import { Router } from 'express';
import { prisma } from '../lib/db';
import { requireAuth, requirePermission } from '../middleware/auth';
import {
  createShiftSchema,
  updateShiftSchema,
  nozzleReadingsBulkSchema,
  stockEntriesBulkSchema,
  paymentCollectionsBulkSchema,
  outstandingReceiptsBulkSchema,
  expenseEntriesBulkSchema,
  creditSaleSchema,
} from '../schemas';
import { buildCarryForward, initializeShiftChildren } from '../services/carryForward';
import { recomputeShift } from '../services/shiftCalc';
import { logAudit } from '../services/audit';
import { ShiftStatus } from '@prisma/client';
import { AppError } from '../middleware/error';

const router = Router();
router.use(requireAuth);

const requirePump = (req: any) => {
  if (!req.user.pumpId) throw new AppError(400, 'No pump assigned to user');
  return req.user.pumpId as string;
};

const getThreshold = async (pumpId: string) => {
  const p = await prisma.pump.findUniqueOrThrow({
    where: { id: pumpId },
    select: { discrepancyMlThreshold: true },
  });
  return p.discrepancyMlThreshold;
};

const ensureEditable = async (id: string) => {
  const s = await prisma.shiftReport.findUniqueOrThrow({ where: { id } });
  if (s.status === ShiftStatus.LOCKED) {
    throw new AppError(403, 'Shift is locked and cannot be edited');
  }
  return s;
};

// LIST
router.get('/', async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const { from, to, status } = req.query;
    const where: any = { pumpId };
    if (from || to) {
      where.reportDate = {};
      if (from) where.reportDate.gte = new Date(String(from));
      if (to) where.reportDate.lte = new Date(String(to));
    }
    if (status) where.status = status;
    const shifts = await prisma.shiftReport.findMany({
      where,
      orderBy: [{ reportDate: 'desc' }, { shiftType: 'desc' }],
      take: 100,
    });
    res.json(shifts);
  } catch (e) {
    next(e);
  }
});

// CREATE — auto-carry-forward
router.post('/', requirePermission('canCreateShift'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const { reportDate, shiftType, openingCashOverridePaise } = createShiftSchema.parse(req.body);
    const dateObj = new Date(reportDate + 'T00:00:00.000Z');

    // Check duplicate
    const existing = await prisma.shiftReport.findUnique({
      where: { pumpId_reportDate_shiftType: { pumpId, reportDate: dateObj, shiftType } },
    });
    if (existing) {
      throw new AppError(409, 'Shift already exists for this date and shift type');
    }

    const carry = await buildCarryForward(pumpId, dateObj, shiftType);
    const openingCash = openingCashOverridePaise ?? carry.openingCashPaise;
    const threshold = await getThreshold(pumpId);

    const shift = await prisma.$transaction(async (tx) => {
      const s = await tx.shiftReport.create({
        data: {
          pumpId,
          reportDate: dateObj,
          shiftType,
          openingCashPaise: openingCash,
          createdById: req.user!.userId,
        },
      });
      await initializeShiftChildren(tx, s.id, pumpId, carry);
      await recomputeShift(tx, s.id, threshold);
      return tx.shiftReport.findUniqueOrThrow({
        where: { id: s.id },
        include: {
          nozzleReadings: { include: { nozzle: true } },
          stockEntries: { include: { tank: true } },
          tankerReceipts: true,
          paymentCollections: true,
          outstandingReceipts: true,
          expenseEntries: { include: { category: true } },
          creditSales: { include: { customer: true } },
        },
      });
    });

    await logAudit(req.user!.userId, 'shift.create', 'ShiftReport', shift.id, null, shift);
    res.status(201).json(shift);
  } catch (e) {
    next(e);
  }
});

// GET ONE — full with all children
router.get('/:id', async (req, res, next) => {
  try {
    const shift = await prisma.shiftReport.findUniqueOrThrow({
      where: { id: req.params.id },
      include: {
        nozzleReadings: { include: { nozzle: true } },
        stockEntries: { include: { tank: true } },
        tankerReceipts: true,
        paymentCollections: { include: { channel: true, timeSlot: true } },
        outstandingReceipts: { include: { customer: true } },
        expenseEntries: { include: { category: true } },
        creditSales: { include: { customer: true } },
      },
    });
    res.json(shift);
  } catch (e) {
    next(e);
  }
});

// UPDATE shift-level fields
router.patch('/:id', async (req, res, next) => {
  try {
    await ensureEditable(req.params.id);
    const data = updateShiftSchema.parse(req.body);
    const threshold = await getThreshold((await prisma.shiftReport.findUniqueOrThrow({ where: { id: req.params.id } })).pumpId);
    const shift = await prisma.$transaction(async (tx) => {
      await tx.shiftReport.update({ where: { id: req.params.id }, data: data as any });
      await recomputeShift(tx, req.params.id, threshold);
      return tx.shiftReport.findUniqueOrThrow({ where: { id: req.params.id } });
    });
    res.json(shift);
  } catch (e) {
    next(e);
  }
});

// DELETE (only DRAFT)
router.delete('/:id', async (req, res, next) => {
  try {
    const s = await prisma.shiftReport.findUniqueOrThrow({ where: { id: req.params.id } });
    if (s.status !== ShiftStatus.DRAFT) {
      throw new AppError(403, 'Only draft shifts can be deleted');
    }
    await prisma.shiftReport.delete({ where: { id: req.params.id } });
    await logAudit(req.user!.userId, 'shift.delete', 'ShiftReport', req.params.id, s, null);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

// SUBMIT
router.post('/:id/submit', requirePermission('canSubmitShift'), async (req, res, next) => {
  try {
    const before = await ensureEditable(req.params.id);
    const threshold = await getThreshold(before.pumpId);
    const shift = await prisma.$transaction(async (tx) => {
      await recomputeShift(tx, req.params.id, threshold);
      return tx.shiftReport.update({
        where: { id: req.params.id },
        data: { status: ShiftStatus.SUBMITTED, submittedAt: new Date() },
      });
    });
    await logAudit(req.user!.userId, 'shift.submit', 'ShiftReport', shift.id, before, shift);
    res.json(shift);
  } catch (e) {
    next(e);
  }
});

// LOCK (owner / canLockShift)
router.post('/:id/lock', requirePermission('canLockShift'), async (req, res, next) => {
  try {
    const before = await prisma.shiftReport.findUniqueOrThrow({ where: { id: req.params.id } });
    if (before.status === ShiftStatus.LOCKED) {
      return res.json(before);
    }
    const shift = await prisma.$transaction(async (tx) => {
      // Apply credit-sale balance updates ONLY at lock time (so corrections stay easy in submitted state)
      const sales = await tx.creditSale.findMany({ where: { shiftReportId: req.params.id } });
      const receipts = await tx.outstandingReceipt.findMany({
        where: { shiftReportId: req.params.id, customerId: { not: null } },
      });
      for (const cs of sales) {
        await tx.creditCustomer.update({
          where: { id: cs.customerId },
          data: { currentBalancePaise: { increment: cs.amountCreditPaise } },
        });
      }
      for (const r of receipts) {
        if (r.customerId) {
          await tx.creditCustomer.update({
            where: { id: r.customerId },
            data: { currentBalancePaise: { decrement: r.amountPaise } },
          });
        }
      }
      return tx.shiftReport.update({
        where: { id: req.params.id },
        data: { status: ShiftStatus.LOCKED, lockedAt: new Date() },
      });
    });
    await logAudit(req.user!.userId, 'shift.lock', 'ShiftReport', shift.id, before, shift);
    res.json(shift);
  } catch (e) {
    next(e);
  }
});

// ----- Nozzle readings bulk upsert -----
router.put(
  '/:id/nozzle-readings',
  requirePermission('canEditNozzleReadings'),
  async (req, res, next) => {
    try {
      const shift = await ensureEditable(req.params.id);
      const { readings } = nozzleReadingsBulkSchema.parse(req.body);
      const threshold = await getThreshold(shift.pumpId);
      // Validate fuelType per nozzle and that closing >= opening
      const nozzles = await prisma.nozzle.findMany({
        where: { id: { in: readings.map((r) => r.nozzleId) } },
      });
      const byId = new Map(nozzles.map((n) => [n.id, n]));
      for (const r of readings) {
        const n = byId.get(r.nozzleId);
        if (!n) throw new AppError(400, `Unknown nozzle ${r.nozzleId}`);
        if (r.closingReadingMl < r.openingReadingMl) {
          throw new AppError(400, `Closing reading < opening for nozzle ${n.code}`);
        }
      }
      const result = await prisma.$transaction(async (tx) => {
        for (const r of readings) {
          const n = byId.get(r.nozzleId)!;
          await tx.nozzleReading.upsert({
            where: { shiftReportId_nozzleId: { shiftReportId: shift.id, nozzleId: r.nozzleId } },
            update: {
              openingReadingMl: r.openingReadingMl,
              closingReadingMl: r.closingReadingMl,
              testingMl: r.testingMl,
            },
            create: {
              shiftReportId: shift.id,
              nozzleId: r.nozzleId,
              fuelType: n.fuelType,
              openingReadingMl: r.openingReadingMl,
              closingReadingMl: r.closingReadingMl,
              testingMl: r.testingMl,
            },
          });
        }
        await recomputeShift(tx, shift.id, threshold);
        return tx.shiftReport.findUniqueOrThrow({
          where: { id: shift.id },
          include: { nozzleReadings: { include: { nozzle: true } } },
        });
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  }
);

// ----- Stock entries bulk upsert -----
router.put('/:id/stock-entries', requirePermission('canEditStock'), async (req, res, next) => {
  try {
    const shift = await ensureEditable(req.params.id);
    const { entries } = stockEntriesBulkSchema.parse(req.body);
    const threshold = await getThreshold(shift.pumpId);
    const tanks = await prisma.tank.findMany({
      where: { id: { in: entries.map((e) => e.tankId) } },
    });
    const byId = new Map(tanks.map((t) => [t.id, t]));
    const result = await prisma.$transaction(async (tx) => {
      for (const e of entries) {
        const t = byId.get(e.tankId);
        if (!t) throw new AppError(400, `Unknown tank ${e.tankId}`);
        await tx.stockEntry.upsert({
          where: { shiftReportId_tankId: { shiftReportId: shift.id, tankId: e.tankId } },
          update: {
            openingStockMl: e.openingStockMl,
            closingStockMl: e.closingStockMl,
          },
          create: {
            shiftReportId: shift.id,
            tankId: e.tankId,
            fuelType: t.fuelType,
            openingStockMl: e.openingStockMl,
            closingStockMl: e.closingStockMl,
          },
        });
      }
      await recomputeShift(tx, shift.id, threshold);
      return tx.shiftReport.findUniqueOrThrow({
        where: { id: shift.id },
        include: { stockEntries: { include: { tank: true } } },
      });
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
});

// ----- Payment collections (replace all) -----
router.put(
  '/:id/payment-collections',
  requirePermission('canEditCollections'),
  async (req, res, next) => {
    try {
      const shift = await ensureEditable(req.params.id);
      const { collections } = paymentCollectionsBulkSchema.parse(req.body);
      const threshold = await getThreshold(shift.pumpId);
      const result = await prisma.$transaction(async (tx) => {
        await tx.paymentModeCollection.deleteMany({ where: { shiftReportId: shift.id } });
        if (collections.length > 0) {
          await tx.paymentModeCollection.createMany({
            data: collections.map((c) => ({
              shiftReportId: shift.id,
              channelId: c.channelId,
              timeSlotId: c.timeSlotId || null,
              amountPaise: c.amountPaise,
              reference: c.reference,
            })),
          });
        }
        await recomputeShift(tx, shift.id, threshold);
        return tx.shiftReport.findUniqueOrThrow({
          where: { id: shift.id },
          include: { paymentCollections: { include: { channel: true, timeSlot: true } } },
        });
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  }
);

// ----- Outstanding receipts (replace all) -----
router.put(
  '/:id/outstanding-receipts',
  requirePermission('canEditOutstanding'),
  async (req, res, next) => {
    try {
      const shift = await ensureEditable(req.params.id);
      const { receipts } = outstandingReceiptsBulkSchema.parse(req.body);
      const threshold = await getThreshold(shift.pumpId);
      const result = await prisma.$transaction(async (tx) => {
        await tx.outstandingReceipt.deleteMany({ where: { shiftReportId: shift.id } });
        if (receipts.length > 0) {
          await tx.outstandingReceipt.createMany({
            data: receipts.map((r) => ({
              shiftReportId: shift.id,
              customerId: r.customerId || null,
              customerNameRaw: r.customerNameRaw,
              amountPaise: r.amountPaise,
              channelId: r.channelId || null,
              reference: r.reference,
            })),
          });
        }
        await recomputeShift(tx, shift.id, threshold);
        return tx.shiftReport.findUniqueOrThrow({
          where: { id: shift.id },
          include: { outstandingReceipts: { include: { customer: true } } },
        });
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  }
);

// ----- Expense entries (replace all) -----
router.put('/:id/expense-entries', requirePermission('canEditExpenses'), async (req, res, next) => {
  try {
    const shift = await ensureEditable(req.params.id);
    const { entries } = expenseEntriesBulkSchema.parse(req.body);
    const threshold = await getThreshold(shift.pumpId);
    const result = await prisma.$transaction(async (tx) => {
      await tx.expenseEntry.deleteMany({ where: { shiftReportId: shift.id } });
      if (entries.length > 0) {
        await tx.expenseEntry.createMany({
          data: entries.map((e) => ({
            shiftReportId: shift.id,
            categoryId: e.categoryId,
            ref: e.ref,
            lastBillDate: e.lastBillDate ? new Date(e.lastBillDate + 'T00:00:00.000Z') : null,
            openingBalancePaise: e.openingBalancePaise,
            dayExpensePaise: e.dayExpensePaise,
            notes: e.notes,
          })),
        });
      }
      await recomputeShift(tx, shift.id, threshold);
      return tx.shiftReport.findUniqueOrThrow({
        where: { id: shift.id },
        include: { expenseEntries: { include: { category: true } } },
      });
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
});

// ----- Credit sale: add one (Vijay's case) -----
router.post('/:id/credit-sales', requirePermission('canEditCreditSales'), async (req, res, next) => {
  try {
    const shift = await ensureEditable(req.params.id);
    const data = creditSaleSchema.parse(req.body);
    const threshold = await getThreshold(shift.pumpId);
    if (data.amountPaidPaise + data.amountCreditPaise !== data.totalAmountPaise) {
      throw new AppError(400, 'amountPaid + amountCredit must equal totalAmount');
    }
    const result = await prisma.$transaction(async (tx) => {
      const sale = await tx.creditSale.create({
        data: {
          shiftReportId: shift.id,
          customerId: data.customerId,
          fuelType: data.fuelType,
          quantityMl: data.quantityMl,
          ratePaise: data.ratePaise,
          totalAmountPaise: data.totalAmountPaise,
          amountPaidPaise: data.amountPaidPaise,
          amountCreditPaise: data.amountCreditPaise,
          paidViaChannelId: data.paidViaChannelId || null,
          vehicleNo: data.vehicleNo,
          reference: data.reference,
        },
      });
      // If customer has a paid portion, also reflect that as a collection on the chosen channel
      if (data.amountPaidPaise > 0n && data.paidViaChannelId) {
        await tx.paymentModeCollection.create({
          data: {
            shiftReportId: shift.id,
            channelId: data.paidViaChannelId,
            amountPaise: data.amountPaidPaise,
            reference: `Credit sale paid portion: ${sale.id}`,
          },
        });
      }
      await recomputeShift(tx, shift.id, threshold);
      return sale;
    });
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

router.delete('/:id/credit-sales/:saleId', requirePermission('canEditCreditSales'), async (req, res, next) => {
  try {
    const shift = await ensureEditable(req.params.id);
    const threshold = await getThreshold(shift.pumpId);
    await prisma.$transaction(async (tx) => {
      await tx.creditSale.delete({ where: { id: req.params.saleId } });
      await recomputeShift(tx, shift.id, threshold);
    });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

export default router;

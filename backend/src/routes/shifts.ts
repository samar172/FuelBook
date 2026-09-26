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
  employeeAssignmentsBulkSchema,
  cashHandoversBulkSchema,
  shiftCashierSchema,
} from '../schemas';
import { buildCarryForward, initializeShiftChildren } from '../services/carryForward';
import { recomputeShift } from '../services/shiftCalc';
import { computeEmployeeExpectations, syncHandoverExpectations } from '../services/ledger';
import { postShiftJournal, reverseShiftJournal } from '../services/ledgerPosting';
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
          employeeAssignments: { include: { employee: true, nozzle: true } },
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
        employeeAssignments: { include: { employee: true, nozzle: true } },
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
      const locked = await tx.shiftReport.update({
        where: { id: req.params.id },
        data: { status: ShiftStatus.LOCKED, lockedAt: new Date() },
      });
      // Refresh expected-vs-received figures, then write the double-entry journal.
      // Both happen inside the lock transaction, so the books can never drift
      // out of step with the shift's status.
      await syncHandoverExpectations(tx, locked.id);
      await postShiftJournal(tx, locked.id, req.user!.userId);
      // Re-read so the response carries ledgerPostedAt, which posting just set.
      return tx.shiftReport.findUniqueOrThrow({ where: { id: locked.id } });
    });
    await logAudit(req.user!.userId, 'shift.lock', 'ShiftReport', shift.id, before, shift);
    res.json(shift);
  } catch (e) {
    next(e);
  }
});

// UNLOCK (owner / canLockShift) — reverses the credit-balance postings applied at
// lock time, then drops back to SUBMITTED so it goes through normal editing +
// submit + lock again. Without reversing those postings, re-locking would
// double-apply every credit sale/outstanding receipt on this shift.
router.post('/:id/unlock', requirePermission('canLockShift'), async (req, res, next) => {
  try {
    const before = await prisma.shiftReport.findUniqueOrThrow({ where: { id: req.params.id } });
    if (before.status !== ShiftStatus.LOCKED) {
      throw new AppError(400, 'Shift is not locked');
    }
    const shift = await prisma.$transaction(async (tx) => {
      const sales = await tx.creditSale.findMany({ where: { shiftReportId: req.params.id } });
      const receipts = await tx.outstandingReceipt.findMany({
        where: { shiftReportId: req.params.id, customerId: { not: null } },
      });
      for (const cs of sales) {
        await tx.creditCustomer.update({
          where: { id: cs.customerId },
          data: { currentBalancePaise: { decrement: cs.amountCreditPaise } },
        });
      }
      for (const r of receipts) {
        if (r.customerId) {
          await tx.creditCustomer.update({
            where: { id: r.customerId },
            data: { currentBalancePaise: { increment: r.amountPaise } },
          });
        }
      }
      // Mirror-image entries undo the journal posted at lock; nothing is deleted.
      await reverseShiftJournal(tx, req.params.id, req.user!.userId, 'shift unlocked');
      return tx.shiftReport.update({
        where: { id: req.params.id },
        data: { status: ShiftStatus.SUBMITTED, lockedAt: null },
      });
    });
    await logAudit(req.user!.userId, 'shift.unlock', 'ShiftReport', shift.id, before, shift);
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

// ----- Employee-nozzle assignments bulk upsert -----
router.put(
  '/:id/employee-assignments',
  requirePermission('canEditNozzleReadings'),
  async (req, res, next) => {
    try {
      const shift = await ensureEditable(req.params.id);
      const { assignments } = employeeAssignmentsBulkSchema.parse(req.body);

      const nozzles = await prisma.nozzle.findMany({
        where: { id: { in: assignments.map((a) => a.nozzleId) }, pumpId: shift.pumpId },
      });
      const nozzleIds = new Set(nozzles.map((n) => n.id));
      const employees = await prisma.employee.findMany({
        where: { id: { in: assignments.map((a) => a.employeeId) }, pumpId: shift.pumpId },
      });
      const employeeIds = new Set(employees.map((e) => e.id));
      for (const a of assignments) {
        if (!nozzleIds.has(a.nozzleId)) throw new AppError(400, `Unknown nozzle ${a.nozzleId}`);
        if (!employeeIds.has(a.employeeId)) throw new AppError(400, `Unknown employee ${a.employeeId}`);
      }

      const result = await prisma.$transaction(async (tx) => {
        for (const a of assignments) {
          await tx.shiftEmployeeAssignment.upsert({
            where: { shiftReportId_nozzleId: { shiftReportId: shift.id, nozzleId: a.nozzleId } },
            update: { employeeId: a.employeeId },
            create: { shiftReportId: shift.id, nozzleId: a.nozzleId, employeeId: a.employeeId },
          });
        }
        return tx.shiftReport.findUniqueOrThrow({
          where: { id: shift.id },
          include: { employeeAssignments: { include: { employee: true, nozzle: true } } },
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
              employeeId: c.employeeId || null,
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
            paidByEmployeeId: e.paidByEmployeeId || null,
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

    // The customer must belong to this pump, and a named vehicle must belong to
    // that customer — otherwise a sale could be booked against someone else's.
    const customer = await prisma.creditCustomer.findFirst({
      where: { id: data.customerId, pumpId: shift.pumpId },
    });
    if (!customer) throw new AppError(404, 'Customer not found');

    if (data.employeeId) {
      const emp = await prisma.employee.findFirst({
        where: { id: data.employeeId, pumpId: shift.pumpId },
      });
      if (!emp) throw new AppError(400, 'Employee does not belong to this pump');
    }

    let vehicleNo = data.vehicleNo?.trim().toUpperCase() || null;
    if (data.vehicleId) {
      const vehicle = await prisma.vehicle.findFirst({
        where: { id: data.vehicleId, customerId: customer.id },
      });
      if (!vehicle) throw new AppError(400, 'Vehicle does not belong to this customer');
      // Keep vehicleNo as the human-readable record of what was fuelled.
      vehicleNo = vehicle.vehicleNo;
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
          vehicleId: data.vehicleId || null,
          employeeId: data.employeeId || null,
          vehicleNo,
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

// ----- Cash reconciliation: what each person owed vs handed over -----
router.get('/:id/cash-reconciliation', async (req, res, next) => {
  try {
    const shift = await prisma.shiftReport.findUniqueOrThrow({
      where: { id: req.params.id },
      select: {
        id: true,
        pumpId: true,
        status: true,
        cashierEmployeeId: true,
        ledgerPostedAt: true,
        pump: { select: { cashHandoverMode: true } },
      },
    });
    const { mode, expectations, unattributedSalesPaise } = await computeEmployeeExpectations(
      prisma,
      shift.id,
    );
    const handovers = await prisma.employeeCashHandover.findMany({
      where: { shiftReportId: shift.id },
      include: { employee: { select: { id: true, name: true, code: true, designation: true } } },
    });
    const byEmp = new Map(handovers.map((h) => [h.employeeId, h]));

    const rows = expectations.map((e) => {
      const h = byEmp.get(e.employeeId);
      const received = h?.receivedCashPaise ?? null;
      return {
        ...e,
        handoverId: h?.id ?? null,
        receivedCashPaise: received,
        variancePaise: received === null ? null : received - e.expectedCashPaise,
        notes: h?.notes ?? null,
        // Helpful default for the form: the cash they already recorded.
        suggestedReceivedPaise: e.cashCollectedPaise,
      };
    });

    res.json({
      shiftId: shift.id,
      status: shift.status,
      mode,
      cashierEmployeeId: shift.cashierEmployeeId,
      ledgerPostedAt: shift.ledgerPostedAt,
      unattributedSalesPaise,
      rows,
      totals: {
        expectedCashPaise: rows.reduce((s, r) => s + r.expectedCashPaise, 0n),
        receivedCashPaise: rows.reduce((s, r) => s + (r.receivedCashPaise ?? 0n), 0n),
        variancePaise: rows.reduce((s, r) => s + (r.variancePaise ?? 0n), 0n),
      },
    });
  } catch (e) {
    next(e);
  }
});

// Record what each person actually handed over. Expected + variance are derived
// server-side so the two can never disagree.
router.put('/:id/cash-handovers', requirePermission('canEditCollections'), async (req, res, next) => {
  try {
    const shift = await ensureEditable(req.params.id);
    const { handovers } = cashHandoversBulkSchema.parse(req.body);

    const employeeIds = handovers.map((h) => h.employeeId);
    if (employeeIds.length > 0) {
      const valid = await prisma.employee.count({
        where: { id: { in: employeeIds }, pumpId: shift.pumpId },
      });
      if (valid !== new Set(employeeIds).size) {
        throw new AppError(400, 'One or more employees do not belong to this pump');
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const { expectations } = await computeEmployeeExpectations(tx, shift.id);
      const expectedByEmp = new Map(expectations.map((e) => [e.employeeId, e.expectedCashPaise]));

      await tx.employeeCashHandover.deleteMany({
        where: { shiftReportId: shift.id, employeeId: { notIn: employeeIds.length ? employeeIds : ['-'] } },
      });
      for (const h of handovers) {
        const expected = expectedByEmp.get(h.employeeId) ?? 0n;
        const variance = h.receivedCashPaise - expected;
        await tx.employeeCashHandover.upsert({
          where: { shiftReportId_employeeId: { shiftReportId: shift.id, employeeId: h.employeeId } },
          create: {
            shiftReportId: shift.id,
            employeeId: h.employeeId,
            expectedCashPaise: expected,
            receivedCashPaise: h.receivedCashPaise,
            variancePaise: variance,
            notes: h.notes ?? null,
          },
          update: {
            expectedCashPaise: expected,
            receivedCashPaise: h.receivedCashPaise,
            variancePaise: variance,
            notes: h.notes ?? null,
          },
        });
      }
      return tx.employeeCashHandover.findMany({
        where: { shiftReportId: shift.id },
        include: { employee: { select: { id: true, name: true } } },
      });
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
});

// Pooled-cashier mode: who is handing over the shift's cash.
router.put('/:id/cashier', requirePermission('canEditCollections'), async (req, res, next) => {
  try {
    const shift = await ensureEditable(req.params.id);
    const { cashierEmployeeId } = shiftCashierSchema.parse(req.body);
    if (cashierEmployeeId) {
      const emp = await prisma.employee.findFirst({
        where: { id: cashierEmployeeId, pumpId: shift.pumpId },
      });
      if (!emp) throw new AppError(400, 'Employee does not belong to this pump');
    }
    const updated = await prisma.shiftReport.update({
      where: { id: shift.id },
      data: { cashierEmployeeId },
    });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

export default router;

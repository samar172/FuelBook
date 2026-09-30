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
  cashDropSchema,
} from '../schemas';
import { buildCarryForward, initializeShiftChildren } from '../services/carryForward';
import { recomputeShift } from '../services/shiftCalc';
import { computeEmployeeExpectations, syncHandoverExpectations } from '../services/ledger';
import { postShiftJournal, reverseShiftJournal } from '../services/ledgerPosting';
import { isAttendantRole } from '../services/roles';
import { ensureShiftForNow, windowFor } from '../services/shiftAuto';
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

    // Nozzle staff see only the shifts they actually worked. The link runs
    // login -> staff record -> nozzle assignment; a login with no staff record
    // attached sees nothing rather than everything.
    if (isAttendantRole(req.user!.role)) {
      const me = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: { employeeId: true },
      });
      where.employeeAssignments = me?.employeeId
        ? { some: { employeeId: me.employeeId } }
        : { some: { employeeId: '__none__' } };
    }

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

// Which shift should be running right now, and whether it exists yet. The screen
// uses this to offer "start today's shift" without guessing at the clock itself.
router.get('/current', async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const pump = await prisma.pump.findUniqueOrThrow({
      where: { id: pumpId },
      select: {
        autoStartShift: true,
        autoMarkAttendance: true,
        dayShiftStartsAtMin: true,
        nightShiftStartsAtMin: true,
      },
    });
    const w = windowFor(pump);
    const shift = await prisma.shiftReport.findUnique({
      where: {
        pumpId_reportDate_shiftType: {
          pumpId,
          reportDate: w.reportDate,
          shiftType: w.shiftType,
        },
      },
      include: { employeeAssignments: { include: { employee: true, nozzle: true } } },
    });
    res.json({
      window: {
        reportDate: w.reportDate.toISOString().slice(0, 10),
        shiftType: w.shiftType,
        startsAtMin: w.startsAtMin,
      },
      shift,
      exists: Boolean(shift),
      autoStartShift: pump.autoStartShift,
      autoMarkAttendance: pump.autoMarkAttendance,
    });
  } catch (e) {
    next(e);
  }
});

// Open the shift for right now. The button behind "start today's shift"; also what
// runs at sign-in when the pump has asked for it.
router.post('/ensure-current', requirePermission('canCreateShift'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const result = await ensureShiftForNow(pumpId, req.user!.userId, { force: true });
    if (!result.shift) throw new AppError(400, result.reason ?? 'Could not start the shift');
    if (result.created) {
      await logAudit(req.user!.userId, 'shift.autoStart', 'ShiftReport', result.shift.id, null, result.shift);
    }
    res.status(result.created ? 201 : 200).json({
      shift: result.shift,
      created: result.created,
      window: {
        reportDate: result.window.reportDate.toISOString().slice(0, 10),
        shiftType: result.window.shiftType,
      },
    });
  } catch (e) {
    next(e);
  }
});

// GET ONE — full with all children
router.get('/:id', async (req, res, next) => {
  try {
    // Scoped to the caller's pump: a shift id from another pump must not resolve.
    const pumpId = requirePump(req);
    const scope: any = { id: req.params.id, pumpId };
    if (isAttendantRole(req.user!.role)) {
      const me = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: { employeeId: true },
      });
      scope.employeeAssignments = me?.employeeId
        ? { some: { employeeId: me.employeeId } }
        : { some: { employeeId: '__none__' } };
    }
    const shift = await prisma.shiftReport.findFirst({
      where: scope,
      include: {
        nozzleReadings: { include: { nozzle: true } },
        stockEntries: { include: { tank: true } },
        tankerReceipts: true,
        paymentCollections: { include: { channel: true, timeSlot: true } },
        outstandingReceipts: { include: { customer: true } },
        expenseEntries: { include: { category: true } },
        creditSales: { include: { customer: true } },
        employeeAssignments: { include: { employee: true, nozzle: true } },
        cashHandovers: { include: { employee: { select: { id: true, name: true } } } },
        // Mid-shift cash drops, oldest first, so the screen can show when each
        // hand-in happened.
        cashMovements: {
          include: {
            fromEmployee: { select: { id: true, name: true } },
            toEmployee: { select: { id: true, name: true } },
          },
          orderBy: { occurredAt: 'asc' },
        },
        cashierEmployee: { select: { id: true, name: true } },
      },
    });
    if (!shift) throw new AppError(404, 'Shift not found');
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
        // This is a PUT: the payload is the whole roster for the shift. Anything
        // not in it is removed, so taking someone off a nozzle actually sticks —
        // it previously only ever added, which made an assignment impossible to
        // undo (and, now that attendants see the shifts they are rostered on,
        // impossible to revoke).
        await tx.shiftEmployeeAssignment.deleteMany({
          where: {
            shiftReportId: shift.id,
            nozzleId: { notIn: assignments.length ? assignments.map((a) => a.nozzleId) : ['__none__'] },
          },
        });
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
    // Scoped to this pump: a tank id from another pump must not be writable here.
    const tanks = await prisma.tank.findMany({
      where: { id: { in: entries.map((e) => e.tankId) }, pumpId: shift.pumpId },
    });
    const byId = new Map(tanks.map((t) => [t.id, t]));

    // A tank cannot hold more than its capacity. This is nearly always a typo or a
    // litres/millilitres slip, and left alone it flows straight into wet-stock
    // variance and the books.
    const asL = (ml: bigint) => (Number(ml) / 1000).toLocaleString('en-IN');
    for (const e of entries) {
      const t = byId.get(e.tankId);
      if (!t) throw new AppError(400, `Unknown tank ${e.tankId}`);
      if (e.closingStockMl > t.capacityMl) {
        throw new AppError(
          400,
          `${t.name}: closing stock ${asL(e.closingStockMl)} L is more than the tank holds ` +
            `(${asL(t.capacityMl)} L). Check the reading, or correct the tank capacity in Pump Setup.`,
        );
      }
      if (e.openingStockMl > t.capacityMl) {
        throw new AppError(
          400,
          `${t.name}: opening stock ${asL(e.openingStockMl)} L is more than the tank holds ` +
            `(${asL(t.capacityMl)} L).`,
        );
      }
    }

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

    // Cash dropped to the office partway through the shift, newest last. These are
    // real CashMovement rows, so the cash position already knows about them.
    const drops = await prisma.cashMovement.findMany({
      where: {
        shiftReportId: shift.id,
        fromLocation: 'ATTENDANT',
        toLocation: { in: ['CASHIER', 'OFFICE_SAFE'] },
      },
      include: {
        fromEmployee: { select: { id: true, name: true } },
        toEmployee: { select: { id: true, name: true } },
      },
      orderBy: { occurredAt: 'asc' },
    });
    const dropsByEmp = new Map<string, typeof drops>();
    for (const d of drops) {
      if (!d.fromEmployeeId) continue;
      const list = dropsByEmp.get(d.fromEmployeeId) ?? [];
      list.push(d);
      dropsByEmp.set(d.fromEmployeeId, list);
    }

    const rows = expectations.map((e) => {
      const h = byEmp.get(e.employeeId);
      const received = h?.receivedCashPaise ?? null;
      const myDrops = dropsByEmp.get(e.employeeId) ?? [];
      const droppedMidShiftPaise = myDrops.reduce((sum, d) => sum + d.amountPaise, 0n);
      // What has actually reached the office from this person: the recorded
      // hand-over when there is one (it is entered as the full amount, drops
      // included), otherwise whatever they dropped during the shift.
      const settledCashPaise = received !== null ? received : droppedMidShiftPaise;
      return {
        ...e,
        handoverId: h?.id ?? null,
        handoverRecorded: Boolean(h),
        receivedCashPaise: received,
        settledCashPaise,
        // Cash they still owe against what they sold. Negative = short.
        // Unlike variancePaise this is never null: before a hand-over is
        // recorded the difference is the whole amount due, not zero.
        differencePaise: settledCashPaise - e.expectedCashPaise,
        variancePaise: received === null ? null : received - e.expectedCashPaise,
        notes: h?.notes ?? null,
        // What they already handed in during the shift, with the time of each drop.
        droppedMidShiftPaise,
        drops: myDrops.map((d) => ({
          id: d.id,
          amountPaise: d.amountPaise,
          occurredAt: d.occurredAt,
          toLocation: d.toLocation,
          toEmployee: d.toEmployee,
          purpose: d.purpose,
          notes: d.notes,
        })),
        // Still to hand over at the end of the shift, if the drops fall short.
        remainingToHandOverPaise:
          e.expectedCashPaise - droppedMidShiftPaise > 0n
            ? e.expectedCashPaise - droppedMidShiftPaise
            : 0n,
        // Default for the form: what they have already handed in beats the raw
        // cash-collection figure, since the drops are the actual money received.
        suggestedReceivedPaise:
          droppedMidShiftPaise > 0n ? droppedMidShiftPaise : e.cashCollectedPaise,
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
        droppedMidShiftPaise: rows.reduce((s, r) => s + r.droppedMidShiftPaise, 0n),
        dropCount: drops.length,
        // Sales value dispensed by the people on this shift, and how much of it
        // has actually been settled.
        salesValuePaise: rows.reduce((s, r) => s + r.salesValuePaise, 0n),
        creditIssuedPaise: rows.reduce((s, r) => s + r.creditIssuedPaise, 0n),
        nonCashCollectedPaise: rows.reduce((s, r) => s + r.nonCashCollectedPaise, 0n),
        settledCashPaise: rows.reduce((s, r) => s + r.settledCashPaise, 0n),
        differencePaise: rows.reduce((s, r) => s + r.differencePaise, 0n),
        awaitingHandover: rows.filter((r) => !r.handoverRecorded).length,
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

// Re-run the totals for an open shift. Normally unnecessary — every save
// recomputes — but it gives the owner a way to re-value a shift after a setup
// change, without having to re-save each tab.
router.post('/:id/recompute', requirePermission('canCreateShift'), async (req, res, next) => {
  try {
    const shift = await ensureEditable(req.params.id);
    const threshold = await getThreshold(shift.pumpId);
    const totals = await prisma.$transaction((tx) => recomputeShift(tx, shift.id, threshold));
    res.json({
      shiftId: shift.id,
      totalSalesPaise: totals.totalSalesPaise,
      totalCollectionsPaise: totals.totalCollectionsPaise,
      closingCashPaise: totals.closingCashPaise,
      cashFlowDifferencePaise: totals.cashFlowDifferencePaise,
      discrepancyMl: totals.discrepancyMl,
      discrepancyFlag: totals.discrepancyFlag,
    });
  } catch (e) {
    next(e);
  }
});

// ----- Mid-shift cash drops: staff handing cash in before the shift ends -----
// Recorded as a CashMovement so the custody trail and the cash position pick them
// up with no extra bookkeeping. Allowed while the shift is still editable.
router.post('/:id/cash-drops', requirePermission('canEditCollections'), async (req, res, next) => {
  try {
    const shift = await ensureEditable(req.params.id);
    const data = cashDropSchema.parse(req.body);
    if (data.amountPaise <= 0n) throw new AppError(400, 'A cash drop must be more than zero');

    const attendant = await prisma.employee.findFirst({
      where: { id: data.employeeId, pumpId: shift.pumpId },
      select: { id: true, name: true },
    });
    if (!attendant) throw new AppError(400, 'Employee does not belong to this pump');

    // A drop to the cashier names who took it; the safe is a place, not a person.
    let toEmployeeId: string | null = null;
    if (data.toLocation === 'CASHIER') {
      toEmployeeId = data.toEmployeeId || shift.cashierEmployeeId || null;
      if (!toEmployeeId) {
        throw new AppError(400, 'Say which cashier took the cash, or set the shift cashier first');
      }
      const cashier = await prisma.employee.findFirst({
        where: { id: toEmployeeId, pumpId: shift.pumpId },
      });
      if (!cashier) throw new AppError(400, 'Cashier does not belong to this pump');
      if (toEmployeeId === attendant.id) {
        throw new AppError(400, 'An attendant cannot hand cash to themselves');
      }
    }

    const occurredAt = data.occurredAt ? new Date(data.occurredAt) : new Date();
    const movement = await prisma.cashMovement.create({
      data: {
        pumpId: shift.pumpId,
        shiftReportId: shift.id,
        fromLocation: 'ATTENDANT',
        fromEmployeeId: attendant.id,
        toLocation: data.toLocation,
        toEmployeeId,
        amountPaise: data.amountPaise,
        occurredAt,
        purpose: data.purpose ?? 'Mid-shift cash drop',
        notes: data.notes ?? null,
        recordedById: req.user!.userId,
      },
      include: {
        fromEmployee: { select: { id: true, name: true } },
        toEmployee: { select: { id: true, name: true } },
      },
    });
    await logAudit(req.user!.userId, 'shift.cashDrop', 'CashMovement', movement.id, null, movement);
    res.status(201).json(movement);
  } catch (e) {
    next(e);
  }
});

router.get('/:id/cash-drops', async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const scope: any = { id: req.params.id, pumpId };
    if (isAttendantRole(req.user!.role)) {
      const me = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: { employeeId: true },
      });
      scope.employeeAssignments = me?.employeeId
        ? { some: { employeeId: me.employeeId } }
        : { some: { employeeId: '__none__' } };
    }
    const shift = await prisma.shiftReport.findFirst({
      where: scope,
      select: { id: true },
    });
    if (!shift) throw new AppError(404, 'Shift not found');
    const drops = await prisma.cashMovement.findMany({
      where: { shiftReportId: shift.id, fromLocation: 'ATTENDANT' },
      include: {
        fromEmployee: { select: { id: true, name: true, code: true } },
        toEmployee: { select: { id: true, name: true } },
      },
      orderBy: { occurredAt: 'asc' },
    });
    res.json({
      drops,
      totalPaise: drops.reduce((s, d) => s + d.amountPaise, 0n),
    });
  } catch (e) {
    next(e);
  }
});

router.delete(
  '/:id/cash-drops/:movementId',
  requirePermission('canEditCollections'),
  async (req, res, next) => {
    try {
      const shift = await ensureEditable(req.params.id);
      const movement = await prisma.cashMovement.findFirst({
        where: { id: req.params.movementId, shiftReportId: shift.id },
      });
      if (!movement) throw new AppError(404, 'Cash drop not found');
      if (movement.journalEntryId) {
        throw new AppError(409, 'This drop is already posted to the books and cannot be removed');
      }
      await prisma.cashMovement.delete({ where: { id: movement.id } });
      await logAudit(req.user!.userId, 'shift.cashDrop.delete', 'CashMovement', movement.id, movement, null);
      res.json({ deleted: true, id: movement.id });
    } catch (e) {
      next(e);
    }
  },
);

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

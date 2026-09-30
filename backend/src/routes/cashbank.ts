// Cash custody, bank and digital settlement.
//
// The question this module answers is "the cashier collected the cash — where is
// it now?". Everything here is in service of that: the custody trail, the
// physical note count, deposits into the bank, what the card/UPI aggregators
// actually credited, and matching all of it against the bank statement.
//
// Deliberately NOT done here: posting to the double-entry ledger. Every
// journalEntryId stays null; accounting entries are wired centrally afterwards.
import { Router } from 'express';
import {
  CashLocation,
  DepositStatus,
  Prisma,
  Role,
  SettlementStatus,
  ShiftStatus,
  TxnDirection,
} from '@prisma/client';
import { prisma } from '../lib/db';
import { requireAuth, requirePermission, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/error';
import {
  createBankAccountSchema,
  createCashDepositSchema,
  createCashMovementSchema,
  denominationCountSchema,
  importBankTransactionsSchema,
  matchTransactionSchema,
  updateBankAccountSchema,
  updateCashDepositSchema,
  updateCashMovementSchema,
  updateSettlementSchema,
} from '../schemas/cashbank';
import {
  DENOMINATIONS,
  computeCashPosition,
  computeDenominationTotal,
  type DenominationCounts,
} from '../services/cashbank';

const router = Router();
router.use(requireAuth);

const requirePump = (req: any) => {
  if (!req.user.pumpId) throw new AppError(400, 'No pump assigned to user');
  return req.user.pumpId as string;
};

// ===================== SHARED HELPERS =====================

const dayStart = (v: string) => new Date(v.slice(0, 10) + 'T00:00:00.000Z');
const dayEnd = (v: string) => new Date(v.slice(0, 10) + 'T23:59:59.999Z');
const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

const parseDay = (v: unknown, label: string): Date | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  if (!isDay(v)) throw new AppError(400, `${label} must be YYYY-MM-DD`);
  return dayStart(v);
};

const dateOnlyStr = (d: Date) => d.toISOString().slice(0, 10);

// Locations that are a person, not a place: a movement to or from one is
// meaningless without knowing which member of staff was holding the money.
const PERSONAL_LOCATIONS: CashLocation[] = [
  CashLocation.ATTENDANT,
  CashLocation.CASHIER,
];

// OWNER is a person but not a member of staff — the owner signs in as a user and
// usually has no Employee record — so naming an employee there is optional. It is
// still a single bucket, which is what "the owner is holding it" means.
const OPTIONAL_PERSON_LOCATIONS: CashLocation[] = [CashLocation.OWNER];

// Every id arriving from a URL or body is checked against the caller's pump
// before it is read or written — another pump's record must simply not exist.
async function findOwnEmployee(pumpId: string, employeeId: string) {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, pumpId },
    select: { id: true, name: true },
  });
  if (!employee) throw new AppError(404, 'Employee not found');
  return employee;
}

async function findOwnShift(pumpId: string, shiftReportId: string) {
  const shift = await prisma.shiftReport.findFirst({
    where: { id: shiftReportId, pumpId },
    select: { id: true, status: true, reportDate: true, shiftType: true, closingCashPaise: true },
  });
  if (!shift) throw new AppError(404, 'Shift report not found');
  return shift;
}

async function findOwnBankAccount(pumpId: string, id: string) {
  const account = await prisma.bankAccount.findFirst({ where: { id, pumpId } });
  if (!account) throw new AppError(404, 'Bank account not found');
  return account;
}

async function findOwnDeposit(pumpId: string, id: string) {
  const deposit = await prisma.cashDeposit.findFirst({
    where: { id, pumpId },
    include: { movement: { select: { id: true } } },
  });
  if (!deposit) throw new AppError(404, 'Deposit not found');
  return deposit;
}

async function findOwnSettlement(pumpId: string, id: string) {
  const batch = await prisma.settlementBatch.findFirst({
    where: { id, pumpId },
    include: { channel: { select: { id: true, name: true, kind: true } } },
  });
  if (!batch) throw new AppError(404, 'Settlement batch not found');
  return batch;
}

async function findOwnTransaction(pumpId: string, id: string) {
  const txn = await prisma.bankTransaction.findFirst({
    where: { id, bankAccount: { pumpId } },
  });
  if (!txn) throw new AppError(404, 'Bank transaction not found');
  return txn;
}

// A movement needs a named custodian at both ends whenever the end is a person.
async function resolveMovementParty(
  pumpId: string,
  side: 'from' | 'to',
  location: CashLocation,
  employeeId: string | null | undefined,
) {
  const needsPerson = PERSONAL_LOCATIONS.includes(location);
  const personOptional = OPTIONAL_PERSON_LOCATIONS.includes(location);
  if (needsPerson && !employeeId) {
    throw new AppError(
      400,
      `${side === 'from' ? 'Source' : 'Destination'} ${location} needs the member of staff holding the cash`,
    );
  }
  if (!needsPerson && !personOptional && employeeId) {
    throw new AppError(400, `${location} is a place, not a person — remove the employee`);
  }
  if (employeeId) await findOwnEmployee(pumpId, employeeId);
  return employeeId ?? null;
}

const movementInclude = {
  fromEmployee: { select: { id: true, name: true, code: true } },
  toEmployee: { select: { id: true, name: true, code: true } },
  shiftReport: { select: { id: true, reportDate: true, shiftType: true } },
  cashDeposit: { select: { id: true, slipNo: true, status: true } },
} satisfies Prisma.CashMovementInclude;

// ===================== 1. CASH CUSTODY TRAIL =====================

router.get('/movements', requirePermission('canViewReports'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const from = parseDay(req.query.from, 'from');
    const to = req.query.to;
    const employeeId = req.query.employeeId ? String(req.query.employeeId) : undefined;
    const location = req.query.location ? String(req.query.location) : undefined;

    if (to !== undefined && to !== '' && !isDay(to)) throw new AppError(400, 'to must be YYYY-MM-DD');
    if (location && !(location in CashLocation)) throw new AppError(400, 'Unknown location');
    if (employeeId) await findOwnEmployee(pumpId, employeeId);

    const where: Prisma.CashMovementWhereInput = { pumpId };
    if (from || isDay(to)) {
      where.occurredAt = {
        ...(from ? { gte: from } : {}),
        ...(isDay(to) ? { lte: dayEnd(to) } : {}),
      };
    }
    if (employeeId) {
      where.OR = [{ fromEmployeeId: employeeId }, { toEmployeeId: employeeId }];
    }
    if (location) {
      const loc = location as CashLocation;
      where.AND = [{ OR: [{ fromLocation: loc }, { toLocation: loc }] }];
    }

    const movements = await prisma.cashMovement.findMany({
      where,
      include: movementInclude,
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });

    const totalPaise = movements.reduce((s, m) => s + m.amountPaise, 0n);
    res.json({ movements, count: movements.length, totalPaise });
  } catch (e) {
    next(e);
  }
});

router.post('/movements', requirePermission('canEditCollections'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const data = createCashMovementSchema.parse(req.body);

    const fromEmployeeId = await resolveMovementParty(
      pumpId,
      'from',
      data.fromLocation,
      data.fromEmployeeId,
    );
    const toEmployeeId = await resolveMovementParty(pumpId, 'to', data.toLocation, data.toEmployeeId);
    if (data.fromLocation === data.toLocation && fromEmployeeId === toEmployeeId) {
      throw new AppError(400, 'Source and destination are the same — nothing moved');
    }
    if (data.shiftReportId) await findOwnShift(pumpId, data.shiftReportId);

    const movement = await prisma.cashMovement.create({
      data: {
        pumpId,
        shiftReportId: data.shiftReportId ?? null,
        fromLocation: data.fromLocation,
        fromEmployeeId,
        toLocation: data.toLocation,
        toEmployeeId,
        amountPaise: data.amountPaise,
        occurredAt: data.occurredAt ?? new Date(),
        purpose: data.purpose ?? null,
        reference: data.reference ?? null,
        notes: data.notes ?? null,
        recordedById: req.user!.userId,
      },
      include: movementInclude,
    });
    res.status(201).json(movement);
  } catch (e) {
    next(e);
  }
});

// A movement created by a deposit belongs to that deposit: edit the deposit.
const assertMovementEditable = (m: { cashDepositId: string | null; journalEntryId: string | null }) => {
  if (m.cashDepositId) {
    throw new AppError(409, 'This movement belongs to a bank deposit — edit the deposit instead');
  }
  if (m.journalEntryId) {
    throw new AppError(409, 'This movement is already posted to the ledger and cannot be changed');
  }
};

router.patch('/movements/:id', requirePermission('canEditCollections'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const existing = await prisma.cashMovement.findFirst({ where: { id: req.params.id, pumpId } });
    if (!existing) throw new AppError(404, 'Movement not found');
    assertMovementEditable(existing);

    const data = updateCashMovementSchema.parse(req.body);
    const fromLocation = data.fromLocation ?? existing.fromLocation;
    const toLocation = data.toLocation ?? existing.toLocation;
    const rawFromEmployee =
      data.fromLocation !== undefined || data.fromEmployeeId !== undefined
        ? data.fromEmployeeId
        : existing.fromEmployeeId;
    const rawToEmployee =
      data.toLocation !== undefined || data.toEmployeeId !== undefined
        ? data.toEmployeeId
        : existing.toEmployeeId;

    const fromEmployeeId = await resolveMovementParty(pumpId, 'from', fromLocation, rawFromEmployee);
    const toEmployeeId = await resolveMovementParty(pumpId, 'to', toLocation, rawToEmployee);
    if (fromLocation === toLocation && fromEmployeeId === toEmployeeId) {
      throw new AppError(400, 'Source and destination are the same — nothing moved');
    }
    if (data.shiftReportId) await findOwnShift(pumpId, data.shiftReportId);

    const movement = await prisma.cashMovement.update({
      where: { id: existing.id },
      data: {
        fromLocation,
        fromEmployeeId,
        toLocation,
        toEmployeeId,
        ...(data.amountPaise !== undefined ? { amountPaise: data.amountPaise } : {}),
        ...(data.occurredAt !== undefined ? { occurredAt: data.occurredAt } : {}),
        ...(data.shiftReportId !== undefined ? { shiftReportId: data.shiftReportId } : {}),
        ...(data.purpose !== undefined ? { purpose: data.purpose } : {}),
        ...(data.reference !== undefined ? { reference: data.reference } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
      include: movementInclude,
    });
    res.json(movement);
  } catch (e) {
    next(e);
  }
});

router.delete('/movements/:id', requirePermission('canEditCollections'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const existing = await prisma.cashMovement.findFirst({ where: { id: req.params.id, pumpId } });
    if (!existing) throw new AppError(404, 'Movement not found');
    assertMovementEditable(existing);

    await prisma.cashMovement.delete({ where: { id: existing.id } });
    res.json({ deleted: true, movementId: existing.id });
  } catch (e) {
    next(e);
  }
});

// ===================== 2. CASH POSITION (the centrepiece) =====================

router.get('/position', requirePermission('canViewReports'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const asOf = parseDay(req.query.asOf, 'asOf') ?? dayStart(new Date().toISOString());
    const position = await computeCashPosition(pumpId, asOf);
    res.json(position);
  } catch (e) {
    next(e);
  }
});

// ===================== 3. DENOMINATION COUNT =====================

// What the shift says should be in the drawer. Hand-overs are the better source
// (they are per-person and already net of expenses paid out of hand); the cash
// channel collections are the fallback when nobody recorded a hand-over.
async function expectedShiftCash(shiftId: string) {
  const [handovers, collections] = await Promise.all([
    prisma.employeeCashHandover.findMany({
      where: { shiftReportId: shiftId },
      select: { receivedCashPaise: true, expectedCashPaise: true },
    }),
    prisma.paymentModeCollection.findMany({
      where: { shiftReportId: shiftId, channel: { kind: 'CASH' } },
      select: { amountPaise: true },
    }),
  ]);
  const handedOverPaise = handovers.reduce((s, h) => s + h.receivedCashPaise, 0n);
  const accountablePaise = handovers.reduce((s, h) => s + h.expectedCashPaise, 0n);
  const cashCollectionsPaise = collections.reduce((s, c) => s + c.amountPaise, 0n);
  return {
    handedOverPaise,
    accountablePaise,
    cashCollectionsPaise,
    handoverCount: handovers.length,
    expectedCashPaise: handovers.length > 0 ? handedOverPaise : cashCollectionsPaise,
    expectedSource: handovers.length > 0 ? ('HANDOVERS' as const) : ('CASH_COLLECTIONS' as const),
  };
}

const denominationBreakdown = (counts: DenominationCounts) =>
  DENOMINATIONS.map((d) => ({
    key: d.key,
    label: d.label,
    valuePaise: d.valuePaise,
    count: counts[d.key] ?? 0,
    subtotalPaise: BigInt(counts[d.key] ?? 0) * d.valuePaise,
  }));

const countsFromRow = (row: Record<string, unknown> | null): DenominationCounts =>
  DENOMINATIONS.reduce((acc, d) => {
    acc[d.key] = row ? Number(row[d.key] ?? 0) : 0;
    return acc;
  }, {} as DenominationCounts);

router.get(
  '/shifts/:shiftId/denomination-count',
  requirePermission('canViewReports'),
  async (req, res, next) => {
    try {
      const pumpId = requirePump(req);
      const shift = await findOwnShift(pumpId, req.params.shiftId);
      const [count, expected] = await Promise.all([
        prisma.cashDenominationCount.findUnique({ where: { shiftReportId: shift.id } }),
        expectedShiftCash(shift.id),
      ]);

      const counts = countsFromRow(count as unknown as Record<string, unknown> | null);
      // Recomputed on read too: a total stored by an older client is never trusted.
      const countedTotalPaise = count ? computeDenominationTotal(counts) : 0n;

      res.json({
        shift,
        count,
        counts,
        breakdown: denominationBreakdown(counts),
        countedTotalPaise,
        ...expected,
        closingCashPaise: shift.closingCashPaise,
        differencePaise: count ? countedTotalPaise - expected.expectedCashPaise : 0n,
        hasCount: Boolean(count),
      });
    } catch (e) {
      next(e);
    }
  },
);

router.put(
  '/shifts/:shiftId/denomination-count',
  requirePermission('canEditCollections'),
  async (req, res, next) => {
    try {
      const pumpId = requirePump(req);
      const shift = await findOwnShift(pumpId, req.params.shiftId);
      if (shift.status === ShiftStatus.LOCKED) {
        throw new AppError(409, 'This shift is locked — the cash count can no longer be changed');
      }
      const data = denominationCountSchema.parse(req.body);
      if (data.countedById) await findOwnEmployee(pumpId, data.countedById);

      const counts = DENOMINATIONS.reduce((acc, d) => {
        acc[d.key] = data[d.key];
        return acc;
      }, {} as DenominationCounts);
      // The total is derived from the notes on the table, never from the client.
      const countedTotalPaise = computeDenominationTotal(counts);

      const payload = {
        ...counts,
        countedTotalPaise,
        countedById: data.countedById ?? null,
        countedAt: data.countedAt ?? new Date(),
        notes: data.notes ?? null,
      };

      const [count, expected] = await Promise.all([
        prisma.cashDenominationCount.upsert({
          where: { shiftReportId: shift.id },
          create: { shiftReportId: shift.id, ...payload },
          update: payload,
        }),
        expectedShiftCash(shift.id),
      ]);

      res.json({
        shift,
        count,
        counts,
        breakdown: denominationBreakdown(counts),
        countedTotalPaise,
        ...expected,
        closingCashPaise: shift.closingCashPaise,
        differencePaise: countedTotalPaise - expected.expectedCashPaise,
        hasCount: true,
      });
    } catch (e) {
      next(e);
    }
  },
);

// ===================== 4. BANK ACCOUNTS =====================

// Balance = opening balance + credits - debits from the imported statement.
async function bankAccountBalances(accountIds: string[]) {
  if (accountIds.length === 0) return new Map<string, { credit: bigint; debit: bigint; txnCount: number }>();
  const grouped = await prisma.bankTransaction.groupBy({
    by: ['bankAccountId', 'direction'],
    where: { bankAccountId: { in: accountIds } },
    _sum: { amountPaise: true },
    _count: { _all: true },
  });
  const map = new Map<string, { credit: bigint; debit: bigint; txnCount: number }>();
  for (const id of accountIds) map.set(id, { credit: 0n, debit: 0n, txnCount: 0 });
  for (const g of grouped) {
    const entry = map.get(g.bankAccountId)!;
    const amount = g._sum.amountPaise ?? 0n;
    if (g.direction === TxnDirection.CREDIT) entry.credit += amount;
    else entry.debit += amount;
    entry.txnCount += g._count._all;
  }
  return map;
}

async function decorateBankAccounts(accounts: { id: string; openingBalancePaise: bigint }[]) {
  const ids = accounts.map((a) => a.id);
  const [balances, depositGroups] = await Promise.all([
    bankAccountBalances(ids),
    ids.length
      ? prisma.cashDeposit.groupBy({
          by: ['bankAccountId', 'status'],
          where: { bankAccountId: { in: ids } },
          _sum: { amountPaise: true },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  return accounts.map((a) => {
    const b = balances.get(a.id) ?? { credit: 0n, debit: 0n, txnCount: 0 };
    const deposits = depositGroups.filter((d) => d.bankAccountId === a.id);
    const sumBy = (status: DepositStatus) =>
      deposits
        .filter((d) => d.status === status)
        .reduce((s, d) => s + (d._sum.amountPaise ?? 0n), 0n);
    return {
      ...a,
      creditsPaise: b.credit,
      debitsPaise: b.debit,
      transactionCount: b.txnCount,
      currentBalancePaise: a.openingBalancePaise + b.credit - b.debit,
      depositsPaise: deposits.reduce((s, d) => s + (d._sum.amountPaise ?? 0n), 0n),
      depositCount: deposits.reduce((s, d) => s + d._count._all, 0),
      depositsPendingPaise: sumBy(DepositStatus.PENDING),
      depositsClearedPaise: sumBy(DepositStatus.CLEARED),
      depositsDisputedPaise: sumBy(DepositStatus.DISPUTED),
    };
  });
}

router.get('/bank-accounts', requirePermission('canViewReports'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const includeInactive = String(req.query.includeInactive || '') === 'true';
    const accounts = await prisma.bankAccount.findMany({
      where: { pumpId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: [{ isActive: 'desc' }, { bankName: 'asc' }],
    });
    res.json(await decorateBankAccounts(accounts));
  } catch (e) {
    next(e);
  }
});

router.get('/bank-accounts/:id', requirePermission('canViewReports'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const account = await findOwnBankAccount(pumpId, req.params.id);
    const [decorated] = await decorateBankAccounts([account]);
    res.json(decorated);
  } catch (e) {
    next(e);
  }
});

router.post('/bank-accounts', requirePermission('canManageBankAndSettlement'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const data = createBankAccountSchema.parse(req.body);
    const account = await prisma.bankAccount.create({
      data: {
        pumpId,
        bankName: data.bankName,
        accountNoLast4: data.accountNoLast4,
        ifsc: data.ifsc ?? null,
        nickname: data.nickname ?? null,
        openingBalancePaise: data.openingBalancePaise,
      },
    });
    const [decorated] = await decorateBankAccounts([account]);
    res.status(201).json(decorated);
  } catch (e) {
    next(e);
  }
});

router.patch('/bank-accounts/:id', requirePermission('canManageBankAndSettlement'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const existing = await findOwnBankAccount(pumpId, req.params.id);
    const data = updateBankAccountSchema.parse(req.body);
    const account = await prisma.bankAccount.update({
      where: { id: existing.id },
      data: {
        ...(data.bankName !== undefined ? { bankName: data.bankName } : {}),
        ...(data.accountNoLast4 !== undefined ? { accountNoLast4: data.accountNoLast4 } : {}),
        ...(data.ifsc !== undefined ? { ifsc: data.ifsc } : {}),
        ...(data.nickname !== undefined ? { nickname: data.nickname } : {}),
        ...(data.openingBalancePaise !== undefined
          ? { openingBalancePaise: data.openingBalancePaise }
          : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });
    const [decorated] = await decorateBankAccounts([account]);
    res.json(decorated);
  } catch (e) {
    next(e);
  }
});

// Retire an account. Anything already recorded against it keeps pointing at it,
// so this deactivates unless the account was never used.
router.delete('/bank-accounts/:id', requirePermission('canManageBankAndSettlement'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const existing = await findOwnBankAccount(pumpId, req.params.id);
    const [deposits, transactions, settlements] = await Promise.all([
      prisma.cashDeposit.count({ where: { bankAccountId: existing.id } }),
      prisma.bankTransaction.count({ where: { bankAccountId: existing.id } }),
      prisma.settlementBatch.count({ where: { bankAccountId: existing.id } }),
    ]);

    if (deposits === 0 && transactions === 0 && settlements === 0) {
      await prisma.bankAccount.delete({ where: { id: existing.id } });
      res.json({ deleted: true, bankAccountId: existing.id });
      return;
    }
    const account = await prisma.bankAccount.update({
      where: { id: existing.id },
      data: { isActive: false },
    });
    res.json({ deleted: false, deactivated: true, deposits, transactions, settlements, account });
  } catch (e) {
    next(e);
  }
});

// ===================== 5. CASH DEPOSITS =====================

const depositInclude = {
  bankAccount: { select: { id: true, bankName: true, accountNoLast4: true, nickname: true } },
  depositedByEmployee: { select: { id: true, name: true, code: true } },
  shiftReport: { select: { id: true, reportDate: true, shiftType: true } },
  movement: { select: { id: true, fromLocation: true, fromEmployeeId: true, occurredAt: true } },
} satisfies Prisma.CashDepositInclude;

router.get('/deposits', requirePermission('canViewReports'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const from = parseDay(req.query.from, 'from');
    const to = parseDay(req.query.to, 'to');
    const status = req.query.status ? String(req.query.status) : undefined;
    if (status && !(status in DepositStatus)) throw new AppError(400, 'Unknown deposit status');

    const deposits = await prisma.cashDeposit.findMany({
      where: {
        pumpId,
        ...(from || to ? { depositedOn: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
        ...(status ? { status: status as DepositStatus } : {}),
      },
      include: depositInclude,
      orderBy: [{ depositedOn: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });

    const sumWhere = (s: DepositStatus) =>
      deposits.filter((d) => d.status === s).reduce((acc, d) => acc + d.amountPaise, 0n);
    res.json({
      deposits,
      summary: {
        count: deposits.length,
        totalPaise: deposits.reduce((s, d) => s + d.amountPaise, 0n),
        pendingPaise: sumWhere(DepositStatus.PENDING),
        clearedPaise: sumWhere(DepositStatus.CLEARED),
        disputedPaise: sumWhere(DepositStatus.DISPUTED),
      },
    });
  } catch (e) {
    next(e);
  }
});

// The deposit and the cash movement that takes the money out of the pump are
// written together: cash can never show as deposited without leaving custody.
router.post('/deposits', requirePermission('canEditCollections'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const data = createCashDepositSchema.parse(req.body);
    await findOwnBankAccount(pumpId, data.bankAccountId);
    if (data.shiftReportId) await findOwnShift(pumpId, data.shiftReportId);
    if (data.depositedByEmployeeId) await findOwnEmployee(pumpId, data.depositedByEmployeeId);
    if (data.fromLocation === CashLocation.BANK) {
      throw new AppError(400, 'Cash cannot be deposited from the bank into the bank');
    }
    const fromEmployeeId = await resolveMovementParty(
      pumpId,
      'from',
      data.fromLocation,
      data.fromEmployeeId,
    );

    const depositedOn = dayStart(data.depositedOn);
    const deposit = await prisma.$transaction(async (tx) => {
      const created = await tx.cashDeposit.create({
        data: {
          pumpId,
          bankAccountId: data.bankAccountId,
          shiftReportId: data.shiftReportId ?? null,
          amountPaise: data.amountPaise,
          depositedOn,
          slipNo: data.slipNo ?? null,
          depositedByEmployeeId: data.depositedByEmployeeId ?? null,
          notes: data.notes ?? null,
          createdById: req.user!.userId,
        },
      });
      await tx.cashMovement.create({
        data: {
          pumpId,
          shiftReportId: data.shiftReportId ?? null,
          fromLocation: data.fromLocation,
          fromEmployeeId,
          toLocation: CashLocation.BANK,
          toEmployeeId: null,
          amountPaise: data.amountPaise,
          occurredAt: depositedOn,
          cashDepositId: created.id,
          purpose: 'Bank deposit',
          reference: data.slipNo ?? null,
          recordedById: req.user!.userId,
        },
      });
      return tx.cashDeposit.findUniqueOrThrow({ where: { id: created.id }, include: depositInclude });
    });

    res.status(201).json(deposit);
  } catch (e) {
    next(e);
  }
});

router.patch('/deposits/:id', requirePermission('canEditCollections'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const existing = await findOwnDeposit(pumpId, req.params.id);
    const data = updateCashDepositSchema.parse(req.body);
    if (data.bankAccountId) await findOwnBankAccount(pumpId, data.bankAccountId);

    const deposit = await prisma.$transaction(async (tx) => {
      const updated = await tx.cashDeposit.update({
        where: { id: existing.id },
        data: {
          ...(data.status !== undefined ? { status: data.status as DepositStatus } : {}),
          ...(data.slipNo !== undefined ? { slipNo: data.slipNo } : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
          ...(data.bankAccountId !== undefined ? { bankAccountId: data.bankAccountId } : {}),
          ...(data.depositedOn !== undefined ? { depositedOn: dayStart(data.depositedOn) } : {}),
        },
      });
      // Keep the custody trail in step with the slip.
      if (existing.movement && (data.depositedOn !== undefined || data.slipNo !== undefined)) {
        await tx.cashMovement.update({
          where: { id: existing.movement.id },
          data: {
            ...(data.depositedOn !== undefined ? { occurredAt: dayStart(data.depositedOn) } : {}),
            ...(data.slipNo !== undefined ? { reference: data.slipNo } : {}),
          },
        });
      }
      return tx.cashDeposit.findUniqueOrThrow({ where: { id: updated.id }, include: depositInclude });
    });

    res.json(deposit);
  } catch (e) {
    next(e);
  }
});

// ===================== 6. DIGITAL SETTLEMENT RECONCILIATION =====================

// difference = settled + mdr - expected.
//   0  -> reconciled
//  < 0 -> money is missing (SHORT)
//  > 0 -> the bank credited more than was taken: also wrong, so DISPUTED.
// While nothing has been claimed yet the batch stays EXPECTED with a zero
// difference; showing -expected before settlement day would cry wolf.
const deriveSettlement = (opts: {
  expectedPaise: bigint;
  settledPaise: bigint;
  mdrPaise: bigint;
  settledOn: Date | null;
  forceDisputed?: boolean;
}) => {
  const untouched = opts.settledPaise === 0n && opts.mdrPaise === 0n && !opts.settledOn;
  if (untouched) {
    return {
      differencePaise: 0n,
      status: opts.forceDisputed ? SettlementStatus.DISPUTED : SettlementStatus.EXPECTED,
    };
  }
  const differencePaise = opts.settledPaise + opts.mdrPaise - opts.expectedPaise;
  if (opts.forceDisputed) return { differencePaise, status: SettlementStatus.DISPUTED };
  if (differencePaise === 0n) return { differencePaise, status: SettlementStatus.SETTLED };
  if (differencePaise < 0n) return { differencePaise, status: SettlementStatus.SHORT };
  return { differencePaise, status: SettlementStatus.DISPUTED };
};

const settlementInclude = {
  channel: { select: { id: true, name: true, kind: true } },
  bankAccount: { select: { id: true, bankName: true, accountNoLast4: true, nickname: true } },
} satisfies Prisma.SettlementBatchInclude;

// Rebuild the expected side of every non-cash channel for a date range from the
// pump's own locked collections. Settled figures already recorded are preserved.
router.post('/settlements/build', requirePermission('canManageBankAndSettlement'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const from = parseDay(req.query.from, 'from');
    const to = parseDay(req.query.to, 'to');
    if (!from || !to) throw new AppError(400, 'from and to are required (YYYY-MM-DD)');
    if (from > to) throw new AppError(400, 'from must not be after to');

    const channels = await prisma.paymentChannel.findMany({
      where: { pumpId, kind: { not: 'CASH' } },
      select: { id: true, name: true, kind: true },
    });
    if (channels.length === 0) {
      res.json({ created: 0, updated: 0, removed: 0, batches: [], message: 'No non-cash payment channels are set up' });
      return;
    }
    const channelIds = channels.map((c) => c.id);

    const collections = await prisma.paymentModeCollection.findMany({
      where: {
        channelId: { in: channelIds },
        shiftReport: { pumpId, status: ShiftStatus.LOCKED, reportDate: { gte: from, lte: to } },
      },
      select: { channelId: true, amountPaise: true, shiftReport: { select: { reportDate: true } } },
    });

    const expectedByKey = new Map<string, { channelId: string; businessDate: Date; expectedPaise: bigint }>();
    for (const c of collections) {
      const date = c.shiftReport.reportDate;
      const key = `${c.channelId}|${dateOnlyStr(date)}`;
      const entry = expectedByKey.get(key);
      if (entry) entry.expectedPaise += c.amountPaise;
      else
        expectedByKey.set(key, {
          channelId: c.channelId,
          businessDate: dayStart(dateOnlyStr(date)),
          expectedPaise: c.amountPaise,
        });
    }

    const existing = await prisma.settlementBatch.findMany({
      where: { pumpId, channelId: { in: channelIds }, businessDate: { gte: from, lte: to } },
    });
    const existingByKey = new Map(
      existing.map((b) => [`${b.channelId}|${dateOnlyStr(b.businessDate)}`, b]),
    );

    let created = 0;
    let updated = 0;
    let removed = 0;

    for (const [key, want] of expectedByKey) {
      const prev = existingByKey.get(key);
      if (!prev) {
        const derived = deriveSettlement({
          expectedPaise: want.expectedPaise,
          settledPaise: 0n,
          mdrPaise: 0n,
          settledOn: null,
        });
        await prisma.settlementBatch.create({
          data: {
            pumpId,
            channelId: want.channelId,
            businessDate: want.businessDate,
            expectedPaise: want.expectedPaise,
            differencePaise: derived.differencePaise,
            status: derived.status,
          },
        });
        created += 1;
        continue;
      }
      const derived = deriveSettlement({
        expectedPaise: want.expectedPaise,
        settledPaise: prev.settledPaise,
        mdrPaise: prev.mdrPaise,
        settledOn: prev.settledOn,
        forceDisputed: prev.status === SettlementStatus.DISPUTED,
      });
      if (
        prev.expectedPaise !== want.expectedPaise ||
        prev.differencePaise !== derived.differencePaise ||
        prev.status !== derived.status
      ) {
        await prisma.settlementBatch.update({
          where: { id: prev.id },
          data: {
            expectedPaise: want.expectedPaise,
            differencePaise: derived.differencePaise,
            status: derived.status,
          },
        });
        updated += 1;
      }
    }

    // A batch whose collections have disappeared (shift unlocked, entry deleted)
    // is dropped — but only while nobody has recorded a settlement against it.
    for (const [key, prev] of existingByKey) {
      if (expectedByKey.has(key)) continue;
      const untouched =
        prev.settledPaise === 0n && prev.mdrPaise === 0n && !prev.settledOn && !prev.reference;
      if (!untouched) continue;
      await prisma.settlementBatch.delete({ where: { id: prev.id } });
      removed += 1;
    }

    const batches = await prisma.settlementBatch.findMany({
      where: { pumpId, businessDate: { gte: from, lte: to } },
      include: settlementInclude,
      orderBy: [{ businessDate: 'desc' }, { channelId: 'asc' }],
    });
    res.json({ created, updated, removed, batches });
  } catch (e) {
    next(e);
  }
});

router.get('/settlements', requirePermission('canViewReports'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const from = parseDay(req.query.from, 'from');
    const to = parseDay(req.query.to, 'to');
    const status = req.query.status ? String(req.query.status) : undefined;
    const channelId = req.query.channelId ? String(req.query.channelId) : undefined;
    if (status && !(status in SettlementStatus)) throw new AppError(400, 'Unknown settlement status');
    if (channelId) {
      const channel = await prisma.paymentChannel.findFirst({ where: { id: channelId, pumpId } });
      if (!channel) throw new AppError(404, 'Payment channel not found');
    }

    const batches = await prisma.settlementBatch.findMany({
      where: {
        pumpId,
        ...(from || to
          ? { businessDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
          : {}),
        ...(status ? { status: status as SettlementStatus } : {}),
        ...(channelId ? { channelId } : {}),
      },
      include: settlementInclude,
      orderBy: [{ businessDate: 'desc' }, { channelId: 'asc' }],
      take: 1000,
    });

    const sum = (pick: (b: (typeof batches)[number]) => bigint) =>
      batches.reduce((s, b) => s + pick(b), 0n);
    const shortfalls = batches.filter((b) => b.status === SettlementStatus.SHORT);
    const unreconciled = batches.filter((b) => b.status !== SettlementStatus.SETTLED);

    res.json({
      batches,
      summary: {
        count: batches.length,
        expectedPaise: sum((b) => b.expectedPaise),
        settledPaise: sum((b) => b.settledPaise),
        mdrPaise: sum((b) => b.mdrPaise),
        // What the pump is still waiting for, at its own valuation.
        unreconciledCount: unreconciled.length,
        unreconciledExpectedPaise: unreconciled.reduce((s, b) => s + b.expectedPaise, 0n),
        // Money that simply never arrived, as a positive number.
        shortfallCount: shortfalls.length,
        shortfallPaise: shortfalls.reduce((s, b) => s - b.differencePaise, 0n),
        byStatus: Object.values(SettlementStatus).map((s) => ({
          status: s,
          count: batches.filter((b) => b.status === s).length,
          expectedPaise: batches
            .filter((b) => b.status === s)
            .reduce((acc, b) => acc + b.expectedPaise, 0n),
        })),
      },
    });
  } catch (e) {
    next(e);
  }
});

router.patch('/settlements/:id', requirePermission('canManageBankAndSettlement'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const existing = await findOwnSettlement(pumpId, req.params.id);
    const data = updateSettlementSchema.parse(req.body);
    if (data.bankAccountId) await findOwnBankAccount(pumpId, data.bankAccountId);

    const settledPaise = data.settledPaise ?? existing.settledPaise;
    const mdrPaise = data.mdrPaise ?? existing.mdrPaise;
    const settledOn =
      data.settledOn === undefined
        ? existing.settledOn
        : data.settledOn === null
          ? null
          : dayStart(data.settledOn);

    const derived = deriveSettlement({
      expectedPaise: existing.expectedPaise,
      settledPaise,
      mdrPaise,
      settledOn,
      forceDisputed: data.status === 'DISPUTED',
    });

    const batch = await prisma.settlementBatch.update({
      where: { id: existing.id },
      data: {
        settledPaise,
        mdrPaise,
        settledOn,
        differencePaise: derived.differencePaise,
        status: derived.status,
        ...(data.bankAccountId !== undefined ? { bankAccountId: data.bankAccountId } : {}),
        ...(data.reference !== undefined ? { reference: data.reference } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
      include: settlementInclude,
    });
    res.json(batch);
  } catch (e) {
    next(e);
  }
});

// ===================== 7. BANK STATEMENT IMPORT & MATCHING =====================

// The UI parses the pasted CSV and posts the rows; nothing is fetched from
// anywhere. Rows identical to ones already stored are skipped, so pasting an
// overlapping statement twice does not duplicate the month.
router.post(
  '/bank-accounts/:id/transactions/import',
  requirePermission('canManageBankAndSettlement'),
  async (req, res, next) => {
    try {
      const pumpId = requirePump(req);
      const account = await findOwnBankAccount(pumpId, req.params.id);
      const data = importBankTransactionsSchema.parse(req.body);

      const dates = data.rows.map((r) => dayStart(r.txnDate));
      const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
      const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));

      const existing = await prisma.bankTransaction.findMany({
        where: { bankAccountId: account.id, txnDate: { gte: minDate, lte: maxDate } },
        select: {
          txnDate: true,
          description: true,
          amountPaise: true,
          direction: true,
          reference: true,
        },
      });
      const fingerprint = (r: {
        txnDate: Date | string;
        description: string;
        amountPaise: bigint;
        direction: TxnDirection;
        reference: string | null;
      }) =>
        [
          typeof r.txnDate === 'string' ? r.txnDate.slice(0, 10) : dateOnlyStr(r.txnDate),
          r.description.trim().toLowerCase(),
          r.amountPaise.toString(),
          r.direction,
          (r.reference ?? '').trim().toLowerCase(),
        ].join('|');

      const seen = new Set(existing.map(fingerprint));
      const toCreate: Prisma.BankTransactionCreateManyInput[] = [];
      let skipped = 0;

      for (const row of data.rows) {
        const fp = fingerprint({
          txnDate: row.txnDate,
          description: row.description,
          amountPaise: row.amountPaise,
          direction: row.direction as TxnDirection,
          reference: row.reference ?? null,
        });
        if (seen.has(fp)) {
          skipped += 1;
          continue;
        }
        seen.add(fp);
        toCreate.push({
          bankAccountId: account.id,
          txnDate: dayStart(row.txnDate),
          description: row.description,
          amountPaise: row.amountPaise,
          direction: row.direction as TxnDirection,
          balancePaise: row.balancePaise ?? null,
          reference: row.reference ?? null,
          importBatch: data.importBatch ?? null,
        });
      }

      if (toCreate.length > 0) {
        await prisma.bankTransaction.createMany({ data: toCreate });
      }
      res.status(201).json({
        imported: toCreate.length,
        skipped,
        received: data.rows.length,
        importBatch: data.importBatch ?? null,
        bankAccountId: account.id,
      });
    } catch (e) {
      next(e);
    }
  },
);

router.get('/transactions', requirePermission('canViewReports'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const from = parseDay(req.query.from, 'from');
    const to = parseDay(req.query.to, 'to');
    const bankAccountId = req.query.bankAccountId ? String(req.query.bankAccountId) : undefined;
    const direction = req.query.direction ? String(req.query.direction) : undefined;
    const matchedParam = req.query.matched ? String(req.query.matched) : undefined;
    const importBatch = req.query.importBatch ? String(req.query.importBatch) : undefined;

    if (bankAccountId) await findOwnBankAccount(pumpId, bankAccountId);
    if (direction && !(direction in TxnDirection)) throw new AppError(400, 'Unknown direction');
    if (matchedParam && !['matched', 'unmatched', 'all'].includes(matchedParam)) {
      throw new AppError(400, "matched must be 'matched', 'unmatched' or 'all'");
    }

    const transactions = await prisma.bankTransaction.findMany({
      where: {
        bankAccount: { pumpId },
        ...(bankAccountId ? { bankAccountId } : {}),
        ...(from || to ? { txnDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
        ...(direction ? { direction: direction as TxnDirection } : {}),
        ...(matchedParam === 'matched' ? { isMatched: true } : {}),
        ...(matchedParam === 'unmatched' ? { isMatched: false } : {}),
        ...(importBatch ? { importBatch } : {}),
      },
      include: {
        bankAccount: { select: { id: true, bankName: true, accountNoLast4: true, nickname: true } },
      },
      orderBy: [{ txnDate: 'desc' }, { createdAt: 'desc' }],
      take: 1000,
    });

    res.json({
      transactions,
      count: transactions.length,
      unmatchedCount: transactions.filter((t) => !t.isMatched).length,
    });
  } catch (e) {
    next(e);
  }
});

router.post('/transactions/:id/match', requirePermission('canManageBankAndSettlement'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const txn = await findOwnTransaction(pumpId, req.params.id);
    const data = matchTransactionSchema.parse(req.body);
    if (txn.isMatched) throw new AppError(409, 'This line is already matched — unmatch it first');

    const warnings: string[] = [];
    let matchedId: string | null = null;

    if (data.kind === 'CASH_DEPOSIT') {
      if (!data.id) throw new AppError(400, 'Pick the deposit this line belongs to');
      const deposit = await findOwnDeposit(pumpId, data.id);
      matchedId = deposit.id;
      if (txn.direction !== TxnDirection.CREDIT) {
        warnings.push('This statement line is a debit, but a cash deposit should be a credit');
      }
      if (deposit.amountPaise !== txn.amountPaise) {
        warnings.push('The deposit slip and the statement line are for different amounts');
      }
      if (deposit.bankAccountId !== txn.bankAccountId) {
        warnings.push('The deposit was recorded against a different bank account');
      }
    } else if (data.kind === 'SETTLEMENT') {
      if (!data.id) throw new AppError(400, 'Pick the settlement this line belongs to');
      const batch = await findOwnSettlement(pumpId, data.id);
      matchedId = batch.id;
      if (txn.direction !== TxnDirection.CREDIT) {
        warnings.push('This statement line is a debit, but a settlement should be a credit');
      }
      const claimed = batch.settledPaise > 0n ? batch.settledPaise : batch.expectedPaise;
      if (claimed !== txn.amountPaise) {
        warnings.push(
          batch.settledPaise > 0n
            ? 'The recorded settled amount and the statement line differ'
            : 'The statement line does not equal the expected amount — record the settled amount and MDR',
        );
      }
    } else if (data.id) {
      throw new AppError(400, "A kind of 'OTHER' cannot point at a record");
    }

    const updated = await prisma.bankTransaction.update({
      where: { id: txn.id },
      data: {
        isMatched: true,
        matchedKind: data.kind,
        matchedId,
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
    });
    res.json({ transaction: updated, warnings });
  } catch (e) {
    next(e);
  }
});

router.post('/transactions/:id/unmatch', requirePermission('canManageBankAndSettlement'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const txn = await findOwnTransaction(pumpId, req.params.id);
    const updated = await prisma.bankTransaction.update({
      where: { id: txn.id },
      data: { isMatched: false, matchedKind: null, matchedId: null },
    });
    res.json({ transaction: updated });
  } catch (e) {
    next(e);
  }
});

router.get('/reconciliation-summary', requirePermission('canViewReports'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const from = parseDay(req.query.from, 'from');
    const to = parseDay(req.query.to, 'to');
    const bankAccountId = req.query.bankAccountId ? String(req.query.bankAccountId) : undefined;
    if (bankAccountId) await findOwnBankAccount(pumpId, bankAccountId);

    const where: Prisma.BankTransactionWhereInput = {
      bankAccount: { pumpId },
      ...(bankAccountId ? { bankAccountId } : {}),
      ...(from || to ? { txnDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    };

    const grouped = await prisma.bankTransaction.groupBy({
      by: ['direction', 'isMatched'],
      where,
      _sum: { amountPaise: true },
      _count: { _all: true },
    });

    const cell = (direction: TxnDirection, isMatched: boolean) => {
      const g = grouped.find((x) => x.direction === direction && x.isMatched === isMatched);
      return { count: g?._count._all ?? 0, amountPaise: g?._sum.amountPaise ?? 0n };
    };

    // Deposits and settlements the pump believes in but the statement never showed.
    const [unlinkedDeposits, unlinkedSettlements] = await Promise.all([
      prisma.cashDeposit.findMany({
        where: {
          pumpId,
          ...(bankAccountId ? { bankAccountId } : {}),
          ...(from || to
            ? { depositedOn: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
            : {}),
          status: { not: DepositStatus.CLEARED },
        },
        select: { id: true, amountPaise: true, depositedOn: true, slipNo: true, status: true },
        orderBy: { depositedOn: 'desc' },
        take: 200,
      }),
      prisma.settlementBatch.findMany({
        where: {
          pumpId,
          status: { not: SettlementStatus.SETTLED },
          ...(from || to
            ? { businessDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
            : {}),
        },
        include: settlementInclude,
        orderBy: { businessDate: 'desc' },
        take: 200,
      }),
    ]);

    const credits = { matched: cell(TxnDirection.CREDIT, true), unmatched: cell(TxnDirection.CREDIT, false) };
    const debits = { matched: cell(TxnDirection.DEBIT, true), unmatched: cell(TxnDirection.DEBIT, false) };

    res.json({
      bankAccountId: bankAccountId ?? null,
      from: from ? dateOnlyStr(from) : null,
      to: to ? dateOnlyStr(to) : null,
      credits,
      debits,
      matchedCount: credits.matched.count + debits.matched.count,
      unmatchedCount: credits.unmatched.count + debits.unmatched.count,
      unmatchedCreditPaise: credits.unmatched.amountPaise,
      unmatchedDebitPaise: debits.unmatched.amountPaise,
      openDeposits: unlinkedDeposits,
      openDepositsPaise: unlinkedDeposits.reduce((s, d) => s + d.amountPaise, 0n),
      openSettlements: unlinkedSettlements,
      openSettlementsExpectedPaise: unlinkedSettlements.reduce((s, b) => s + b.expectedPaise, 0n),
    });
  } catch (e) {
    next(e);
  }
});

export default router;

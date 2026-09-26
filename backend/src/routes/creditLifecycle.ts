// Credit customer lifecycle: monthly statements, the cheque / RTGS register with
// bounce handling, ageing by DUE DATE and copy-and-send payment reminders.
//
// DOUBLE-COUNTING RULE (read before changing anything here): a customer's
// `currentBalancePaise` is moved when a shift report is LOCKED. Statements and
// ageing therefore only ever count activity from LOCKED shifts — counting a DRAFT
// or SUBMITTED shift would bill the customer once now and again when the shift is
// locked. The single exception in this file is the cheque-bounce reversal, which
// deliberately increments `currentBalancePaise` because a bounced cheque means the
// money never arrived. No ledger service is touched from here.

import { Router } from 'express';
import { prisma } from '../lib/db';
import { requireAuth, requirePermission } from '../middleware/auth';
import { AppError } from '../middleware/error';
import {
  generateStatementSchema,
  updateStatementSchema,
  createInstrumentSchema,
  updateInstrumentSchema,
} from '../schemas/creditLifecycle';
import {
  ageDueItems,
  addDays,
  assertStatementTransition,
  buildReminderMessage,
  buildStatementNo,
  cash269STWarning,
  dayOnly,
  deriveStatementStatus,
  emptyBuckets,
  formatDay,
  nextDay,
  todayUTC,
  type AgeingBucket,
  type DueItem,
} from '../services/creditLifecycle';

const router = Router();
router.use(requireAuth);

const requirePump = (req: any) => {
  if (!req.user.pumpId) throw new AppError(400, 'No pump assigned to user');
  return req.user.pumpId as string;
};

const userId = (req: any) => req.user.userId as string;

// ---------------------------------------------------------------------------
// Pump scoping. Every customer / statement / instrument lookup goes through one
// of these: a caller must never reach another pump's customer by guessing an id.
// ---------------------------------------------------------------------------

async function findOwnCustomer(req: any, customerId: string) {
  const pumpId = requirePump(req);
  const customer = await prisma.creditCustomer.findFirst({ where: { id: customerId, pumpId } });
  if (!customer) throw new AppError(404, 'Customer not found');
  return customer;
}

async function findOwnStatement(req: any, id: string) {
  const pumpId = requirePump(req);
  const statement = await prisma.customerStatement.findFirst({
    where: { id, customer: { pumpId } },
    include: { customer: true },
  });
  if (!statement) throw new AppError(404, 'Statement not found');
  return statement;
}

async function findOwnInstrument(req: any, id: string) {
  const pumpId = requirePump(req);
  const instrument = await prisma.paymentInstrument.findFirst({
    where: { id, customer: { pumpId } },
    include: { customer: { select: { id: true, name: true, code: true, phone: true } } },
  });
  if (!instrument) throw new AppError(404, 'Payment instrument not found');
  return instrument;
}

const str = (v: unknown): string | undefined => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s === '' ? undefined : s;
};

const parseDayParam = (v: unknown, field: string): Date | undefined => {
  const s = str(v);
  if (!s) return undefined;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? s + 'T00:00:00Z' : s);
  if (Number.isNaN(d.getTime())) throw new AppError(400, `${field} is not a valid date`);
  return dayOnly(d);
};

const LOCKED = { shiftReport: { status: 'LOCKED' as const } };

// ---------------------------------------------------------------------------
// Money received against a statement.
//
// A statement's closing balance is what the customer owed on `periodTo`. Anything
// that arrives AFTER that date is a payment against the bill. Two sources count:
//   - OutstandingReceipt rows from LOCKED shifts (the normal path), and
//   - CLEARED PaymentInstrument rows that are NOT linked to an OutstandingReceipt
//     (money banked outside a shift). Linked instruments are skipped, otherwise the
//     same rupee would be counted twice.
// The window is closed off at the next statement's periodTo, so once a later
// statement rolls the balance forward an old bill's paid figure stops moving.
// ---------------------------------------------------------------------------

type PaidSource = {
  receipts: { customerId: string | null; amountPaise: bigint; receivedAt: Date }[];
  instruments: {
    customerId: string;
    amountPaise: bigint;
    receivedOn: Date;
    status: string;
    outstandingReceiptId: string | null;
  }[];
};

function paidAgainst(
  statement: { customerId: string; periodTo: Date },
  nextPeriodTo: Date | null,
  src: PaidSource,
): bigint {
  const from = nextDay(statement.periodTo);
  const untilExclusive = nextPeriodTo ? nextDay(nextPeriodTo) : null;
  const inWindow = (d: Date) =>
    d >= from && (untilExclusive === null || d < untilExclusive);

  let paid = 0n;
  for (const r of src.receipts) {
    if (r.customerId !== statement.customerId) continue;
    if (inWindow(r.receivedAt)) paid += r.amountPaise;
  }
  for (const i of src.instruments) {
    if (i.customerId !== statement.customerId) continue;
    if (i.status !== 'CLEARED' || i.outstandingReceiptId) continue;
    if (inWindow(i.receivedOn)) paid += i.amountPaise;
  }
  return paid;
}

async function loadPaidSources(customerIds: string[]): Promise<PaidSource> {
  if (customerIds.length === 0) return { receipts: [], instruments: [] };
  const [receipts, instruments] = await Promise.all([
    prisma.outstandingReceipt.findMany({
      where: { customerId: { in: customerIds }, ...LOCKED },
      select: { customerId: true, amountPaise: true, receivedAt: true },
    }),
    prisma.paymentInstrument.findMany({
      where: { customerId: { in: customerIds } },
      select: {
        customerId: true,
        amountPaise: true,
        receivedOn: true,
        status: true,
        outstandingReceiptId: true,
      },
    }),
  ]);
  return { receipts, instruments };
}

// ===================== STATEMENTS =====================

router.post(
  '/statements/generate',
  requirePermission('canManageCreditCustomers'),
  async (req, res, next) => {
    try {
      const data = generateStatementSchema.parse(req.body);
      const customer = await findOwnCustomer(req, data.customerId);
      const { periodFrom, periodTo } = data;
      const periodEnd = nextDay(periodTo); // exclusive upper bound for timestamps

      // One period, one statement: overlapping bills for the same customer would
      // double-bill the same fuel.
      const clash = await prisma.customerStatement.findFirst({
        where: {
          customerId: customer.id,
          periodFrom: { lte: periodTo },
          periodTo: { gte: periodFrom },
        },
        orderBy: { periodFrom: 'asc' },
      });
      if (clash) {
        throw new AppError(
          400,
          `Statement ${clash.statementNo} already covers ${formatDay(clash.periodFrom)} to ` +
            `${formatDay(clash.periodTo)} for this customer. Pick a period that does not overlap.`,
        );
      }

      const previous = await prisma.customerStatement.findFirst({
        where: { customerId: customer.id, periodTo: { lt: periodFrom } },
        orderBy: { periodTo: 'desc' },
      });

      const [priorSales, priorReceipts, periodSales, periodReceipts] = await Promise.all([
        previous
          ? null
          : prisma.creditSale.aggregate({
              where: { customerId: customer.id, saleAt: { lt: periodFrom }, ...LOCKED },
              _sum: { amountCreditPaise: true },
            }),
        previous
          ? null
          : prisma.outstandingReceipt.aggregate({
              where: { customerId: customer.id, receivedAt: { lt: periodFrom }, ...LOCKED },
              _sum: { amountPaise: true },
            }),
        prisma.creditSale.aggregate({
          where: { customerId: customer.id, saleAt: { gte: periodFrom, lt: periodEnd }, ...LOCKED },
          _sum: { amountCreditPaise: true },
        }),
        prisma.outstandingReceipt.aggregate({
          where: {
            customerId: customer.id,
            receivedAt: { gte: periodFrom, lt: periodEnd },
            ...LOCKED,
          },
          _sum: { amountPaise: true },
        }),
      ]);

      // Opening balance: carry the previous bill's closing figure forward, otherwise
      // reconstruct it from LOCKED activity before the period started.
      const openingBalancePaise = previous
        ? previous.closingBalancePaise
        : (priorSales?._sum.amountCreditPaise ?? 0n) - (priorReceipts?._sum.amountPaise ?? 0n);

      const salesPaise = periodSales._sum.amountCreditPaise ?? 0n;
      const receiptsPaise = periodReceipts._sum.amountPaise ?? 0n;
      const closingBalancePaise = openingBalancePaise + salesPaise - receiptsPaise;
      const dueDate = addDays(periodTo, customer.paymentTermsDays);

      // Human-readable, sequential per customer: CODE-001/2026-09.
      const existing = await prisma.customerStatement.findMany({
        where: { customerId: customer.id },
        select: { statementNo: true },
      });
      const taken = new Set(existing.map((s) => s.statementNo));
      let seq = existing.length + 1;
      let statementNo = buildStatementNo(customer.code, periodTo, seq);
      while (taken.has(statementNo) && seq < existing.length + 200) {
        seq += 1;
        statementNo = buildStatementNo(customer.code, periodTo, seq);
      }

      const statement = await prisma.customerStatement.create({
        data: {
          customerId: customer.id,
          statementNo,
          periodFrom,
          periodTo,
          dueDate,
          openingBalancePaise,
          salesPaise,
          receiptsPaise,
          closingBalancePaise,
          status: 'DRAFT',
          notes: data.notes ?? null,
          createdById: userId(req),
        },
      });

      const derived = deriveStatementStatus(statement, 0n, todayUTC());
      res.status(201).json({
        ...statement,
        derived,
        customer: {
          id: customer.id,
          name: customer.name,
          code: customer.code,
          phone: customer.phone,
          paymentTermsDays: customer.paymentTermsDays,
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

router.get('/statements', requirePermission('canViewReports'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const customerId = str(req.query.customerId);
    const statusFilter = str(req.query.status);
    const overdueOnly = String(req.query.overdueOnly || '') === 'true';

    if (customerId) await findOwnCustomer(req, customerId);

    const statements = await prisma.customerStatement.findMany({
      where: { customer: { pumpId }, ...(customerId ? { customerId } : {}) },
      orderBy: [{ periodTo: 'desc' }, { createdAt: 'desc' }],
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            code: true,
            phone: true,
            paymentTermsDays: true,
            currentBalancePaise: true,
            creditLimitPaise: true,
          },
        },
      },
    });

    const src = await loadPaidSources([...new Set(statements.map((s) => s.customerId))]);
    const asOf = todayUTC();

    // For each statement, the next one for the same customer closes its payment window.
    const byCustomer = new Map<string, typeof statements>();
    for (const s of statements) {
      const list = byCustomer.get(s.customerId) ?? [];
      list.push(s);
      byCustomer.set(s.customerId, list);
    }
    const nextPeriodToOf = new Map<string, Date | null>();
    for (const list of byCustomer.values()) {
      const asc = [...list].sort((a, b) => a.periodTo.getTime() - b.periodTo.getTime());
      asc.forEach((s, i) => nextPeriodToOf.set(s.id, asc[i + 1]?.periodTo ?? null));
    }

    let rows = statements.map((s) => {
      const paid = paidAgainst(s, nextPeriodToOf.get(s.id) ?? null, src);
      return { ...s, derived: deriveStatementStatus(s, paid, asOf) };
    });

    if (overdueOnly) rows = rows.filter((r) => r.derived.isOverdue);
    if (statusFilter) rows = rows.filter((r) => r.derived.status === statusFilter);

    res.json({
      statements: rows,
      totals: {
        count: rows.length,
        closingBalancePaise: rows.reduce((s, r) => s + r.closingBalancePaise, 0n),
        unpaidPaise: rows.reduce((s, r) => s + r.derived.unpaidPaise, 0n),
        overdueCount: rows.filter((r) => r.derived.isOverdue).length,
      },
      appliedFilters: { customerId, status: statusFilter, overdueOnly: overdueOnly || undefined },
    });
  } catch (e) {
    next(e);
  }
});

router.get('/statements/:id', requirePermission('canViewReports'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const statement = await findOwnStatement(req, req.params.id);
    const periodEnd = nextDay(statement.periodTo);

    const [pump, sales, receipts, later, instrumentsInPeriod] = await Promise.all([
      prisma.pump.findUnique({
        where: { id: pumpId },
        select: { name: true, code: true, address: true, city: true, state: true },
      }),
      // Itemised lines — LOCKED shifts only, same rule as the totals above.
      prisma.creditSale.findMany({
        where: {
          customerId: statement.customerId,
          saleAt: { gte: statement.periodFrom, lt: periodEnd },
          ...LOCKED,
        },
        orderBy: { saleAt: 'asc' },
        include: { vehicle: { select: { vehicleNo: true } } },
      }),
      prisma.outstandingReceipt.findMany({
        where: {
          customerId: statement.customerId,
          receivedAt: { gte: statement.periodFrom, lt: periodEnd },
          ...LOCKED,
        },
        orderBy: { receivedAt: 'asc' },
      }),
      prisma.customerStatement.findFirst({
        where: { customerId: statement.customerId, periodTo: { gt: statement.periodTo } },
        orderBy: { periodTo: 'asc' },
        select: { id: true, statementNo: true, periodTo: true },
      }),
      prisma.paymentInstrument.findMany({
        where: {
          customerId: statement.customerId,
          receivedOn: { gte: statement.periodFrom },
        },
        orderBy: [{ receivedOn: 'asc' }],
      }),
    ]);

    const src = await loadPaidSources([statement.customerId]);
    const paid = paidAgainst(statement, later?.periodTo ?? null, src);
    const derived = deriveStatementStatus(statement, paid, todayUTC());

    res.json({
      ...statement,
      derived,
      pump,
      nextStatement: later ?? null,
      lines: {
        sales: sales.map((s) => ({
          id: s.id,
          saleAt: s.saleAt,
          vehicleNo: s.vehicle?.vehicleNo ?? s.vehicleNo ?? null,
          fuelType: s.fuelType,
          quantityMl: s.quantityMl,
          ratePaise: s.ratePaise,
          totalAmountPaise: s.totalAmountPaise,
          amountPaidPaise: s.amountPaidPaise,
          amountCreditPaise: s.amountCreditPaise,
        })),
        receipts: receipts.map((r) => ({
          id: r.id,
          receivedAt: r.receivedAt,
          reference: r.reference,
          amountPaise: r.amountPaise,
        })),
        // Instruments recorded from the period start onwards — the cheques and
        // transfers behind those receipts, plus anything received since the bill.
        instruments: instrumentsInPeriod.map((i) => ({
          id: i.id,
          kind: i.kind,
          amountPaise: i.amountPaise,
          receivedOn: i.receivedOn,
          chequeNo: i.chequeNo,
          chequeDate: i.chequeDate,
          bankName: i.bankName,
          utrNo: i.utrNo,
          status: i.status,
          bouncedOn: i.bouncedOn,
          bounceReason: i.bounceReason,
          afterPeriod: i.receivedOn >= periodEnd,
        })),
      },
    });
  } catch (e) {
    next(e);
  }
});

router.patch(
  '/statements/:id',
  requirePermission('canManageCreditCustomers'),
  async (req, res, next) => {
    try {
      const statement = await findOwnStatement(req, req.params.id);
      const data = updateStatementSchema.parse(req.body);

      const later = await prisma.customerStatement.findFirst({
        where: { customerId: statement.customerId, periodTo: { gt: statement.periodTo } },
        orderBy: { periodTo: 'asc' },
        select: { periodTo: true },
      });
      const src = await loadPaidSources([statement.customerId]);
      const paid = paidAgainst(statement, later?.periodTo ?? null, src);

      const update: {
        status?: 'DRAFT' | 'SENT';
        sentAt?: Date | null;
        sentVia?: string | null;
        notes?: string | null;
      } = {};

      if (data.status) {
        // PAID / PARTIALLY_PAID / OVERDUE are facts about money, derived on read —
        // the client can only move the bill between DRAFT and SENT.
        assertStatementTransition(statement.status, data.status, paid);
        update.status = data.status;
        if (data.status === 'SENT') {
          update.sentAt = new Date();
          update.sentVia = data.sentVia ?? statement.sentVia ?? null;
        } else {
          update.sentAt = null;
          update.sentVia = null;
        }
      } else if (data.sentVia !== undefined) {
        if (statement.status === 'DRAFT') {
          throw new AppError(400, 'Mark the statement as sent before recording how it was sent');
        }
        update.sentVia = data.sentVia;
      }

      if (data.notes !== undefined) update.notes = data.notes;

      const saved = await prisma.customerStatement.update({
        where: { id: statement.id },
        data: update,
      });

      res.json({
        ...saved,
        derived: deriveStatementStatus(saved, paid, todayUTC()),
      });
    } catch (e) {
      next(e);
    }
  },
);

// ===================== CHEQUE / INSTRUMENT REGISTER =====================

const instrumentCustomerSelect = {
  select: { id: true, name: true, code: true, phone: true },
} as const;

router.post('/instruments', requirePermission('canManageCreditCustomers'), async (req, res, next) => {
  try {
    const data = createInstrumentSchema.parse(req.body);
    const customer = await findOwnCustomer(req, data.customerId);

    // Recording an instrument does NOT move the customer balance: balances move when
    // a shift is locked, and the same money would otherwise be credited twice. The
    // register exists to answer "which cheques are still to clear".
    const instrument = await prisma.paymentInstrument.create({
      data: {
        customerId: customer.id,
        kind: data.kind,
        amountPaise: data.amountPaise,
        receivedOn: data.receivedOn,
        chequeNo: data.chequeNo ?? null,
        chequeDate: data.chequeDate ?? null,
        bankName: data.bankName ?? null,
        utrNo: data.utrNo ?? null,
        notes: data.notes ?? null,
        // CASH and UPI are in hand the moment they are taken; a cheque or bank
        // transfer is only money once it clears.
        status: data.kind === 'CASH' || data.kind === 'UPI' ? 'CLEARED' : 'PENDING',
        clearedOn: data.kind === 'CASH' || data.kind === 'UPI' ? data.receivedOn : null,
        createdById: userId(req),
      },
      include: { customer: instrumentCustomerSelect },
    });

    const warning = cash269STWarning(data.kind, data.amountPaise);
    res.status(201).json({ ...instrument, warnings: warning ? [warning] : [] });
  } catch (e) {
    next(e);
  }
});

router.get('/instruments', requirePermission('canViewReports'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const status = str(req.query.status);
    const customerId = str(req.query.customerId);
    const dueBefore = parseDayParam(req.query.dueBefore, 'dueBefore');

    if (status && !['PENDING', 'CLEARED', 'BOUNCED', 'CANCELLED'].includes(status)) {
      throw new AppError(400, 'status must be PENDING, CLEARED, BOUNCED or CANCELLED');
    }
    if (customerId) await findOwnCustomer(req, customerId);

    const instruments = await prisma.paymentInstrument.findMany({
      where: {
        customer: { pumpId },
        ...(status ? { status: status as any } : {}),
        ...(customerId ? { customerId } : {}),
        // `dueBefore` reads against the cheque date — "what is bankable by this day".
        ...(dueBefore ? { chequeDate: { lte: dueBefore } } : {}),
      },
      orderBy: [{ chequeDate: 'asc' }, { receivedOn: 'desc' }],
      include: { customer: instrumentCustomerSelect },
    });

    const sumOf = (s: string) =>
      instruments.filter((i) => i.status === s).reduce((t, i) => t + i.amountPaise, 0n);

    res.json({
      instruments,
      totals: {
        count: instruments.length,
        pendingPaise: sumOf('PENDING'),
        clearedPaise: sumOf('CLEARED'),
        bouncedPaise: sumOf('BOUNCED'),
        pendingCount: instruments.filter((i) => i.status === 'PENDING').length,
        bouncedCount: instruments.filter((i) => i.status === 'BOUNCED').length,
      },
      appliedFilters: {
        status,
        customerId,
        dueBefore: dueBefore ? dueBefore.toISOString().slice(0, 10) : undefined,
      },
    });
  } catch (e) {
    next(e);
  }
});

router.patch(
  '/instruments/:id',
  requirePermission('canManageCreditCustomers'),
  async (req, res, next) => {
    try {
      const existing = await findOwnInstrument(req, req.params.id);
      const data = updateInstrumentSchema.parse(req.body);
      const today = todayUTC();

      if (data.action === 'CLEAR') {
        if (existing.status === 'CLEARED') {
          res.json({ ...existing, changed: false, message: 'Already cleared' });
          return;
        }
        if (existing.status !== 'PENDING') {
          throw new AppError(400, `A ${existing.status.toLowerCase()} instrument cannot be cleared`);
        }
        const saved = await prisma.paymentInstrument.update({
          where: { id: existing.id },
          data: {
            status: 'CLEARED',
            clearedOn: data.clearedOn ?? today,
            ...(data.notes !== undefined ? { notes: data.notes } : {}),
          },
          include: { customer: instrumentCustomerSelect },
        });
        res.json({ ...saved, changed: true });
        return;
      }

      if (data.action === 'CANCEL') {
        if (existing.status === 'CANCELLED') {
          res.json({ ...existing, changed: false, message: 'Already cancelled' });
          return;
        }
        if (existing.status !== 'PENDING') {
          throw new AppError(
            400,
            `A ${existing.status.toLowerCase()} instrument cannot be cancelled`,
          );
        }
        const saved = await prisma.paymentInstrument.update({
          where: { id: existing.id },
          data: { status: 'CANCELLED', ...(data.notes !== undefined ? { notes: data.notes } : {}) },
          include: { customer: instrumentCustomerSelect },
        });
        res.json({ ...saved, changed: true });
        return;
      }

      // ----- BOUNCE -----
      // The money never arrived, so it goes back on the customer. The guarded
      // updateMany makes this idempotent: a second bounce matches no row, so the
      // balance is never incremented twice.
      if (existing.status === 'CANCELLED') {
        throw new AppError(400, 'A cancelled instrument cannot be bounced');
      }
      if (existing.status === 'BOUNCED') {
        res.json({
          ...existing,
          changed: false,
          message: 'Already recorded as bounced — the balance was not touched again',
        });
        return;
      }

      const bounceCharge = data.bounceChargePaise ?? null;
      const reversalPaise = existing.amountPaise + (bounceCharge ?? 0n);

      const outcome = await prisma.$transaction(async (tx) => {
        const hit = await tx.paymentInstrument.updateMany({
          where: { id: existing.id, status: { in: ['PENDING', 'CLEARED'] } },
          data: {
            status: 'BOUNCED',
            bouncedOn: data.bouncedOn ?? today,
            bounceReason: data.bounceReason,
            bounceChargePaise: bounceCharge,
            clearedOn: null,
            ...(data.notes !== undefined ? { notes: data.notes } : {}),
          },
        });
        if (hit.count === 0) return { changed: false, reversalPaise: 0n };

        await tx.creditCustomer.update({
          where: { id: existing.customerId },
          data: { currentBalancePaise: { increment: reversalPaise } },
        });
        return { changed: true, reversalPaise };
      });

      const saved = await prisma.paymentInstrument.findUniqueOrThrow({
        where: { id: existing.id },
        include: { customer: instrumentCustomerSelect },
      });

      res.json({
        ...saved,
        changed: outcome.changed,
        reversalPaise: outcome.reversalPaise,
        message: outcome.changed
          ? `Put back on the customer's balance`
          : 'Already recorded as bounced — the balance was not touched again',
      });
    } catch (e) {
      next(e);
    }
  },
);

// ===================== AGEING BY DUE DATE =====================

// This is NOT a duplicate of `/api/dashboard/customer-aging`, and the two are
// expected to disagree. That endpoint ages each credit SALE by its sale date and
// answers "how long has this fuel been unpaid?". This one ages money by the DUE DATE
// of the statement it was billed on (or, for fuel not yet billed, sale date +
// paymentTermsDays) and answers "how late is this customer against the credit terms
// we agreed?". With 30-day terms a 40-day-old sale is 40 days old there and 10 days
// past due here. Keep both; do not make one call the other.
async function computeReceivables(req: any, asOf: Date) {
  const pumpId = requirePump(req);

  const [pump, customers] = await Promise.all([
    prisma.pump.findUnique({ where: { id: pumpId }, select: { name: true } }),
    prisma.creditCustomer.findMany({
      where: { pumpId, isActive: true },
      orderBy: { name: 'asc' },
      include: {
        statements: { orderBy: { periodTo: 'asc' } },
        // LOCKED only — see the double-counting rule at the top of this file.
        creditSales: { where: LOCKED, orderBy: { saleAt: 'asc' } },
        outstandingReceipts: { where: LOCKED, orderBy: { receivedAt: 'asc' } },
        paymentInstruments: true,
      },
    }),
  ]);

  const totals = emptyBuckets();
  let totalOutstandingPaise = 0n;
  let totalOverduePaise = 0n;

  const rows = customers
    .map((c) => {
      const statements = c.statements;
      const lastStatement = statements[statements.length - 1] ?? null;

      // Each statement becomes one amount owed, payable on its due date. Only the
      // first carries the opening balance — later openings are the previous closing
      // and would double count.
      const items: DueItem[] = statements.map((s, i) => ({
        dueDate: dayOnly(s.dueDate),
        amountPaise: (i === 0 ? s.openingBalancePaise : 0n) + s.salesPaise,
        label: s.statementNo,
        statementId: s.id,
      }));

      // Fuel bought since the last bill is not overdue yet: it falls due at
      // sale date + the customer's credit terms. Grouped by due date to keep the
      // response small.
      const unbilledFrom = lastStatement ? nextDay(lastStatement.periodTo) : null;
      const unbilled = new Map<number, bigint>();
      let unbilledPaise = 0n;
      for (const s of c.creditSales) {
        if (unbilledFrom && s.saleAt < unbilledFrom) continue;
        if (s.amountCreditPaise <= 0n) continue;
        const due = addDays(s.saleAt, c.paymentTermsDays);
        unbilled.set(due.getTime(), (unbilled.get(due.getTime()) ?? 0n) + s.amountCreditPaise);
        unbilledPaise += s.amountCreditPaise;
      }
      for (const [time, amountPaise] of unbilled) {
        const dueDate = new Date(time);
        items.push({
          dueDate,
          amountPaise,
          label: `Unbilled (due ${formatDay(dueDate)})`,
          statementId: null,
        });
      }

      // Receipts to apply: everything from the first statement period onwards (an
      // earlier receipt is already netted inside that statement's opening balance),
      // or all of them when the customer has never been billed. Cleared instruments
      // that are not linked to a shift receipt are money too — linked ones are
      // skipped so the same rupee is not applied twice.
      const receiptsFrom = statements[0] ? dayOnly(statements[0].periodFrom) : null;
      let receiptsPaise = 0n;
      for (const r of c.outstandingReceipts) {
        if (receiptsFrom && r.receivedAt < receiptsFrom) continue;
        receiptsPaise += r.amountPaise;
      }
      for (const i of c.paymentInstruments) {
        if (i.status !== 'CLEARED' || i.outstandingReceiptId) continue;
        if (receiptsFrom && i.receivedOn < receiptsFrom) continue;
        receiptsPaise += i.amountPaise;
      }

      const aged = ageDueItems(items, receiptsPaise, asOf);

      const creditLimitPaise = c.creditLimitPaise;
      const headroomPaise = creditLimitPaise - c.currentBalancePaise;
      const overLimit = creditLimitPaise > 0n && c.currentBalancePaise > creditLimitPaise;

      return {
        customerId: c.id,
        name: c.name,
        code: c.code,
        phone: c.phone,
        contactPerson: c.contactPerson,
        paymentTermsDays: c.paymentTermsDays,
        // The authoritative balance (moved when shifts lock) …
        currentBalancePaise: c.currentBalancePaise,
        // … and what the due-date walk accounts for. They can differ slightly when
        // instruments were banked outside a shift; both are shown rather than hidden.
        openPaise: aged.openPaise,
        unbilledPaise,
        overduePaise: aged.overduePaise,
        buckets: aged.buckets,
        oldestUnpaid: aged.oldest
          ? {
              statementId: aged.oldest.statementId,
              label: aged.oldest.label,
              dueDate: aged.oldest.dueDate,
              daysPastDue: aged.oldest.daysPastDue,
            }
          : null,
        daysPastDue: aged.oldest?.daysPastDue ?? 0,
        creditLimitPaise,
        headroomPaise,
        overLimit,
        statementCount: statements.length,
        lastStatement: lastStatement
          ? {
              id: lastStatement.id,
              statementNo: lastStatement.statementNo,
              periodTo: lastStatement.periodTo,
              dueDate: lastStatement.dueDate,
            }
          : null,
      };
    })
    .filter((r) => r.currentBalancePaise !== 0n || r.openPaise > 0n || r.statementCount > 0);

  for (const r of rows) {
    for (const key of Object.keys(r.buckets) as AgeingBucket[]) totals[key] += r.buckets[key];
    totalOutstandingPaise += r.currentBalancePaise;
    totalOverduePaise += r.overduePaise;
  }

  rows.sort((a, b) => {
    if (a.overduePaise !== b.overduePaise) return a.overduePaise > b.overduePaise ? -1 : 1;
    return a.currentBalancePaise > b.currentBalancePaise ? -1 : 1;
  });

  return {
    pumpName: pump?.name ?? 'our pump',
    asOf,
    rows,
    summary: {
      buckets: totals,
      customerCount: rows.length,
      overdueCustomers: rows.filter((r) => r.overduePaise > 0n).length,
      overLimitCustomers: rows.filter((r) => r.overLimit).length,
      totalOutstandingPaise,
      totalOverduePaise,
    },
  };
}

router.get('/ageing', requirePermission('canViewReports'), async (req, res, next) => {
  try {
    const asOf = parseDayParam(req.query.asOf, 'asOf') ?? todayUTC();
    const data = await computeReceivables(req, asOf);
    res.json({
      asOf: asOf.toISOString().slice(0, 10),
      basis: 'DUE_DATE',
      summary: data.summary,
      customers: data.rows,
    });
  } catch (e) {
    next(e);
  }
});

// ===================== REMINDERS =====================

// Returns text only. Nothing is sent from the server — no SMS, WhatsApp or email
// API is called — the owner copies the message and sends it himself.
router.get('/reminders', requirePermission('canViewReports'), async (req, res, next) => {
  try {
    const overdueOnly = String(req.query.overdueOnly || 'true') !== 'false';
    const asOf = parseDayParam(req.query.asOf, 'asOf') ?? todayUTC();
    const data = await computeReceivables(req, asOf);

    const candidates = data.rows.filter((r) =>
      overdueOnly ? r.overduePaise > 0n : r.currentBalancePaise > 0n || r.openPaise > 0n,
    );

    const reminders = candidates.map((r) => ({
      customerId: r.customerId,
      name: r.name,
      code: r.code,
      phone: r.phone,
      contactPerson: r.contactPerson,
      hasPhone: !!r.phone,
      balancePaise: r.currentBalancePaise,
      overduePaise: r.overduePaise,
      daysPastDue: r.daysPastDue,
      oldestUnpaid: r.oldestUnpaid,
      overLimit: r.overLimit,
      message: buildReminderMessage({
        pumpName: data.pumpName,
        customerName: r.name,
        contactPerson: r.contactPerson,
        balancePaise: r.currentBalancePaise,
        overduePaise: r.overduePaise,
        asOf,
        oldest: r.oldestUnpaid
          ? {
              label: r.oldestUnpaid.label,
              dueDate: r.oldestUnpaid.dueDate,
              daysPastDue: r.oldestUnpaid.daysPastDue,
              isStatement: !!r.oldestUnpaid.statementId,
            }
          : null,
        paymentTermsDays: r.paymentTermsDays,
      }),
    }));

    res.json({
      asOf: asOf.toISOString().slice(0, 10),
      pumpName: data.pumpName,
      overdueOnly,
      sent: false, // this API never sends anything
      count: reminders.length,
      withoutPhone: reminders.filter((r) => !r.hasPhone).length,
      totalOverduePaise: reminders.reduce((s, r) => s + r.overduePaise, 0n),
      reminders,
    });
  } catch (e) {
    next(e);
  }
});

export default router;

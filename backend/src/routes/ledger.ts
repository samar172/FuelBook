// Ledger endpoints: chart of accounts, journal, trial balance, P&L, balance sheet,
// and the subsidiary views (per customer, per employee, per channel).
//
// Reading the books needs canViewReports. Writing a manual entry or reversing one
// is owner-only: those are accounting corrections, not day-to-day data entry.

import { Router } from 'express';
import { Role, JournalSource } from '@prisma/client';
import { prisma } from '../lib/db';
import { requireAuth, requirePermission, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/error';
import { manualJournalSchema } from '../schemas';
import { ensureChartOfAccounts, postEntry } from '../services/ledger';
import { countPending, postPendingEntries } from '../services/ledgerBridge';
import { findCurrentOpening, postOpeningBalances, summarise } from '../services/openingBalances';
import { openingBalancesSchema } from '../schemas';
import {
  accountLedger,
  balanceSheet,
  channelBalances,
  customerBalances,
  employeeDues,
  profitAndLoss,
  trialBalance,
} from '../services/ledgerReports';

const router = Router();
router.use(requireAuth);

const requirePump = (req: any) => {
  if (!req.user.pumpId) throw new AppError(400, 'No pump assigned to user');
  return req.user.pumpId as string;
};

// Dates arrive as YYYY-MM-DD and are treated as UTC days, matching reportDate.
const parseDay = (v: unknown, fallback?: Date): Date | undefined => {
  const str = typeof v === 'string' ? v.trim() : '';
  if (!str) return fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) throw new AppError(400, 'Dates must be YYYY-MM-DD');
  return new Date(str + 'T00:00:00Z');
};
const today = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

router.get('/accounts', requirePermission('canViewReports'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    // Lazily bootstrap so a pump created before the ledger existed still works.
    await prisma.$transaction((tx) => ensureChartOfAccounts(tx, pumpId));
    const tb = await trialBalance(pumpId, { to: parseDay(req.query.asOf, today()) });
    res.json(tb.allRows);
  } catch (e) {
    next(e);
  }
});

router.get('/trial-balance', requirePermission('canViewReports'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    res.json(
      await trialBalance(pumpId, {
        from: parseDay(req.query.from),
        to: parseDay(req.query.to, today()),
      }),
    );
  } catch (e) {
    next(e);
  }
});

router.get('/profit-loss', requirePermission('canViewReports'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const to = parseDay(req.query.to, today())!;
    const defaultFrom = new Date(to);
    defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29);
    const from = parseDay(req.query.from, defaultFrom)!;
    if (from > to) throw new AppError(400, 'from must be before to');
    res.json(await profitAndLoss(pumpId, from, to));
  } catch (e) {
    next(e);
  }
});

router.get('/balance-sheet', requirePermission('canViewReports'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    res.json(await balanceSheet(pumpId, parseDay(req.query.asOf, today())!));
  } catch (e) {
    next(e);
  }
});

router.get('/subsidiary/customers', requirePermission('canViewReports'), async (req, res, next) => {
  try {
    res.json(
      await customerBalances(requirePump(req), {
        from: parseDay(req.query.from),
        to: parseDay(req.query.to),
      }),
    );
  } catch (e) {
    next(e);
  }
});

router.get('/subsidiary/employees', requirePermission('canViewReports'), async (req, res, next) => {
  try {
    res.json(
      await employeeDues(requirePump(req), {
        from: parseDay(req.query.from),
        to: parseDay(req.query.to),
      }),
    );
  } catch (e) {
    next(e);
  }
});

router.get('/subsidiary/channels', requirePermission('canViewReports'), async (req, res, next) => {
  try {
    res.json(
      await channelBalances(requirePump(req), {
        from: parseDay(req.query.from),
        to: parseDay(req.query.to),
      }),
    );
  } catch (e) {
    next(e);
  }
});

// One account's running ledger, optionally narrowed to a single subject.
router.get('/accounts/:code/ledger', requirePermission('canViewReports'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const result = await accountLedger(
      pumpId,
      req.params.code,
      { from: parseDay(req.query.from), to: parseDay(req.query.to, today()) },
      {
        customerId: (req.query.customerId as string) || undefined,
        employeeId: (req.query.employeeId as string) || undefined,
        channelId: (req.query.channelId as string) || undefined,
        tankId: (req.query.tankId as string) || undefined,
      },
    );
    if (!result) throw new AppError(404, 'Account not found');
    res.json(result);
  } catch (e) {
    next(e);
  }
});

// Journal entries, newest first.
router.get('/entries', requirePermission('canViewReports'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const from = parseDay(req.query.from);
    const to = parseDay(req.query.to);
    const source = req.query.source as JournalSource | undefined;
    const take = Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 200);
    const skip = Math.max(parseInt(String(req.query.offset || '0'), 10) || 0, 0);

    const where = {
      pumpId,
      ...(from || to
        ? { entryDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
      ...(source ? { source } : {}),
      ...(req.query.shiftReportId ? { shiftReportId: String(req.query.shiftReportId) } : {}),
    };

    const [total, entries] = await Promise.all([
      prisma.journalEntry.count({ where }),
      prisma.journalEntry.findMany({
        where,
        orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
        take,
        skip,
        include: {
          lines: {
            include: {
              account: { select: { code: true, name: true, type: true } },
              customer: { select: { id: true, name: true } },
              employee: { select: { id: true, name: true } },
              channel: { select: { id: true, name: true } },
              tank: { select: { id: true, name: true } },
            },
          },
          reversedBy: { select: { id: true } },
        },
      }),
    ]);

    res.json({
      total,
      limit: take,
      offset: skip,
      entries: entries.map((e) => ({
        ...e,
        totalPaise: e.lines.reduce((s, l) => s + l.debitPaise, 0n),
        isReversed: Boolean(e.reversedBy),
      })),
    });
  } catch (e) {
    next(e);
  }
});

router.get('/entries/:id', requirePermission('canViewReports'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const entry = await prisma.journalEntry.findFirst({
      where: { id: req.params.id, pumpId },
      include: {
        lines: {
          include: {
            account: { select: { code: true, name: true, type: true } },
            customer: { select: { id: true, name: true } },
            employee: { select: { id: true, name: true } },
            channel: { select: { id: true, name: true } },
            expenseCategory: { select: { id: true, name: true } },
            tank: { select: { id: true, name: true } },
          },
        },
        reversedBy: { select: { id: true, narration: true } },
        reversalOf: { select: { id: true, narration: true } },
      },
    });
    if (!entry) throw new AppError(404, 'Entry not found');
    res.json(entry);
  } catch (e) {
    next(e);
  }
});

// Manual adjustment (capital, drawings, recovering a staff shortage, settling a
// channel to bank). Owner only, and it must balance.
router.post('/entries', requireRole(Role.OWNER), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const data = manualJournalSchema.parse(req.body);

    const result = await prisma.$transaction(async (tx) => {
      const accounts = await ensureChartOfAccounts(tx, pumpId);
      for (const l of data.lines) {
        if (!accounts[l.code]) throw new AppError(400, `Unknown account code: ${l.code}`);
        if (l.debitPaise === 0n && l.creditPaise === 0n) {
          throw new AppError(400, 'Every line needs a debit or a credit amount');
        }
        if (l.debitPaise !== 0n && l.creditPaise !== 0n) {
          throw new AppError(400, 'A line is either a debit or a credit, not both');
        }
      }
      const debit = data.lines.reduce((s, l) => s + l.debitPaise, 0n);
      const credit = data.lines.reduce((s, l) => s + l.creditPaise, 0n);
      if (debit !== credit) {
        throw new AppError(
          400,
          `Entry does not balance: debits ${debit} vs credits ${credit} paise`,
        );
      }
      const posted = await postEntry(tx, accounts, {
        pumpId,
        entryDate: new Date(data.entryDate + 'T00:00:00Z'),
        narration: data.narration,
        source: JournalSource.MANUAL,
        createdById: (req as any).user.userId,
        lines: data.lines,
      });
      return posted;
    });
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

// Reverse any entry by posting its mirror image.
router.post('/entries/:id/reverse', requireRole(Role.OWNER), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const entry = await prisma.journalEntry.findFirst({
      where: { id: req.params.id, pumpId },
      include: { lines: { include: { account: true } }, reversedBy: { select: { id: true } } },
    });
    if (!entry) throw new AppError(404, 'Entry not found');
    if (entry.reversedBy) throw new AppError(400, 'This entry has already been reversed');

    const reversal = await prisma.$transaction(async (tx) => {
      const accounts = await ensureChartOfAccounts(tx, pumpId);
      return postEntry(tx, accounts, {
        pumpId,
        entryDate: entry.entryDate,
        narration: `Reversal — ${entry.narration}`,
        source: JournalSource.REVERSAL,
        shiftReportId: entry.shiftReportId,
        reversalOfId: entry.id,
        createdById: (req as any).user.userId,
        lines: entry.lines.map((l) => ({
          code: l.account.code,
          debitPaise: l.creditPaise,
          creditPaise: l.debitPaise,
          customerId: l.customerId,
          employeeId: l.employeeId,
          channelId: l.channelId,
          expenseCategoryId: l.expenseCategoryId,
          tankId: l.tankId,
          fuelType: l.fuelType,
          quantityMl: l.quantityMl,
          memo: l.memo,
        })),
      });
    });
    res.status(201).json(reversal);
  } catch (e) {
    next(e);
  }
});

// What operational activity (bank deposits, staff advances, cash sent to the bank)
// has not reached the books yet.
router.get('/pending', requirePermission('canViewReports'), async (req, res, next) => {
  try {
    res.json(await countPending(requirePump(req)));
  } catch (e) {
    next(e);
  }
});

// Post that activity. Idempotent: each record is picked up only while it has no
// journal entry, and the link is written in the same transaction as the entry.
router.post('/post-pending', requireRole(Role.OWNER), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    res.json(await postPendingEntries(pumpId, (req as any).user.userId));
  } catch (e) {
    next(e);
  }
});

// ===================== OPENING BALANCES =====================

// Everything the form needs: what the pump already has on file, plus whatever
// opening entry is currently in force so the figures can be edited rather than
// re-typed.
router.get('/opening-balances', requirePermission('canViewReports'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const [customers, tanks, products, bankAccounts, employees, current, firstShift] =
      await Promise.all([
        prisma.creditCustomer.findMany({
          where: { pumpId, isActive: true },
          select: { id: true, name: true, code: true, currentBalancePaise: true },
          orderBy: { name: 'asc' },
        }),
        prisma.tank.findMany({
          where: { pumpId, isActive: true },
          select: { id: true, name: true, fuelType: true, capacityMl: true },
          orderBy: { name: 'asc' },
        }),
        prisma.product.findMany({
          where: { pumpId, isActive: true },
          select: { id: true, sku: true, name: true, unit: true, purchasePricePaise: true },
          orderBy: { name: 'asc' },
        }),
        prisma.bankAccount.findMany({
          where: { pumpId, isActive: true },
          select: { id: true, bankName: true, accountNoLast4: true, nickname: true },
        }),
        prisma.employee.findMany({
          where: { pumpId, isActive: true },
          select: { id: true, name: true, code: true },
          orderBy: { name: 'asc' },
        }),
        findCurrentOpening(pumpId),
        prisma.shiftReport.findFirst({
          where: { pumpId },
          orderBy: { reportDate: 'asc' },
          select: { reportDate: true, status: true },
        }),
      ]);

    // Decompose the entry in force back into the shape of the form.
    const existing = current
      ? {
          entryId: current.id,
          asOnDate: current.entryDate.toISOString().slice(0, 10),
          narration: current.narration,
          cashInHandPaise: current.lines
            .filter((l) => l.account.code === '1000')
            .reduce((s, l) => s + l.debitPaise, 0n),
          supplierPayablePaise: current.lines
            .filter((l) => l.account.code === '2000')
            .reduce((s, l) => s + l.creditPaise, 0n),
          bankPaise: current.lines
            .filter((l) => l.account.code === '1050')
            .reduce((s, l) => s + l.debitPaise, 0n),
          customerDues: current.lines
            .filter((l) => l.account.code === '1200' && l.customerId)
            .map((l) => ({ customerId: l.customerId, amountPaise: l.debitPaise })),
          fuelStock: current.lines
            .filter((l) => l.account.code === '1400' && l.tankId)
            .map((l) => ({
              tankId: l.tankId,
              quantityMl: l.quantityMl ?? 0n,
              valuePaise: l.debitPaise,
            })),
          staffAdvances: current.lines
            .filter((l) => l.account.code === '1310' && l.employeeId)
            .map((l) => ({ employeeId: l.employeeId, amountPaise: l.debitPaise })),
          staffShortages: current.lines
            .filter((l) => l.account.code === '1300' && l.employeeId)
            .map((l) => ({ employeeId: l.employeeId, amountPaise: l.debitPaise })),
        }
      : null;

    res.json({
      customers,
      tanks,
      products,
      bankAccounts,
      employees,
      existing,
      // Opening balances belong the day before trading starts here.
      suggestedAsOnDate: firstShift
        ? new Date(firstShift.reportDate.getTime() - 86400000).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10),
      hasTraded: Boolean(firstShift),
    });
  } catch (e) {
    next(e);
  }
});

// Preview the totals and the balancing capital figure without posting anything.
router.post('/opening-balances/preview', requirePermission('canViewReports'), async (req, res, next) => {
  try {
    requirePump(req);
    const data = openingBalancesSchema.parse(req.body);
    res.json(summarise({ ...data, asOnDate: new Date(data.asOnDate + 'T00:00:00Z') }));
  } catch (e) {
    next(e);
  }
});

// Post them. Owner only: this writes the business's starting position.
router.post('/opening-balances', requireRole(Role.OWNER), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const data = openingBalancesSchema.parse(req.body);
    const result = await postOpeningBalances(pumpId, (req as any).user.userId, {
      ...data,
      asOnDate: new Date(data.asOnDate + 'T00:00:00Z'),
    });
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

export default router;

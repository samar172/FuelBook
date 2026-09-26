// Reads over the journal: trial balance, P&L, balance sheet, subsidiary balances.
//
// Sign convention: assets and expenses are debit-positive, liabilities, equity and
// income are credit-positive. Every function returns a "natural" positive figure
// for a normal balance, so the UI never has to guess.

import { AccountType, Prisma } from '@prisma/client';
import { prisma } from '../lib/db';
import { ACCOUNT } from './ledger';

const DEBIT_POSITIVE: AccountType[] = ['ASSET', 'EXPENSE'];

export const naturalBalance = (type: AccountType, debit: bigint, credit: bigint) =>
  DEBIT_POSITIVE.includes(type) ? debit - credit : credit - debit;

interface DateWindow {
  from?: Date;
  to?: Date;
}

const entryWhere = (pumpId: string, w: DateWindow): Prisma.JournalEntryWhereInput => ({
  pumpId,
  ...(w.from || w.to
    ? { entryDate: { ...(w.from ? { gte: w.from } : {}), ...(w.to ? { lte: w.to } : {}) } }
    : {}),
});

/** Totals per account. `to` alone gives cumulative balances as of a date. */
export async function trialBalance(pumpId: string, window: DateWindow) {
  const [accounts, grouped] = await Promise.all([
    prisma.ledgerAccount.findMany({ where: { pumpId }, orderBy: { sortOrder: 'asc' } }),
    prisma.journalLine.groupBy({
      by: ['accountId'],
      where: { entry: entryWhere(pumpId, window) },
      _sum: { debitPaise: true, creditPaise: true },
    }),
  ]);
  const byId = new Map(grouped.map((g) => [g.accountId, g._sum]));

  let totalDebit = 0n;
  let totalCredit = 0n;
  const rows = accounts.map((a) => {
    const sums = byId.get(a.id);
    const debit = sums?.debitPaise ?? 0n;
    const credit = sums?.creditPaise ?? 0n;
    totalDebit += debit;
    totalCredit += credit;
    return {
      accountId: a.id,
      code: a.code,
      name: a.name,
      type: a.type,
      debitPaise: debit,
      creditPaise: credit,
      balancePaise: naturalBalance(a.type, debit, credit),
    };
  });

  return {
    rows: rows.filter((r) => r.debitPaise !== 0n || r.creditPaise !== 0n),
    allRows: rows,
    totalDebitPaise: totalDebit,
    totalCreditPaise: totalCredit,
    // The headline check: a healthy ledger always has these equal.
    balanced: totalDebit === totalCredit,
    differencePaise: totalDebit - totalCredit,
  };
}

/** Income and expenses for a period, with per-fuel and per-category detail. */
export async function profitAndLoss(pumpId: string, from: Date, to: Date) {
  const tb = await trialBalance(pumpId, { from, to });
  const income = tb.allRows.filter((r) => r.type === 'INCOME' && r.balancePaise !== 0n);
  const expenses = tb.allRows.filter((r) => r.type === 'EXPENSE' && r.balancePaise !== 0n);
  const totalIncome = income.reduce((s, r) => s + r.balancePaise, 0n);
  const totalExpenses = expenses.reduce((s, r) => s + r.balancePaise, 0n);

  const where = { entry: entryWhere(pumpId, { from, to }) };

  const [byFuel, byCategory, cogsRow] = await Promise.all([
    prisma.journalLine.groupBy({
      by: ['fuelType'],
      where: { ...where, account: { code: ACCOUNT.FUEL_SALES } },
      _sum: { creditPaise: true, debitPaise: true, quantityMl: true },
    }),
    prisma.journalLine.groupBy({
      by: ['expenseCategoryId'],
      where: { ...where, account: { code: ACCOUNT.OPERATING_EXPENSES } },
      _sum: { debitPaise: true, creditPaise: true },
    }),
    prisma.journalLine.aggregate({
      where: { ...where, account: { code: ACCOUNT.COGS_FUEL } },
      _sum: { debitPaise: true, creditPaise: true },
    }),
  ]);

  const categoryIds = byCategory.map((c) => c.expenseCategoryId).filter(Boolean) as string[];
  const categories = categoryIds.length
    ? await prisma.expenseCategory.findMany({
        where: { id: { in: categoryIds } },
        select: { id: true, name: true },
      })
    : [];
  const catName = new Map(categories.map((c) => [c.id, c.name]));

  const grossSales = (byFuel.reduce((s, f) => s + (f._sum.creditPaise ?? 0n) - (f._sum.debitPaise ?? 0n), 0n));
  const cogs = (cogsRow._sum.debitPaise ?? 0n) - (cogsRow._sum.creditPaise ?? 0n);

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    income,
    expenses,
    totalIncomePaise: totalIncome,
    totalExpensesPaise: totalExpenses,
    netProfitPaise: totalIncome - totalExpenses,
    // Fuel-specific view: what the fuel itself earned before running costs.
    fuelSalesPaise: grossSales,
    cogsPaise: cogs,
    grossMarginPaise: grossSales - cogs,
    salesByFuel: byFuel
      .filter((f) => f.fuelType)
      .map((f) => ({
        fuelType: f.fuelType,
        amountPaise: (f._sum.creditPaise ?? 0n) - (f._sum.debitPaise ?? 0n),
        quantityMl: f._sum.quantityMl ?? 0n,
      })),
    expensesByCategory: byCategory
      .filter((c) => c.expenseCategoryId)
      .map((c) => ({
        categoryId: c.expenseCategoryId,
        name: catName.get(c.expenseCategoryId as string) ?? 'Uncategorised',
        amountPaise: (c._sum.debitPaise ?? 0n) - (c._sum.creditPaise ?? 0n),
      }))
      .sort((a, b) => (a.amountPaise > b.amountPaise ? -1 : 1)),
  };
}

/** Assets, liabilities and equity as of a date, including retained earnings. */
export async function balanceSheet(pumpId: string, asOf: Date) {
  const tb = await trialBalance(pumpId, { to: asOf });
  const pick = (t: AccountType) => tb.allRows.filter((r) => r.type === t && r.balancePaise !== 0n);

  const assets = pick('ASSET');
  const liabilities = pick('LIABILITY');
  const equityAccounts = pick('EQUITY');

  const totalAssets = assets.reduce((s, r) => s + r.balancePaise, 0n);
  const totalLiabilities = liabilities.reduce((s, r) => s + r.balancePaise, 0n);
  const totalEquityAccounts = equityAccounts.reduce((s, r) => s + r.balancePaise, 0n);

  // Profit earned to date belongs to the owner, so it forms part of equity.
  const income = tb.allRows.filter((r) => r.type === 'INCOME').reduce((s, r) => s + r.balancePaise, 0n);
  const expenses = tb.allRows.filter((r) => r.type === 'EXPENSE').reduce((s, r) => s + r.balancePaise, 0n);
  const retained = income - expenses;
  const totalEquity = totalEquityAccounts + retained;

  return {
    asOf: asOf.toISOString().slice(0, 10),
    assets,
    liabilities,
    equityAccounts,
    retainedEarningsPaise: retained,
    totalAssetsPaise: totalAssets,
    totalLiabilitiesPaise: totalLiabilities,
    totalEquityPaise: totalEquity,
    // Assets = liabilities + equity, when the books are sound.
    balanced: totalAssets === totalLiabilities + totalEquity,
    differencePaise: totalAssets - (totalLiabilities + totalEquity),
  };
}

/** Per-customer receivable balances straight from the journal. */
export async function customerBalances(pumpId: string, window: DateWindow = {}) {
  const grouped = await prisma.journalLine.groupBy({
    by: ['customerId'],
    where: {
      entry: entryWhere(pumpId, window),
      account: { code: ACCOUNT.RECEIVABLE_CUSTOMER },
      customerId: { not: null },
    },
    _sum: { debitPaise: true, creditPaise: true },
  });
  const ids = grouped.map((g) => g.customerId as string);
  const customers = ids.length
    ? await prisma.creditCustomer.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, code: true, currentBalancePaise: true },
      })
    : [];
  const byId = new Map(customers.map((c) => [c.id, c]));
  return grouped
    .map((g) => {
      const c = byId.get(g.customerId as string);
      const ledger = (g._sum.debitPaise ?? 0n) - (g._sum.creditPaise ?? 0n);
      return {
        customerId: g.customerId as string,
        name: c?.name ?? 'Unknown',
        code: c?.code ?? null,
        billedPaise: g._sum.debitPaise ?? 0n,
        receivedPaise: g._sum.creditPaise ?? 0n,
        ledgerBalancePaise: ledger,
        // The denormalised figure the app maintains on the customer row; these
        // should agree, and a mismatch is worth showing rather than hiding.
        storedBalancePaise: c?.currentBalancePaise ?? 0n,
        matchesStored: (c?.currentBalancePaise ?? 0n) === ledger,
      };
    })
    .sort((a, b) => (a.ledgerBalancePaise > b.ledgerBalancePaise ? -1 : 1));
}

/** Per-employee cash dues (shortages recoverable, less anything repaid). */
export async function employeeDues(pumpId: string, window: DateWindow = {}) {
  const grouped = await prisma.journalLine.groupBy({
    by: ['employeeId'],
    where: {
      entry: entryWhere(pumpId, window),
      account: { code: ACCOUNT.RECEIVABLE_STAFF },
      employeeId: { not: null },
    },
    _sum: { debitPaise: true, creditPaise: true },
  });
  const ids = grouped.map((g) => g.employeeId as string);
  const employees = ids.length
    ? await prisma.employee.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, code: true, designation: true, isActive: true },
      })
    : [];
  const byId = new Map(employees.map((e) => [e.id, e]));
  return grouped
    .map((g) => ({
      employeeId: g.employeeId as string,
      name: byId.get(g.employeeId as string)?.name ?? 'Unknown',
      code: byId.get(g.employeeId as string)?.code ?? null,
      designation: byId.get(g.employeeId as string)?.designation ?? null,
      isActive: byId.get(g.employeeId as string)?.isActive ?? true,
      shortagePaise: g._sum.debitPaise ?? 0n,
      recoveredPaise: g._sum.creditPaise ?? 0n,
      outstandingPaise: (g._sum.debitPaise ?? 0n) - (g._sum.creditPaise ?? 0n),
    }))
    .filter((r) => r.outstandingPaise !== 0n || r.shortagePaise !== 0n)
    .sort((a, b) => (a.outstandingPaise > b.outstandingPaise ? -1 : 1));
}

/** Money held per digital channel, i.e. taken but not yet settled to bank. */
export async function channelBalances(pumpId: string, window: DateWindow = {}) {
  const grouped = await prisma.journalLine.groupBy({
    by: ['channelId'],
    where: {
      entry: entryWhere(pumpId, window),
      account: { code: ACCOUNT.CARD_UPI_CLEARING },
      channelId: { not: null },
    },
    _sum: { debitPaise: true, creditPaise: true },
  });
  const ids = grouped.map((g) => g.channelId as string);
  const channels = ids.length
    ? await prisma.paymentChannel.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, kind: true },
      })
    : [];
  const byId = new Map(channels.map((c) => [c.id, c]));
  return grouped
    .map((g) => ({
      channelId: g.channelId as string,
      name: byId.get(g.channelId as string)?.name ?? 'Unknown',
      kind: byId.get(g.channelId as string)?.kind ?? null,
      inPaise: g._sum.debitPaise ?? 0n,
      settledPaise: g._sum.creditPaise ?? 0n,
      heldPaise: (g._sum.debitPaise ?? 0n) - (g._sum.creditPaise ?? 0n),
    }))
    .sort((a, b) => (a.heldPaise > b.heldPaise ? -1 : 1));
}

/** One account's entries in order, with a running balance. */
export async function accountLedger(
  pumpId: string,
  code: string,
  window: DateWindow,
  filters: { customerId?: string; employeeId?: string; channelId?: string; tankId?: string } = {},
) {
  const account = await prisma.ledgerAccount.findFirst({ where: { pumpId, code } });
  if (!account) return null;

  // Anything before the window start is collapsed into an opening balance.
  const opening = window.from
    ? await prisma.journalLine.aggregate({
        where: {
          accountId: account.id,
          entry: { pumpId, entryDate: { lt: window.from } },
          ...filters,
        },
        _sum: { debitPaise: true, creditPaise: true },
      })
    : null;

  const lines = await prisma.journalLine.findMany({
    where: { accountId: account.id, entry: entryWhere(pumpId, window), ...filters },
    include: {
      entry: { select: { id: true, entryDate: true, narration: true, source: true, shiftReportId: true } },
      customer: { select: { id: true, name: true } },
      employee: { select: { id: true, name: true } },
      channel: { select: { id: true, name: true } },
      tank: { select: { id: true, name: true } },
    },
    orderBy: [{ entry: { entryDate: 'asc' } }, { id: 'asc' }],
  });

  let running = opening
    ? naturalBalance(account.type, opening._sum.debitPaise ?? 0n, opening._sum.creditPaise ?? 0n)
    : 0n;
  const openingPaise = running;

  const rows = lines.map((l) => {
    running += naturalBalance(account.type, l.debitPaise, l.creditPaise);
    return {
      lineId: l.id,
      entryId: l.entry.id,
      entryDate: l.entry.entryDate.toISOString().slice(0, 10),
      narration: l.entry.narration,
      source: l.entry.source,
      shiftReportId: l.entry.shiftReportId,
      debitPaise: l.debitPaise,
      creditPaise: l.creditPaise,
      runningBalancePaise: running,
      memo: l.memo,
      customer: l.customer,
      employee: l.employee,
      channel: l.channel,
      tank: l.tank,
      fuelType: l.fuelType,
      quantityMl: l.quantityMl,
    };
  });

  return {
    account: { id: account.id, code: account.code, name: account.name, type: account.type },
    openingBalancePaise: openingPaise,
    closingBalancePaise: running,
    rows,
  };
}

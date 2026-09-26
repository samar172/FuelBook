// Double-entry ledger: chart of accounts, shift posting, reversal and reports.
//
// Design notes
// ------------
// * Money is BigInt paise everywhere, volume BigInt millilitres.
// * The chart of accounts holds CONTROL accounts only. Per-customer /
//   per-employee / per-channel / per-tank detail lives on JournalLine columns,
//   so onboarding a customer never creates an account.
// * Every entry balances: Σ debits === Σ credits. postEntry() refuses otherwise,
//   so an unbalanced journal can never reach the database.
// * Shift journals are posted when a shift is LOCKED and reversed by posting a
//   mirror entry (never by editing or deleting), keeping an audit trail.

import { Prisma, FuelType, AccountType, JournalSource, CashHandoverMode } from '@prisma/client';

// ---------------------------------------------------------------- chart of accounts

export const ACCOUNT = {
  CASH: '1000',
  BANK: '1050',
  CARD_UPI_CLEARING: '1100',
  RECEIVABLE_CUSTOMER: '1200',
  RECEIVABLE_STAFF: '1300',
  STAFF_ADVANCES: '1310',
  FUEL_INVENTORY: '1400',
  PAYABLE_FUEL: '2000',
  OWNER_CAPITAL: '3000',
  OWNER_DRAWINGS: '3100',
  FUEL_SALES: '4000',
  CASH_OVER: '4900',
  COGS_FUEL: '5000',
  OPERATING_EXPENSES: '6000',
  BANK_CHARGES: '6100',
  CASH_SHORT: '6900',
} as const;

const CHART: Array<{
  code: string;
  name: string;
  type: AccountType;
  description: string;
  sortOrder: number;
}> = [
  { code: ACCOUNT.CASH, name: 'Cash in Hand', type: 'ASSET', description: 'Physical cash at the pump / office', sortOrder: 10 },
  { code: ACCOUNT.BANK, name: 'Bank', type: 'ASSET', description: 'Bank deposits', sortOrder: 20 },
  { code: ACCOUNT.CARD_UPI_CLEARING, name: 'Card / UPI / Wallet Clearing', type: 'ASSET', description: 'Money taken digitally, awaiting settlement (per channel)', sortOrder: 30 },
  { code: ACCOUNT.RECEIVABLE_CUSTOMER, name: 'Accounts Receivable — Credit Customers', type: 'ASSET', description: 'Fuel sold on credit, per customer', sortOrder: 40 },
  { code: ACCOUNT.RECEIVABLE_STAFF, name: 'Staff Receivable — Cash Shortage', type: 'ASSET', description: 'Cash short on an attendant, recoverable from them', sortOrder: 50 },
  { code: ACCOUNT.STAFF_ADVANCES, name: 'Staff Advances', type: 'ASSET', description: 'Money lent to staff, recoverable — separate from cash shortages', sortOrder: 55 },
  { code: ACCOUNT.FUEL_INVENTORY, name: 'Fuel Inventory', type: 'ASSET', description: 'Fuel in tanks at weighted-average cost', sortOrder: 60 },
  { code: ACCOUNT.PAYABLE_FUEL, name: 'Accounts Payable — Fuel Purchases', type: 'LIABILITY', description: 'Owed to the oil company for tanker loads', sortOrder: 110 },
  { code: ACCOUNT.OWNER_CAPITAL, name: "Owner's Capital", type: 'EQUITY', description: 'Money put into the business', sortOrder: 210 },
  { code: ACCOUNT.OWNER_DRAWINGS, name: "Owner's Drawings", type: 'EQUITY', description: 'Money taken out by the owner', sortOrder: 220 },
  { code: ACCOUNT.FUEL_SALES, name: 'Fuel Sales', type: 'INCOME', description: 'Revenue from fuel, per fuel type', sortOrder: 310 },
  { code: ACCOUNT.CASH_OVER, name: 'Cash Over', type: 'INCOME', description: 'Unexplained excess cash', sortOrder: 390 },
  { code: ACCOUNT.COGS_FUEL, name: 'Cost of Goods Sold — Fuel', type: 'EXPENSE', description: 'Cost of the fuel sold', sortOrder: 410 },
  { code: ACCOUNT.OPERATING_EXPENSES, name: 'Operating Expenses', type: 'EXPENSE', description: 'Day-to-day pump expenses, per category', sortOrder: 420 },
  { code: ACCOUNT.BANK_CHARGES, name: 'Bank & Payment Charges', type: 'EXPENSE', description: 'MDR on card/UPI settlement and bank fees', sortOrder: 430 },
  { code: ACCOUNT.CASH_SHORT, name: 'Cash Short', type: 'EXPENSE', description: 'Unexplained missing cash, not pinned on anyone', sortOrder: 490 },
];

export type AccountMap = Record<string, { id: string; code: string; name: string; type: AccountType }>;

/** Creates any missing system accounts for a pump and returns a code -> account map. */
export async function ensureChartOfAccounts(
  tx: Prisma.TransactionClient,
  pumpId: string,
): Promise<AccountMap> {
  const existing = await tx.ledgerAccount.findMany({ where: { pumpId } });
  const byCode = new Map(existing.map((a) => [a.code, a]));
  const missing = CHART.filter((c) => !byCode.has(c.code));
  if (missing.length > 0) {
    await tx.ledgerAccount.createMany({
      data: missing.map((c) => ({ ...c, pumpId, isSystem: true })),
      skipDuplicates: true,
    });
  }
  const all = await tx.ledgerAccount.findMany({ where: { pumpId } });
  const map: AccountMap = {};
  for (const a of all) map[a.code] = { id: a.id, code: a.code, name: a.name, type: a.type };
  return map;
}

// ---------------------------------------------------------------- posting primitives

export interface DraftLine {
  code: string;
  debitPaise?: bigint;
  creditPaise?: bigint;
  customerId?: string | null;
  employeeId?: string | null;
  channelId?: string | null;
  expenseCategoryId?: string | null;
  tankId?: string | null;
  fuelType?: FuelType | null;
  quantityMl?: bigint | null;
  memo?: string | null;
}

export interface DraftEntry {
  pumpId: string;
  entryDate: Date;
  narration: string;
  source: JournalSource;
  shiftReportId?: string | null;
  reversalOfId?: string | null;
  createdById: string;
  lines: DraftLine[];
}

export class LedgerImbalanceError extends Error {
  constructor(public debit: bigint, public credit: bigint, narration: string) {
    super(
      `Refusing to post "${narration}": debits (${debit}) do not equal credits (${credit}); ` +
        `difference ${debit - credit} paise`,
    );
    this.name = 'LedgerImbalanceError';
  }
}

/**
 * Writes one journal entry. Drops zero-value lines, then refuses to post unless
 * debits equal credits — the invariant the whole ledger rests on.
 */
export async function postEntry(
  tx: Prisma.TransactionClient,
  accounts: AccountMap,
  draft: DraftEntry,
): Promise<{ id: string; totalPaise: bigint } | null> {
  const lines = draft.lines
    .map((l) => ({
      ...l,
      debitPaise: l.debitPaise ?? 0n,
      creditPaise: l.creditPaise ?? 0n,
    }))
    .filter((l) => l.debitPaise !== 0n || l.creditPaise !== 0n);

  if (lines.length === 0) return null; // nothing happened — don't post an empty entry

  let debit = 0n;
  let credit = 0n;
  for (const l of lines) {
    if (l.debitPaise < 0n || l.creditPaise < 0n) {
      throw new Error('Journal lines must not carry negative amounts; swap the side instead');
    }
    if (l.debitPaise !== 0n && l.creditPaise !== 0n) {
      throw new Error('A journal line is either a debit or a credit, never both');
    }
    if (!accounts[l.code]) throw new Error(`Unknown ledger account code: ${l.code}`);
    debit += l.debitPaise;
    credit += l.creditPaise;
  }
  if (debit !== credit) throw new LedgerImbalanceError(debit, credit, draft.narration);

  const entry = await tx.journalEntry.create({
    data: {
      pumpId: draft.pumpId,
      entryDate: draft.entryDate,
      narration: draft.narration,
      source: draft.source,
      shiftReportId: draft.shiftReportId ?? null,
      reversalOfId: draft.reversalOfId ?? null,
      createdById: draft.createdById,
      lines: {
        create: lines.map((l) => ({
          accountId: accounts[l.code].id,
          debitPaise: l.debitPaise,
          creditPaise: l.creditPaise,
          customerId: l.customerId ?? null,
          employeeId: l.employeeId ?? null,
          channelId: l.channelId ?? null,
          expenseCategoryId: l.expenseCategoryId ?? null,
          tankId: l.tankId ?? null,
          fuelType: l.fuelType ?? null,
          quantityMl: l.quantityMl ?? null,
          memo: l.memo ?? null,
        })),
      },
    },
  });
  return { id: entry.id, totalPaise: debit };
}

// ---------------------------------------------------------------- employee cash expectation

export interface EmployeeExpectation {
  employeeId: string;
  employeeName: string;
  nozzleCodes: string[];
  salesValuePaise: bigint; // value dispensed through their nozzles
  salesQuantityMl: bigint;
  creditIssuedPaise: bigint; // credit sales they booked — not their cash to hand over
  nonCashCollectedPaise: bigint; // card / UPI / bank they took
  cashCollectedPaise: bigint; // cash they recorded
  // Cash they spent on pump expenses. Reported for context only: it does NOT
  // reduce the cash they owe, because this app treats collections as GROSS of
  // expenses (see shiftCalc: money in = sales - credit + outstanding, with
  // expenses a separate outflow). An attendant who pays an expense from the
  // drawer hands over the bill in place of the cash.
  expensesPaidPaise: bigint;
  expectedCashPaise: bigint; // what they must hand over
}

/**
 * Works out, per attendant, how much cash they owe the office for a shift:
 *   expected = value they dispensed
 *            - credit they issued
 *            - money they took digitally
 * Expenses they paid out of the drawer are NOT deducted — collections are gross
 * of expenses throughout this app, and the expense is recorded as its own cash
 * outflow. In POOLED_CASHIER mode a single expectation is produced for the shift
 * cashier, covering the whole shift's cash.
 */
export async function computeEmployeeExpectations(
  tx: Prisma.TransactionClient,
  shiftReportId: string,
): Promise<{ mode: CashHandoverMode; expectations: EmployeeExpectation[]; unattributedSalesPaise: bigint }> {
  const shift = await tx.shiftReport.findUniqueOrThrow({
    where: { id: shiftReportId },
    include: {
      pump: { select: { cashHandoverMode: true } },
      nozzleReadings: { include: { nozzle: { select: { id: true, code: true } } } },
      employeeAssignments: { include: { employee: { select: { id: true, name: true } }, nozzle: true } },
      creditSales: true,
      paymentCollections: { include: { channel: { select: { kind: true } } } },
      expenseEntries: true,
      outstandingReceipts: true,
    },
  });

  const rates = await latestRates(tx, shift.pumpId);

  // Value dispensed per nozzle, from the meter readings.
  const valueByNozzle = new Map<string, { valuePaise: bigint; quantityMl: bigint }>();
  for (const r of shift.nozzleReadings) {
    const sold = r.closingReadingMl - r.openingReadingMl - r.testingMl;
    const qty = sold > 0n ? sold : 0n;
    const rate = rates[r.fuelType] ?? 0n;
    valueByNozzle.set(r.nozzleId, { valuePaise: (qty * rate) / 1000n, quantityMl: qty });
  }

  const mode = shift.pump.cashHandoverMode;

  // ---- totals used by both modes
  const creditByEmp = new Map<string, bigint>();
  let creditUnattributed = 0n;
  let creditTotal = 0n;
  for (const cs of shift.creditSales) {
    creditTotal += cs.amountCreditPaise;
    if (cs.employeeId) {
      creditByEmp.set(cs.employeeId, (creditByEmp.get(cs.employeeId) ?? 0n) + cs.amountCreditPaise);
    } else {
      creditUnattributed += cs.amountCreditPaise;
    }
  }

  const nonCashByEmp = new Map<string, bigint>();
  const cashByEmp = new Map<string, bigint>();
  let nonCashTotal = 0n;
  for (const pc of shift.paymentCollections) {
    const isCash = pc.channel.kind === 'CASH';
    if (!isCash) nonCashTotal += pc.amountPaise;
    if (!pc.employeeId) continue;
    const bucket = isCash ? cashByEmp : nonCashByEmp;
    bucket.set(pc.employeeId, (bucket.get(pc.employeeId) ?? 0n) + pc.amountPaise);
  }

  const expenseByEmp = new Map<string, bigint>();
  let expenseTotal = 0n;
  for (const e of shift.expenseEntries) {
    expenseTotal += e.dayExpensePaise;
    if (e.paidByEmployeeId) {
      expenseByEmp.set(
        e.paidByEmployeeId,
        (expenseByEmp.get(e.paidByEmployeeId) ?? 0n) + e.dayExpensePaise,
      );
    }
  }

  if (mode === 'POOLED_CASHIER') {
    const salesTotal = [...valueByNozzle.values()].reduce((s, v) => s + v.valuePaise, 0n);
    const qtyTotal = [...valueByNozzle.values()].reduce((s, v) => s + v.quantityMl, 0n);
    const outstandingTotal = shift.outstandingReceipts.reduce((s, r) => s + r.amountPaise, 0n);
    const cashierId = shift.cashierEmployeeId;
    if (!cashierId) {
      return { mode, expectations: [], unattributedSalesPaise: salesTotal };
    }
    const cashier = await tx.employee.findUnique({
      where: { id: cashierId },
      select: { id: true, name: true },
    });
    // The office should receive: everything sold, less credit given, less money
    // that arrived digitally, plus old dues collected. Expenses are a separate
    // outflow from that cash, so they are not netted off here.
    const expected = salesTotal - creditTotal + outstandingTotal - nonCashTotal;
    return {
      mode,
      unattributedSalesPaise: 0n,
      expectations: [
        {
          employeeId: cashierId,
          employeeName: cashier?.name ?? 'Shift cashier',
          nozzleCodes: [],
          salesValuePaise: salesTotal,
          salesQuantityMl: qtyTotal,
          creditIssuedPaise: creditTotal,
          nonCashCollectedPaise: nonCashTotal,
          cashCollectedPaise: [...cashByEmp.values()].reduce((s, v) => s + v, 0n),
          expensesPaidPaise: expenseTotal,
          expectedCashPaise: expected,
        },
      ],
    };
  }

  // ---- PER_ATTENDANT: group the nozzles each person worked
  const byEmp = new Map<string, EmployeeExpectation>();
  let attributedSales = 0n;
  for (const a of shift.employeeAssignments) {
    const v = valueByNozzle.get(a.nozzleId) ?? { valuePaise: 0n, quantityMl: 0n };
    const row =
      byEmp.get(a.employeeId) ??
      ({
        employeeId: a.employeeId,
        employeeName: a.employee.name,
        nozzleCodes: [],
        salesValuePaise: 0n,
        salesQuantityMl: 0n,
        creditIssuedPaise: 0n,
        nonCashCollectedPaise: 0n,
        cashCollectedPaise: 0n,
        expensesPaidPaise: 0n,
        expectedCashPaise: 0n,
      } as EmployeeExpectation);
    row.nozzleCodes.push(a.nozzle.code);
    row.salesValuePaise += v.valuePaise;
    row.salesQuantityMl += v.quantityMl;
    attributedSales += v.valuePaise;
    byEmp.set(a.employeeId, row);
  }

  // Anyone who took money or booked credit but worked no nozzle still needs a row.
  const extraIds = new Set<string>([
    ...creditByEmp.keys(),
    ...nonCashByEmp.keys(),
    ...cashByEmp.keys(),
    ...expenseByEmp.keys(),
  ]);
  for (const id of extraIds) {
    if (byEmp.has(id)) continue;
    const emp = await tx.employee.findUnique({ where: { id }, select: { id: true, name: true } });
    byEmp.set(id, {
      employeeId: id,
      employeeName: emp?.name ?? 'Unknown',
      nozzleCodes: [],
      salesValuePaise: 0n,
      salesQuantityMl: 0n,
      creditIssuedPaise: 0n,
      nonCashCollectedPaise: 0n,
      cashCollectedPaise: 0n,
      expensesPaidPaise: 0n,
      expectedCashPaise: 0n,
    });
  }

  for (const row of byEmp.values()) {
    row.creditIssuedPaise = creditByEmp.get(row.employeeId) ?? 0n;
    row.nonCashCollectedPaise = nonCashByEmp.get(row.employeeId) ?? 0n;
    row.cashCollectedPaise = cashByEmp.get(row.employeeId) ?? 0n;
    row.expensesPaidPaise = expenseByEmp.get(row.employeeId) ?? 0n;
    row.expectedCashPaise =
      row.salesValuePaise - row.creditIssuedPaise - row.nonCashCollectedPaise;
  }

  const totalSales = [...valueByNozzle.values()].reduce((s, v) => s + v.valuePaise, 0n);
  return {
    mode,
    expectations: [...byEmp.values()].sort((a, b) => a.employeeName.localeCompare(b.employeeName)),
    // Fuel dispensed on nozzles nobody was assigned to.
    unattributedSalesPaise: totalSales - attributedSales,
  };
}

/** Latest rate per fuel type — the same convention shiftCalc uses. */
export async function latestRates(
  tx: Prisma.TransactionClient,
  pumpId: string,
): Promise<Partial<Record<FuelType, bigint>>> {
  const rates = await tx.fuelRate.findMany({
    where: { pumpId },
    orderBy: { effectiveFrom: 'desc' },
  });
  const out: Partial<Record<FuelType, bigint>> = {};
  for (const r of rates) if (!out[r.fuelType]) out[r.fuelType] = r.ratePaise;
  return out;
}

/** Refreshes the stored expected/variance figures on a shift's handover rows. */
export async function syncHandoverExpectations(
  tx: Prisma.TransactionClient,
  shiftReportId: string,
) {
  const { expectations } = await computeEmployeeExpectations(tx, shiftReportId);
  const byEmp = new Map(expectations.map((e) => [e.employeeId, e]));
  const rows = await tx.employeeCashHandover.findMany({ where: { shiftReportId } });
  for (const row of rows) {
    const expected = byEmp.get(row.employeeId)?.expectedCashPaise ?? 0n;
    if (row.expectedCashPaise !== expected || row.variancePaise !== row.receivedCashPaise - expected) {
      await tx.employeeCashHandover.update({
        where: { id: row.id },
        data: {
          expectedCashPaise: expected,
          variancePaise: row.receivedCashPaise - expected,
        },
      });
    }
  }
}

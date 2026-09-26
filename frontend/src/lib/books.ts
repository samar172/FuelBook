// Shared types, labels and helpers for the Books section (the double-entry ledger).
// Money is paise and volume is millilitres, both serialized as strings (BigInt) by the API.
// Never do arithmetic on these as floats — sum in paise (Number is safe up to 2^53
// paise ≈ ₹90,000 crore) and divide by 100 only when formatting.

import { subDays } from "date-fns";

export type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";

export type JournalSource = "SHIFT_LOCK" | "REVERSAL" | "MANUAL" | "OPENING_BALANCE";

export const JOURNAL_SOURCES: JournalSource[] = [
  "SHIFT_LOCK",
  "REVERSAL",
  "MANUAL",
  "OPENING_BALANCE",
];

export const SOURCE_LABELS: Record<JournalSource, string> = {
  SHIFT_LOCK: "Shift locked",
  REVERSAL: "Reversal",
  MANUAL: "Manual entry",
  OPENING_BALANCE: "Opening balance",
};

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  ASSET: "Asset",
  LIABILITY: "Liability",
  EQUITY: "Equity",
  INCOME: "Income",
  EXPENSE: "Expense",
};

// Which side of the account its normal (positive) balance sits on.
export const normalSide = (type: AccountType): "Dr" | "Cr" =>
  type === "ASSET" || type === "EXPENSE" ? "Dr" : "Cr";

// Fixed chart-of-accounts codes, mirroring the backend.
export const ACCOUNT_CODE = {
  CASH: "1000",
  BANK: "1050",
  CARD_UPI_CLEARING: "1100",
  RECEIVABLE_CUSTOMER: "1200",
  RECEIVABLE_STAFF: "1300",
  FUEL_INVENTORY: "1400",
  PAYABLE_FUEL: "2000",
  OWNER_CAPITAL: "3000",
  OWNER_DRAWINGS: "3100",
  FUEL_SALES: "4000",
  CASH_OVER: "4900",
  COGS_FUEL: "5000",
  OPERATING_EXPENSES: "6000",
  CASH_SHORT: "6900",
} as const;

// Plain-language gloss shown next to the formal account name, because a pump
// owner is not an accountant.
export const ACCOUNT_PLAIN: Record<string, string> = {
  "1000": "Cash you physically hold",
  "1050": "Money sitting in the bank",
  "1100": "Card / UPI money taken but not yet in the bank",
  "1200": "Money customers owe you",
  "1300": "Cash short on staff — recoverable from them",
  "1400": "Value of the fuel still in your tanks",
  "2000": "Money you owe the fuel supplier",
  "3000": "Money you put into the business",
  "3100": "Money you took out of the business",
  "4000": "Fuel you sold",
  "4900": "Extra cash found in the drawer",
  "5000": "What the fuel you sold cost you",
  "6000": "Day-to-day running costs",
  "6900": "Cash short that was written off",
};

// Which subject a line on this account is usually tagged with, so the manual
// entry form and the ledger filters can ask for the right thing.
export type SubjectKind = "customer" | "employee" | "channel" | "tank" | "expenseCategory";

export const ACCOUNT_SUBJECT: Record<string, SubjectKind> = {
  "1100": "channel",
  "1200": "customer",
  "1300": "employee",
  "1400": "tank",
  "6000": "expenseCategory",
};

export type AccountRow = {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  debitPaise: string;
  creditPaise: string;
  balancePaise: string;
};

export type TrialBalance = {
  rows: AccountRow[];
  allRows: AccountRow[];
  totalDebitPaise: string;
  totalCreditPaise: string;
  balanced: boolean;
  differencePaise: string;
};

export type ProfitLoss = {
  from: string;
  to: string;
  income: AccountRow[];
  expenses: AccountRow[];
  totalIncomePaise: string;
  totalExpensesPaise: string;
  netProfitPaise: string;
  fuelSalesPaise: string;
  cogsPaise: string;
  grossMarginPaise: string;
  salesByFuel: { fuelType: string; amountPaise: string; quantityMl: string }[];
  expensesByCategory: { categoryId: string | null; name: string; amountPaise: string }[];
};

export type BalanceSheet = {
  asOf: string;
  assets: AccountRow[];
  liabilities: AccountRow[];
  equityAccounts: AccountRow[];
  retainedEarningsPaise: string;
  totalAssetsPaise: string;
  totalLiabilitiesPaise: string;
  totalEquityPaise: string;
  balanced: boolean;
  differencePaise: string;
};

export type Subject = { id: string; name: string } | null;

export type JournalLine = {
  id?: string;
  debitPaise: string;
  creditPaise: string;
  memo: string | null;
  fuelType: string | null;
  quantityMl: string | null;
  account: { code: string; name: string; type: AccountType };
  customer: Subject;
  employee: Subject;
  channel: Subject;
  tank: Subject;
  expenseCategory?: Subject;
};

export type JournalEntry = {
  id: string;
  entryDate: string;
  narration: string;
  source: JournalSource;
  shiftReportId: string | null;
  totalPaise: string;
  isReversed: boolean;
  lines: JournalLine[];
  reversedBy?: { id: string; narration?: string } | null;
  reversalOf?: { id: string; narration?: string } | null;
};

export type JournalPage = {
  total: number;
  limit: number;
  offset: number;
  entries: JournalEntry[];
};

export type AccountLedgerRow = {
  lineId: string;
  entryId: string;
  entryDate: string;
  narration: string;
  source: JournalSource;
  shiftReportId: string | null;
  debitPaise: string;
  creditPaise: string;
  runningBalancePaise: string;
  memo: string | null;
  customer: Subject;
  employee: Subject;
  channel: Subject;
  tank: Subject;
  fuelType: string | null;
  quantityMl: string | null;
};

export type AccountLedger = {
  account: { id: string; code: string; name: string; type: AccountType };
  openingBalancePaise: string;
  closingBalancePaise: string;
  rows: AccountLedgerRow[];
};

export type CustomerSubsidiaryRow = {
  customerId: string;
  name: string;
  code: string | null;
  billedPaise: string;
  receivedPaise: string;
  ledgerBalancePaise: string;
  storedBalancePaise: string;
  matchesStored: boolean;
};

export type EmployeeSubsidiaryRow = {
  employeeId: string;
  name: string;
  code: string | null;
  designation: string | null;
  isActive: boolean;
  shortagePaise: string;
  recoveredPaise: string;
  outstandingPaise: string;
};

export type ChannelSubsidiaryRow = {
  channelId: string;
  name: string;
  kind: string;
  inPaise: string;
  settledPaise: string;
  heldPaise: string;
};

// ----- Cash reconciliation (per shift) -----

export type CashHandoverMode = "PER_ATTENDANT" | "POOLED_CASHIER";

export const CASH_MODE_LABELS: Record<CashHandoverMode, string> = {
  PER_ATTENDANT: "Each attendant hands over their own cash",
  POOLED_CASHIER: "One shift cashier hands over the whole shift",
};

export const CASH_MODE_HELP: Record<CashHandoverMode, string> = {
  PER_ATTENDANT:
    "Every attendant hands over the cash from their own nozzles and is individually accountable for any shortage.",
  POOLED_CASHIER:
    "Attendants pass their cash to one shift cashier, who hands over the shift total. Only the cashier is accountable.",
};

export type CashReconRow = {
  employeeId: string;
  employeeName: string;
  nozzleCodes: string[];
  salesValuePaise: string;
  salesQuantityMl: string;
  creditIssuedPaise: string;
  nonCashCollectedPaise: string;
  cashCollectedPaise: string;
  expensesPaidPaise: string;
  expectedCashPaise: string;
  handoverId: string | null;
  receivedCashPaise: string | null;
  variancePaise: string | null;
  notes: string | null;
  suggestedReceivedPaise: string;
};

export type CashReconciliation = {
  shiftId: string;
  status: string;
  mode: CashHandoverMode;
  cashierEmployeeId: string | null;
  ledgerPostedAt: string | null;
  unattributedSalesPaise: string;
  rows: CashReconRow[];
  totals: {
    expectedCashPaise: string;
    receivedCashPaise: string;
    variancePaise: string;
  };
};

// ----- small helpers -----

// Paise as an integer Number. Safe for display and for summing pump-scale money.
export const paise = (v: string | number | null | undefined): number =>
  v === null || v === undefined || v === "" ? 0 : Number(v);

export const sumPaise = (values: (string | number | null | undefined)[]): number =>
  values.reduce<number>((s, v) => s + paise(v), 0);

export type Range = { from: string; to: string };

export const todayStr = (): string => new Date().toISOString().slice(0, 10);

export const daysAgoStr = (d: number): string =>
  subDays(new Date(), d).toISOString().slice(0, 10);

export const defaultRange = (): Range => ({ from: daysAgoStr(29), to: todayStr() });

// A paise integer as the rupee string an <input type="number" step="0.01"> wants.
export const paiseToInput = (v: string | number | null | undefined): string =>
  v === null || v === undefined || v === "" ? "" : (paise(v) / 100).toFixed(2);

// A rupee input string back to a paise string, rounding to the nearest paisa.
export const inputToPaise = (v: string): string => {
  const n = parseFloat(v);
  if (!isFinite(n)) return "0";
  return Math.round(n * 100).toString();
};

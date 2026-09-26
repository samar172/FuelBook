// Pure helpers for the credit customer lifecycle (statements, cheque register,
// ageing by DUE DATE, reminder text). Deliberately free of Prisma calls so the
// route file owns all data access and pump scoping.
//
// NOTE ON BALANCES: a customer's `currentBalancePaise` is mutated when a shift is
// LOCKED. Nothing here writes to it — the only balance mutation in this feature is
// the cheque-bounce reversal in the route, which puts bounced money back on the
// customer. Every figure computed below therefore counts LOCKED shift activity
// only, otherwise a draft shift would be billed twice (once in the statement and
// again when the shift is finally locked).

import { AppError } from '../middleware/error';

// Section 269ST of the Income Tax Act: a person must not RECEIVE ₹2,00,000 or more
// in cash from one person in one transaction (or for one event/occasion). The
// penalty under 271DA equals the amount received, so the register warns loudly —
// but it does not block the entry, because refusing to record cash the owner has
// already taken in would just hide the problem.
export const CASH_269ST_LIMIT_PAISE = 20000000n; // ₹2,00,000

export const cash269STWarning = (kind: string, amountPaise: bigint): string | null => {
  if (kind !== 'CASH' || amountPaise < CASH_269ST_LIMIT_PAISE) return null;
  return (
    `Section 269ST: receiving ${formatINRPaise(amountPaise)} in cash from one person in one ` +
    `transaction is prohibited (limit ₹2,00,000). The penalty under section 271DA equals the ` +
    `amount received. Split the payment across dates/transactions or take it by cheque/RTGS.`
  );
};

// ---------- dates (statement periods and due dates are calendar days) ----------

export const dayOnly = (d: Date): Date => {
  const c = new Date(d);
  c.setUTCHours(0, 0, 0, 0);
  return c;
};

export const addDays = (d: Date, days: number): Date => {
  const c = dayOnly(d);
  c.setUTCDate(c.getUTCDate() + days);
  return c;
};

// Exclusive upper bound for a day range: sales are timestamps, periods are dates.
export const nextDay = (d: Date): Date => addDays(d, 1);

export const daysBetween = (from: Date, to: Date): number =>
  Math.floor((dayOnly(to).getTime() - dayOnly(from).getTime()) / 86400000);

export const todayUTC = (): Date => dayOnly(new Date());

// "26 Sep 2026" — how an Indian pump owner reads a date on a bill.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const formatDay = (d: Date): string =>
  `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

// ---------- money (paise BigInt -> Indian grouped rupees, no floats) ----------

export const formatINRPaise = (paise: bigint): string => {
  const neg = paise < 0n;
  const abs = neg ? -paise : paise;
  const rupees = (abs / 100n).toString();
  const pp = (abs % 100n).toString().padStart(2, '0');
  // Indian grouping: last 3 digits, then pairs.
  let grouped: string;
  if (rupees.length <= 3) {
    grouped = rupees;
  } else {
    const head = rupees.slice(0, rupees.length - 3);
    const tail = rupees.slice(rupees.length - 3);
    grouped = head.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + tail;
  }
  return `${neg ? '-' : ''}₹${grouped}.${pp}`;
};

// ---------- statement numbering ----------

// e.g. "FLEET1-003/2026-09" (or "CUST-003/2026-09" when the customer has no code).
export const buildStatementNo = (code: string | null, periodTo: Date, seq: number): string => {
  const prefix = (code || 'CUST').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'CUST';
  const ym = `${periodTo.getUTCFullYear()}-${String(periodTo.getUTCMonth() + 1).padStart(2, '0')}`;
  return `${prefix}-${String(seq).padStart(3, '0')}/${ym}`;
};

// ---------- derived statement status ----------

export type StatementFigures = {
  dueDate: Date;
  closingBalancePaise: bigint;
  status: 'DRAFT' | 'SENT' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE';
};

export type DerivedStatement = {
  status: 'DRAFT' | 'SENT' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE';
  paidAgainstPaise: bigint;
  unpaidPaise: bigint;
  isOverdue: boolean;
  daysPastDue: number;
};

// The stored status only ever says DRAFT or SENT. Everything else is a fact about
// money, so it is derived on read and can never contradict the figures.
export const deriveStatementStatus = (
  s: StatementFigures,
  paidAgainstPaise: bigint,
  asOf: Date,
): DerivedStatement => {
  const closing = s.closingBalancePaise;
  const unpaid = closing - paidAgainstPaise;
  const settled = closing <= 0n || unpaid <= 0n;
  const daysPastDue = Math.max(0, daysBetween(s.dueDate, asOf));
  const pastDue = dayOnly(asOf) > dayOnly(s.dueDate);

  let status: DerivedStatement['status'];
  if (settled) status = 'PAID';
  else if (pastDue) status = 'OVERDUE';
  else if (paidAgainstPaise > 0n) status = 'PARTIALLY_PAID';
  else status = s.status === 'DRAFT' ? 'DRAFT' : 'SENT';

  return {
    status,
    paidAgainstPaise,
    unpaidPaise: unpaid > 0n ? unpaid : 0n,
    isOverdue: !settled && pastDue,
    daysPastDue: settled ? 0 : daysPastDue,
  };
};

// `stored` is what the column says (only ever DRAFT or SENT); `derived` is what the
// money says. The stored value decides whether a send/unsend is a no-op, the money
// decides whether unsending is allowed at all.
export const assertStatementTransition = (
  stored: 'DRAFT' | 'SENT' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE',
  next: 'DRAFT' | 'SENT',
  paidAgainstPaise: bigint,
) => {
  if (next === 'SENT' && stored === 'SENT') {
    throw new AppError(400, 'Statement is already marked as sent');
  }
  if (next === 'DRAFT') {
    if (stored === 'DRAFT') throw new AppError(400, 'Statement is already a draft');
    if (paidAgainstPaise > 0n) {
      throw new AppError(
        400,
        'Payments have already been received against this statement — it cannot go back to draft',
      );
    }
  }
};

// ---------- ageing by due date ----------

export const AGEING_BUCKETS = ['notYetDue', 'd1_30', 'd31_60', 'd61_90', 'd90_plus'] as const;
export type AgeingBucket = (typeof AGEING_BUCKETS)[number];

export const bucketForDaysPastDue = (daysPastDue: number): AgeingBucket => {
  if (daysPastDue <= 0) return 'notYetDue';
  if (daysPastDue <= 30) return 'd1_30';
  if (daysPastDue <= 60) return 'd31_60';
  if (daysPastDue <= 90) return 'd61_90';
  return 'd90_plus';
};

export const emptyBuckets = (): Record<AgeingBucket, bigint> => ({
  notYetDue: 0n,
  d1_30: 0n,
  d31_60: 0n,
  d61_90: 0n,
  d90_plus: 0n,
});

// An amount owed with the date it actually became payable.
export type DueItem = {
  dueDate: Date;
  amountPaise: bigint;
  label: string; // statement number, or "unbilled since <date>"
  statementId: string | null;
};

// Applies receipts FIFO (oldest due item first) and buckets what's left by how far
// past its DUE DATE it is. This is the whole point of the endpoint: `/api/dashboard/
// customer-aging` ages by SALE date and applies FIFO to individual credit sales,
// which answers "how old is this fuel?". Ageing by due date answers "how late is the
// customer?" — with 30-day terms the same money sits in different buckets in the two
// reports, and that is correct, not a contradiction. Neither endpoint replaces the
// other and neither is derived from the other.
export const ageDueItems = (
  items: DueItem[],
  receiptsPaise: bigint,
  asOf: Date,
): {
  buckets: Record<AgeingBucket, bigint>;
  openPaise: bigint;
  overduePaise: bigint;
  oldest: { dueDate: Date; daysPastDue: number; label: string; statementId: string | null } | null;
} => {
  const sorted = [...items]
    .filter((i) => i.amountPaise > 0n)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
    .map((i) => ({ ...i, remaining: i.amountPaise }));

  let unapplied = receiptsPaise;
  for (const item of sorted) {
    if (unapplied <= 0n) break;
    if (item.remaining <= unapplied) {
      unapplied -= item.remaining;
      item.remaining = 0n;
    } else {
      item.remaining -= unapplied;
      unapplied = 0n;
    }
  }

  const buckets = emptyBuckets();
  let openPaise = 0n;
  let overduePaise = 0n;
  let oldest: {
    dueDate: Date;
    daysPastDue: number;
    label: string;
    statementId: string | null;
  } | null = null;

  for (const item of sorted) {
    if (item.remaining <= 0n) continue;
    const daysPastDue = daysBetween(item.dueDate, asOf);
    buckets[bucketForDaysPastDue(daysPastDue)] += item.remaining;
    openPaise += item.remaining;
    if (daysPastDue > 0) {
      overduePaise += item.remaining;
      if (!oldest) {
        oldest = {
          dueDate: item.dueDate,
          daysPastDue,
          label: item.label,
          statementId: item.statementId,
        };
      }
    }
  }

  return { buckets, openPaise, overduePaise, oldest };
};

// ---------- reminder text ----------

// Plain-English, polite, and ready to paste into WhatsApp or SMS. Nothing here
// sends anything: the owner copies the text and sends it himself.
export const buildReminderMessage = (input: {
  pumpName: string;
  customerName: string;
  contactPerson: string | null;
  balancePaise: bigint;
  overduePaise: bigint;
  asOf: Date;
  oldest: { label: string; dueDate: Date; daysPastDue: number; isStatement: boolean } | null;
  paymentTermsDays: number;
}): string => {
  const greetName = input.contactPerson?.trim() || input.customerName;
  const lines: string[] = [];
  lines.push(`Dear ${greetName},`);
  lines.push('');
  lines.push(
    `This is a gentle payment reminder from ${input.pumpName}. As on ${formatDay(input.asOf)}, ` +
      `your fuel credit account (${input.customerName}) shows an outstanding balance of ` +
      `${formatINRPaise(input.balancePaise)}.`,
  );

  if (input.oldest) {
    const what = input.oldest.isStatement
      ? `The oldest pending bill is ${input.oldest.label}, which was due on`
      : `The oldest pending amount is for fuel taken on credit and was payable by`;
    if (input.oldest.daysPastDue > 0) {
      lines.push(
        `${what} ${formatDay(input.oldest.dueDate)} — ${input.oldest.daysPastDue} day` +
          `${input.oldest.daysPastDue === 1 ? '' : 's'} ago. Of the total, ` +
          `${formatINRPaise(input.overduePaise)} is now past its due date.`,
      );
    } else if (input.oldest.isStatement) {
      lines.push(
        `Your next bill ${input.oldest.label} is due on ${formatDay(input.oldest.dueDate)}.`,
      );
    } else {
      lines.push(
        `The earliest amount falls due on ${formatDay(input.oldest.dueDate)}, as per the agreed ` +
          `credit terms of ${input.paymentTermsDays} days.`,
      );
    }
  } else {
    lines.push(
      `As per the agreed credit terms of ${input.paymentTermsDays} days, kindly clear the ` +
        `balance at the earliest.`,
    );
  }

  lines.push('');
  lines.push(
    'Please arrange the payment by cash, cheque or RTGS/NEFT at your earliest convenience. ' +
      'If any amount has already been paid, kindly share the payment details so we can update ' +
      'our records.',
  );
  lines.push('');
  lines.push('Thank you for your business.');
  lines.push(input.pumpName);

  return lines.join('\n');
};

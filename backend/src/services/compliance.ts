import { AttendanceStatus, LicenceKind } from '@prisma/client';

// ===================== DATE HELPERS =====================
// Every date in this feature is a `@db.Date` column, i.e. a calendar day with no
// time zone. We pin them all to midnight UTC, the same way shifts.ts builds
// ShiftReport.reportDate, so comparisons and day arithmetic stay exact.

export const MS_PER_DAY = 86_400_000;

export const toUtcDay = (ymd: string): Date => new Date(`${ymd}T00:00:00.000Z`);

export const toYmd = (d: Date): string => d.toISOString().slice(0, 10);

/** Today as a midnight-UTC calendar day. */
export const todayUtcDay = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

export const addDays = (d: Date, days: number): Date => new Date(d.getTime() + days * MS_PER_DAY);

/** Whole days between two calendar days (b - a). */
export const daysBetween = (a: Date, b: Date): number =>
  Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);

/** Inclusive list of "YYYY-MM-DD" days in a YYYY-MM month. */
export const daysInMonth = (month: string): string[] => {
  const [y, m] = month.split('-').map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out: string[] = [];
  for (let d = 1; d <= count; d++) {
    out.push(`${month}-${String(d).padStart(2, '0')}`);
  }
  return out;
};

export const monthBounds = (month: string): { start: Date; endExclusive: Date } => {
  const [y, m] = month.split('-').map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, 1)),
    endExclusive: new Date(Date.UTC(y, m, 1)),
  };
};

// ===================== LICENCE STATUS =====================

export type LicenceStatus = 'VALID' | 'EXPIRING_SOON' | 'EXPIRED';

/**
 * Derived on every read — nothing about status is stored, so it can never go
 * stale. `EXPIRING_SOON` uses the licence's own reminder window, because a PESO
 * licence wants months of notice while a stamping certificate wants weeks.
 */
export const licenceStatusOf = (
  expiresOn: Date,
  reminderDaysBefore: number,
  today = todayUtcDay()
): { status: LicenceStatus; daysRemaining: number } => {
  const daysRemaining = daysBetween(today, expiresOn);
  const status: LicenceStatus =
    daysRemaining < 0 ? 'EXPIRED' : daysRemaining <= reminderDaysBefore ? 'EXPIRING_SOON' : 'VALID';
  return { status, daysRemaining };
};

/** Sort key: expired first (most overdue first), then soonest to expire. */
export const urgencyRank = (status: LicenceStatus): number =>
  status === 'EXPIRED' ? 0 : status === 'EXPIRING_SOON' ? 1 : 2;

export const LICENCE_KIND_LABELS: Record<LicenceKind, string> = {
  PESO_EXPLOSIVE: 'PESO explosives licence',
  WEIGHTS_MEASURES_STAMPING: 'Weights & Measures stamping',
  FIRE_NOC: 'Fire NOC',
  POLLUTION_NOC: 'Pollution NOC',
  TRADE_LICENCE: 'Trade licence',
  SHOP_ESTABLISHMENT: 'Shop & Establishment registration',
  GST_REGISTRATION: 'GST registration',
  VAT_REGISTRATION: 'VAT registration',
  INSURANCE: 'Insurance policy',
  DEALERSHIP_AGREEMENT: 'Dealership agreement',
  OTHER: 'Other document',
};

export const licenceTitle = (kind: LicenceKind, label?: string | null): string =>
  label ? `${LICENCE_KIND_LABELS[kind]} — ${label}` : LICENCE_KIND_LABELS[kind];

/**
 * Renewal history approach: a licence keeps ONE row for its whole life, and each
 * renewal appends a dated line to `notes`. The owner sees the current expiry at
 * the top of the register (no duplicate rows to filter out) with the previous
 * expiry dates readable underneath. Creating successor rows was the alternative;
 * it was rejected because the register is the primary screen and would fill up
 * with dead rows.
 */
export const renewalNote = (
  previousExpiry: Date,
  previousNumber: string | null,
  newExpiry: string
): string => {
  const num = previousNumber ? ` (no. ${previousNumber})` : '';
  return `Renewed on ${toYmd(todayUtcDay())}: previous expiry ${toYmd(previousExpiry)}${num} → ${newExpiry}`;
};

export const appendNote = (existing: string | null, line: string): string =>
  existing && existing.trim() ? `${existing.trim()}\n${line}` : line;

// ===================== ATTENDANCE =====================

export const ATTENDANCE_STATUSES: AttendanceStatus[] = [
  'PRESENT',
  'ABSENT',
  'HALF_DAY',
  'LEAVE',
  'WEEKLY_OFF',
];

export type AttendanceTotals = {
  present: number;
  absent: number;
  halfDay: number;
  leave: number;
  weeklyOff: number;
  overtimeMinutes: number;
};

export const emptyTotals = (): AttendanceTotals => ({
  present: 0,
  absent: 0,
  halfDay: 0,
  leave: 0,
  weeklyOff: 0,
  overtimeMinutes: 0,
});

export const addToTotals = (
  totals: AttendanceTotals,
  status: AttendanceStatus,
  overtimeMinutes: number
): void => {
  if (status === 'PRESENT') totals.present += 1;
  else if (status === 'ABSENT') totals.absent += 1;
  else if (status === 'HALF_DAY') totals.halfDay += 1;
  else if (status === 'LEAVE') totals.leave += 1;
  else if (status === 'WEEKLY_OFF') totals.weeklyOff += 1;
  totals.overtimeMinutes += overtimeMinutes;
};

// ===================== MONEY =====================

/** Paise -> "₹1,23,456.78", for error messages a pump owner has to read. */
export const formatPaise = (paise: bigint): string => {
  const neg = paise < 0n;
  const abs = neg ? -paise : paise;
  const rupees = abs / 100n;
  const pp = String(abs % 100n).padStart(2, '0');
  // Indian grouping: last 3 digits, then pairs.
  const s = rupees.toString();
  const head = s.length > 3 ? s.slice(0, s.length - 3) : '';
  const tail = s.slice(-3);
  const grouped = head ? `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${tail}` : tail;
  return `${neg ? '-' : ''}₹${grouped}.${pp}`;
};

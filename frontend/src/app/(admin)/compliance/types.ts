// Shapes returned by /api/compliance. Money is always paise as a JSON string.

export type LicenceKind =
  | "PESO_EXPLOSIVE"
  | "WEIGHTS_MEASURES_STAMPING"
  | "FIRE_NOC"
  | "POLLUTION_NOC"
  | "TRADE_LICENCE"
  | "SHOP_ESTABLISHMENT"
  | "GST_REGISTRATION"
  | "VAT_REGISTRATION"
  | "INSURANCE"
  | "DEALERSHIP_AGREEMENT"
  | "OTHER";

export type LicenceStatus = "VALID" | "EXPIRING_SOON" | "EXPIRED";

export type Licence = {
  id: string;
  pumpId: string;
  kind: LicenceKind;
  kindLabel: string;
  title: string;
  label: string | null;
  number: string | null;
  issuedBy: string | null;
  issuedOn: string | null;
  expiresOn: string;
  reminderDaysBefore: number;
  documentRef: string | null;
  notes: string | null;
  isActive: boolean;
  status: LicenceStatus;
  daysRemaining: number;
};

export type CalendarResponse = {
  today: string;
  withinDays: number;
  windowEnd: string;
  summary: { expired: number; expiringSoon: number; valid: number; total: number };
  expiredCount: number;
  needsAttention: number;
  items: Licence[];
};

export type AttendanceStatus = "PRESENT" | "ABSENT" | "HALF_DAY" | "LEAVE" | "WEEKLY_OFF";
export type ShiftType = "DAY" | "NIGHT";

export type StaffRef = {
  id: string;
  code: string | null;
  name: string;
  designation: string | null;
  isActive: boolean;
};

export type AttendanceRow = {
  id: string;
  employeeId: string;
  attendanceDate: string;
  shiftType: ShiftType | null;
  status: AttendanceStatus;
  overtimeMinutes: number;
  shiftReportId: string | null;
  notes: string | null;
  employee?: StaffRef;
};

export type RegisterMark = {
  id: string;
  shiftType: ShiftType | null;
  status: AttendanceStatus;
  overtimeMinutes: number;
  notes: string | null;
};

export type AttendanceTotals = {
  present: number;
  absent: number;
  halfDay: number;
  leave: number;
  weeklyOff: number;
  overtimeMinutes: number;
};

export type RegisterResponse = {
  month: string;
  days: string[];
  statuses: AttendanceStatus[];
  register: {
    employee: StaffRef;
    cells: { date: string; marks: RegisterMark[] }[];
    totals: AttendanceTotals;
  }[];
  grandTotals: AttendanceTotals;
};

export type AdvanceKind = "ADVANCE" | "REPAYMENT";

export type Advance = {
  id: string;
  employeeId: string;
  kind: AdvanceKind;
  amountPaise: string;
  occurredOn: string;
  reference: string | null;
  notes: string | null;
  journalEntryId: string | null;
  createdAt: string;
  employee?: StaffRef;
};

export type AdvanceListResponse = {
  rows: Advance[];
  totals: { advancedPaise: string; repaidPaise: string; netPaise: string };
};

export type AdvanceBalance = {
  employee: StaffRef;
  advancedPaise: string;
  repaidPaise: string;
  outstandingPaise: string;
};

export type BalancesResponse = {
  balances: AdvanceBalance[];
  totals: { advancedPaise: string; repaidPaise: string; outstandingPaise: string };
};

// ===== Display helpers =====

export const LICENCE_KIND_LABELS: Record<LicenceKind, string> = {
  PESO_EXPLOSIVE: "PESO explosives licence",
  WEIGHTS_MEASURES_STAMPING: "Weights & Measures stamping",
  FIRE_NOC: "Fire NOC",
  POLLUTION_NOC: "Pollution NOC",
  TRADE_LICENCE: "Trade licence",
  SHOP_ESTABLISHMENT: "Shop & Establishment registration",
  GST_REGISTRATION: "GST registration",
  VAT_REGISTRATION: "VAT registration",
  INSURANCE: "Insurance policy",
  DEALERSHIP_AGREEMENT: "Dealership agreement",
  OTHER: "Other document",
};

export const LICENCE_KIND_ORDER: LicenceKind[] = [
  "PESO_EXPLOSIVE",
  "WEIGHTS_MEASURES_STAMPING",
  "FIRE_NOC",
  "POLLUTION_NOC",
  "TRADE_LICENCE",
  "SHOP_ESTABLISHMENT",
  "GST_REGISTRATION",
  "VAT_REGISTRATION",
  "INSURANCE",
  "DEALERSHIP_AGREEMENT",
  "OTHER",
];

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  HALF_DAY: "Half day",
  LEAVE: "Leave",
  WEEKLY_OFF: "Weekly off",
};

// Single letters for the monthly grid — a month of columns has no room for words.
export const ATTENDANCE_SHORT: Record<AttendanceStatus, string> = {
  PRESENT: "P",
  ABSENT: "A",
  HALF_DAY: "H",
  LEAVE: "L",
  WEEKLY_OFF: "W",
};

export const ATTENDANCE_CELL_CLASS: Record<AttendanceStatus, string> = {
  PRESENT: "bg-green-100 text-green-900",
  ABSENT: "bg-red-100 text-red-900",
  HALF_DAY: "bg-amber-100 text-amber-900",
  LEAVE: "bg-blue-100 text-blue-900",
  WEEKLY_OFF: "bg-muted text-muted-foreground",
};

export const STATUS_STYLES: Record<
  LicenceStatus,
  { label: string; badge: "destructive" | "warning" | "success"; row: string }
> = {
  EXPIRED: { label: "Expired", badge: "destructive", row: "bg-red-50" },
  EXPIRING_SOON: { label: "Expiring soon", badge: "warning", row: "bg-amber-50" },
  VALID: { label: "Valid", badge: "success", row: "" },
};

/** "in 42 days" / "12 days overdue" / "expires today". */
export const daysPhrase = (daysRemaining: number): string => {
  if (daysRemaining === 0) return "expires today";
  if (daysRemaining < 0) {
    const n = -daysRemaining;
    return `${n} day${n === 1 ? "" : "s"} overdue`;
  }
  return `in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`;
};

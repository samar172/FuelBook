// Shared API shapes and helpers for the Wet Stock section.
// Volumes are millilitres and money is paise, both serialized as strings (BigInt)
// by the API — never parse them into floats before formatting.

export type FuelType = "HSD" | "MS" | "MS_POWER" | "CNG";

export type WetTank = {
  id: string;
  name: string;
  fuelType: FuelType;
  capacityMl: string;
  isActive: boolean;
  chartPoints?: number;
};

export type WetNozzle = {
  id: string;
  code: string;
  fuelType: FuelType;
  tankId: string;
  isActive: boolean;
  tank?: { id: string; name: string };
};

export type ShiftLite = {
  id: string;
  reportDate: string;
  shiftType: "DAY" | "NIGHT";
  status: "DRAFT" | "SUBMITTED" | "LOCKED";
};

export type DipChartPoint = { dipMm: number; volumeMl: string };

export type DipChartResponse = {
  tank: { id: string; name: string; fuelType: FuelType; capacityMl: string };
  points: DipChartPoint[];
  minDipMm: number | null;
  maxDipMm: number | null;
};

export type DipReading = {
  id: string;
  tankId: string;
  dipMm: number;
  volumeFromChartMl: string | null;
  densityKgM3: number | null;
  temperatureC: number | null;
  densityAt15CKgM3: number | null;
  observedAt: string;
  recordedById: string | null;
  notes: string | null;
  tank: WetTank;
  recordedBy?: { id: string; name: string } | null;
};

export type DipReadingsResponse = {
  shift: ShiftLite;
  readings: DipReading[];
  tanks: WetTank[];
  densityNote: string;
};

export type MeasureTest = {
  id: string;
  nozzleId: string;
  measureMl: string;
  deliveredMl: string;
  varianceMl: string;
  withinTolerance: boolean;
  toleranceMl: string;
  testedAt: string;
  testedById: string | null;
  notes: string | null;
  nozzle: WetNozzle;
  testedBy?: { id: string; name: string } | null;
};

export type MeasureTestsResponse = {
  shift: ShiftLite;
  tests: MeasureTest[];
  nozzles: WetNozzle[];
  failedCount: number;
};

export type VarianceRow = {
  shiftReportId: string;
  reportDate: string;
  shiftType: "DAY" | "NIGHT";
  status: string;
  tankId: string;
  tankName: string;
  fuelType: FuelType;
  openingMl: string;
  receiptsMl: string;
  salesMl: string;
  bookClosingMl: string;
  recordedClosingMl: string | null;
  measuredMl: string | null;
  dipMm: number | null;
  densityKgM3: number | null;
  densityAt15CKgM3: number | null;
  throughputMl: string;
  varianceMl: string | null;
  variancePct: number | null;
  hasDip: boolean;
  flagged: boolean;
};

export type VarianceResponse = {
  rows: VarianceRow[];
  tolerancePct: number;
  totals: {
    shiftsCovered: number;
    rowsWithDip: number;
    rowsWithoutDip: number;
    flaggedCount: number;
    totalVarianceMl: string;
    totalThroughputMl: string;
    totalVariancePct: number | null;
  };
  tanks: { id: string; name: string; fuelType: FuelType }[];
  note: string;
};

export type DecantRow = {
  id: string;
  tankId: string;
  shiftReportId: string | null;
  receivedMl: string;
  ratePaise: string | null;
  totalCostPaise: string | null;
  billNo: string | null;
  vendorName: string | null;
  receivedAt: string;
  notes: string | null;
  invoiceQtyMl: string | null;
  dipBeforeMm: number | null;
  dipAfterMm: number | null;
  receivedByDipMl: string | null;
  transitLossMl: string | null;
  densityAtLoading: number | null;
  densityAtReceipt: number | null;
  temperatureC: number | null;
  sealIntact: boolean | null;
  decantedAt: string | null;
  decantedById: string | null;
  claimRaised: boolean;
  claimAmountPaise: string | null;
  lossPct: number | null;
  sealBroken: boolean;
  lossFlagged: boolean;
  decanted: boolean;
  tank: WetTank;
  shiftReport: { id: string; reportDate: string; shiftType: string } | null;
};

export type DecantResponse = {
  rows: DecantRow[];
  claimFlagPct: number;
  totals: {
    loads: number;
    decantedLoads: number;
    brokenSeals: number;
    flaggedLosses: number;
    claimsRaised: number;
    totalInvoiceMl: string;
    totalLossMl: string;
    totalClaimPaise: string;
  };
};

// ---- small display helpers ------------------------------------------------

export const SHIFT_LABELS: Record<string, string> = { DAY: "Day", NIGHT: "Night" };

// A signed litre figure: variances read much faster with an explicit + or −.
export const signedLitres = (ml: string | null, decimals = 2): string => {
  if (ml === null) return "—";
  const n = Number(ml);
  const abs = Math.abs(n) / 1000;
  const body = abs.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  if (n === 0) return body;
  return `${n > 0 ? "+" : "−"}${body}`;
};

export const signedPct = (pct: number | null): string => {
  if (pct === null) return "—";
  const s = Math.abs(pct).toFixed(3);
  if (pct === 0) return `${s}%`;
  return `${pct > 0 ? "+" : "−"}${s}%`;
};

// "" -> null, so a blank field clears the column instead of storing a zero.
export const numOrNull = (v: string): number | null => {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n) : null;
};

export const litresToMlStr = (v: string): string | null => {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 1000).toString();
};

export const mlToLitreInput = (ml: string | null | undefined, decimals = 2): string =>
  ml === null || ml === undefined ? "" : (Number(ml) / 1000).toFixed(decimals);

export const todayStr = () => new Date().toISOString().slice(0, 10);

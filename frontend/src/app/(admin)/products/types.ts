// Shared types + helpers for the non-fuel retail (lubes / AdBlue / accessories)
// screens. Money arrives from the API as BigInt PAISE serialized to strings, so
// everything here stays in BigInt and only formatINR() crosses to display.

export type ProductCategory = "LUBRICANT" | "ADBLUE" | "ACCESSORY" | "SERVICE" | "OTHER";
export type ProductUnit = "LITRE" | "PIECE" | "KG" | "SERVICE";
export type MovementKind = "PURCHASE" | "SALE" | "ADJUSTMENT" | "RETURN";
export type Direction = "IN" | "OUT";

export const CATEGORIES: ProductCategory[] = [
  "LUBRICANT",
  "ADBLUE",
  "ACCESSORY",
  "SERVICE",
  "OTHER",
];

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  LUBRICANT: "Lubricants",
  ADBLUE: "AdBlue / DEF",
  ACCESSORY: "Accessories",
  SERVICE: "Services",
  OTHER: "Other",
};

export const UNITS: ProductUnit[] = ["PIECE", "LITRE", "KG", "SERVICE"];

export const UNIT_LABELS: Record<ProductUnit, string> = {
  PIECE: "Piece",
  LITRE: "Litre",
  KG: "Kg",
  SERVICE: "Service",
};

export const KINDS: MovementKind[] = ["SALE", "PURCHASE", "RETURN", "ADJUSTMENT"];

export const KIND_LABELS: Record<MovementKind, string> = {
  SALE: "Sale",
  PURCHASE: "Purchase",
  RETURN: "Return",
  ADJUSTMENT: "Adjustment",
};

export type Product = {
  id: string;
  sku: string;
  name: string;
  category: ProductCategory;
  unit: ProductUnit;
  packSizeMl: string | null;
  purchasePricePaise: string;
  sellingPricePaise: string;
  gstRateBp: number;
  hsnCode: string | null;
  reorderLevelQty: number;
  isActive: boolean;
  stockQuantity: number;
  stockValuePaise: string;
  avgCostPaise: string;
  belowReorder: boolean;
};

export type Movement = {
  id: string;
  productId: string;
  kind: MovementKind;
  direction: Direction;
  quantity: number;
  unitPricePaise: string;
  totalPaise: string;
  gstPaise: string;
  taxablePaise: string;
  grossPaise: string;
  customerId: string | null;
  shiftReportId: string | null;
  reference: string | null;
  notes: string | null;
  occurredAt: string;
  product?: { id: string; sku: string; name: string; unit: ProductUnit };
};

export type ProductDetail = Product & {
  movementCount: number;
  recentMovements: Movement[];
};

export type MarginRow = {
  productId: string;
  sku: string;
  name: string;
  category: ProductCategory;
  unit: ProductUnit;
  gstRateBp: number;
  quantitySold: number;
  revenueNetPaise: string;
  gstPaise: string;
  grossPaise: string;
  cogsPaise: string;
  marginPaise: string;
  marginPct: number;
  stockQuantity: number;
  stockValuePaise: string;
};

export type MarginReport = {
  from: string;
  to: string;
  products: MarginRow[];
  categories: {
    category: ProductCategory;
    quantitySold: number;
    revenueNetPaise: string;
    gstPaise: string;
    cogsPaise: string;
    marginPaise: string;
    marginPct: number;
    productCount: number;
  }[];
  totals: {
    quantitySold: number;
    revenueNetPaise: string;
    gstPaise: string;
    grossPaise: string;
    cogsPaise: string;
    marginPaise: string;
    marginPct: number;
  };
};

export type StockReport = {
  rows: {
    productId: string;
    sku: string;
    name: string;
    category: ProductCategory;
    unit: ProductUnit;
    packSizeMl: string | null;
    quantity: number;
    valuePaise: string;
    avgCostPaise: string;
    sellingPricePaise: string;
    reorderLevelQty: number;
    belowReorder: boolean;
    isActive: boolean;
  }[];
  totals: {
    productCount: number;
    totalValuePaise: string;
    belowReorderCount: number;
    outOfStockCount: number;
  };
};

export type MovementSummary = {
  from: string;
  to: string;
  groupBy: "day" | "month";
  periods: SummaryBucket[];
  totals: SummaryBucket;
};

export type SummaryBucket = {
  period: string;
  purchaseQty: number;
  purchasePaise: string;
  saleQty: number;
  saleGrossPaise: string;
  saleNetPaise: string;
  saleGstPaise: string;
  adjustmentInQty: number;
  adjustmentOutQty: number;
  adjustmentPaise: string;
  returnInQty: number;
  returnOutQty: number;
  returnPaise: string;
};

// ---------------------------------------------------------------------------
// Live GST preview — the SAME formulas the API applies (services/products.ts),
// in BigInt, so the number shown at the counter is the number that gets stored.
// BigInt division truncates: the taxable base rounds DOWN and GST keeps the
// remainder, so taxable + gst is always exactly the gross.
// ---------------------------------------------------------------------------
const BP = 10000n;

export type GstPreview = { taxable: bigint; gst: bigint; gross: bigint };

export const splitGst = (
  amountPaise: bigint,
  gstRateBp: number,
  inclusive: boolean,
): GstPreview => {
  const bp = BigInt(Math.max(0, Math.trunc(gstRateBp)));
  if (amountPaise <= 0n || bp === 0n) {
    return { taxable: amountPaise, gst: 0n, gross: amountPaise };
  }
  if (inclusive) {
    const taxable = (amountPaise * BP) / (BP + bp);
    return { taxable, gst: amountPaise - taxable, gross: amountPaise };
  }
  const gst = (amountPaise * bp) / BP;
  return { taxable: amountPaise, gst, gross: amountPaise + gst };
};

/** Rupees typed into a form -> BigInt paise, without floating-point drift. */
export const rupeesInputToPaise = (v: string): bigint => {
  const t = (v || "").trim();
  if (t === "") return 0n;
  const m = /^(-?)(\d*)(?:\.(\d{0,}))?$/.exec(t);
  if (!m) return 0n;
  const sign = m[1] === "-" ? -1n : 1n;
  const whole = m[2] === "" ? "0" : m[2];
  const frac = (m[3] || "").padEnd(2, "0").slice(0, 2);
  return sign * (BigInt(whole) * 100n + BigInt(frac));
};

export const paiseToRupeesInput = (paise: string | number | bigint): string => {
  const n = BigInt(typeof paise === "bigint" ? paise : String(paise || "0"));
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, "0");
  return `${neg ? "-" : ""}${whole}.${frac}`;
};

/** GST rate: basis points <-> percentage shown in the form. */
export const bpToPct = (bp: number): string => String(bp / 100);
export const pctToBp = (pct: string): number => Math.round((parseFloat(pct) || 0) * 100);

export const GST_RATE_OPTIONS = [0, 500, 1200, 1800, 2800];

export const big = (v: string | number | bigint | null | undefined): bigint => {
  if (v === null || v === undefined || v === "") return 0n;
  try {
    return BigInt(typeof v === "number" ? Math.trunc(v) : v);
  } catch {
    return 0n;
  }
};

export const formatPct = (n: number): string => `${n.toFixed(1)}%`;

export const packLabel = (p: { packSizeMl: string | null; unit: ProductUnit }): string => {
  if (!p.packSizeMl) return "—";
  const ml = Number(p.packSizeMl);
  return ml >= 1000 ? `${ml / 1000} L` : `${ml} ml`;
};

"use client";
import { ReactNode } from "react";
import { getAuthUser } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { cn, formatINR } from "@/lib/utils";

export const CASH_LOCATIONS = [
  "ATTENDANT",
  "CASHIER",
  "OFFICE_SAFE",
  "OWNER",
  "BANK",
  "VENDOR",
  "OTHER",
] as const;
export type CashLocation = (typeof CASH_LOCATIONS)[number];

export const LOCATION_LABELS: Record<string, string> = {
  ATTENDANT: "With attendant",
  CASHIER: "With cashier",
  OFFICE_SAFE: "Office safe",
  OWNER: "With owner",
  BANK: "Bank",
  VENDOR: "Paid to vendor",
  OTHER: "Other",
};

export const LOCATION_SHORT: Record<string, string> = {
  ATTENDANT: "Attendant",
  CASHIER: "Cashier",
  OFFICE_SAFE: "Office safe",
  OWNER: "Owner",
  BANK: "Bank",
  VENDOR: "Vendor",
  OTHER: "Other",
};

// Locations that are a person: the API insists on knowing who held the money.
export const PERSONAL_LOCATIONS: string[] = ["ATTENDANT", "CASHIER", "OWNER"];

export const todayStr = () => new Date().toISOString().slice(0, 10);
export const daysAgoStr = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};

export const isOwner = () => getAuthUser()?.role === "OWNER";

// Money arrives from the API as a paise string. Never parse it into a float for
// anything but display.
export const bigOf = (v: string | number | bigint | null | undefined): bigint => {
  if (v === null || v === undefined || v === "") return 0n;
  try {
    return BigInt(typeof v === "string" ? v : Math.round(Number(v)));
  } catch {
    return 0n;
  }
};

export const signedINR = (paise: string | number | bigint) => {
  const v = bigOf(paise);
  return (v < 0n ? "-" : "") + formatINR(v < 0n ? -v : v);
};

export const Money = ({
  paise,
  className,
  emphasise,
}: {
  paise: string | number | bigint | null | undefined;
  className?: string;
  emphasise?: boolean;
}) => {
  const v = bigOf(paise);
  return (
    <span
      className={cn(
        "tabular-nums",
        emphasise && v < 0n && "text-destructive font-semibold",
        className,
      )}
    >
      {signedINR(v)}
    </span>
  );
};

export const StatTile = ({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "danger" | "good" | "warn";
}) => (
  <Card
    className={cn(
      tone === "danger" && "border-destructive/50 bg-destructive/5",
      tone === "good" && "border-emerald-500/40 bg-emerald-500/5",
      tone === "warn" && "border-amber-500/40 bg-amber-500/5",
    )}
  >
    <CardContent className="p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-xl sm:text-2xl font-bold tabular-nums mt-1 break-words",
          tone === "danger" && "text-destructive",
        )}
      >
        {value}
      </p>
      {hint ? <p className="text-xs text-muted-foreground mt-1">{hint}</p> : null}
    </CardContent>
  </Card>
);

export const EmptyState = ({ title, hint }: { title: string; hint?: string }) => (
  <div className="rounded-md border border-dashed p-6 text-center">
    <p className="text-sm font-medium">{title}</p>
    {hint ? <p className="text-xs text-muted-foreground mt-1">{hint}</p> : null}
  </div>
);

export const Loading = ({ label = "Loading…" }: { label?: string }) => (
  <p className="text-sm text-muted-foreground py-6 text-center">{label}</p>
);

// ===================== CSV PARSING =====================
// The statement is pasted in by hand and parsed here in the browser; nothing is
// ever fetched from a bank.

// RFC4180-ish: quoted fields, embedded commas and newlines, doubled quotes.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let started = false;

  const pushField = () => {
    row.push(field);
    field = "";
    started = false;
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"' && !started) {
      inQuotes = true;
      started = true;
    } else if (c === "," || c === "\t") pushField();
    else if (c === "\n") pushRow();
    else if (c === "\r") continue;
    else {
      field += c;
      started = true;
    }
  }
  if (field !== "" || row.length > 0) pushRow();

  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

// Banks print dates every way imaginable. Day-first is assumed for d/m/y, as
// every Indian statement does.
export function toIsoDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  let m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    let year = Number(m[3]);
    if (year < 100) year += year > 70 ? 1900 : 2000;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  m = s.match(/^(\d{1,2})[\s\-/]([A-Za-z]{3,})[\s\-/](\d{2,4})/);
  if (m) {
    const day = Number(m[1]);
    const month = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
    let year = Number(m[3]);
    if (year < 100) year += year > 70 ? 1900 : 2000;
    if (month === 0) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return null;
}

// "1,23,456.78 Cr" -> "12345678" paise. Integer maths only: the rupee part and
// the paise part are parsed separately so no float ever touches the money.
export function toPaise(raw: string): string | null {
  const cleaned = raw.replace(/[₹,\s]/g, "").replace(/(cr|dr)$/i, "");
  const m = cleaned.match(/^(-?)(\d*)(?:\.(\d{0,2}))?$/);
  if (!m || (m[2] === "" && !m[3])) return null;
  const rupees = m[2] === "" ? "0" : m[2];
  const paise = (m[3] ?? "").padEnd(2, "0");
  const value = BigInt(rupees) * 100n + BigInt(paise === "" ? "0" : paise);
  return (m[1] === "-" ? -value : value).toString();
}

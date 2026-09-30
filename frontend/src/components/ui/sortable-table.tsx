"use client";
// Shared client-side table sorting used by every admin list + the reports page.
//
// Money (paise) and volume (ml) come off the API as BigInt *strings*, so they
// must never be compared lexicographically — compareValues() detects integer
// strings and compares them as BigInt. Dates compare chronologically, text
// case-insensitively, and null / undefined / "" always sort last regardless of
// the direction.
import * as React from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { TableHead, TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type SortDir = "asc" | "desc";
export type SortValue = string | number | bigint | boolean | Date | null | undefined;
export type SortAccessors<T> = Record<string, (row: T) => SortValue>;
export type SortState = { key: string; dir: SortDir } | null;

const isNil = (v: SortValue): boolean =>
  v === null || v === undefined || v === "" || (typeof v === "number" && Number.isNaN(v));

const INTEGER_RE = /^-?\d+$/;

// Compares two non-nil values. Returns <0, 0 or >0 like Array#sort.
export function compareValues(a: SortValue, b: SortValue): number {
  if (a instanceof Date || b instanceof Date) {
    const at = a instanceof Date ? a.getTime() : Number(a);
    const bt = b instanceof Date ? b.getTime() : Number(b);
    return at === bt ? 0 : at < bt ? -1 : 1;
  }
  if (typeof a === "boolean" || typeof b === "boolean") {
    return Number(a) - Number(b);
  }
  if (typeof a === "bigint" || typeof b === "bigint") {
    const ab = typeof a === "bigint" ? a : BigInt(Math.trunc(Number(a) || 0));
    const bb = typeof b === "bigint" ? b : BigInt(Math.trunc(Number(b) || 0));
    return ab === bb ? 0 : ab < bb ? -1 : 1;
  }
  if (typeof a === "number" && typeof b === "number") {
    return a === b ? 0 : a < b ? -1 : 1;
  }
  const as = String(a);
  const bs = String(b);
  // BigInt-as-string money / volume: exact numeric comparison, no precision loss.
  if (INTEGER_RE.test(as) && INTEGER_RE.test(bs)) {
    const ab = BigInt(as);
    const bb = BigInt(bs);
    return ab === bb ? 0 : ab < bb ? -1 : 1;
  }
  if (typeof a === "number" || typeof b === "number") {
    const an = Number(a);
    const bn = Number(b);
    if (!Number.isNaN(an) && !Number.isNaN(bn)) return an === bn ? 0 : an < bn ? -1 : 1;
  }
  return as.localeCompare(bs, undefined, { sensitivity: "base", numeric: true });
}

// A date-ish value (ISO string / Date) for chronological sorting.
export const sortDate = (v: string | Date | null | undefined): number | undefined => {
  if (!v) return undefined;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isNaN(t) ? undefined : t;
};

// A BigInt-string (paise / ml) for exact numeric sorting.
export const sortBig = (v: string | number | bigint | null | undefined): bigint | undefined => {
  if (v === null || v === undefined || v === "") return undefined;
  try {
    return typeof v === "bigint" ? v : BigInt(Math.trunc(Number(v)));
  } catch {
    return undefined;
  }
};

export type UseTableSort<T> = {
  rows: T[];
  sort: SortState;
  toggle: (key: string) => void;
  reset: () => void;
  /** Spread onto <SortableHead> for a column. */
  sortProps: (key: string) => { sortKey: string; sort: SortState; onSort: (key: string) => void };
};

export function useTableSort<T>(
  rows: T[],
  accessors: SortAccessors<T>,
  initial?: { key: string; dir?: SortDir },
): UseTableSort<T> {
  const [sort, setSort] = React.useState<SortState>(
    initial ? { key: initial.key, dir: initial.dir ?? "asc" } : null,
  );

  // Accessors are static logic declared inline at render time; keep them in a
  // ref so a new object identity each render doesn't invalidate the memo.
  const accRef = React.useRef(accessors);
  accRef.current = accessors;

  const toggle = React.useCallback((key: string) => {
    setSort((cur) =>
      cur && cur.key === key
        ? { key, dir: cur.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
  }, []);

  const reset = React.useCallback(() => setSort(null), []);

  // The sort choice survives filter changes — only `rows` and `sort` feed this.
  const sorted = React.useMemo(() => {
    if (!sort) return rows;
    const acc = accRef.current[sort.key];
    if (!acc) return rows;
    const mult = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((x, y) => {
      const a = acc(x);
      const b = acc(y);
      const an = isNil(a);
      const bn = isNil(b);
      if (an && bn) return 0;
      if (an) return 1; // nulls last, both directions
      if (bn) return -1;
      return mult * compareValues(a, b);
    });
  }, [rows, sort]);

  const sortProps = React.useCallback(
    (key: string) => ({ sortKey: key, sort, onSort: toggle }),
    [sort, toggle],
  );

  return { rows: sorted, sort, toggle, reset, sortProps };
}

export function SortableHead({
  sortKey,
  sort,
  onSort,
  children,
  className,
  align = "left",
}: {
  sortKey: string;
  sort: SortState;
  onSort: (key: string) => void;
  children: React.ReactNode;
  className?: string;
  align?: "left" | "right";
}) {
  const active = sort?.key === sortKey;
  const dir = active ? sort?.dir : undefined;
  return (
    <TableHead
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn(align === "right" && "text-right", className)}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 font-medium hover:text-foreground transition-colors",
          align === "right" && "flex-row-reverse",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <span>{children}</span>
        {active ? (
          dir === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5 shrink-0" />
          )
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-40" />
        )}
      </button>
    </TableHead>
  );
}

// Shared "nothing matched" row so a filtered-out table is never blank.
export function NoMatchRow({
  colSpan,
  filtered,
  onClear,
  emptyMessage,
}: {
  colSpan: number;
  filtered: boolean;
  onClear?: () => void;
  emptyMessage?: string;
}) {
  const { t } = useT();
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="text-center text-muted-foreground py-8">
        {filtered ? (
          <div className="space-y-2">
            <div>{t("common.noMatch", "No data matches these filters")}</div>
            {onClear && (
              <Button size="sm" variant="outline" onClick={onClear}>
                {t("common.clearFilters", "Clear filters")}
              </Button>
            )}
          </div>
        ) : (
          emptyMessage ?? t("common.nothingYet", "Nothing here yet.")
        )}
      </TableCell>
    </TableRow>
  );
}

// Removable filter chip for the filter bars.
export function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2.5 py-0.5 text-xs">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="text-muted-foreground hover:text-foreground leading-none"
      >
        ×
      </button>
    </span>
  );
}

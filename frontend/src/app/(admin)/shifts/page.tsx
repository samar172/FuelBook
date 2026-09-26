"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FilterChip,
  NoMatchRow,
  SortableHead,
  sortBig,
  sortDate,
  useTableSort,
} from "@/components/ui/sortable-table";
import { formatINR } from "@/lib/utils";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

const ALL = "__all__";

type Filters = {
  from: string;
  to: string;
  shiftType: string;
  status: string;
  discrepancyOnly: boolean;
};

const EMPTY: Filters = {
  from: "",
  to: "",
  shiftType: ALL,
  status: ALL,
  discrepancyOnly: false,
};

export default function ShiftsListPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["shifts"],
    queryFn: async () => (await api.get("/api/shifts")).data,
  });

  const [f, setF] = useState<Filters>(EMPTY);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) =>
    setF((cur) => ({ ...cur, [k]: v }));

  const all: any[] = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  // Client-side: /api/shifts already returns the whole list.
  const filtered = useMemo(
    () =>
      all.filter((s) => {
        const day = String(s.reportDate).slice(0, 10);
        if (f.from && day < f.from) return false;
        if (f.to && day > f.to) return false;
        if (f.shiftType !== ALL && s.shiftType !== f.shiftType) return false;
        if (f.status !== ALL && s.status !== f.status) return false;
        if (f.discrepancyOnly && !s.discrepancyFlag) return false;
        return true;
      }),
    [all, f],
  );

  const sorted = useTableSort<any>(
    filtered,
    {
      date: (s) => sortDate(s.reportDate),
      shiftType: (s) => s.shiftType,
      status: (s) => s.status,
      sales: (s) => sortBig(s.totalSalesPaise),
      expenses: (s) => sortBig(s.totalExpensesPaise),
      closing: (s) => sortBig(s.closingCashPaise),
      reconcile: (s) => (s.discrepancyFlag ? 1 : 0),
    },
    { key: "date", dir: "desc" },
  );

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (f.from) chips.push({ key: "from", label: `From ${f.from}`, clear: () => set("from", "") });
  if (f.to) chips.push({ key: "to", label: `To ${f.to}`, clear: () => set("to", "") });
  if (f.shiftType !== ALL)
    chips.push({
      key: "shiftType",
      label: `Shift: ${f.shiftType}`,
      clear: () => set("shiftType", ALL),
    });
  if (f.status !== ALL)
    chips.push({ key: "status", label: `Status: ${f.status}`, clear: () => set("status", ALL) });
  if (f.discrepancyOnly)
    chips.push({
      key: "disc",
      label: "Flagged only",
      clear: () => set("discrepancyOnly", false),
    });

  const active = chips.length > 0;
  const clearAll = () => setF(EMPTY);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Shift Reports</h1>
          <p className="text-muted-foreground text-sm sm:text-base">Daily shift entries — replaces the manual Excel</p>
        </div>
        <Link href="/shifts/new">
          <Button>+ New Shift</Button>
        </Link>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">From</Label>
              <Input
                type="date"
                value={f.from}
                max={f.to || undefined}
                onChange={(e) => set("from", e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                value={f.to}
                min={f.from || undefined}
                onChange={(e) => set("to", e.target.value)}
              />
            </div>
            <div className="min-w-0">
              <Label className="text-xs">Shift type</Label>
              <Select value={f.shiftType} onValueChange={(v) => set("shiftType", v)}>
                <SelectTrigger className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All shifts</SelectItem>
                  <SelectItem value="DAY">Day</SelectItem>
                  <SelectItem value="NIGHT">Night</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0">
              <Label className="text-xs">Status</Label>
              <Select value={f.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="SUBMITTED">Submitted</SelectItem>
                  <SelectItem value="LOCKED">Locked</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={f.discrepancyOnly}
              onChange={(e) => set("discrepancyOnly", e.target.checked)}
            />
            Only shifts flagged for reconciliation
          </label>

          {active && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
              {chips.map((c) => (
                <FilterChip key={c.key} label={c.label} onRemove={c.clear} />
              ))}
              <Button size="sm" variant="ghost" onClick={clearAll}>
                Clear all
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {active ? `${sorted.rows.length} of ${all.length} shifts` : "Recent shifts"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead {...sorted.sortProps("date")}>Date</SortableHead>
                  <SortableHead {...sorted.sortProps("shiftType")}>Shift</SortableHead>
                  <SortableHead {...sorted.sortProps("status")}>Status</SortableHead>
                  <SortableHead {...sorted.sortProps("sales")} align="right">
                    Sales
                  </SortableHead>
                  <SortableHead {...sorted.sortProps("expenses")} align="right">
                    Expenses
                  </SortableHead>
                  <SortableHead {...sorted.sortProps("closing")} align="right">
                    Closing Cash
                  </SortableHead>
                  <SortableHead {...sorted.sortProps("reconcile")}>Reconcile</SortableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.rows.length === 0 ? (
                  <NoMatchRow
                    colSpan={7}
                    filtered={active}
                    onClear={clearAll}
                    emptyMessage="No shifts yet. Create your first one."
                  />
                ) : (
                  sorted.rows.map((s: any) => (
                    <TableRow key={s.id} className="cursor-pointer">
                      <TableCell>
                        <Link href={`/shifts/${s.id}`}>{format(new Date(s.reportDate), "dd MMM yyyy")}</Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/shifts/${s.id}`}>
                          <Badge variant={s.shiftType === "DAY" ? "default" : "secondary"}>{s.shiftType}</Badge>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{s.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatINR(s.totalSalesPaise)}</TableCell>
                      <TableCell className="text-right">{formatINR(s.totalExpensesPaise)}</TableCell>
                      <TableCell className="text-right font-medium">{formatINR(s.closingCashPaise)}</TableCell>
                      <TableCell>
                        {s.discrepancyFlag ? (
                          <Badge variant="warning">Flagged</Badge>
                        ) : (
                          <Badge variant="success">OK</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

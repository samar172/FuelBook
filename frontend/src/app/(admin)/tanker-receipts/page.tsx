"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
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
import { formatINR, formatLitres } from "@/lib/utils";
import { format } from "date-fns";
import { useT } from "@/lib/i18n";
import { useDateLocale } from "@/lib/i18n/core";

const ALL = "__all__";

type Filters = { from: string; to: string; tankId: string; vendor: string };
const EMPTY: Filters = { from: "", to: "", tankId: ALL, vendor: "" };

export default function TankerReceiptsPage() {
  const { t: tr } = useT();
  const locale = useDateLocale();
  const { data = [] } = useQuery({
    queryKey: ["tanker-receipts"],
    queryFn: async () => (await api.get("/api/tanker-receipts")).data,
  });
  const tanksQ = useQuery({
    queryKey: ["setup-tanks"],
    queryFn: async () => (await api.get("/api/setup/tanks")).data,
  });
  const tanks: { id: string; name: string }[] = tanksQ.data || [];

  const [f, setF] = useState<Filters>(EMPTY);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) =>
    setF((cur) => ({ ...cur, [k]: v }));

  // The receipt list is already fully loaded — filter and sort in the browser.
  const filtered = useMemo(() => {
    const needle = f.vendor.trim().toLowerCase();
    return (data as any[]).filter((t) => {
      const day = String(t.receivedAt).slice(0, 10);
      if (f.from && day < f.from) return false;
      if (f.to && day > f.to) return false;
      if (f.tankId !== ALL && t.tankId !== f.tankId) return false;
      if (needle) {
        const hay = `${t.vendorName || ""} ${t.billNo || ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [data, f]);

  const sorted = useTableSort<any>(
    filtered,
    {
      date: (t) => sortDate(t.receivedAt),
      tank: (t) => t.tank?.name,
      litres: (t) => sortBig(t.receivedMl),
      rate: (t) => sortBig(t.ratePaise),
      cost: (t) => sortBig(t.totalCostPaise),
      bill: (t) => t.billNo,
      vendor: (t) => t.vendorName,
    },
    { key: "date", dir: "desc" },
  );

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (f.from) chips.push({ key: "from", label: tr("tankers.chipFrom", "From {d}", { d: f.from }), clear: () => set("from", "") });
  if (f.to) chips.push({ key: "to", label: tr("tankers.chipTo", "To {d}", { d: f.to }), clear: () => set("to", "") });
  if (f.tankId !== ALL)
    chips.push({
      key: "tank",
      label: tr("tankers.chipTank", "Tank: {name}", {
        name: tanks.find((t) => t.id === f.tankId)?.name || f.tankId,
      }),
      clear: () => set("tankId", ALL),
    });
  if (f.vendor.trim())
    chips.push({ key: "vendor", label: tr("tankers.chipVendor", "Vendor: {v}", { v: f.vendor.trim() }), clear: () => set("vendor", "") });
  const active = chips.length > 0;
  const clearAll = () => setF(EMPTY);

  const totalLitres = sorted.rows.reduce((s: bigint, t: any) => s + BigInt(t.receivedMl || 0), 0n);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl sm:text-3xl font-bold">{tr("tankers.title", "Tanker Receipts")}</h1>
      <p className="text-muted-foreground text-sm sm:text-base">{tr(
          "tankers.subtitle",
          "Fuel deliveries received. Add a new one from inside a Shift » Stock tab."
        )}</p>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">{tr("common.from", "From")}</Label>
              <Input
                type="date"
                value={f.from}
                max={f.to || undefined}
                onChange={(e) => set("from", e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">{tr("common.to", "To")}</Label>
              <Input
                type="date"
                value={f.to}
                min={f.from || undefined}
                onChange={(e) => set("to", e.target.value)}
              />
            </div>
            <div className="min-w-0">
              <Label className="text-xs">{tr("tankers.tank", "Tank")}</Label>
              <Select value={f.tankId} onValueChange={(v) => set("tankId", v)}>
                <SelectTrigger className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{tr("tankers.allTanks", "All tanks")}</SelectItem>
                  {tanks.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{tr("tankers.vendorBill", "Vendor / bill")}</Label>
              <Input
                placeholder={tr("tankers.vendorPh", "Search vendor or bill no")}
                value={f.vendor}
                onChange={(e) => set("vendor", e.target.value)}
              />
            </div>
          </div>
          {active && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
              {chips.map((c) => (
                <FilterChip key={c.key} label={c.label} onRemove={c.clear} />
              ))}
              <Button size="sm" variant="ghost" onClick={clearAll}>
                {tr("common.clearAll", "Clear all")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {active
              ? tr("tankers.countTitle", "{n} of {total} receipts · {litres} L", {
                  n: sorted.rows.length,
                  total: (data as any[]).length,
                  litres: formatLitres(totalLitres),
                })
              : tr("tankers.recent", "Recent receipts · {litres} L", {
                  litres: formatLitres(totalLitres),
                })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <SortableHead {...sorted.sortProps("date")}>{tr("common.date", "Date")}</SortableHead>
              <SortableHead {...sorted.sortProps("tank")}>{tr("tankers.col.tank", "Tank")}</SortableHead>
              <SortableHead {...sorted.sortProps("litres")} align="right">{tr("common.litres", "Litres")}</SortableHead>
              <SortableHead {...sorted.sortProps("rate")} align="right">{tr("tankers.col.rate", "Rate / L")}</SortableHead>
              <SortableHead {...sorted.sortProps("cost")} align="right">{tr("tankers.col.cost", "Total Cost")}</SortableHead>
              <SortableHead {...sorted.sortProps("bill")}>{tr("tankers.col.bill", "Bill")}</SortableHead>
              <SortableHead {...sorted.sortProps("vendor")}>{tr("tankers.col.vendor", "Vendor")}</SortableHead>
            </TableRow></TableHeader>
            <TableBody>
              {sorted.rows.length === 0 ? (
                <NoMatchRow
                  colSpan={7}
                  filtered={active}
                  onClear={clearAll}
                  emptyMessage={tr("tankers.empty", "No tanker receipts yet")}
                />
              ) : (
                sorted.rows.map((t: any) => (
                  <TableRow key={t.id}>
                    <TableCell>{format(new Date(t.receivedAt), "d MMM yyyy HH:mm", { locale })}</TableCell>
                    <TableCell>{t.tank?.name || "-"}</TableCell>
                    <TableCell className="text-right">{formatLitres(t.receivedMl)} L</TableCell>
                    <TableCell className="text-right">{t.ratePaise ? formatINR(t.ratePaise) : "-"}</TableCell>
                    <TableCell className="text-right">{t.totalCostPaise ? formatINR(t.totalCostPaise) : "-"}</TableCell>
                    <TableCell>{t.billNo || "-"}</TableCell>
                    <TableCell>{t.vendorName || "-"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

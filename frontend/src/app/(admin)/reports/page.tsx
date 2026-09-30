"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, downloadFile } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FilterChip,
  NoMatchRow,
  SortableHead,
  sortBig,
  useTableSort,
} from "@/components/ui/sortable-table";
import { formatINR, formatLitres, FUEL_LABELS, rupeesToPaise } from "@/lib/utils";
import type { Employee } from "@/lib/types";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { FileSpreadsheet } from "lucide-react";
import { format, parseISO, subDays } from "date-fns";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { useDateLocale } from "@/lib/i18n/core";

type Range = { from: string; to: string };

const ALL = "__all__";

type Filters = {
  shiftType: string;
  status: string;
  fuelType: string[];
  employeeId: string;
  nozzleId: string;
  channelId: string;
  categoryId: string;
};

const EMPTY_FILTERS: Filters = {
  shiftType: ALL,
  status: ALL,
  fuelType: [],
  employeeId: ALL,
  nozzleId: ALL,
  channelId: ALL,
  categoryId: ALL,
};

type AgingFilters = { bucket: string; minBalance: string; q: string };
const EMPTY_AGING: AgingFilters = { bucket: ALL, minBalance: "", q: "" };

const FUELS = ["HSD", "MS", "MS_POWER", "CNG"] as const;

const BUCKET_KEYS: Record<string, { key: string; en: string }> = {
  d0_30: { key: "reports.bucket0_30", en: "0–30 days" },
  d31_60: { key: "reports.bucket31_60", en: "31–60 days" },
  d61_90: { key: "reports.bucket61_90", en: "61–90 days" },
  d90_plus: { key: "reports.bucket90plus", en: "90+ days" },
};

const todayStr = () => new Date().toISOString().slice(0, 10);
const daysAgoStr = (d: number) =>
  subDays(new Date(), d).toISOString().slice(0, 10);

const PIE_COLORS = [
  "#0f172a",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
];

export default function ReportsPage() {
  const { t } = useT();
  const dateLocale = useDateLocale();
  const bucketLabel = (b: string) =>
    BUCKET_KEYS[b] ? t(BUCKET_KEYS[b].key, BUCKET_KEYS[b].en) : b;
  const shiftLabel = (v: string) =>
    v === "DAY" ? t("reports.day", "Day") : v === "NIGHT" ? t("reports.night", "Night") : v;
  const statusLabel = (v: string) =>
    v === "DRAFT"
      ? t("reports.draft", "Draft")
      : v === "SUBMITTED"
        ? t("reports.submitted", "Submitted")
        : v === "LOCKED"
          ? t("reports.locked", "Locked")
          : v;
  const [range, setRange] = useState<Range>({
    from: daysAgoStr(29),
    to: todayStr(),
  });
  const [draft, setDraft] = useState<Range>(range);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [aging, setAging] = useState<AgingFilters>(EMPTY_AGING);

  // Keystrokes in the customer search shouldn't hammer the API.
  const [agingQ, setAgingQ] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setAgingQ(aging.q.trim()), 300);
    return () => clearTimeout(timer);
  }, [aging.q]);

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  const toggleFuel = (fuel: string) =>
    setFilters((f) => ({
      ...f,
      fuelType: f.fuelType.includes(fuel)
        ? f.fuelType.filter((x) => x !== fuel)
        : [...f.fuelType, fuel],
    }));

  // ---- option lists -------------------------------------------------------
  const nozzlesQ = useQuery({
    queryKey: ["setup-nozzles"],
    queryFn: async () => (await api.get("/api/setup/nozzles")).data,
  });
  const channelsQ = useQuery({
    queryKey: ["setup-payment-channels"],
    queryFn: async () => (await api.get("/api/setup/payment-channels")).data,
  });
  const categoriesQ = useQuery({
    queryKey: ["setup-expense-categories"],
    queryFn: async () => (await api.get("/api/setup/expense-categories")).data,
  });
  const employeesQ = useQuery<Employee[]>({
    queryKey: ["employees-options"],
    queryFn: async () => (await api.get("/api/employees")).data,
  });

  const nozzles = useMemo<{ id: string; code: string; fuelType: string }[]>(
    () => nozzlesQ.data || [],
    [nozzlesQ.data],
  );
  const channels = useMemo<{ id: string; name: string }[]>(
    () => channelsQ.data || [],
    [channelsQ.data],
  );
  const categories = useMemo<{ id: string; name: string }[]>(
    () => categoriesQ.data || [],
    [categoriesQ.data],
  );
  const employees = useMemo<Employee[]>(() => employeesQ.data || [], [employeesQ.data]);

  const nameOf = (list: { id: string; name: string }[], id: string) =>
    list.find((x) => x.id === id)?.name || id;

  // ---- query strings ------------------------------------------------------
  const rangeQs = `from=${range.from}&to=${range.to}`;

  const filterQs = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.shiftType !== ALL) p.set("shiftType", filters.shiftType);
    if (filters.status !== ALL) p.set("status", filters.status);
    if (filters.fuelType.length > 0) p.set("fuelType", filters.fuelType.join(","));
    if (filters.employeeId !== ALL) p.set("employeeId", filters.employeeId);
    if (filters.nozzleId !== ALL) p.set("nozzleId", filters.nozzleId);
    if (filters.channelId !== ALL) p.set("channelId", filters.channelId);
    if (filters.categoryId !== ALL) p.set("categoryId", filters.categoryId);
    const s = p.toString();
    return s ? `&${s}` : "";
  }, [filters]);

  const expenseQs = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.shiftType !== ALL) p.set("shiftType", filters.shiftType);
    if (filters.status !== ALL) p.set("status", filters.status);
    if (filters.employeeId !== ALL) p.set("employeeId", filters.employeeId);
    if (filters.categoryId !== ALL) p.set("categoryId", filters.categoryId);
    const s = p.toString();
    return s ? `&${s}` : "";
  }, [filters]);

  const agingQs = useMemo(() => {
    const p = new URLSearchParams();
    if (aging.bucket !== ALL) p.set("bucket", aging.bucket);
    if (aging.minBalance.trim() !== "" && !Number.isNaN(Number(aging.minBalance))) {
      p.set("minBalancePaise", rupeesToPaise(aging.minBalance));
    }
    if (agingQ) p.set("q", agingQ);
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [aging.bucket, aging.minBalance, agingQ]);

  const rangeQuery = useQuery({
    queryKey: ["report-range", range, filterQs],
    queryFn: async () =>
      (await api.get(`/api/dashboard/range?${rangeQs}${filterQs}`)).data,
  });
  const expenseQuery = useQuery({
    queryKey: ["report-expense", range, expenseQs],
    queryFn: async () =>
      (await api.get(`/api/dashboard/expense-breakdown?${rangeQs}${expenseQs}`)).data,
  });
  const agingQuery = useQuery({
    queryKey: ["report-aging", agingQs],
    queryFn: async () =>
      (await api.get(`/api/dashboard/customer-aging${agingQs}`)).data,
  });

  useEffect(() => {
    if (rangeQuery.error) toast.error(t("reports.loadFailed", "Could not load the report for these filters"));
  }, [rangeQuery.error, t]);
  useEffect(() => {
    if (agingQuery.error) toast.error(t("reports.agingLoadFailed", "Could not load customer aging"));
  }, [agingQuery.error, t]);

  const r = rangeQuery.data;
  const exp = expenseQuery.data;
  const agingData = agingQuery.data;

  // ---- active-filter chips ------------------------------------------------
  const chips = useMemo(() => {
    const out: { key: string; label: string; clear: () => void }[] = [];
    if (filters.shiftType !== ALL)
      out.push({
        key: "shiftType",
        label: t("reports.chipShift", "Shift: {value}", { value: shiftLabel(filters.shiftType) }),
        clear: () => set("shiftType", ALL),
      });
    if (filters.status !== ALL)
      out.push({
        key: "status",
        label: t("reports.chipStatus", "Status: {value}", { value: statusLabel(filters.status) }),
        clear: () => set("status", ALL),
      });
    for (const f of filters.fuelType)
      out.push({
        key: `fuel-${f}`,
        label: t("reports.chipFuel", "Fuel: {value}", { value: FUEL_LABELS[f] || f }),
        clear: () => toggleFuel(f),
      });
    if (filters.employeeId !== ALL)
      out.push({
        key: "employeeId",
        label: t("reports.chipAttendant", "Attendant: {value}", { value: employees.find((e) => e.id === filters.employeeId)?.name || filters.employeeId }),
        clear: () => set("employeeId", ALL),
      });
    if (filters.nozzleId !== ALL)
      out.push({
        key: "nozzleId",
        label: t("reports.chipNozzle", "Nozzle: {value}", { value: nozzles.find((n) => n.id === filters.nozzleId)?.code || filters.nozzleId }),
        clear: () => set("nozzleId", ALL),
      });
    if (filters.channelId !== ALL)
      out.push({
        key: "channelId",
        label: t("reports.chipChannel", "Channel: {value}", { value: nameOf(channels, filters.channelId) }),
        clear: () => set("channelId", ALL),
      });
    if (filters.categoryId !== ALL)
      out.push({
        key: "categoryId",
        label: t("reports.chipExpense", "Expense: {value}", { value: nameOf(categories, filters.categoryId) }),
        clear: () => set("categoryId", ALL),
      });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, employees, nozzles, channels, categories, t]);

  const filtersActive = chips.length > 0;
  const clearAll = () => setFilters(EMPTY_FILTERS);

  const agingFiltersActive =
    aging.bucket !== ALL || aging.minBalance.trim() !== "" || aging.q.trim() !== "";
  const clearAging = () => setAging(EMPTY_AGING);

  // ---- chart data ---------------------------------------------------------
  const chartData = useMemo<
    { date: string; sales: number; collections: number; expenses: number }[]
  >(() => {
    if (!r) return [];
    return r.byDate.map((d: any) => ({
      date: format(parseISO(d.date), "dd MMM", { locale: dateLocale }),
      sales: Number(d.salesPaise) / 100,
      collections: Number(d.collectionsPaise) / 100,
      expenses: Number(d.expensesPaise) / 100,
    }));
  }, [r, dateLocale]);

  const fuelMixData = useMemo<
    { name: string; value: number; qty: number }[]
  >(() => {
    if (!r) return [];
    return Object.entries(r.fuelMix as Record<string, any>)
      .filter(([, v]: any) => Number(v.amtPaise) > 0)
      .map(([k, v]: any) => ({
        name: FUEL_LABELS[k] || k,
        value: Number(v.amtPaise) / 100,
        qty: Number(v.qtyMl) / 1000,
      }));
  }, [r]);

  const channelData = useMemo<{ name: string; value: number }[]>(() => {
    if (!r) return [];
    return r.collectionsByChannel.map((c: any) => ({
      name: c.name,
      value: Number(c.amountPaise) / 100,
    }));
  }, [r]);

  // ---- sortable tables ----------------------------------------------------
  const expenseRows = useMemo<any[]>(
    () => (exp?.byCategory || []).filter((c: any) => Number(c.amountPaise) > 0),
    [exp],
  );
  const expenseSort = useTableSort<any>(
    expenseRows,
    {
      name: (c) => c.name,
      amount: (c) => sortBig(c.amountPaise),
      count: (c) => Number(c.count),
    },
    { key: "amount", dir: "desc" },
  );

  const dailyRows = useMemo<any[]>(() => r?.byDate || [], [r]);
  const dailySort = useTableSort<any>(
    dailyRows,
    {
      date: (d) => d.date,
      sales: (d) => sortBig(d.salesPaise),
      credit: (d) => sortBig(d.creditIssuedPaise),
      collections: (d) => sortBig(d.collectionsPaise),
      expenses: (d) => sortBig(d.expensesPaise),
      shifts: (d) => Number(d.shifts),
    },
    { key: "date", dir: "asc" },
  );

  const nozzleRows = useMemo<any[]>(() => r?.byNozzle || [], [r]);
  const nozzleSort = useTableSort<any>(
    nozzleRows,
    {
      code: (n) => n.code,
      fuelType: (n) => FUEL_LABELS[n.fuelType] || n.fuelType,
      qty: (n) => sortBig(n.quantityMl),
      amount: (n) => sortBig(n.amountPaise),
    },
    { key: "amount", dir: "desc" },
  );

  const employeeRows = useMemo<any[]>(() => r?.byEmployee || [], [r]);
  const employeeSort = useTableSort<any>(
    employeeRows,
    {
      name: (e) => e.name,
      qty: (e) => sortBig(e.quantityMl),
      amount: (e) => sortBig(e.amountPaise),
    },
    { key: "amount", dir: "desc" },
  );

  const agingRows = useMemo<any[]>(() => agingData?.customers || [], [agingData]);
  const agingSort = useTableSort<any>(
    agingRows,
    {
      name: (c) => c.name,
      vehicle: (c) => c.vehicleNo,
      balance: (c) => sortBig(c.balancePaise),
      age: (c) => Number(c.ageDays),
      bucket: (c) => c.bucket,
    },
    { key: "balance", dir: "desc" },
  );

  const handleApply = () => setRange(draft);

  const handleQuick = (days: number) => {
    const next = { from: daysAgoStr(days - 1), to: todayStr() };
    setDraft(next);
    setRange(next);
  };

  const handleExport = async () => {
    try {
      await downloadFile(
        `/api/exports/range.xlsx?${rangeQs}`,
        `fuelbook-${range.from}-to-${range.to}.xlsx`,
      );
    } catch (e: any) {
      toast.error(e?.message || t("reports.exportFailed", "Export failed"));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("reports.title", "Reports")}</h1>
          <p className="text-muted-foreground">
            {t("reports.subtitle", "Sales, collections, expenses and credit aging across a date range.")}
          </p>
        </div>
        <Button onClick={handleExport} disabled={!r}>
          <FileSpreadsheet className="h-4 w-4 mr-2" /> {t("common.export", "Export Excel")}
        </Button>
      </div>

      {/* ---------------- Filter bar ---------------- */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs">{t("common.from", "From")}</Label>
              <Input
                type="date"
                value={draft.from}
                max={draft.to}
                onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
                className="w-40"
              />
            </div>
            <div>
              <Label className="text-xs">{t("common.to", "To")}</Label>
              <Input
                type="date"
                value={draft.to}
                min={draft.from}
                max={todayStr()}
                onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
                className="w-40"
              />
            </div>
            <Button onClick={handleApply}>{t("common.apply", "Apply")}</Button>
            <div className="flex gap-1 sm:ml-auto">
              <Button size="sm" variant="outline" onClick={() => handleQuick(7)}>
                {t("reports.quick7", "7d")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleQuick(30)}>
                {t("reports.quick30", "30d")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleQuick(90)}>
                {t("reports.quick90", "90d")}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <FilterSelect
              label={t("reports.shiftType", "Shift type")}
              value={filters.shiftType}
              onChange={(v) => set("shiftType", v)}
              allLabel={t("reports.allShifts", "All shifts")}
              options={[
                { value: "DAY", label: t("reports.day", "Day") },
                { value: "NIGHT", label: t("reports.night", "Night") },
              ]}
            />
            <FilterSelect
              label={t("common.status", "Status")}
              value={filters.status}
              onChange={(v) => set("status", v)}
              allLabel={t("reports.allStatuses", "All statuses")}
              options={[
                { value: "DRAFT", label: t("reports.draft", "Draft") },
                { value: "SUBMITTED", label: t("reports.submitted", "Submitted") },
                { value: "LOCKED", label: t("reports.locked", "Locked") },
              ]}
            />
            <FilterSelect
              label={t("reports.attendant", "Attendant")}
              value={filters.employeeId}
              onChange={(v) => set("employeeId", v)}
              allLabel={t("reports.allAttendants", "All attendants")}
              options={employees.map((e) => ({ value: e.id, label: e.name }))}
            />
            <FilterSelect
              label={t("reports.nozzle", "Nozzle")}
              value={filters.nozzleId}
              onChange={(v) => set("nozzleId", v)}
              allLabel={t("reports.allNozzles", "All nozzles")}
              options={nozzles.map((n) => ({
                value: n.id,
                label: `${n.code} · ${FUEL_LABELS[n.fuelType] || n.fuelType}`,
              }))}
            />
            <FilterSelect
              label={t("reports.paymentChannel", "Payment channel")}
              value={filters.channelId}
              onChange={(v) => set("channelId", v)}
              allLabel={t("reports.allChannels", "All channels")}
              options={channels.map((c) => ({ value: c.id, label: c.name }))}
            />
            <FilterSelect
              label={t("reports.expenseCategory", "Expense category")}
              value={filters.categoryId}
              onChange={(v) => set("categoryId", v)}
              allLabel={t("reports.allCategories", "All categories")}
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
            />
          </div>

          <div>
            <Label className="text-xs">{t("reports.fuelType", "Fuel type")}</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {FUELS.map((f) => {
                const on = filters.fuelType.includes(f);
                return (
                  <Button
                    key={f}
                    type="button"
                    size="sm"
                    variant={on ? "default" : "outline"}
                    onClick={() => toggleFuel(f)}
                  >
                    {FUEL_LABELS[f] || f}
                  </Button>
                );
              })}
            </div>
          </div>

          {filtersActive && (
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t">
              <span className="text-xs text-muted-foreground pt-2">{t("reports.activeFilters", "Active:")}</span>
              <div className="flex flex-wrap gap-2 pt-2">
                {chips.map((c) => (
                  <FilterChip key={c.key} label={c.label} onRemove={c.clear} />
                ))}
              </div>
              <Button size="sm" variant="ghost" className="mt-2" onClick={clearAll}>
                {t("common.clearAll", "Clear all")}
              </Button>
            </div>
          )}
          {filtersActive && r?.appliedFilters?.recomputedSalesFromReadings && (
            <p className="text-xs text-muted-foreground">
              {t(
                "reports.recomputedNote",
                "Sales figures recomputed from nozzle readings to match the active fuel / nozzle / attendant filters."
              )}
            </p>
          )}
        </CardContent>
      </Card>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <Kpi label={t("reports.kpiSales", "Total Sales")} value={formatINR(r?.totals?.salesPaise || 0)} />
        <Kpi
          label={t("reports.kpiCredit", "Credit Issued")}
          value={formatINR(r?.totals?.creditIssuedPaise || 0)}
          accent="amber"
        />
        <Kpi
          label={t("reports.kpiOutstandingRecv", "Outstanding Recv")}
          value={formatINR(r?.totals?.outstandingReceivedPaise || 0)}
          accent="green"
        />
        <Kpi
          label={t("reports.kpiCollections", "Collections")}
          value={formatINR(r?.totals?.collectionsPaise || 0)}
        />
        <Kpi
          label={t("reports.kpiExpenses", "Expenses")}
          value={formatINR(r?.totals?.expensesPaise || 0)}
          accent="red"
        />
        <Kpi
          label={t("reports.kpiNetCash", "Net Cash Flow")}
          value={formatINR(r?.totals?.netCashPaise || 0)}
          accent="primary"
        />
      </div>

      {/* Sales / Collections / Expenses trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("reports.dailyTrend", "Daily Trend")}</CardTitle>
          <CardDescription>
            {t("reports.dailyTrendDesc", "Sales, collections and expenses for each day in the range.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              {filtersActive ? t("common.noMatch", "No data matches these filters") : t("reports.noDataInRange", "No data in this range.")}
            </div>
          ) : (
            <div style={{ width: "100%", height: 320 }}>
              <ResponsiveContainer>
                <BarChart
                  data={chartData}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) =>
                      v >= 100000
                        ? `${(v / 100000).toFixed(1)}L`
                        : `${(v / 1000).toFixed(0)}k`
                    }
                  />
                  <Tooltip
                    formatter={(v) =>
                      "₹" +
                      Number(v).toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    }
                  />
                  <Legend />
                  <Bar dataKey="sales" fill="#0f172a" name={t("reports.legendSales", "Sales")} />
                  <Bar dataKey="collections" fill="#10b981" name={t("reports.legendCollections", "Collections")} />
                  <Bar dataKey="expenses" fill="#ef4444" name={t("reports.legendExpenses", "Expenses")} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Day-by-day table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("reports.dayByDay", "Day by Day")}</CardTitle>
          <CardDescription>
            {t("reports.dayByDayDesc", "Every day in the range — click any column heading to sort.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead {...dailySort.sortProps("date")}>{t("common.date", "Date")}</SortableHead>
                <SortableHead {...dailySort.sortProps("sales")} align="right">
                  {t("reports.colSales", "Sales")}
                </SortableHead>
                <SortableHead {...dailySort.sortProps("credit")} align="right">
                  {t("reports.colCredit", "Credit")}
                </SortableHead>
                <SortableHead {...dailySort.sortProps("collections")} align="right">
                  {t("reports.colCollections", "Collections")}
                </SortableHead>
                <SortableHead {...dailySort.sortProps("expenses")} align="right">
                  {t("reports.colExpenses", "Expenses")}
                </SortableHead>
                <SortableHead {...dailySort.sortProps("shifts")} align="right">
                  {t("reports.colShifts", "Shifts")}
                </SortableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dailySort.rows.length === 0 ? (
                <NoMatchRow
                  colSpan={6}
                  filtered={filtersActive}
                  onClear={clearAll}
                  emptyMessage={t("reports.noDataInRange", "No data in this range.")}
                />
              ) : (
                dailySort.rows.map((d: any) => (
                  <TableRow key={d.date}>
                    <TableCell className="font-medium">
                      {format(parseISO(d.date), "dd MMM yyyy", { locale: dateLocale })}
                    </TableCell>
                    <TableCell className="text-right">{formatINR(d.salesPaise)}</TableCell>
                    <TableCell className="text-right">
                      {formatINR(d.creditIssuedPaise)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatINR(d.collectionsPaise)}
                    </TableCell>
                    <TableCell className="text-right">{formatINR(d.expensesPaise)}</TableCell>
                    <TableCell className="text-right">{d.shifts}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Fuel mix */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("reports.fuelMix", "Fuel Mix")}</CardTitle>
            <CardDescription>{t("reports.fuelMixDesc", "By revenue across the range.")}</CardDescription>
          </CardHeader>
          <CardContent>
            {fuelMixData.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">
                {filtersActive ? t("common.noMatch", "No data matches these filters") : t("reports.noFuelSales", "No fuel sales.")}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div style={{ width: "100%", height: 220 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={fuelMixData}
                        dataKey="value"
                        innerRadius={45}
                        outerRadius={80}
                        paddingAngle={2}
                      >
                        {fuelMixData.map((_: unknown, i: number) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v) =>
                          "₹" +
                          Number(v).toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })
                        }
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2 text-sm self-center">
                  {fuelMixData.map((f, i) => (
                    <div
                      key={f.name}
                      className="flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="h-2.5 w-2.5 rounded-full inline-block"
                          style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                        />
                        <span className="truncate">{f.name}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">
                          ₹{f.value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {f.qty.toLocaleString("en-IN", { maximumFractionDigits: 1 })} L
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Channel mix */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("reports.collectionsByChannel", "Collections by Channel")}</CardTitle>
            <CardDescription>
              {t("reports.collectionsByChannelDesc", "How customers paid across the range.")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {channelData.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">
                {filtersActive ? t("common.noMatch", "No data matches these filters") : t("reports.noCollections", "No collections.")}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div style={{ width: "100%", height: 220 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={channelData}
                        dataKey="value"
                        innerRadius={45}
                        outerRadius={80}
                        paddingAngle={2}
                      >
                        {channelData.map((_: unknown, i: number) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v) =>
                          "₹" +
                          Number(v).toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })
                        }
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2 text-sm self-center">
                  {channelData.map((c, i) => (
                    <div
                      key={c.name}
                      className="flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="h-2.5 w-2.5 rounded-full inline-block"
                          style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                        />
                        <span className="truncate">{c.name}</span>
                      </div>
                      <div className="font-medium">
                        ₹{c.value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Shift-type split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("reports.salesByShiftType", "Sales by Shift Type")}</CardTitle>
            <CardDescription>{t("reports.salesByShiftTypeDesc", "Day vs night across the range.")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("reports.colShift", "Shift")}</TableHead>
                  <TableHead className="text-right">{t("reports.colShifts", "Shifts")}</TableHead>
                  <TableHead className="text-right">{t("common.litres", "Litres")}</TableHead>
                  <TableHead className="text-right">{t("reports.colSales", "Sales")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(r?.byShiftType || []).length === 0 ? (
                  <NoMatchRow
                    colSpan={4}
                    filtered={filtersActive}
                    onClear={clearAll}
                    emptyMessage={t("reports.noShiftsInRange", "No shifts in this range.")}
                  />
                ) : (
                  (r?.byShiftType || []).map((s: any) => (
                    <TableRow key={s.shiftType}>
                      <TableCell>
                        <Badge variant={s.shiftType === "DAY" ? "default" : "secondary"}>
                          {shiftLabel(s.shiftType)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{s.shifts}</TableCell>
                      <TableCell className="text-right">
                        {formatLitres(s.quantityMl)} L
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatINR(s.amountPaise)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Sales by nozzle */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("reports.salesByNozzle", "Sales by Nozzle")}</CardTitle>
            <CardDescription>{t("reports.salesByNozzleDesc", "Meter-derived volume and revenue.")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead {...nozzleSort.sortProps("code")}>{t("reports.nozzle", "Nozzle")}</SortableHead>
                  <SortableHead {...nozzleSort.sortProps("fuelType")}>{t("reports.colFuel", "Fuel")}</SortableHead>
                  <SortableHead {...nozzleSort.sortProps("qty")} align="right">
                    {t("common.litres", "Litres")}
                  </SortableHead>
                  <SortableHead {...nozzleSort.sortProps("amount")} align="right">
                    {t("reports.colSales", "Sales")}
                  </SortableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {nozzleSort.rows.length === 0 ? (
                  <NoMatchRow
                    colSpan={4}
                    filtered={filtersActive}
                    onClear={clearAll}
                    emptyMessage={t("reports.noNozzleReadings", "No nozzle readings in this range.")}
                  />
                ) : (
                  nozzleSort.rows.map((n: any) => (
                    <TableRow key={n.nozzleId}>
                      <TableCell className="font-medium">{n.code}</TableCell>
                      <TableCell>{FUEL_LABELS[n.fuelType] || n.fuelType}</TableCell>
                      <TableCell className="text-right">
                        {formatLitres(n.quantityMl)} L
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatINR(n.amountPaise)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Sales by attendant */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("reports.salesByAttendant", "Sales by Attendant")}</CardTitle>
          <CardDescription>
            {t(
              "reports.salesByAttendantDesc",
              "Attributed from the nozzles each attendant was assigned to; split evenly when a nozzle was shared."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead {...employeeSort.sortProps("name")}>{t("reports.attendant", "Attendant")}</SortableHead>
                <SortableHead {...employeeSort.sortProps("qty")} align="right">
                  {t("common.litres", "Litres")}
                </SortableHead>
                <SortableHead {...employeeSort.sortProps("amount")} align="right">
                  {t("reports.colSales", "Sales")}
                </SortableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employeeSort.rows.length === 0 ? (
                <NoMatchRow
                  colSpan={3}
                  filtered={filtersActive}
                  onClear={clearAll}
                  emptyMessage={t("reports.noAttendantRows", "No attendant assignments in this range.")}
                />
              ) : (
                employeeSort.rows.map((e: any) => (
                  <TableRow key={e.employeeId}>
                    <TableCell className="font-medium">{e.name}</TableCell>
                    <TableCell className="text-right">
                      {formatLitres(e.quantityMl)} L
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatINR(e.amountPaise)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Expense breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("reports.expensesByCategory", "Expenses by Category")}</CardTitle>
          <CardDescription>
            {t("reports.expensesByCategoryDesc", "Across the selected range — {total} total.", { total: formatINR(exp?.totalPaise || 0) })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead {...expenseSort.sortProps("name")}>{t("reports.colCategory", "Category")}</SortableHead>
                <SortableHead {...expenseSort.sortProps("amount")} align="right">
                  {t("common.amount", "Amount")}
                </SortableHead>
                <SortableHead {...expenseSort.sortProps("count")} align="right">
                  {t("reports.colEntries", "Entries")}
                </SortableHead>
                <TableHead className="w-1/3">{t("reports.colPercentOfTotal", "% of total")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenseSort.rows.length === 0 ? (
                <NoMatchRow
                  colSpan={4}
                  filtered={filtersActive}
                  onClear={clearAll}
                  emptyMessage={t("reports.noExpensesInRange", "No expenses in this range.")}
                />
              ) : (
                expenseSort.rows.map((c: any) => {
                  const pct =
                    exp?.totalPaise && Number(exp.totalPaise) > 0
                      ? (Number(c.amountPaise) / Number(exp.totalPaise)) * 100
                      : 0;
                  return (
                    <TableRow key={c.categoryId}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-right">
                        {formatINR(c.amountPaise)}
                      </TableCell>
                      <TableCell className="text-right">{c.count}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-2 bg-slate-100 rounded flex-1 overflow-hidden">
                            <div
                              className="h-full bg-slate-900"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-10 text-right">
                            {pct.toFixed(0)}%
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Customer aging */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("reports.aging", "Customer Outstanding — Aging")}</CardTitle>
          <CardDescription>
            {t("reports.agingDesc", "Buckets based on FIFO of credit sales vs payments received.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <BucketCard
              label={t("reports.bucket0_30", "0–30 days")}
              amount={agingData?.buckets?.d0_30}
              tone="green"
            />
            <BucketCard
              label={t("reports.bucket31_60", "31–60 days")}
              amount={agingData?.buckets?.d31_60}
              tone="yellow"
            />
            <BucketCard
              label={t("reports.bucket61_90", "61–90 days")}
              amount={agingData?.buckets?.d61_90}
              tone="orange"
            />
            <BucketCard
              label={t("reports.bucket90plus", "90+ days")}
              amount={agingData?.buckets?.d90_plus}
              tone="red"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1">
              <Label className="text-xs">{t("reports.customerOrVehicle", "Customer / vehicle")}</Label>
              <Input
                placeholder={t("reports.customerSearchPlaceholder", "Name, code or vehicle no")}
                value={aging.q}
                onChange={(e) => setAging((a) => ({ ...a, q: e.target.value }))}
              />
            </div>
            <FilterSelect
              label={t("reports.bucket", "Bucket")}
              value={aging.bucket}
              onChange={(v) => setAging((a) => ({ ...a, bucket: v }))}
              allLabel={t("reports.allBuckets", "All buckets")}
              options={Object.keys(BUCKET_KEYS).map((value) => ({
                value,
                label: bucketLabel(value),
              }))}
            />
            <div>
              <Label className="text-xs">{t("reports.minBalance", "Min balance (₹)")}</Label>
              <Input
                type="number"
                min="0"
                step="1"
                placeholder="0"
                value={aging.minBalance}
                onChange={(e) => setAging((a) => ({ ...a, minBalance: e.target.value }))}
              />
            </div>
          </div>

          {agingFiltersActive && (
            <div className="flex flex-wrap items-center gap-2">
              {aging.q.trim() !== "" && (
                <FilterChip
                  label={t("reports.chipSearch", "Search: {value}", { value: aging.q.trim() })}
                  onRemove={() => setAging((a) => ({ ...a, q: "" }))}
                />
              )}
              {aging.bucket !== ALL && (
                <FilterChip
                  label={t("reports.chipBucket", "Bucket: {value}", { value: bucketLabel(aging.bucket) })}
                  onRemove={() => setAging((a) => ({ ...a, bucket: ALL }))}
                />
              )}
              {aging.minBalance.trim() !== "" && (
                <FilterChip
                  label={t("reports.chipMin", "Min ₹{value}", { value: aging.minBalance })}
                  onRemove={() => setAging((a) => ({ ...a, minBalance: "" }))}
                />
              )}
              <Button size="sm" variant="ghost" onClick={clearAging}>
                {t("common.clearAll", "Clear all")}
              </Button>
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead {...agingSort.sortProps("name")}>{t("reports.colCustomer", "Customer")}</SortableHead>
                <SortableHead {...agingSort.sortProps("vehicle")}>{t("reports.colVehicle", "Vehicle")}</SortableHead>
                <SortableHead {...agingSort.sortProps("balance")} align="right">
                  {t("reports.colBalance", "Balance")}
                </SortableHead>
                <SortableHead {...agingSort.sortProps("age")} align="right">
                  {t("reports.colOldestAge", "Oldest age")}
                </SortableHead>
                <SortableHead {...agingSort.sortProps("bucket")}>{t("reports.colBucket", "Bucket")}</SortableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agingSort.rows.length === 0 ? (
                <NoMatchRow
                  colSpan={5}
                  filtered={agingFiltersActive}
                  onClear={clearAging}
                  emptyMessage={t("reports.noOutstanding", "No outstanding balances.")}
                />
              ) : (
                agingSort.rows.map((c: any) => (
                  <TableRow key={c.customerId}>
                    <TableCell className="font-medium">
                      {c.name}
                      {c.code && (
                        <div className="text-xs text-muted-foreground font-mono">{c.code}</div>
                      )}
                    </TableCell>
                    <TableCell className="uppercase">
                      {c.vehicleNo || "-"}
                      {Number(c.vehicleCount || 0) > 1 && (
                        <span className="text-muted-foreground">
                          {" "}
                          +{Number(c.vehicleCount) - 1}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatINR(c.balancePaise)}
                    </TableCell>
                    <TableCell className="text-right">
                      {c.ageDays === 1
                        ? t("reports.day_one", "{count} day", { count: c.ageDays })
                        : t("reports.day_other", "{count} days", { count: c.ageDays })}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          c.bucket === "d0_30"
                            ? "success"
                            : c.bucket === "d31_60"
                              ? "secondary"
                              : c.bucket === "d61_90"
                                ? "warning"
                                : "destructive"
                        }
                      >
                        {c.bucket === "d0_30"
                          ? "0–30"
                          : c.bucket === "d31_60"
                            ? "31–60"
                            : c.bucket === "d61_90"
                              ? "61–90"
                              : "90+"}
                      </Badge>
                    </TableCell>
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

function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel = "All",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  allLabel?: string;
}) {
  return (
    <div className="min-w-0">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-10 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Kpi({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "green" | "amber" | "red" | "primary";
}) {
  const cls =
    accent === "green"
      ? "text-green-700"
      : accent === "amber"
        ? "text-amber-700"
        : accent === "red"
          ? "text-red-700"
          : accent === "primary"
            ? "text-primary"
            : "";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-lg font-semibold mt-1 ${cls}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function BucketCard({
  label,
  amount,
  tone,
}: {
  label: string;
  amount: string | number | undefined;
  tone: "green" | "yellow" | "orange" | "red";
}) {
  const bg =
    tone === "green"
      ? "bg-green-50 border-green-200"
      : tone === "yellow"
        ? "bg-yellow-50 border-yellow-200"
        : tone === "orange"
          ? "bg-orange-50 border-orange-200"
          : "bg-red-50 border-red-200";
  return (
    <div className={`rounded-md border p-3 ${bg}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold mt-0.5">
        {formatINR(amount || 0)}
      </div>
    </div>
  );
}

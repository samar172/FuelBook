"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, downloadFile } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatINR, formatLitres, FUEL_LABELS } from "@/lib/utils";
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
import { Download, FileSpreadsheet } from "lucide-react";
import { format, parseISO, subDays } from "date-fns";
import { toast } from "sonner";

type Range = { from: string; to: string };

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
  const [range, setRange] = useState<Range>({
    from: daysAgoStr(29),
    to: todayStr(),
  });
  const [draft, setDraft] = useState<Range>(range);

  const qs = `from=${range.from}&to=${range.to}`;

  const rangeQ = useQuery({
    queryKey: ["report-range", range],
    queryFn: async () => (await api.get(`/api/dashboard/range?${qs}`)).data,
  });
  const expenseQ = useQuery({
    queryKey: ["report-expense", range],
    queryFn: async () =>
      (await api.get(`/api/dashboard/expense-breakdown?${qs}`)).data,
  });
  const agingQ = useQuery({
    queryKey: ["report-aging"],
    queryFn: async () => (await api.get(`/api/dashboard/customer-aging`)).data,
  });

  const r = rangeQ.data;
  const exp = expenseQ.data;
  const aging = agingQ.data;

  const chartData = useMemo(() => {
    if (!r) return [];
    return r.byDate.map((d: any) => ({
      date: format(parseISO(d.date), "dd MMM"),
      sales: Number(d.salesPaise) / 100,
      collections: Number(d.collectionsPaise) / 100,
      expenses: Number(d.expensesPaise) / 100,
    }));
  }, [r]);

  const fuelMixData = useMemo(() => {
    if (!r) return [];
    return Object.entries(r.fuelMix as Record<string, any>)
      .filter(([, v]: any) => Number(v.amtPaise) > 0)
      .map(([k, v]: any) => ({
        name: FUEL_LABELS[k] || k,
        value: Number(v.amtPaise) / 100,
        qty: Number(v.qtyMl) / 1000,
      }));
  }, [r]);

  const channelData = useMemo(() => {
    if (!r) return [];
    return r.collectionsByChannel.map((c: any) => ({
      name: c.name,
      value: Number(c.amountPaise) / 100,
    }));
  }, [r]);

  const handleApply = () => setRange(draft);

  const handleQuick = (days: number) => {
    const next = { from: daysAgoStr(days - 1), to: todayStr() };
    setDraft(next);
    setRange(next);
  };

  const handleExport = async () => {
    try {
      await downloadFile(
        `/api/exports/range.xlsx?${qs}`,
        `fuelbook-${range.from}-to-${range.to}.xlsx`,
      );
    } catch (e: any) {
      toast.error(e?.message || "Export failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
          <p className="text-muted-foreground">
            Sales, collections, expenses and credit aging across a date range.
          </p>
        </div>
        <Button onClick={handleExport} disabled={!r}>
          <FileSpreadsheet className="h-4 w-4 mr-2" /> Export Excel
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">From</Label>
            <Input
              type="date"
              value={draft.from}
              max={draft.to}
              onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
              className="w-40"
            />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input
              type="date"
              value={draft.to}
              min={draft.from}
              max={todayStr()}
              onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
              className="w-40"
            />
          </div>
          <Button onClick={handleApply}>Apply</Button>
          <div className="flex gap-1 ml-auto">
            <Button size="sm" variant="outline" onClick={() => handleQuick(7)}>
              7d
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleQuick(30)}>
              30d
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleQuick(90)}>
              90d
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <Kpi label="Total Sales" value={formatINR(r?.totals?.salesPaise || 0)} />
        <Kpi
          label="Credit Issued"
          value={formatINR(r?.totals?.creditIssuedPaise || 0)}
          accent="amber"
        />
        <Kpi
          label="Outstanding Recv"
          value={formatINR(r?.totals?.outstandingReceivedPaise || 0)}
          accent="green"
        />
        <Kpi
          label="Collections"
          value={formatINR(r?.totals?.collectionsPaise || 0)}
        />
        <Kpi
          label="Expenses"
          value={formatINR(r?.totals?.expensesPaise || 0)}
          accent="red"
        />
        <Kpi
          label="Net Cash Flow"
          value={formatINR(r?.totals?.netCashPaise || 0)}
          accent="primary"
        />
      </div>

      {/* Sales / Collections / Expenses trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily Trend</CardTitle>
          <CardDescription>
            Sales, collections and expenses for each day in the range.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              No data in this range.
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
                    formatter={(v: number) =>
                      "₹" +
                      v.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    }
                  />
                  <Legend />
                  <Bar dataKey="sales" fill="#0f172a" name="Sales" />
                  <Bar dataKey="collections" fill="#10b981" name="Collections" />
                  <Bar dataKey="expenses" fill="#ef4444" name="Expenses" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Fuel mix */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fuel Mix</CardTitle>
            <CardDescription>By revenue across the range.</CardDescription>
          </CardHeader>
          <CardContent>
            {fuelMixData.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">
                No fuel sales.
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
                        {fuelMixData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v: number) =>
                          "₹" +
                          v.toLocaleString("en-IN", {
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
            <CardTitle className="text-base">Collections by Channel</CardTitle>
            <CardDescription>
              How customers paid across the range.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {channelData.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">
                No collections.
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
                        {channelData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v: number) =>
                          "₹" +
                          v.toLocaleString("en-IN", {
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

      {/* Expense breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Expenses by Category</CardTitle>
          <CardDescription>
            Across the selected range — {formatINR(exp?.totalPaise || 0)} total.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Entries</TableHead>
                <TableHead className="w-1/3">% of total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(exp?.byCategory || []).filter((c: any) => Number(c.amountPaise) > 0).length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No expenses in this range.
                  </TableCell>
                </TableRow>
              )}
              {(exp?.byCategory || [])
                .filter((c: any) => Number(c.amountPaise) > 0)
                .map((c: any) => {
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
                })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Customer aging */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Customer Outstanding — Aging</CardTitle>
          <CardDescription>
            Buckets based on FIFO of credit sales vs payments received.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <BucketCard
              label="0–30 days"
              amount={aging?.buckets?.d0_30}
              tone="green"
            />
            <BucketCard
              label="31–60 days"
              amount={aging?.buckets?.d31_60}
              tone="yellow"
            />
            <BucketCard
              label="61–90 days"
              amount={aging?.buckets?.d61_90}
              tone="orange"
            />
            <BucketCard
              label="90+ days"
              amount={aging?.buckets?.d90_plus}
              tone="red"
            />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="text-right">Oldest age</TableHead>
                <TableHead>Bucket</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(aging?.customers || []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No outstanding balances.
                  </TableCell>
                </TableRow>
              )}
              {(aging?.customers || []).map((c: any) => (
                <TableRow key={c.customerId}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{c.vehicleNo || "-"}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatINR(c.balancePaise)}
                  </TableCell>
                  <TableCell className="text-right">
                    {c.ageDays} {c.ageDays === 1 ? "day" : "days"}
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
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
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

"use client";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatINR, formatLitres, FUEL_LABELS } from "@/lib/utils";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Wallet,
  TrendingUp,
  AlertTriangle,
  CircleDollarSign,
  Receipt,
  Banknote,
  Users,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { format, parseISO } from "date-fns";

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-today"],
    queryFn: async () => (await api.get("/api/dashboard/today")).data,
  });
  const trendQ = useQuery({
    queryKey: ["dashboard-trend-7"],
    queryFn: async () => (await api.get("/api/dashboard/sales-trend?days=7")).data,
  });
  const topCustomersQ = useQuery({
    queryKey: ["dashboard-top-customers"],
    queryFn: async () =>
      (await api.get("/api/dashboard/top-credit-customers?limit=5")).data,
  });

  const trendData = useMemo(() => {
    const raw = trendQ.data || {};
    return Object.entries(raw)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, v]: any) => ({
        date: format(parseISO(date), "EEE"),
        sales: Number(v.sales) / 100,
      }));
  }, [trendQ.data]);

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (!data) return null;

  const cf = data.cashFlow;
  const diff = Number(cf.difference);
  const isMatched = Math.abs(diff) < 100; // < ₹1

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Today — {data.date}</h1>
          <p className="text-muted-foreground text-sm sm:text-base">{data.shiftsCount} shift(s) running for today</p>
        </div>
        <Link href="/shifts/new">
          <button className="bg-primary text-primary-foreground rounded-md px-3 sm:px-4 py-2 text-sm font-medium hover:bg-primary/90">
            + New Shift
          </button>
        </Link>
      </div>

      {/* Money Flow Reconciliation */}
      <Card className={isMatched ? "border-green-200" : "border-amber-300"}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CircleDollarSign className="h-5 w-5" />
            Money Flow Reconciliation
            {isMatched ? (
              <Badge variant="success">Matched</Badge>
            ) : (
              <Badge variant="warning">{diff > 0 ? "Excess" : "Short"} {formatINR(Math.abs(diff))}</Badge>
            )}
          </CardTitle>
          <CardDescription>
            Where every rupee of today's sales went — cash, digital, credit, expenses.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Money IN */}
          <div className="space-y-2">
            <div className="text-xs uppercase font-semibold text-muted-foreground tracking-wider">
              Money In
            </div>
            <Row icon={<TrendingUp className="h-4 w-4 text-green-600" />} label="Total Sales" value={formatINR(cf.totalSalesPaise)} />
            <Row icon={<ArrowDownCircle className="h-4 w-4 text-red-500" />} label="Less: Credit Issued (not collected)" value={`- ${formatINR(cf.totalCreditIssuedPaise)}`} />
            <Row icon={<ArrowUpCircle className="h-4 w-4 text-green-600" />} label="Outstanding Received (past credit)" value={`+ ${formatINR(cf.totalOutstandingReceivedPaise)}`} />
            <div className="border-t pt-2 mt-2">
              <Row label="Expected Collections" value={formatINR(cf.moneyInExpected)} bold />
              <Row label="Actual Collections (cash + digital + bank)" value={formatINR(cf.moneyInCollected)} bold />
              <Row
                label="Difference"
                value={(diff >= 0 ? "+" : "") + formatINR(Math.abs(diff))}
                bold
                accent={isMatched ? "success" : "warning"}
              />
            </div>
          </div>

          {/* Cash position */}
          <div className="space-y-2">
            <div className="text-xs uppercase font-semibold text-muted-foreground tracking-wider">
              Cash Position
            </div>
            <Row icon={<Wallet className="h-4 w-4" />} label="Opening Cash" value={formatINR(cf.openingCashPaise)} />
            <Row icon={<TrendingUp className="h-4 w-4 text-green-600" />} label="+ Cash Sales (sales − credit)" value={formatINR(BigInt(cf.totalSalesPaise) - BigInt(cf.totalCreditIssuedPaise))} />
            <Row icon={<ArrowUpCircle className="h-4 w-4 text-green-600" />} label="+ Outstanding Received" value={formatINR(cf.totalOutstandingReceivedPaise)} />
            <Row icon={<Receipt className="h-4 w-4 text-red-500" />} label="− Total Expenses" value={`- ${formatINR(cf.totalExpensesPaise)}`} />
            <div className="border-t pt-2 mt-2">
              <Row label="Closing Cash" value={formatINR(cf.closingCashPaise)} bold accent="primary" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Fuel sales by type */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Fuel Sales — Today</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(data.fuelSales as Record<string, { qtyMl: string; amtPaise: string }>).map(([k, v]) => (
            <Card key={k}>
              <CardHeader className="pb-2">
                <CardDescription className="text-xs">{FUEL_LABELS[k] || k}</CardDescription>
                <CardTitle className="text-xl">{formatLitres(v.qtyMl)} L</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground">{formatINR(v.amtPaise)}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Collections + Stock */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Banknote className="h-4 w-4" /> Collections by Channel
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data.collectionsByChannel || []).length === 0 && (
              <div className="text-sm text-muted-foreground">No collections yet.</div>
            )}
            {(data.collectionsByChannel || []).map((c: any) => (
              <Row key={c.name} label={c.name} value={formatINR(c.amount)} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stock Levels</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.stock.map((t: any) => {
              const pct = (Number(t.currentMl) / Number(t.capacityMl)) * 100;
              return (
                <div key={t.tankId}>
                  <div className="flex justify-between text-sm">
                    <div className="font-medium">{t.name}</div>
                    <div className="text-muted-foreground">
                      {formatLitres(t.currentMl)} / {formatLitres(t.capacityMl)} L
                    </div>
                  </div>
                  <div className="h-2 bg-slate-100 rounded mt-1 overflow-hidden">
                    <div
                      className={
                        pct < 10 ? "h-full bg-red-500" : pct < 20 ? "h-full bg-amber-500" : "h-full bg-green-500"
                      }
                      style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* 7-day trend + top credit customers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4" /> Sales — Last 7 Days
              </CardTitle>
              <CardDescription>Daily totals across all shifts.</CardDescription>
            </div>
            <Link
              href="/reports"
              className="text-sm text-primary inline-flex items-center gap-1 hover:underline"
            >
              Full reports <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent>
            {trendData.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">
                Trend will appear after a few shifts are submitted.
              </div>
            ) : (
              <div style={{ width: "100%", height: 220 }}>
                <ResponsiveContainer>
                  <AreaChart
                    data={trendData}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="salesArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0f172a" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#0f172a" stopOpacity={0} />
                      </linearGradient>
                    </defs>
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
                    <Area
                      type="monotone"
                      dataKey="sales"
                      stroke="#0f172a"
                      strokeWidth={2}
                      fill="url(#salesArea)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" /> Top Credit Customers
            </CardTitle>
            <CardDescription>By current outstanding.</CardDescription>
          </CardHeader>
          <CardContent>
            {(topCustomersQ.data || []).length === 0 ? (
              <div className="text-sm text-muted-foreground py-4">
                No outstanding balances.
              </div>
            ) : (
              <div className="space-y-2">
                {(topCustomersQ.data || []).map((c: any) => {
                  const used =
                    Number(c.creditLimitPaise) > 0
                      ? Math.min(
                          100,
                          (Number(c.currentBalancePaise) /
                            Number(c.creditLimitPaise)) *
                            100,
                        )
                      : 0;
                  return (
                    <Link
                      key={c.id}
                      href={`/credit/${c.id}`}
                      className="block border rounded-md p-2.5 hover:bg-slate-50"
                    >
                      <div className="flex justify-between text-sm">
                        <div className="font-medium truncate">{c.name}</div>
                        <div className="text-amber-700 font-semibold">
                          {formatINR(c.currentBalancePaise)}
                        </div>
                      </div>
                      {c.vehicleNo && (
                        <div className="text-xs text-muted-foreground">
                          {c.vehicleNo}
                        </div>
                      )}
                      {Number(c.creditLimitPaise) > 0 && (
                        <div className="h-1 bg-slate-100 rounded mt-1.5 overflow-hidden">
                          <div
                            className={
                              used >= 90
                                ? "h-full bg-red-500"
                                : used >= 70
                                  ? "h-full bg-amber-500"
                                  : "h-full bg-green-500"
                            }
                            style={{ width: `${used}%` }}
                          />
                        </div>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Outstanding Across All Customers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{formatINR(data.totalCustomerOutstandingPaise)}</div>
          <div className="text-sm text-muted-foreground">
            Total amount owed to the pump by credit customers (running balance).
          </div>
        </CardContent>
      </Card>

      {/* Today's shifts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Today's Shifts</CardTitle>
        </CardHeader>
        <CardContent>
          {data.shifts.length === 0 ? (
            <div className="text-sm text-muted-foreground">No shifts created yet for today.</div>
          ) : (
            <div className="space-y-2">
              {data.shifts.map((s: any) => (
                <Link
                  key={s.id}
                  href={`/shifts/${s.id}`}
                  className="flex items-center justify-between border rounded-md p-3 hover:bg-slate-50"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant={s.shiftType === "DAY" ? "default" : "secondary"}>
                      {s.shiftType}
                    </Badge>
                    <div className="text-sm font-medium">Sales {formatINR(s.totalSalesPaise)}</div>
                    <div className="text-sm text-muted-foreground">
                      Closing cash {formatINR(s.closingCashPaise)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.discrepancyFlag && (
                      <Badge variant="warning" className="gap-1">
                        <AlertTriangle className="h-3 w-3" /> Discrepancy
                      </Badge>
                    )}
                    <Badge variant="outline">{s.status}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
  bold,
  accent,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  bold?: boolean;
  accent?: "success" | "warning" | "primary";
}) {
  const accentCls =
    accent === "success"
      ? "text-green-700"
      : accent === "warning"
      ? "text-amber-700"
      : accent === "primary"
      ? "text-primary"
      : "";
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <div className="flex items-center gap-2">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`${bold ? "font-semibold" : ""} ${accentCls}`}>{value}</div>
    </div>
  );
}

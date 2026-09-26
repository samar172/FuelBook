"use client";
// Daily price revision & stock revaluation.
//
// When the oil company moves the pump rate, the litres already in the tanks are
// suddenly worth more or less than they cost. That is a revaluation of stock —
// NOT cash — and this page is where the dealer records it and watches the margin
// between the selling rate and the weighted-average cost per litre.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { formatINR, formatLitres, FUEL_LABELS, rupeesToPaise } from "@/lib/utils";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { format, subDays } from "date-fns";
import { toast } from "sonner";

const onError = (e: any) =>
  toast.error(e?.response?.data?.error || e?.message || "Failed");

const FUELS = ["HSD", "MS", "MS_POWER", "CNG"] as const;
const ALL = "__all__";

// Same palette family as the reports page charts.
const FUEL_COLORS: Record<string, string> = {
  HSD: "#0f172a",
  MS: "#3b82f6",
  MS_POWER: "#8b5cf6",
  CNG: "#10b981",
};

const todayStr = () => format(new Date(), "yyyy-MM-dd");
const daysAgoStr = (n: number) => format(subDays(new Date(), n), "yyyy-MM-dd");

// datetime-local inputs carry no timezone; convert both ways.
const fromDatetimeLocal = (v: string) => new Date(v).toISOString();

// ---- money / volume helpers ------------------------------------------------
// The API sends paise and millilitres as strings. All arithmetic here is BigInt:
// a rate is paise per LITRE, so a value in paise is ml * rate / 1000n, and the
// division by 1000n comes LAST. BigInt division truncates toward zero.
const big = (v: string | number | null | undefined): bigint => {
  if (v === null || v === undefined || v === "") return 0n;
  try {
    return BigInt(v);
  } catch {
    return 0n;
  }
};
const absBig = (v: bigint) => (v < 0n ? -v : v);

const revalue = (stockMl: bigint, oldPaise: bigint, newPaise: bigint): bigint =>
  (stockMl * (newPaise - oldPaise)) / 1000n;

/** "+₹7,182.50" / "−₹1,204.00" — signed so a loss reads as a loss. */
const signedINR = (paise: bigint | string | null | undefined): string => {
  if (paise === null || paise === undefined) return "—";
  const v = typeof paise === "bigint" ? paise : big(paise);
  if (v === 0n) return formatINR(0);
  return (v < 0n ? "−" : "+") + formatINR(absBig(v).toString());
};

const signClass = (v: bigint | null) =>
  v === null ? "" : v > 0n ? "text-green-700" : v < 0n ? "text-red-700" : "";

// ---- API shapes ------------------------------------------------------------
type FuelRow = {
  fuelType: string;
  currentRatePaise: string | null;
  effectiveFrom: string | null;
  stockMl: string;
  stockValuePaise: string;
  avgCostPaisePerLitre: string | null;
  marginPaisePerLitre: string | null;
  stockAtRatePaise: string | null;
  tankCount: number;
  estimatedStockTankCount: number;
  costBasisComplete: boolean;
};
type RatesResp = { fuels: FuelRow[]; asOf: string };

type Revision = {
  id: string;
  fuelType: string;
  oldRatePaise: string;
  newRatePaise: string;
  deltaPaisePerLitre: string;
  effectiveAt: string;
  stockAtRevisionMl: string;
  stockGainLossPaise: string;
};
type RevisionsResp = {
  revisions: Revision[];
  totals: { count: number; netGainLossPaise: string; gainPaise: string; lossPaise: string };
};

type SummaryFuel = {
  fuelType: string;
  revisionCount: number;
  increases: number;
  decreases: number;
  netGainLossPaise: string;
  openingRatePaise: string | null;
  closingRatePaise: string | null;
  highRatePaise: string | null;
  lowRatePaise: string | null;
};
type SummaryResp = {
  fuels: SummaryFuel[];
  totals: { revisionCount: number; netGainLossPaise: string };
};

type TrendDay = {
  date: string;
  fuels: {
    fuelType: string;
    ratePaise: string | null;
    avgCostPaisePerLitre: string | null;
    marginPaisePerLitre: string | null;
    soldMl: string;
  }[];
};
type TrendResp = { days: TrendDay[]; costBasis: string };

export default function PricingPage() {
  const qc = useQueryClient();
  const [range, setRange] = useState({ from: daysAgoStr(29), to: todayStr() });
  const [historyFuel, setHistoryFuel] = useState<string>(ALL);
  const [formOpen, setFormOpen] = useState(false);
  const [formFuel, setFormFuel] = useState<string>("HSD");

  const rangeQs = `from=${range.from}&to=${range.to}`;

  const ratesQ = useQuery<RatesResp>({
    queryKey: ["pricing-rates"],
    queryFn: async () => (await api.get("/api/pricing/rates")).data,
  });

  const revisionsQ = useQuery<RevisionsResp>({
    queryKey: ["pricing-revisions", rangeQs, historyFuel],
    queryFn: async () =>
      (
        await api.get(
          `/api/pricing/revisions?${rangeQs}${
            historyFuel === ALL ? "" : `&fuelType=${historyFuel}`
          }`,
        )
      ).data,
  });

  const summaryQ = useQuery<SummaryResp>({
    queryKey: ["pricing-revaluation-summary", rangeQs],
    queryFn: async () =>
      (await api.get(`/api/pricing/revaluation-summary?${rangeQs}`)).data,
  });

  const trendQ = useQuery<TrendResp>({
    queryKey: ["pricing-margin-trend", rangeQs],
    queryFn: async () => (await api.get(`/api/pricing/margin-trend?${rangeQs}`)).data,
  });

  const fuels = ratesQ.data?.fuels || [];
  const fuelRow = (f: string) => fuels.find((x) => x.fuelType === f);

  const openForm = (fuel: string) => {
    setFormFuel(fuel);
    setFormOpen(true);
  };

  // Margin per litre in RUPEES for the chart (paise/L ÷ 100). Display only.
  const chartData = useMemo(() => {
    const days = trendQ.data?.days || [];
    return days.map((d) => {
      const row: Record<string, any> = {
        date: d.date.slice(5),
        // Litres sold that day, all fuels — shown as the tooltip's footer context.
        litres: d.fuels.reduce((sum, f) => sum + Number(f.soldMl) / 1000, 0),
      };
      for (const f of d.fuels) {
        row[f.fuelType] =
          f.marginPaisePerLitre === null ? null : Number(f.marginPaisePerLitre) / 100;
      }
      return row;
    });
  }, [trendQ.data]);

  // Only chart fuels that actually have a margin somewhere in the range.
  const chartFuels = useMemo(
    () =>
      FUELS.filter((f) =>
        (trendQ.data?.days || []).some((d) =>
          d.fuels.some((x) => x.fuelType === f && x.marginPaisePerLitre !== null),
        ),
      ),
    [trendQ.data],
  );

  const netRevaluation = big(summaryQ.data?.totals?.netGainLossPaise);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Price Revision &amp; Revaluation</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Rates move daily. The litres already in your tanks get revalued with
            them — a paper gain or loss, not cash.
          </p>
        </div>
        <Button onClick={() => openForm("HSD")}>
          <TrendingUp className="h-4 w-4 mr-2" />
          Record price revision
        </Button>
      </div>

      {/* ---- Today, per fuel ---- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {FUELS.map((f) => {
          const row = fuelRow(f);
          const margin = row?.marginPaisePerLitre ? big(row.marginPaisePerLitre) : null;
          const hasRate = Boolean(row?.currentRatePaise);
          return (
            <Card key={f}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  {FUEL_LABELS[f]}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <div className="text-2xl font-semibold">
                    {hasRate ? formatINR(row!.currentRatePaise!) : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    selling rate / L
                    {row?.effectiveFrom
                      ? ` · since ${format(new Date(row.effectiveFrom), "dd MMM HH:mm")}`
                      : ""}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t">
                  <div>
                    <div className="text-muted-foreground">Avg cost / L</div>
                    <div className="font-medium text-sm">
                      {row?.avgCostPaisePerLitre
                        ? formatINR(row.avgCostPaisePerLitre)
                        : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Margin / L</div>
                    <div className={`font-semibold text-sm ${signClass(margin)}`}>
                      {margin === null ? "—" : signedINR(margin)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">In stock</div>
                    <div className="font-medium text-sm">
                      {row ? `${formatLitres(row.stockMl)} L` : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Stock at rate</div>
                    <div className="font-medium text-sm">
                      {row?.stockAtRatePaise ? formatINR(row.stockAtRatePaise) : "—"}
                    </div>
                  </div>
                </div>
                {row && !row.costBasisComplete && (
                  <div className="text-[11px] text-amber-700">
                    {row.estimatedStockTankCount} tank(s) have no cost basis yet —
                    litres counted from the last shift&apos;s closing stock.
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => openForm(f)}
                >
                  Revise rate
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ---- Range picker + period revaluation ---- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Period</CardTitle>
          <CardDescription>
            Revaluation gain or loss recorded in this window, across all fuels.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div>
            <Label>From</Label>
            <Input
              type="date"
              value={range.from}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            />
          </div>
          <div>
            <Label>To</Label>
            <Input
              type="date"
              value={range.to}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            />
          </div>
          <div className="ml-auto text-right">
            <div className="text-xs text-muted-foreground">Net stock revaluation</div>
            <div className={`text-2xl font-semibold ${signClass(netRevaluation)}`}>
              {signedINR(netRevaluation)}
            </div>
            <div className="text-xs text-muted-foreground">
              {summaryQ.data?.totals?.revisionCount ?? 0} revision(s) — paper value,
              not cash
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ---- Per-fuel summary ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Revaluation by fuel</CardTitle>
          <CardDescription>
            How much of the period&apos;s result came from price movement rather
            than from selling fuel.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fuel</TableHead>
                <TableHead className="text-right">Revisions</TableHead>
                <TableHead className="text-right">Opening</TableHead>
                <TableHead className="text-right">Closing</TableHead>
                <TableHead className="text-right">Low</TableHead>
                <TableHead className="text-right">High</TableHead>
                <TableHead className="text-right">Net gain / loss</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(summaryQ.data?.fuels || []).filter((f) => f.revisionCount > 0).length ===
              0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                    {summaryQ.isLoading
                      ? "Loading…"
                      : "No price revisions recorded in this period."}
                  </TableCell>
                </TableRow>
              ) : (
                (summaryQ.data?.fuels || [])
                  .filter((f) => f.revisionCount > 0)
                  .map((f) => {
                    const net = big(f.netGainLossPaise);
                    return (
                      <TableRow key={f.fuelType}>
                        <TableCell className="font-medium">
                          {FUEL_LABELS[f.fuelType] || f.fuelType}
                        </TableCell>
                        <TableCell className="text-right">
                          {f.revisionCount}
                          <span className="text-xs text-muted-foreground">
                            {" "}
                            ({f.increases}↑ {f.decreases}↓)
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {f.openingRatePaise ? formatINR(f.openingRatePaise) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {f.closingRatePaise ? formatINR(f.closingRatePaise) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {f.lowRatePaise ? formatINR(f.lowRatePaise) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {f.highRatePaise ? formatINR(f.highRatePaise) : "—"}
                        </TableCell>
                        <TableCell className={`text-right font-medium ${signClass(net)}`}>
                          {signedINR(net)}
                        </TableCell>
                      </TableRow>
                    );
                  })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ---- Margin trend ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Margin per litre</CardTitle>
          <CardDescription>
            Selling rate minus weighted-average cost, per day.
            {trendQ.data?.costBasis === "CURRENT_SNAPSHOT" &&
              " Cost is today's average cost basis applied across the range."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {chartFuels.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              {trendQ.isLoading
                ? "Loading…"
                : "No margin to chart yet — a rate and a tank cost basis are both needed."}
            </div>
          ) : (
            <div style={{ width: "100%", height: 320 }}>
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `₹${Number(v).toFixed(2)}`}
                  />
                  <Tooltip
                    formatter={(v, name) => [
                      v === null
                        ? "—"
                        : "₹" +
                          Number(v).toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          }) +
                          " / L",
                      FUEL_LABELS[String(name)] || String(name),
                    ]}
                    labelFormatter={(label, payload) => {
                      const litres = (payload?.[0] as any)?.payload?.litres;
                      return litres
                        ? `${label} — ${Number(litres).toLocaleString("en-IN", {
                            maximumFractionDigits: 0,
                          })} L sold`
                        : String(label);
                    }}
                  />
                  <Legend formatter={(name) => FUEL_LABELS[String(name)] || String(name)} />
                  {chartFuels.map((f) => (
                    <Line
                      key={f}
                      type="monotone"
                      dataKey={f}
                      stroke={FUEL_COLORS[f]}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                      name={f}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- Revision history ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Revision history</CardTitle>
          <CardDescription>
            Every recorded rate change, with the stock it revalued.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label>Fuel</Label>
              <Select value={historyFuel} onValueChange={setHistoryFuel}>
                <SelectTrigger className="min-w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All fuels</SelectItem>
                  {FUELS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {FUEL_LABELS[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {revisionsQ.data && (
              <div className="ml-auto flex gap-2">
                <Badge variant="outline">
                  Gains {signedINR(big(revisionsQ.data.totals.gainPaise))}
                </Badge>
                <Badge variant="outline">
                  Losses {signedINR(big(revisionsQ.data.totals.lossPaise))}
                </Badge>
                <Badge>Net {signedINR(big(revisionsQ.data.totals.netGainLossPaise))}</Badge>
              </div>
            )}
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Effective</TableHead>
                <TableHead>Fuel</TableHead>
                <TableHead className="text-right">Old → New / L</TableHead>
                <TableHead className="text-right">Change / L</TableHead>
                <TableHead className="text-right">Stock at revision</TableHead>
                <TableHead className="text-right">Gain / loss</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(revisionsQ.data?.revisions || []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                    {revisionsQ.isLoading
                      ? "Loading…"
                      : "No revisions yet. Record one when the company changes your rate."}
                  </TableCell>
                </TableRow>
              ) : (
                revisionsQ.data!.revisions.map((r) => {
                  const delta = big(r.deltaPaisePerLitre);
                  const gl = big(r.stockGainLossPaise);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(r.effectiveAt), "dd MMM yyyy HH:mm")}
                      </TableCell>
                      <TableCell>{FUEL_LABELS[r.fuelType] || r.fuelType}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {formatINR(r.oldRatePaise)} → {formatINR(r.newRatePaise)}
                      </TableCell>
                      <TableCell className={`text-right ${signClass(delta)}`}>
                        {signedINR(delta)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatLitres(r.stockAtRevisionMl)} L
                      </TableCell>
                      <TableCell className={`text-right font-medium ${signClass(gl)}`}>
                        {signedINR(gl)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <RevisionDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        fuelType={formFuel}
        setFuelType={setFormFuel}
        fuels={fuels}
        onSaved={() => {
          setFormOpen(false);
          qc.invalidateQueries({ queryKey: ["pricing-rates"] });
          qc.invalidateQueries({ queryKey: ["pricing-revisions"] });
          qc.invalidateQueries({ queryKey: ["pricing-revaluation-summary"] });
          qc.invalidateQueries({ queryKey: ["pricing-margin-trend"] });
          qc.invalidateQueries({ queryKey: ["fuel-rates"] });
        }}
      />
    </div>
  );
}

// ===================== REVISION FORM =====================

function RevisionDialog({
  open,
  onOpenChange,
  fuelType,
  setFuelType,
  fuels,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  fuelType: string;
  setFuelType: (v: string) => void;
  fuels: FuelRow[];
  onSaved: () => void;
}) {
  const [rate, setRate] = useState("");
  const [effectiveAt, setEffectiveAt] = useState("");

  const row = fuels.find((f) => f.fuelType === fuelType);
  const oldPaise = row?.currentRatePaise ? big(row.currentRatePaise) : null;
  const stockMl = big(row?.stockMl);

  // Live preview. The typed rupee figure becomes whole paise first (via
  // rupeesToPaise), then all arithmetic is BigInt — no floats touch money.
  const preview = useMemo(() => {
    const trimmed = rate.trim();
    if (!trimmed || oldPaise === null) return null;
    const asNum = Number(trimmed);
    if (!Number.isFinite(asNum) || asNum <= 0) return null;
    const newPaise = big(rupeesToPaise(trimmed));
    if (newPaise === oldPaise) return { same: true as const };
    const delta = newPaise - oldPaise;
    return {
      same: false as const,
      newPaise,
      delta,
      gainLoss: revalue(stockMl, oldPaise, newPaise),
    };
  }, [rate, oldPaise, stockMl]);

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.post("/api/pricing/revisions", {
          fuelType,
          newRatePaise: rupeesToPaise(rate),
          effectiveAt: effectiveAt ? fromDatetimeLocal(effectiveAt) : undefined,
        })
      ).data,
    onSuccess: (d: any) => {
      const gl = big(d?.stockGainLossPaise);
      toast.success(
        `Rate revised. Stock revalued by ${signedINR(gl)} (${formatLitres(
          d?.stockMl ?? "0",
        )} L on hand).`,
      );
      setRate("");
      setEffectiveAt("");
      onSaved();
    },
    onError,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record price revision</DialogTitle>
          <DialogDescription>
            Sets the new selling rate and records what the change does to the fuel
            already in your tanks.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Fuel</Label>
            <Select value={fuelType} onValueChange={setFuelType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FUELS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {FUEL_LABELS[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Current rate (₹/L)</Label>
              <div className="h-10 flex items-center text-sm font-medium">
                {oldPaise === null ? "Not set" : formatINR(oldPaise.toString())}
              </div>
            </div>
            <div>
              <Label>New rate (₹/L)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={rate}
                placeholder="0.00"
                onChange={(e) => setRate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>Effective from (optional — defaults to now)</Label>
            <Input
              type="datetime-local"
              value={effectiveAt}
              onChange={(e) => setEffectiveAt(e.target.value)}
            />
          </div>

          {/* ---- live impact preview ---- */}
          {oldPaise === null ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              No rate is set for {FUEL_LABELS[fuelType]} yet, so there is nothing to
              revise. Set the opening rate under Fuel Rates first.
            </div>
          ) : preview === null ? (
            <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
              You have <strong>{formatLitres(stockMl.toString())} L</strong> of{" "}
              {FUEL_LABELS[fuelType]} in stock. Enter a new rate to see what the
              change does to its value.
            </div>
          ) : preview.same ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              That is the same as the current rate — nothing to revise.
            </div>
          ) : (
            <div
              className={`rounded-md border p-3 text-sm ${
                preview.gainLoss >= 0n
                  ? "border-green-200 bg-green-50 text-green-900"
                  : "border-red-200 bg-red-50 text-red-900"
              }`}
            >
              <p>
                You have <strong>{formatLitres(stockMl.toString())} L</strong> of{" "}
                {FUEL_LABELS[fuelType]} in stock. A{" "}
                <strong>
                  {formatINR(absBig(preview.delta).toString())}{" "}
                  {preview.delta > 0n ? "increase" : "decrease"}
                </strong>{" "}
                {preview.gainLoss >= 0n ? "adds" : "takes"}{" "}
                <strong>{formatINR(absBig(preview.gainLoss).toString())}</strong>{" "}
                {preview.gainLoss >= 0n ? "to" : "from"} the value of that stock.
              </p>
              <p className="mt-2 text-xs opacity-80">
                This revalues fuel you already own — it is not cash in hand, and no
                money moves today.
              </p>
              {row && !row.costBasisComplete && (
                <p className="mt-1 text-xs opacity-80">
                  {row.estimatedStockTankCount} tank(s) have no running inventory
                  state; their litres come from the last shift&apos;s closing stock.
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => save.mutate()}
              disabled={
                save.isPending || preview === null || preview.same || oldPaise === null
              }
            >
              {save.isPending ? "Saving…" : "Record revision"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

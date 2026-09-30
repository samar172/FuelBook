"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { formatLitres, FUEL_LABELS } from "@/lib/utils";
import { apiError } from "@/lib/types";
import { format, parseISO, subDays } from "date-fns";
import { AlertTriangle, Info, Scale } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useDateLocale } from "@/lib/i18n/core";
import { VarianceResponse, SHIFT_LABELS, signedLitres, signedPct, todayStr } from "./types";

const ALL = "__all__";

export function VarianceTab() {
  const { t } = useT();
  const locale = useDateLocale();
  const [range, setRange] = useState({
    from: subDays(new Date(), 13).toISOString().slice(0, 10),
    to: todayStr(),
  });
  const [draft, setDraft] = useState(range);
  const [tankId, setTankId] = useState(ALL);
  const [tolerance, setTolerance] = useState("0.5");
  const [appliedTolerance, setAppliedTolerance] = useState("0.5");

  const tanksQ = useQuery<{ id: string; name: string }[]>({
    queryKey: ["setup-tanks"],
    queryFn: async () => (await api.get("/api/setup/tanks")).data,
  });
  const tanks = tanksQ.data ?? [];

  const { data, isLoading, isError, error } = useQuery<VarianceResponse>({
    queryKey: ["wet-variance", range, tankId, appliedTolerance],
    queryFn: async () =>
      (
        await api.get("/api/wet-stock/variance", {
          params: {
            from: range.from,
            to: range.to,
            ...(tankId === ALL ? {} : { tankId }),
            ...(appliedTolerance.trim() === "" ? {} : { tolerancePct: appliedTolerance }),
          },
        })
      ).data,
  });

  const apply = () => {
    setRange(draft);
    setAppliedTolerance(tolerance);
  };

  const rows = data?.rows ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="h-4 w-4" /> {t("wetstock.var.title", "Wet-stock variance")}
          </CardTitle>
          <CardDescription>
            {t(
              "wetstock.var.desc",
              "Book stock (opening + tanker receipts − metered sales) against the stock the dip actually measured, per shift and tank."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <Label htmlFor="v-from">{t("common.from", "From")}</Label>
              <Input
                id="v-from"
                type="date"
                value={draft.from}
                onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="v-to">{t("common.to", "To")}</Label>
              <Input
                id="v-to"
                type="date"
                value={draft.to}
                onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="v-tank">{t("wetstock.var.tank", "Tank")}</Label>
              <Select value={tankId} onValueChange={setTankId}>
                <SelectTrigger id="v-tank" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t("wetstock.var.allTanks", "All tanks")}</SelectItem>
                  {tanks.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="v-tol">{t("wetstock.var.tolerance", "Tolerance (%)")}</Label>
              <Input
                id="v-tol"
                inputMode="decimal"
                value={tolerance}
                onChange={(e) => setTolerance(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={apply} className="w-full">
                {t("common.apply", "Apply")}
              </Button>
            </div>
          </div>
          <p className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {t(
                "wetstock.var.note",
                data?.note ??
                  "Variance = dip-measured stock minus book stock. A small negative variance is normal for petrol/MS because it evaporates."
              )}
            </span>
          </p>
        </CardContent>
      </Card>

      {isError ? (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">
            {apiError(error, t("wetstock.var.loadError", "Could not load the variance report"))}
          </CardContent>
        </Card>
      ) : isLoading ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            {t("common.loading", "Loading…")}
          </CardContent>
        </Card>
      ) : (
        <>
          {data ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-xs text-muted-foreground">
                    {t("wetstock.var.shiftsCovered", "Shifts covered")}
                  </div>
                  <div className="text-2xl font-semibold">{data.totals.shiftsCovered}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-xs text-muted-foreground">
                    {t("wetstock.var.netVariance", "Net variance")}
                  </div>
                  <div className="text-2xl font-semibold">
                    {signedLitres(data.totals.totalVarianceMl)} L
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("wetstock.var.ofThroughput", "{pct} of {litres} L throughput", {
                      pct: signedPct(data.totals.totalVariancePct),
                      litres: formatLitres(data.totals.totalThroughputMl, 0),
                    })}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-xs text-muted-foreground">
                    {t("wetstock.var.flagged", "Flagged (beyond ±{pct}%)", {
                      pct: data.tolerancePct,
                    })}
                  </div>
                  <div className="text-2xl font-semibold">{data.totals.flaggedCount}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-xs text-muted-foreground">
                    {t("wetstock.var.withoutDip", "Tank-shifts without a dip")}
                  </div>
                  <div className="text-2xl font-semibold">{data.totals.rowsWithoutDip}</div>
                  <div className="text-xs text-muted-foreground">
                    {t("wetstock.var.measured", "{count} measured", {
                      count: data.totals.rowsWithDip,
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t("wetstock.var.perShiftTank", "Per shift and tank")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {rows.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">
                  {t(
                    "wetstock.var.empty",
                    "Nothing to compare in this range — there are no shifts with stock entries or dip readings."
                  )}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("common.date", "Date")}</TableHead>
                        <TableHead>{t("wetstock.shift", "Shift")}</TableHead>
                        <TableHead>{t("wetstock.var.tank", "Tank")}</TableHead>
                        <TableHead className="text-right">
                          {t("wetstock.var.thOpening", "Opening L")}
                        </TableHead>
                        <TableHead className="text-right">
                          {t("wetstock.var.thReceipts", "Receipts L")}
                        </TableHead>
                        <TableHead className="text-right">
                          {t("wetstock.var.thSales", "Sales L")}
                        </TableHead>
                        <TableHead className="text-right">
                          {t("wetstock.var.thBook", "Book L")}
                        </TableHead>
                        <TableHead className="text-right">
                          {t("wetstock.var.thDip", "Dip mm")}
                        </TableHead>
                        <TableHead className="text-right">
                          {t("wetstock.var.thMeasured", "Measured L")}
                        </TableHead>
                        <TableHead className="text-right">
                          {t("wetstock.var.thVariance", "Variance L")}
                        </TableHead>
                        <TableHead className="text-right">%</TableHead>
                        <TableHead>{t("wetstock.var.thFlag", "Flag")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => (
                        <TableRow
                          key={`${r.shiftReportId}-${r.tankId}`}
                          className={r.flagged ? "bg-destructive/5" : undefined}
                        >
                          <TableCell className="whitespace-nowrap">
                            {format(parseISO(r.reportDate), "dd MMM", { locale })}
                          </TableCell>
                          <TableCell>
                            {t(
                              `wetstock.shiftType.${r.shiftType}`,
                              SHIFT_LABELS[r.shiftType] ?? r.shiftType
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {r.tankName}
                            <span className="ml-1 text-xs text-muted-foreground">
                              {t(`shift.fuel.${r.fuelType}`, FUEL_LABELS[r.fuelType] ?? r.fuelType)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">{formatLitres(r.openingMl)}</TableCell>
                          <TableCell className="text-right">{formatLitres(r.receiptsMl)}</TableCell>
                          <TableCell className="text-right">{formatLitres(r.salesMl)}</TableCell>
                          <TableCell className="text-right">
                            {formatLitres(r.bookClosingMl)}
                          </TableCell>
                          <TableCell className="text-right">{r.dipMm ?? "—"}</TableCell>
                          <TableCell className="text-right">
                            {r.measuredMl === null ? "—" : formatLitres(r.measuredMl)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {signedLitres(r.varianceMl)}
                          </TableCell>
                          <TableCell className="text-right">{signedPct(r.variancePct)}</TableCell>
                          <TableCell>
                            {!r.hasDip ? (
                              <Badge variant="outline">{t("wetstock.var.noDip", "No dip")}</Badge>
                            ) : r.flagged ? (
                              <Badge variant="destructive" className="whitespace-nowrap">
                                <AlertTriangle className="mr-1 h-3 w-3" />{" "}
                                {t("wetstock.var.investigate", "Investigate")}
                              </Badge>
                            ) : (
                              <Badge variant="success">{t("wetstock.var.ok", "OK")}</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

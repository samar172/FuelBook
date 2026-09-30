"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, can } from "@/lib/api";
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
import { FUEL_LABELS } from "@/lib/utils";
import { apiError, Employee } from "@/lib/types";
import { toast } from "sonner";
import { AlertTriangle, Beaker, Plus, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { ShiftPicker } from "./ShiftPicker";
import { MeasureTestsResponse, numOrNull } from "./types";

const NO_EMPLOYEE = "NONE";

// Measure cans a pump actually owns. Tolerance scales with the size: ±25 ml per 5 L.
const MEASURE_SIZES = [
  { ml: "500", key: "wetstock.test.measure500", label: "500 ml" },
  { ml: "5000", key: "wetstock.test.measure5l", label: "5 litre" },
  { ml: "10000", key: "wetstock.test.measure10l", label: "10 litre" },
  { ml: "20000", key: "wetstock.test.measure20l", label: "20 litre" },
];

type Row = {
  key: string;
  nozzleId: string;
  measureMl: string;
  deliveredMl: string; // typed in ml, because the error is a few ml
  testedById: string;
  notes: string;
};

let rowSeq = 0;
const newRow = (nozzleId = ""): Row => ({
  key: `r${++rowSeq}`,
  nozzleId,
  measureMl: "5000",
  deliveredMl: "",
  testedById: NO_EMPLOYEE,
  notes: "",
});

// ±25 ml per 5 litres, scaled and rounded up — mirrors the backend exactly.
const toleranceMl = (measureMl: number): number =>
  measureMl > 0 ? Math.ceil((25 * measureMl) / 5000) : 25;

export function MeasureTestsTab({
  shiftId,
  setShiftId,
}: {
  shiftId: string;
  setShiftId: (id: string) => void;
}) {
  const qc = useQueryClient();
  const { t } = useT();
  const writable = can("canEditStock");

  const { data, isLoading, isError, error } = useQuery<MeasureTestsResponse>({
    queryKey: ["wet-measure-tests", shiftId],
    queryFn: async () => (await api.get(`/api/wet-stock/shifts/${shiftId}/measure-tests`)).data,
    enabled: Boolean(shiftId),
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["employees"],
    queryFn: async () => (await api.get("/api/employees")).data,
  });

  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (!data) return;
    setRows(
      data.tests.map((t) => ({
        key: t.id,
        nozzleId: t.nozzleId,
        measureMl: String(t.measureMl),
        deliveredMl: String(t.deliveredMl),
        testedById: t.testedById ?? NO_EMPLOYEE,
        notes: t.notes ?? "",
      })),
    );
  }, [data]);

  const locked = data?.shift.status === "LOCKED";
  const disabled = !writable || locked;

  const set = (key: string, field: keyof Row, value: string) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [field]: value } : r)));

  const save = useMutation({
    mutationFn: async () => {
      const tests = rows
        .filter((r) => r.nozzleId && r.deliveredMl.trim() !== "")
        .map((r) => ({
          nozzleId: r.nozzleId,
          measureMl: r.measureMl,
          deliveredMl: String(numOrNull(r.deliveredMl) ?? 0),
          testedById: r.testedById === NO_EMPLOYEE ? null : r.testedById,
          notes: r.notes.trim() || null,
        }));
      return (await api.put(`/api/wet-stock/shifts/${shiftId}/measure-tests`, { tests })).data;
    },
    onSuccess: (res: { failedCount: number }) => {
      if (res.failedCount > 0) {
        toast.error(
          res.failedCount === 1
            ? t(
                "wetstock.test.savedFailOne",
                "Saved — 1 nozzle test failed tolerance. Seal and recalibrate before dispensing."
              )
            : t(
                "wetstock.test.savedFailMany",
                "Saved — {count} nozzle tests failed tolerance. Seal and recalibrate before dispensing.",
                { count: res.failedCount }
              ),
        );
      } else {
        toast.success(t("wetstock.test.savedOk", "Nozzle tests saved — all within tolerance"));
      }
      qc.invalidateQueries({ queryKey: ["wet-measure-tests", shiftId] });
    },
    onError: (e) =>
      toast.error(apiError(e, t("wetstock.test.saveFailed", "Could not save the nozzle tests"))),
  });

  const nozzles = data?.nozzles ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Beaker className="h-4 w-4" />{" "}
            {t("wetstock.test.title", "Weights & Measures nozzle tests")}
          </CardTitle>
          <CardDescription>
            {t(
              "wetstock.test.desc",
              "Deliver into the calibrated measure and record what came out. Tolerance is ±25 ml per 5 litres, scaled to the can you used."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ShiftPicker value={shiftId} onChange={setShiftId} />
        </CardContent>
      </Card>

      {!shiftId ? null : isError ? (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">
            {apiError(error, t("wetstock.test.loadError", "Could not load the nozzle tests"))}
          </CardContent>
        </Card>
      ) : isLoading ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            {t("common.loading", "Loading…")}
          </CardContent>
        </Card>
      ) : nozzles.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            {t("wetstock.test.noNozzles", "No active nozzles yet. Add nozzles in Settings first.")}
          </CardContent>
        </Card>
      ) : (
        <>
          {data && data.failedCount > 0 ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {data.failedCount === 1
                  ? t(
                      "wetstock.test.failedOne",
                      "1 recorded test is outside the statutory tolerance. That nozzle must be sealed and recalibrated before it dispenses again."
                    )
                  : t(
                      "wetstock.test.failedMany",
                      "{count} recorded tests are outside the statutory tolerance. Those nozzles must be sealed and recalibrated before they dispense again.",
                      { count: data.failedCount }
                    )}
              </span>
            </div>
          ) : null}

          <div className="space-y-4">
            {rows.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-sm text-muted-foreground">
                  {t("wetstock.test.none", "No tests logged for this shift yet.")}
                </CardContent>
              </Card>
            ) : null}

            {rows.map((r) => {
              const measure = Number(r.measureMl) || 0;
              const delivered = r.deliveredMl.trim() === "" ? null : Number(r.deliveredMl);
              const variance = delivered === null ? null : delivered - measure;
              const tol = toleranceMl(measure);
              const pass = variance === null ? null : Math.abs(variance) <= tol;
              const nozzle = nozzles.find((n) => n.id === r.nozzleId);
              return (
                <Card key={r.key}>
                  <CardContent className="space-y-3 pt-6">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <Label>{t("wetstock.test.nozzle", "Nozzle")}</Label>
                        <Select
                          value={r.nozzleId || undefined}
                          onValueChange={(v) => set(r.key, "nozzleId", v)}
                          disabled={disabled}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder={t("wetstock.test.pickNozzle", "Pick a nozzle")} />
                          </SelectTrigger>
                          <SelectContent>
                            {nozzles.map((n) => (
                              <SelectItem key={n.id} value={n.id}>
                                {n.code} · {FUEL_LABELS[n.fuelType] ?? n.fuelType}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>{t("wetstock.test.measure", "Measure")}</Label>
                        <Select
                          value={r.measureMl}
                          onValueChange={(v) => set(r.key, "measureMl", v)}
                          disabled={disabled}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {MEASURE_SIZES.map((m) => (
                              <SelectItem key={m.ml} value={m.ml}>
                                {t(m.key, m.label)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>{t("wetstock.test.delivered", "Delivered (ml)")}</Label>
                        <Input
                          inputMode="numeric"
                          value={r.deliveredMl}
                          disabled={disabled}
                          placeholder={r.measureMl}
                          onChange={(e) => set(r.key, "deliveredMl", e.target.value)}
                          className="mt-1"
                        />
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <Label>{t("wetstock.test.testedBy", "Tested by")}</Label>
                        <Select
                          value={r.testedById}
                          onValueChange={(v) => set(r.key, "testedById", v)}
                          disabled={disabled}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NO_EMPLOYEE}>
                              {t("wetstock.notRecorded", "Not recorded")}
                            </SelectItem>
                            {employees.map((e) => (
                              <SelectItem key={e.id} value={e.id}>
                                {e.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="sm:col-span-2">
                        <Label>{t("common.notes", "Notes")}</Label>
                        <Input
                          value={r.notes}
                          disabled={disabled}
                          placeholder={t(
                            "wetstock.test.notesPlaceholder",
                            "Re-tested after calibration, etc."
                          )}
                          onChange={(e) => set(r.key, "notes", e.target.value)}
                          className="mt-1"
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/40 p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-3">
                        <span>
                          {t("wetstock.test.variance", "Variance:")}{" "}
                          <strong>
                            {variance === null
                              ? "—"
                              : `${variance > 0 ? "+" : variance < 0 ? "−" : ""}${Math.abs(variance)} ml`}
                          </strong>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {t("wetstock.test.tolerance", "tolerance ±{ml} ml", { ml: tol })}
                        </span>
                        {pass === null ? null : pass ? (
                          <Badge variant="success">{t("wetstock.test.pass", "Pass")}</Badge>
                        ) : (
                          <Badge variant="destructive">
                            {variance !== null && variance < 0
                              ? t("wetstock.test.failShort", "FAIL — short delivery")
                              : t("wetstock.test.failExcess", "FAIL — excess delivery")}
                          </Badge>
                        )}
                        {nozzle ? (
                          <span className="text-xs text-muted-foreground">{nozzle.code}</span>
                        ) : null}
                      </div>
                      {!disabled ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" /> {t("common.remove", "Remove")}
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {locked ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4" />{" "}
              {t(
                "wetstock.test.lockedNote",
                "This shift is locked, so its test log can no longer be edited."
              )}
            </p>
          ) : !writable ? (
            <p className="text-sm text-muted-foreground">
              {t(
                "wetstock.noStockPermission",
                "You do not have permission to edit stock readings."
              )}
            </p>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => setRows((rs) => [...rs, newRow()])}>
                <Plus className="mr-1 h-4 w-4" /> {t("wetstock.test.add", "Add a test")}
              </Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending
                  ? t("common.saving", "Saving…")
                  : t("wetstock.test.save", "Save test log")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

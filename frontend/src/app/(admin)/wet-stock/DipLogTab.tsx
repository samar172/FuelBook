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
import { formatLitres, FUEL_LABELS } from "@/lib/utils";
import { apiError, Employee } from "@/lib/types";
import { toast } from "sonner";
import { AlertTriangle, Info, Ruler } from "lucide-react";
import { useT } from "@/lib/i18n";
import { ShiftPicker } from "./ShiftPicker";
import { DipReadingsResponse, numOrNull } from "./types";

const NO_EMPLOYEE = "NONE";

type Draft = {
  dipMm: string;
  densityKgM3: string;
  temperatureC: string;
  recordedById: string;
  notes: string;
};

const emptyDraft = (): Draft => ({
  dipMm: "",
  densityKgM3: "",
  temperatureC: "",
  recordedById: NO_EMPLOYEE,
  notes: "",
});

export function DipLogTab({
  shiftId,
  setShiftId,
}: {
  shiftId: string;
  setShiftId: (id: string) => void;
}) {
  const qc = useQueryClient();
  const { t } = useT();
  // `t` is shadowed by the tank inside the per-tank map below, so keep an alias.
  const t2 = t;
  const writable = can("canEditStock");

  const { data, isLoading, isError, error } = useQuery<DipReadingsResponse>({
    queryKey: ["wet-dip-readings", shiftId],
    queryFn: async () => (await api.get(`/api/wet-stock/shifts/${shiftId}/dip-readings`)).data,
    enabled: Boolean(shiftId),
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["employees"],
    queryFn: async () => (await api.get("/api/employees")).data,
  });

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  // Seed the inputs from whatever was already logged for this shift.
  useEffect(() => {
    if (!data) return;
    const next: Record<string, Draft> = {};
    for (const t of data.tanks) {
      const r = data.readings.find((x) => x.tankId === t.id);
      next[t.id] = r
        ? {
            dipMm: String(r.dipMm),
            densityKgM3: r.densityKgM3 === null ? "" : String(r.densityKgM3),
            temperatureC: r.temperatureC === null ? "" : String(r.temperatureC),
            recordedById: r.recordedById ?? NO_EMPLOYEE,
            notes: r.notes ?? "",
          }
        : emptyDraft();
    }
    setDrafts(next);
  }, [data]);

  const set = (tankId: string, key: keyof Draft, value: string) =>
    setDrafts((d) => ({ ...d, [tankId]: { ...(d[tankId] ?? emptyDraft()), [key]: value } }));

  const locked = data?.shift.status === "LOCKED";
  const disabled = !writable || locked;

  const save = useMutation({
    mutationFn: async () => {
      const readings = (data?.tanks ?? [])
        .filter((t) => (drafts[t.id]?.dipMm ?? "").trim() !== "")
        .map((t) => {
          const d = drafts[t.id];
          return {
            tankId: t.id,
            dipMm: numOrNull(d.dipMm),
            densityKgM3: numOrNull(d.densityKgM3),
            temperatureC: numOrNull(d.temperatureC),
            recordedById: d.recordedById === NO_EMPLOYEE ? null : d.recordedById,
            notes: d.notes.trim() || null,
          };
        });
      if (!readings.length)
        throw new Error(t("wetstock.dip.needOne", "Enter at least one dip before saving"));
      return (await api.put(`/api/wet-stock/shifts/${shiftId}/dip-readings`, { readings })).data;
    },
    onSuccess: () => {
      toast.success(t("wetstock.dip.saved", "Dip readings saved"));
      qc.invalidateQueries({ queryKey: ["wet-dip-readings", shiftId] });
      qc.invalidateQueries({ queryKey: ["wet-variance"] });
    },
    onError: (e) =>
      toast.error(apiError(e, t("wetstock.dip.saveFailed", "Could not save the dip readings"))),
  });

  if (!shiftId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("wetstock.dip.title", "Dip & density log")}</CardTitle>
          <CardDescription>
            {t("wetstock.dip.pickShift", "Pick a shift to record its tank dips.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ShiftPicker value={shiftId} onChange={setShiftId} />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ruler className="h-4 w-4" /> {t("wetstock.dip.title", "Dip & density log")}
          </CardTitle>
          <CardDescription>
            {t(
              "wetstock.dip.desc",
              "One dip per tank, taken at the tank. The volume is read off the tank's dip chart automatically."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ShiftPicker value={shiftId} onChange={setShiftId} />
        </CardContent>
      </Card>

      {isError ? (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">
            {apiError(error, t("wetstock.dip.loadError", "Could not load the dip log"))}
          </CardContent>
        </Card>
      ) : isLoading ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            {t("common.loading", "Loading…")}
          </CardContent>
        </Card>
      ) : !data || data.tanks.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            {t("wetstock.dip.noTanks", "No active tanks yet. Add tanks in Settings first.")}
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {t("wetstock.dip.densityNoteLead", "Density at 15 °C is")}{" "}
              <strong>{t("wetstock.dip.densityNoteApprox", "approximate")}</strong>
              {t(
                "wetstock.dip.densityNoteTail",
                ": a simplified linear correction of 0.65 kg/m³ per °C, not the ASTM 54B table. Good enough for the daily log and for checking an invoice — not a lab figure."
              )}
            </span>
          </p>

          {/* One card per tank: readings get typed on a phone, standing at the tank. */}
          <div className="grid gap-4 md:grid-cols-2">
            {data.tanks.map((t) => {
              const d = drafts[t.id] ?? emptyDraft();
              const saved = data.readings.find((x) => x.tankId === t.id);
              const noChart = (t.chartPoints ?? 0) < 2;
              return (
                <Card key={t.id}>
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle className="text-base">{t.name}</CardTitle>
                      <Badge variant="outline">{t2(`shift.fuel.${t.fuelType}`, FUEL_LABELS[t.fuelType] ?? t.fuelType)}</Badge>
                    </div>
                    <CardDescription>
                      {t2("wetstock.dip.capacity", "Capacity {litres} L", {
                        litres: formatLitres(t.capacityMl, 0),
                      })}{" "}
                      ·{" "}
                      {noChart ? (
                        <span className="text-amber-700">
                          {t2(
                            "wetstock.dip.noChart",
                            "no dip chart — the volume cannot be derived"
                          )}
                        </span>
                      ) : (
                        t2("wetstock.dip.chartPoints", "{count} chart points", {
                          count: t.chartPoints ?? 0,
                        })
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor={`dip-${t.id}`}>{t2("wetstock.dip.dipMm", "Dip (mm)")}</Label>
                        <Input
                          id={`dip-${t.id}`}
                          inputMode="numeric"
                          value={d.dipMm}
                          disabled={disabled}
                          onChange={(e) => set(t.id, "dipMm", e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor={`temp-${t.id}`}>{t2("wetstock.dip.tempC", "Temp (°C)")}</Label>
                        <Input
                          id={`temp-${t.id}`}
                          inputMode="numeric"
                          value={d.temperatureC}
                          disabled={disabled}
                          onChange={(e) => set(t.id, "temperatureC", e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor={`den-${t.id}`}>
                          {t2("wetstock.dip.density", "Density (kg/m³)")}
                        </Label>
                        <Input
                          id={`den-${t.id}`}
                          inputMode="numeric"
                          value={d.densityKgM3}
                          disabled={disabled}
                          onChange={(e) => set(t.id, "densityKgM3", e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor={`by-${t.id}`}>{t2("wetstock.dip.takenBy", "Taken by")}</Label>
                        <Select
                          value={d.recordedById}
                          onValueChange={(v) => set(t.id, "recordedById", v)}
                          disabled={disabled}
                        >
                          <SelectTrigger id={`by-${t.id}`} className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NO_EMPLOYEE}>
                              {t2("wetstock.notRecorded", "Not recorded")}
                            </SelectItem>
                            {employees.map((e) => (
                              <SelectItem key={e.id} value={e.id}>
                                {e.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor={`notes-${t.id}`}>{t2("common.notes", "Notes")}</Label>
                      <Input
                        id={`notes-${t.id}`}
                        value={d.notes}
                        disabled={disabled}
                        placeholder={t2(
                          "wetstock.dip.notesPlaceholder",
                          "Water in tank, foam, anything unusual"
                        )}
                        onChange={(e) => set(t.id, "notes", e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3 rounded-md bg-muted/40 p-3 text-sm">
                      <div>
                        <div className="text-xs text-muted-foreground">
                          {t2("wetstock.dip.volumeFromChart", "Volume from chart")}
                        </div>
                        <div className="font-medium">
                          {saved?.volumeFromChartMl
                            ? `${formatLitres(saved.volumeFromChartMl)} L`
                            : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">
                          {t2("wetstock.dip.densityAt15", "Density @ 15 °C (approx.)")}
                        </div>
                        <div className="font-medium">
                          {saved?.densityAt15CKgM3 !== null && saved?.densityAt15CKgM3 !== undefined
                            ? `${saved.densityAt15CKgM3} kg/m³`
                            : "—"}
                        </div>
                      </div>
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
                "wetstock.dip.lockedNote",
                "This shift is locked, so its dip log can no longer be edited."
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
            <Button onClick={() => save.mutate()} disabled={save.isPending} className="w-full sm:w-auto">
              {save.isPending
                ? t("common.saving", "Saving…")
                : t("wetstock.dip.save", "Save dip readings")}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

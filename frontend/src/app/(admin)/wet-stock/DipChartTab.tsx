"use client";
import { useEffect, useMemo, useState } from "react";
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
import { toast } from "sonner";
import { Table2, Wand2 } from "lucide-react";
import { DipChartResponse, WetTank } from "./types";

type Parsed = { rows: { dipMm: number; litres: number }[]; errors: string[] };

// The OMC calibration chart arrives as a printout or a spreadsheet, so the paste
// box accepts anything two-column: tabs, commas, semicolons or runs of spaces.
function parseChart(text: string): Parsed {
  const rows: { dipMm: number; litres: number }[] = [];
  const errors: string[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    const t = line.trim();
    if (t === "") return;
    const parts = t.split(/[\t,;]+|\s{1,}/).filter((p) => p !== "");
    if (parts.length < 2) {
      errors.push(`Line ${i + 1}: needs two columns (dip mm and litres)`);
      return;
    }
    const dip = Number(parts[0].replace(/[^\d.-]/g, ""));
    const litres = Number(parts[1].replace(/[^\d.-]/g, ""));
    if (!Number.isFinite(dip) || !Number.isFinite(litres)) {
      // A header row like "Dip (mm)  Litres" is skipped silently.
      if (i === 0) return;
      errors.push(`Line ${i + 1}: could not read "${t}"`);
      return;
    }
    if (dip < 0 || litres < 0) {
      errors.push(`Line ${i + 1}: negative values are not possible`);
      return;
    }
    rows.push({ dipMm: Math.round(dip), litres });
  });
  return { rows, errors };
}

export function DipChartTab() {
  const qc = useQueryClient();
  const writable = can("canEditStock");

  const tanksQ = useQuery<WetTank[]>({
    queryKey: ["setup-tanks"],
    queryFn: async () => (await api.get("/api/setup/tanks")).data,
  });
  const tanks = tanksQ.data ?? [];
  const [tankId, setTankId] = useState("");

  useEffect(() => {
    // Depend on the query result itself: `tanks` is a fresh array every render.
    const first = tanksQ.data?.[0]?.id;
    if (!tankId && first) setTankId(first);
  }, [tanksQ.data, tankId]);

  const chartQ = useQuery<DipChartResponse>({
    queryKey: ["wet-dip-chart", tankId],
    queryFn: async () => (await api.get(`/api/wet-stock/tanks/${tankId}/dip-chart`)).data,
    enabled: Boolean(tankId),
  });

  const [paste, setPaste] = useState("");
  const [probeDip, setProbeDip] = useState("");
  const [probe, setProbe] = useState<string | null>(null);

  // Loading a tank's chart into the box makes the table editable by re-pasting.
  useEffect(() => {
    setPaste("");
    setProbe(null);
    setProbeDip("");
  }, [tankId]);

  const parsed = useMemo(() => parseChart(paste), [paste]);

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.put(`/api/wet-stock/tanks/${tankId}/dip-chart`, {
          points: parsed.rows.map((r) => ({ dipMm: r.dipMm, litres: r.litres })),
        })
      ).data,
    onSuccess: (res: { count: number }) => {
      toast.success(`Chart saved — ${res.count} calibration points`);
      setPaste("");
      qc.invalidateQueries({ queryKey: ["wet-dip-chart", tankId] });
      qc.invalidateQueries({ queryKey: ["wet-dip-readings"] });
    },
    onError: (e) => toast.error(apiError(e, "Could not save the dip chart")),
  });

  const convert = useMutation({
    mutationFn: async () =>
      (
        await api.get(`/api/wet-stock/tanks/${tankId}/dip-to-volume`, {
          params: { dipMm: probeDip },
        })
      ).data,
    onSuccess: (res: { volumeMl: string; exact: boolean }) => {
      setProbe(`${formatLitres(res.volumeMl)} L${res.exact ? " (exact chart point)" : " (interpolated)"}`);
    },
    onError: (e) => {
      setProbe(null);
      toast.error(apiError(e, "Could not convert that dip"));
    },
  });

  const loadIntoBox = () => {
    const points = chartQ.data?.points ?? [];
    setPaste(points.map((p) => `${p.dipMm}\t${(Number(p.volumeMl) / 1000).toFixed(2)}`).join("\n"));
  };

  const chart = chartQ.data;
  const tank = tanks.find((t) => t.id === tankId);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Table2 className="h-4 w-4" /> Tank dip charts
          </CardTitle>
          <CardDescription>
            The calibration table from the OMC: dip in millimetres against volume in litres. Every
            dip reading and every decantation is measured through this chart.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {tanks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tanks yet. Add tanks in Settings first.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="c-tank">Tank</Label>
                <Select value={tankId || undefined} onValueChange={setTankId}>
                  <SelectTrigger id="c-tank" className="mt-1">
                    <SelectValue placeholder="Pick a tank" />
                  </SelectTrigger>
                  <SelectContent>
                    {tanks.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} · {FUEL_LABELS[t.fuelType] ?? t.fuelType}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {tank ? (
                <div className="flex items-end gap-2 text-sm text-muted-foreground">
                  Capacity {formatLitres(tank.capacityMl, 0)} L
                  {chart ? (
                    <Badge variant="outline">
                      {chart.points.length
                        ? `${chart.points.length} points (${chart.minDipMm}–${chart.maxDipMm} mm)`
                        : "no chart"}
                    </Badge>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      {!tankId ? null : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dip to volume</CardTitle>
              <CardDescription>
                Linear interpolation between the two nearest chart points.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <Label htmlFor="c-probe">Dip (mm)</Label>
                  <Input
                    id="c-probe"
                    inputMode="numeric"
                    value={probeDip}
                    onChange={(e) => setProbeDip(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={() => convert.mutate()}
                  disabled={convert.isPending || probeDip.trim() === ""}
                >
                  Convert
                </Button>
              </div>
              {probe ? <p className="mt-3 text-sm font-medium">{probe}</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Paste a calibration table</CardTitle>
              <CardDescription>
                Two columns per line — dip in mm, then litres. Tabs, commas or spaces all work, and
                a header row is ignored. Saving replaces the whole chart for this tank.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <textarea
                value={paste}
                disabled={!writable}
                onChange={(e) => setPaste(e.target.value)}
                rows={10}
                spellCheck={false}
                placeholder={"0\t0\n10\t42.5\n20\t95.0\n30\t152.8"}
                className="w-full rounded-md border border-input bg-background p-3 font-mono text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              />
              {parsed.errors.length ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                  {parsed.errors.slice(0, 6).map((e) => (
                    <div key={e}>{e}</div>
                  ))}
                  {parsed.errors.length > 6 ? (
                    <div>…and {parsed.errors.length - 6} more</div>
                  ) : null}
                </div>
              ) : null}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <span className="text-sm text-muted-foreground">
                  {parsed.rows.length} point{parsed.rows.length === 1 ? "" : "s"} parsed
                </span>
                <div className="flex-1" />
                <Button variant="outline" onClick={loadIntoBox} disabled={!chart?.points.length}>
                  <Wand2 className="mr-1 h-4 w-4" /> Load current chart to edit
                </Button>
                <Button
                  onClick={() => save.mutate()}
                  disabled={!writable || save.isPending || parsed.rows.length === 0}
                >
                  {save.isPending ? "Saving…" : "Replace chart"}
                </Button>
              </div>
              {!writable ? (
                <p className="text-xs text-muted-foreground">
                  You do not have permission to edit stock data.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Current chart</CardTitle>
            </CardHeader>
            <CardContent>
              {chartQ.isLoading ? (
                <p className="py-4 text-sm text-muted-foreground">Loading…</p>
              ) : chartQ.isError ? (
                <p className="py-4 text-sm text-destructive">
                  {apiError(chartQ.error, "Could not load the chart")}
                </p>
              ) : !chart?.points.length ? (
                <p className="py-4 text-sm text-muted-foreground">
                  No chart loaded for this tank yet. Dips can still be recorded, but the volume and
                  the wet-stock variance cannot be derived until a chart is pasted in.
                </p>
              ) : (
                <div className="max-h-96 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Dip (mm)</TableHead>
                        <TableHead className="text-right">Volume (L)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {chart.points.map((p) => (
                        <TableRow key={p.dipMm}>
                          <TableCell>{p.dipMm}</TableCell>
                          <TableCell className="text-right">{formatLitres(p.volumeMl)}</TableCell>
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

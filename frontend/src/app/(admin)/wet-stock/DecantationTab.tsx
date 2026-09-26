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
import { formatINR, formatLitres } from "@/lib/utils";
import { apiError, Employee } from "@/lib/types";
import { toast } from "sonner";
import { format, parseISO, subDays } from "date-fns";
import { AlertTriangle, Droplets, ShieldAlert, Truck } from "lucide-react";
import {
  DecantResponse,
  DecantRow,
  mlToLitreInput,
  numOrNull,
  litresToMlStr,
  signedLitres,
  signedPct,
  todayStr,
} from "./types";

const NO_EMPLOYEE = "NONE";
const SEAL_UNKNOWN = "UNKNOWN";

type Form = {
  invoiceLitres: string;
  dipBeforeMm: string;
  dipAfterMm: string;
  densityAtLoading: string;
  densityAtReceipt: string;
  temperatureC: string;
  sealIntact: string;
  decantedById: string;
  claimRaised: boolean;
  notes: string;
};

const toForm = (r: DecantRow): Form => ({
  invoiceLitres: mlToLitreInput(r.invoiceQtyMl ?? r.receivedMl),
  dipBeforeMm: r.dipBeforeMm === null ? "" : String(r.dipBeforeMm),
  dipAfterMm: r.dipAfterMm === null ? "" : String(r.dipAfterMm),
  densityAtLoading: r.densityAtLoading === null ? "" : String(r.densityAtLoading),
  densityAtReceipt: r.densityAtReceipt === null ? "" : String(r.densityAtReceipt),
  temperatureC: r.temperatureC === null ? "" : String(r.temperatureC),
  sealIntact: r.sealIntact === null ? SEAL_UNKNOWN : r.sealIntact ? "YES" : "NO",
  decantedById: r.decantedById ?? NO_EMPLOYEE,
  claimRaised: r.claimRaised,
  notes: r.notes ?? "",
});

export function DecantationTab() {
  const qc = useQueryClient();
  const writable = can("canEditTankerReceipts");

  const [range, setRange] = useState({
    from: subDays(new Date(), 29).toISOString().slice(0, 10),
    to: todayStr(),
  });
  const [draft, setDraft] = useState(range);
  const [editing, setEditing] = useState<DecantRow | null>(null);
  const [form, setForm] = useState<Form | null>(null);

  const { data, isLoading, isError, error } = useQuery<DecantResponse>({
    queryKey: ["wet-decantation", range],
    queryFn: async () =>
      (await api.get("/api/wet-stock/decantation", { params: range })).data,
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["employees"],
    queryFn: async () => (await api.get("/api/employees")).data,
  });

  useEffect(() => {
    setForm(editing ? toForm(editing) : null);
  }, [editing]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const save = useMutation({
    mutationFn: async () => {
      if (!editing || !form) throw new Error("Nothing to save");
      return (
        await api.patch(`/api/wet-stock/decantation/${editing.id}`, {
          invoiceQtyMl: litresToMlStr(form.invoiceLitres) ?? undefined,
          dipBeforeMm: form.dipBeforeMm.trim() === "" ? null : numOrNull(form.dipBeforeMm),
          dipAfterMm: form.dipAfterMm.trim() === "" ? null : numOrNull(form.dipAfterMm),
          densityAtLoading: numOrNull(form.densityAtLoading),
          densityAtReceipt: numOrNull(form.densityAtReceipt),
          temperatureC: numOrNull(form.temperatureC),
          sealIntact:
            form.sealIntact === SEAL_UNKNOWN ? null : form.sealIntact === "YES" ? true : false,
          decantedById: form.decantedById === NO_EMPLOYEE ? null : form.decantedById,
          claimRaised: form.claimRaised,
          notes: form.notes.trim() || null,
        })
      ).data;
    },
    onSuccess: (row: DecantRow) => {
      if (row.transitLossMl && Number(row.transitLossMl) > 0) {
        toast.success(
          `Saved — transit loss ${signedLitres(row.transitLossMl)} L${
            row.claimAmountPaise ? ` (${formatINR(row.claimAmountPaise)})` : ""
          }`,
        );
      } else {
        toast.success("Decantation record saved");
      }
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["wet-decantation"] });
      qc.invalidateQueries({ queryKey: ["wet-variance"] });
    },
    onError: (e) => toast.error(apiError(e, "Could not save the decantation record")),
  });

  const rows = data?.rows ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-4 w-4" /> Tanker decantation &amp; transit loss
          </CardTitle>
          <CardDescription>
            Dip the tank before and after decanting. The shortfall against the OMC invoice is the
            transit loss you can claim.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="d-from">From</Label>
              <Input
                id="d-from"
                type="date"
                value={draft.from}
                onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="d-to">To</Label>
              <Input
                id="d-to"
                type="date"
                value={draft.to}
                onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={() => setRange(draft)} className="w-full">
                Apply
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {isError ? (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">
            {apiError(error, "Could not load the tanker loads")}
          </CardContent>
        </Card>
      ) : isLoading ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">Loading…</CardContent>
        </Card>
      ) : (
        <>
          {data ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-xs text-muted-foreground">Loads</div>
                  <div className="text-2xl font-semibold">{data.totals.loads}</div>
                  <div className="text-xs text-muted-foreground">
                    {data.totals.decantedLoads} with dips recorded
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-xs text-muted-foreground">Total transit loss</div>
                  <div className="text-2xl font-semibold">
                    {formatLitres(data.totals.totalLossMl)} L
                  </div>
                  <div className="text-xs text-muted-foreground">
                    on {formatLitres(data.totals.totalInvoiceMl, 0)} L invoiced
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-xs text-muted-foreground">Claimable value</div>
                  <div className="text-2xl font-semibold">
                    {formatINR(data.totals.totalClaimPaise)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {data.totals.claimsRaised} claim(s) raised
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-xs text-muted-foreground">Needs attention</div>
                  <div className="text-2xl font-semibold">
                    {data.totals.brokenSeals + data.totals.flaggedLosses}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {data.totals.brokenSeals} broken seal(s), {data.totals.flaggedLosses} loss
                    {data.totals.flaggedLosses === 1 ? "" : "es"} over {data.claimFlagPct}%
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Loads received</CardTitle>
            </CardHeader>
            <CardContent>
              {rows.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">
                  No tanker loads in this range. Record receipts on the shift they arrived in, then
                  decant them here.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Received</TableHead>
                        <TableHead>Tank</TableHead>
                        <TableHead>Vendor / bill</TableHead>
                        <TableHead className="text-right">Invoice L</TableHead>
                        <TableHead className="text-right">By dip L</TableHead>
                        <TableHead className="text-right">Loss L</TableHead>
                        <TableHead className="text-right">Loss %</TableHead>
                        <TableHead className="text-right">Claim</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => (
                        <TableRow
                          key={r.id}
                          className={r.sealBroken || r.lossFlagged ? "bg-destructive/5" : undefined}
                        >
                          <TableCell className="whitespace-nowrap">
                            {format(parseISO(r.receivedAt), "dd MMM yyyy")}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{r.tank?.name ?? "—"}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            {r.vendorName || "—"}
                            {r.billNo ? (
                              <span className="ml-1 text-xs text-muted-foreground">
                                #{r.billNo}
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right">
                            {r.invoiceQtyMl === null ? "—" : formatLitres(r.invoiceQtyMl)}
                          </TableCell>
                          <TableCell className="text-right">
                            {r.receivedByDipMl === null ? "—" : formatLitres(r.receivedByDipMl)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {r.transitLossMl === null ? "—" : formatLitres(r.transitLossMl)}
                          </TableCell>
                          <TableCell className="text-right">{signedPct(r.lossPct)}</TableCell>
                          <TableCell className="text-right">
                            {r.claimAmountPaise === null ? "—" : formatINR(r.claimAmountPaise)}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {r.sealBroken ? (
                                <Badge variant="destructive" className="whitespace-nowrap">
                                  <ShieldAlert className="mr-1 h-3 w-3" /> Seal broken
                                </Badge>
                              ) : null}
                              {r.lossFlagged ? (
                                <Badge variant="destructive" className="whitespace-nowrap">
                                  <AlertTriangle className="mr-1 h-3 w-3" /> High loss
                                </Badge>
                              ) : null}
                              {r.claimRaised ? (
                                <Badge variant="warning">Claim raised</Badge>
                              ) : null}
                              {!r.decanted ? (
                                <Badge variant="outline" className="whitespace-nowrap">
                                  Not decanted
                                </Badge>
                              ) : !r.sealBroken && !r.lossFlagged ? (
                                <Badge variant="success">OK</Badge>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditing(r)}
                              disabled={!writable}
                            >
                              <Droplets className="mr-1 h-3.5 w-3.5" />
                              {r.decanted ? "Edit" : "Decant"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {!writable ? (
                <p className="pt-3 text-xs text-muted-foreground">
                  You do not have permission to edit tanker receipts.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Decantation record</DialogTitle>
            <DialogDescription>
              {editing
                ? `${editing.tank?.name ?? "Tank"} · ${editing.vendorName || "load"} · received ${format(
                    parseISO(editing.receivedAt),
                    "dd MMM yyyy",
                  )}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {form && editing ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="f-inv">Invoice qty (L)</Label>
                  <Input
                    id="f-inv"
                    inputMode="decimal"
                    value={form.invoiceLitres}
                    onChange={(e) => set("invoiceLitres", e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="f-temp">Temperature (°C)</Label>
                  <Input
                    id="f-temp"
                    inputMode="numeric"
                    value={form.temperatureC}
                    onChange={(e) => set("temperatureC", e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="f-dipb">Dip before (mm)</Label>
                  <Input
                    id="f-dipb"
                    inputMode="numeric"
                    value={form.dipBeforeMm}
                    onChange={(e) => set("dipBeforeMm", e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="f-dipa">Dip after (mm)</Label>
                  <Input
                    id="f-dipa"
                    inputMode="numeric"
                    value={form.dipAfterMm}
                    onChange={(e) => set("dipAfterMm", e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="f-dl">Density at loading</Label>
                  <Input
                    id="f-dl"
                    inputMode="numeric"
                    value={form.densityAtLoading}
                    onChange={(e) => set("densityAtLoading", e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="f-dr">Density at receipt</Label>
                  <Input
                    id="f-dr"
                    inputMode="numeric"
                    value={form.densityAtReceipt}
                    onChange={(e) => set("densityAtReceipt", e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="f-seal">Seals on arrival</Label>
                  <Select value={form.sealIntact} onValueChange={(v) => set("sealIntact", v)}>
                    <SelectTrigger id="f-seal" className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SEAL_UNKNOWN}>Not checked</SelectItem>
                      <SelectItem value="YES">Intact</SelectItem>
                      <SelectItem value="NO">Broken / tampered</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="f-by">Decanted by</Label>
                  <Select value={form.decantedById} onValueChange={(v) => set("decantedById", v)}>
                    <SelectTrigger id="f-by" className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_EMPLOYEE}>Not recorded</SelectItem>
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
                <Label htmlFor="f-notes">Notes</Label>
                <Input
                  id="f-notes"
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  placeholder="Seal numbers, driver, anything disputed"
                  className="mt-1"
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.claimRaised}
                  onChange={(e) => set("claimRaised", e.target.checked)}
                  className="h-4 w-4"
                />
                A transit-loss claim has been raised with the OMC
              </label>
              <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
                The dip-measured quantity, the transit loss and the claim value are computed from
                the tank&apos;s dip chart and this load&apos;s rate when you save. Without a dip
                chart for the tank, the dips are stored but the loss cannot be derived.
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button onClick={() => save.mutate()} disabled={save.isPending}>
                  {save.isPending ? "Saving…" : "Save record"}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

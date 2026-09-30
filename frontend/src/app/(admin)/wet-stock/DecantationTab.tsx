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
import { useT } from "@/lib/i18n";
import { useDateLocale } from "@/lib/i18n/core";
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
  const { t } = useT();
  const locale = useDateLocale();
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
      if (!editing || !form) throw new Error(t("wetstock.decant.nothingToSave", "Nothing to save"));
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
          row.claimAmountPaise
            ? t("wetstock.decant.savedWithClaim", "Saved — transit loss {litres} L ({amount})", {
                litres: signedLitres(row.transitLossMl),
                amount: formatINR(row.claimAmountPaise),
              })
            : t("wetstock.decant.savedWithLoss", "Saved — transit loss {litres} L", {
                litres: signedLitres(row.transitLossMl),
              }),
        );
      } else {
        toast.success(t("wetstock.decant.saved", "Decantation record saved"));
      }
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["wet-decantation"] });
      qc.invalidateQueries({ queryKey: ["wet-variance"] });
    },
    onError: (e) =>
      toast.error(
        apiError(e, t("wetstock.decant.saveFailed", "Could not save the decantation record")),
      ),
  });

  const rows = data?.rows ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-4 w-4" />{" "}
            {t("wetstock.decant.title", "Tanker decantation & transit loss")}
          </CardTitle>
          <CardDescription>
            {t(
              "wetstock.decant.desc",
              "Dip the tank before and after decanting. The shortfall against the OMC invoice is the transit loss you can claim."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="d-from">{t("common.from", "From")}</Label>
              <Input
                id="d-from"
                type="date"
                value={draft.from}
                onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="d-to">{t("common.to", "To")}</Label>
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
                {t("common.apply", "Apply")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {isError ? (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">
            {apiError(error, t("wetstock.decant.loadError", "Could not load the tanker loads"))}
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
                    {t("wetstock.decant.loads", "Loads")}
                  </div>
                  <div className="text-2xl font-semibold">{data.totals.loads}</div>
                  <div className="text-xs text-muted-foreground">
                    {t("wetstock.decant.loadsWithDips", "{count} with dips recorded", {
                      count: data.totals.decantedLoads,
                    })}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-xs text-muted-foreground">
                    {t("wetstock.decant.totalLoss", "Total transit loss")}
                  </div>
                  <div className="text-2xl font-semibold">
                    {formatLitres(data.totals.totalLossMl)} L
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("wetstock.decant.onInvoiced", "on {litres} L invoiced", {
                      litres: formatLitres(data.totals.totalInvoiceMl, 0),
                    })}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-xs text-muted-foreground">
                    {t("wetstock.decant.claimable", "Claimable value")}
                  </div>
                  <div className="text-2xl font-semibold">
                    {formatINR(data.totals.totalClaimPaise)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("wetstock.decant.claimsRaised", "{count} claim(s) raised", {
                      count: data.totals.claimsRaised,
                    })}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-xs text-muted-foreground">
                    {t("wetstock.decant.needsAttention", "Needs attention")}
                  </div>
                  <div className="text-2xl font-semibold">
                    {data.totals.brokenSeals + data.totals.flaggedLosses}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t(
                      "wetstock.decant.attentionDetail",
                      "{seals} broken seal(s), {losses} loss(es) over {pct}%",
                      {
                        seals: data.totals.brokenSeals,
                        losses: data.totals.flaggedLosses,
                        pct: data.claimFlagPct,
                      }
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t("wetstock.decant.loadsReceived", "Loads received")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {rows.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">
                  {t(
                    "wetstock.decant.empty",
                    "No tanker loads in this range. Record receipts on the shift they arrived in, then decant them here."
                  )}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("wetstock.decant.thReceived", "Received")}</TableHead>
                        <TableHead>{t("wetstock.var.tank", "Tank")}</TableHead>
                        <TableHead>{t("wetstock.decant.thVendorBill", "Vendor / bill")}</TableHead>
                        <TableHead className="text-right">
                          {t("wetstock.decant.thInvoiceL", "Invoice L")}
                        </TableHead>
                        <TableHead className="text-right">
                          {t("wetstock.decant.thByDipL", "By dip L")}
                        </TableHead>
                        <TableHead className="text-right">
                          {t("wetstock.decant.thLossL", "Loss L")}
                        </TableHead>
                        <TableHead className="text-right">
                          {t("wetstock.decant.thLossPct", "Loss %")}
                        </TableHead>
                        <TableHead className="text-right">
                          {t("wetstock.decant.thClaim", "Claim")}
                        </TableHead>
                        <TableHead>{t("common.status", "Status")}</TableHead>
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
                            {format(parseISO(r.receivedAt), "dd MMM yyyy", { locale })}
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
                                  <ShieldAlert className="mr-1 h-3 w-3" />{" "}
                                  {t("wetstock.decant.sealBroken", "Seal broken")}
                                </Badge>
                              ) : null}
                              {r.lossFlagged ? (
                                <Badge variant="destructive" className="whitespace-nowrap">
                                  <AlertTriangle className="mr-1 h-3 w-3" />{" "}
                                  {t("wetstock.decant.highLoss", "High loss")}
                                </Badge>
                              ) : null}
                              {r.claimRaised ? (
                                <Badge variant="warning">
                                  {t("wetstock.decant.claimRaisedBadge", "Claim raised")}
                                </Badge>
                              ) : null}
                              {!r.decanted ? (
                                <Badge variant="outline" className="whitespace-nowrap">
                                  {t("wetstock.decant.notDecanted", "Not decanted")}
                                </Badge>
                              ) : !r.sealBroken && !r.lossFlagged ? (
                                <Badge variant="success">{t("wetstock.decant.ok", "OK")}</Badge>
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
                              {r.decanted
                                ? t("common.edit", "Edit")
                                : t("wetstock.decant.decantBtn", "Decant")}
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
                  {t(
                    "wetstock.decant.noPermission",
                    "You do not have permission to edit tanker receipts."
                  )}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("wetstock.decant.dialogTitle", "Decantation record")}</DialogTitle>
            <DialogDescription>
              {editing
                ? `${editing.tank?.name ?? t("wetstock.decant.dialogTank", "Tank")} · ${
                    editing.vendorName || t("wetstock.decant.dialogLoad", "load")
                  } · ${t("wetstock.decant.dialogReceived", "received")} ${format(
                    parseISO(editing.receivedAt),
                    "dd MMM yyyy",
                    { locale },
                  )}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {form && editing ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="f-inv">{t("wetstock.decant.invoiceQty", "Invoice qty (L)")}</Label>
                  <Input
                    id="f-inv"
                    inputMode="decimal"
                    value={form.invoiceLitres}
                    onChange={(e) => set("invoiceLitres", e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="f-temp">
                    {t("wetstock.decant.temperature", "Temperature (°C)")}
                  </Label>
                  <Input
                    id="f-temp"
                    inputMode="numeric"
                    value={form.temperatureC}
                    onChange={(e) => set("temperatureC", e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="f-dipb">{t("wetstock.decant.dipBefore", "Dip before (mm)")}</Label>
                  <Input
                    id="f-dipb"
                    inputMode="numeric"
                    value={form.dipBeforeMm}
                    onChange={(e) => set("dipBeforeMm", e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="f-dipa">{t("wetstock.decant.dipAfter", "Dip after (mm)")}</Label>
                  <Input
                    id="f-dipa"
                    inputMode="numeric"
                    value={form.dipAfterMm}
                    onChange={(e) => set("dipAfterMm", e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="f-dl">
                    {t("wetstock.decant.densityLoading", "Density at loading")}
                  </Label>
                  <Input
                    id="f-dl"
                    inputMode="numeric"
                    value={form.densityAtLoading}
                    onChange={(e) => set("densityAtLoading", e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="f-dr">
                    {t("wetstock.decant.densityReceipt", "Density at receipt")}
                  </Label>
                  <Input
                    id="f-dr"
                    inputMode="numeric"
                    value={form.densityAtReceipt}
                    onChange={(e) => set("densityAtReceipt", e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="f-seal">{t("wetstock.decant.seals", "Seals on arrival")}</Label>
                  <Select value={form.sealIntact} onValueChange={(v) => set("sealIntact", v)}>
                    <SelectTrigger id="f-seal" className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SEAL_UNKNOWN}>
                        {t("wetstock.decant.sealNotChecked", "Not checked")}
                      </SelectItem>
                      <SelectItem value="YES">
                        {t("wetstock.decant.sealIntact", "Intact")}
                      </SelectItem>
                      <SelectItem value="NO">
                        {t("wetstock.decant.sealTampered", "Broken / tampered")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="f-by">{t("wetstock.decant.decantedBy", "Decanted by")}</Label>
                  <Select value={form.decantedById} onValueChange={(v) => set("decantedById", v)}>
                    <SelectTrigger id="f-by" className="mt-1">
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
              </div>
              <div>
                <Label htmlFor="f-notes">{t("common.notes", "Notes")}</Label>
                <Input
                  id="f-notes"
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  placeholder={t(
                    "wetstock.decant.notesPlaceholder",
                    "Seal numbers, driver, anything disputed"
                  )}
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
                {t(
                  "wetstock.decant.claimCheckbox",
                  "A transit-loss claim has been raised with the OMC"
                )}
              </label>
              <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
                {t(
                  "wetstock.decant.computedNote",
                  "The dip-measured quantity, the transit loss and the claim value are computed from the tank's dip chart and this load's rate when you save. Without a dip chart for the tank, the dips are stored but the loss cannot be derived."
                )}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={() => setEditing(null)}>
                  {t("common.cancel", "Cancel")}
                </Button>
                <Button onClick={() => save.mutate()} disabled={save.isPending}>
                  {save.isPending
                    ? t("common.saving", "Saving…")
                    : t("wetstock.decant.saveRecord", "Save record")}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

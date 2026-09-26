"use client";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, can } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { apiError } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { AlertTriangle, CalendarClock, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import {
  LICENCE_KIND_LABELS,
  LICENCE_KIND_ORDER,
  STATUS_STYLES,
  daysPhrase,
  type CalendarResponse,
  type Licence,
  type LicenceKind,
  type LicenceStatus,
} from "./types";

const ALL = "__all__";

const fmtDay = (iso: string | null): string =>
  iso ? format(parseISO(iso.slice(0, 10)), "dd MMM yyyy") : "—";

const emptyForm = {
  kind: "PESO_EXPLOSIVE" as LicenceKind,
  label: "",
  number: "",
  issuedBy: "",
  issuedOn: "",
  expiresOn: "",
  reminderDaysBefore: "30",
  documentRef: "",
  notes: "",
};

export default function LicenceRegister() {
  const qc = useQueryClient();
  const canManage = can("canManagePump");

  const [kindFilter, setKindFilter] = useState<string>(ALL);
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [withinDays, setWithinDays] = useState("90");

  const calendar = useQuery<CalendarResponse>({
    queryKey: ["compliance", "calendar", withinDays],
    queryFn: async () =>
      (await api.get(`/api/compliance/calendar?withinDays=${Number(withinDays) || 0}`)).data,
  });

  const licences = useQuery<Licence[]>({
    queryKey: ["compliance", "licences", kindFilter, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (kindFilter !== ALL) params.set("kind", kindFilter);
      if (statusFilter !== ALL) params.set("status", statusFilter);
      const qs = params.toString();
      return (await api.get(`/api/compliance/licences${qs ? `?${qs}` : ""}`)).data;
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["compliance"] });

  // ===== Add form =====
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const set = <K extends keyof typeof emptyForm>(k: K, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post("/api/compliance/licences", {
          kind: form.kind,
          label: form.label || undefined,
          number: form.number || undefined,
          issuedBy: form.issuedBy || undefined,
          issuedOn: form.issuedOn || undefined,
          expiresOn: form.expiresOn,
          reminderDaysBefore: Number(form.reminderDaysBefore) || 0,
          documentRef: form.documentRef || undefined,
          notes: form.notes || undefined,
        })
      ).data,
    onSuccess: () => {
      toast.success("Licence added to the register");
      setAddOpen(false);
      setForm(emptyForm);
      invalidate();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  // ===== Renew =====
  const [renewing, setRenewing] = useState<Licence | null>(null);
  const [renewExpiry, setRenewExpiry] = useState("");
  const [renewNumber, setRenewNumber] = useState("");
  const [renewIssuedOn, setRenewIssuedOn] = useState("");

  const openRenew = (licence: Licence) => {
    setRenewing(licence);
    setRenewExpiry("");
    setRenewNumber(licence.number ?? "");
    setRenewIssuedOn("");
  };

  const renew = useMutation({
    mutationFn: async () =>
      (
        await api.post(`/api/compliance/licences/${renewing!.id}/renew`, {
          expiresOn: renewExpiry,
          number: renewNumber || undefined,
          issuedOn: renewIssuedOn || undefined,
        })
      ).data,
    onSuccess: () => {
      toast.success("Renewed — the previous expiry is kept in the notes");
      setRenewing(null);
      invalidate();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const summary = calendar.data?.summary;
  const rows = licences.data ?? [];
  const attention = calendar.data?.items ?? [];

  const tiles = useMemo(
    () => [
      {
        key: "expired" as const,
        label: "Expired",
        value: summary?.expired ?? 0,
        icon: AlertTriangle,
        className: "border-red-200 bg-red-50 text-red-900",
      },
      {
        key: "expiringSoon" as const,
        label: "Expiring soon",
        value: summary?.expiringSoon ?? 0,
        icon: CalendarClock,
        className: "border-amber-200 bg-amber-50 text-amber-900",
      },
      {
        key: "valid" as const,
        label: "Valid",
        value: summary?.valid ?? 0,
        icon: ShieldCheck,
        className: "border-green-200 bg-green-50 text-green-900",
      },
    ],
    [summary]
  );

  return (
    <div className="space-y-6">
      {/* Summary tiles */}
      <div className="grid grid-cols-3 gap-3">
        {tiles.map((t) => (
          <div key={t.key} className={cn("rounded-lg border p-3 sm:p-4", t.className)}>
            <div className="flex items-center gap-2 text-xs sm:text-sm font-medium">
              <t.icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{t.label}</span>
            </div>
            <div className="text-2xl sm:text-3xl font-bold mt-1">
              {calendar.isLoading ? "—" : t.value}
            </div>
          </div>
        ))}
      </div>

      {/* Calendar window */}
      <Card>
        <CardHeader className="gap-2">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle>Compliance calendar</CardTitle>
              <CardDescription>
                Everything already expired, plus anything due by{" "}
                {calendar.data ? fmtDay(calendar.data.windowEnd) : "…"}. Nothing is emailed or
                texted — this screen is the reminder.
              </CardDescription>
            </div>
            <div className="w-32">
              <Label className="text-xs">Window (days)</Label>
              <Input
                type="number"
                min={0}
                max={3650}
                value={withinDays}
                onChange={(e) => setWithinDays(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {calendar.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : calendar.isError ? (
            <p className="text-sm text-destructive">{apiError(calendar.error)}</p>
          ) : attention.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {summary && summary.total === 0
                ? "No licences on the register yet. Add your PESO licence, stamping certificate and NOCs so nothing lapses."
                : "Nothing needs attention in this window. Every licence on the register is valid."}
            </p>
          ) : (
            <ul className="divide-y">
              {attention.map((l) => {
                const s = STATUS_STYLES[l.status];
                return (
                  <li
                    key={l.id}
                    className={cn(
                      "flex items-start justify-between gap-3 py-3 px-2 -mx-2 rounded",
                      s.row
                    )}
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{l.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {l.number ? `No. ${l.number} · ` : ""}
                        expires {fmtDay(l.expiresOn)} ({daysPhrase(l.daysRemaining)})
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={s.badge}>{s.label}</Badge>
                      {canManage && (
                        <Button size="sm" variant="outline" onClick={() => openRenew(l)}>
                          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Renew
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Register */}
      <Card>
        <CardHeader className="gap-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle>Licence register</CardTitle>
              <CardDescription>Every licence, certificate and NOC for this pump.</CardDescription>
            </div>
            {canManage && (
              <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-1" /> Add licence
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Add licence or certificate</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div>
                      <Label>Document type</Label>
                      <Select
                        value={form.kind}
                        onValueChange={(v) => set("kind", v as LicenceKind)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LICENCE_KIND_ORDER.map((k) => (
                            <SelectItem key={k} value={k}>
                              {LICENCE_KIND_LABELS[k]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="sm:col-span-2">
                        <Label>What it covers</Label>
                        <Input
                          value={form.label}
                          onChange={(e) => set("label", e.target.value)}
                          placeholder="Optional — e.g. DU-2 / tank 3 / the tanker"
                        />
                      </div>
                      <div>
                        <Label>Licence number</Label>
                        <Input
                          value={form.number}
                          onChange={(e) => set("number", e.target.value)}
                          placeholder="Optional"
                        />
                      </div>
                      <div>
                        <Label>Issued by</Label>
                        <Input
                          value={form.issuedBy}
                          onChange={(e) => set("issuedBy", e.target.value)}
                          placeholder="Optional — PESO, Legal Metrology…"
                        />
                      </div>
                      <div>
                        <Label>Issued on</Label>
                        <Input
                          type="date"
                          value={form.issuedOn}
                          onChange={(e) => set("issuedOn", e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Expires on</Label>
                        <Input
                          type="date"
                          value={form.expiresOn}
                          onChange={(e) => set("expiresOn", e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Warn me this many days before</Label>
                        <Input
                          type="number"
                          min={0}
                          max={365}
                          value={form.reminderDaysBefore}
                          onChange={(e) => set("reminderDaysBefore", e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Where the paper copy is</Label>
                        <Input
                          value={form.documentRef}
                          onChange={(e) => set("documentRef", e.target.value)}
                          placeholder="Optional — office file, drive link"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label>Notes</Label>
                        <Input
                          value={form.notes}
                          onChange={(e) => set("notes", e.target.value)}
                          placeholder="Optional"
                        />
                      </div>
                    </div>
                    <Button
                      className="w-full"
                      disabled={!form.expiresOn || create.isPending}
                      onClick={() => create.mutate()}
                    >
                      {create.isPending ? "Saving…" : "Add to register"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={kindFilter} onValueChange={setKindFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All types</SelectItem>
                  {LICENCE_KIND_ORDER.map((k) => (
                    <SelectItem key={k} value={k}>
                      {LICENCE_KIND_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  {(["EXPIRED", "EXPIRING_SOON", "VALID"] as LicenceStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_STYLES[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {licences.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : licences.isError ? (
            <p className="text-sm text-destructive">{apiError(licences.error)}</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {kindFilter === ALL && statusFilter === ALL
                ? "The register is empty. Add a licence to start the countdown."
                : "No licence matches these filters."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Document</TableHead>
                    <TableHead>Number</TableHead>
                    <TableHead>Issued</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="text-right">Days left</TableHead>
                    <TableHead>Status</TableHead>
                    {canManage && <TableHead className="text-right">Action</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((l) => {
                    const s = STATUS_STYLES[l.status];
                    return (
                      <TableRow key={l.id} className={s.row}>
                        <TableCell>
                          <div className="font-medium">{l.kindLabel}</div>
                          {l.label && (
                            <div className="text-xs text-muted-foreground">{l.label}</div>
                          )}
                          {l.issuedBy && (
                            <div className="text-xs text-muted-foreground">
                              Issued by {l.issuedBy}
                            </div>
                          )}
                          {l.notes && (
                            <div className="text-xs text-muted-foreground whitespace-pre-line mt-1">
                              {l.notes}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{l.number || "—"}</TableCell>
                        <TableCell className="text-sm">{fmtDay(l.issuedOn)}</TableCell>
                        <TableCell className="text-sm">{fmtDay(l.expiresOn)}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {l.daysRemaining}
                        </TableCell>
                        <TableCell>
                          <Badge variant={s.badge}>{s.label}</Badge>
                          <div className="text-xs text-muted-foreground mt-1">
                            {daysPhrase(l.daysRemaining)}
                          </div>
                        </TableCell>
                        {canManage && (
                          <TableCell className="text-right">
                            <Button size="sm" variant="outline" onClick={() => openRenew(l)}>
                              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Renew
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Renew dialog */}
      <Dialog open={Boolean(renewing)} onOpenChange={(o) => !o && setRenewing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renew {renewing?.kindLabel}</DialogTitle>
          </DialogHeader>
          {renewing && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Current expiry {fmtDay(renewing.expiresOn)}. The licence keeps one row in the
                register and the old expiry is written into its notes, so the renewal history stays
                readable.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <Label>New expiry date</Label>
                  <Input
                    type="date"
                    value={renewExpiry}
                    onChange={(e) => setRenewExpiry(e.target.value)}
                  />
                </div>
                <div>
                  <Label>New licence number</Label>
                  <Input
                    value={renewNumber}
                    onChange={(e) => setRenewNumber(e.target.value)}
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <Label>New issue date</Label>
                  <Input
                    type="date"
                    value={renewIssuedOn}
                    onChange={(e) => setRenewIssuedOn(e.target.value)}
                  />
                </div>
              </div>
              <Button
                className="w-full"
                disabled={!renewExpiry || renew.isPending}
                onClick={() => renew.mutate()}
              >
                {renew.isPending ? "Renewing…" : "Save renewal"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

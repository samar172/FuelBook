"use client";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { apiError } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { formatINR, rupeesToPaise } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { EmptyState, Loading, Money, StatTile, bigOf, daysAgoStr, isOwner, todayStr } from "./shared";
import { accountLabel, useBankAccounts } from "./deposits";

const ALL = "__all__";
const NONE = "__none__";

export type SettlementRow = {
  id: string;
  businessDate: string;
  expectedPaise: string;
  settledPaise: string;
  mdrPaise: string;
  differencePaise: string;
  settledOn: string | null;
  status: "EXPECTED" | "SETTLED" | "SHORT" | "DISPUTED";
  reference: string | null;
  notes: string | null;
  channel: { id: string; name: string; kind: string };
  bankAccount: { id: string; bankName: string; accountNoLast4: string; nickname: string | null } | null;
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  EXPECTED: "secondary",
  SETTLED: "default",
  SHORT: "destructive",
  DISPUTED: "destructive",
};

export function SettlementsSection() {
  const { t } = useT();
  const qc = useQueryClient();
  const owner = isOwner();

  const [from, setFrom] = useState(daysAgoStr(29));
  const [to, setTo] = useState(todayStr());
  const [status, setStatus] = useState(ALL);
  const [channelId, setChannelId] = useState(ALL);
  const [editing, setEditing] = useState<SettlementRow | null>(null);

  const channelsQ = useQuery<{ id: string; name: string; kind: string }[]>({
    queryKey: ["setup-payment-channels"],
    queryFn: async () => (await api.get("/api/setup/payment-channels")).data,
  });
  const nonCashChannels = (channelsQ.data ?? []).filter((c) => c.kind !== "CASH");

  const qs = useMemo(() => {
    const p = new URLSearchParams({ from, to });
    if (status !== ALL) p.set("status", status);
    if (channelId !== ALL) p.set("channelId", channelId);
    return p.toString();
  }, [from, to, status, channelId]);

  const settlementsQ = useQuery<{
    batches: SettlementRow[];
    summary: {
      count: number;
      expectedPaise: string;
      settledPaise: string;
      mdrPaise: string;
      unreconciledCount: number;
      unreconciledExpectedPaise: string;
      shortfallCount: number;
      shortfallPaise: string;
    };
  }>({
    queryKey: ["cash-settlements", qs],
    queryFn: async () => (await api.get(`/api/cash-bank/settlements?${qs}`)).data,
  });

  const build = useMutation({
    mutationFn: async () =>
      (await api.post(`/api/cash-bank/settlements/build?from=${from}&to=${to}`)).data,
    onSuccess: (d: { created: number; updated: number; removed: number; message?: string }) => {
      toast.success(
        d.message ??
          t("cash.settle.rebuilt", "Rebuilt: {created} new, {updated} updated, {removed} removed", {
            created: d.created,
            updated: d.updated,
            removed: d.removed,
          }),
      );
      qc.invalidateQueries({ queryKey: ["cash-settlements"] });
    },
    onError: (e) => toast.error(
        apiError(e, t("cash.settle.rebuildFailed", "Could not rebuild the expected settlements")),
      ),
  });

  const rows = settlementsQ.data?.batches ?? [];
  const summary = settlementsQ.data?.summary;

  return (
    <div className="space-y-4">
      {editing ? (
        <SettleDialog batch={editing} onClose={() => setEditing(null)} />
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle>{t("cash.settle.title", "Card & UPI settlement")}</CardTitle>
              <CardDescription>
                {t(
                  "cash.settle.desc",
                  "What the pump took on each channel against what the bank actually credited, net of MDR. This is where digital money quietly goes missing.",
                )}
              </CardDescription>
            </div>
            {owner ? (
              <Button variant="outline" onClick={() => build.mutate()} disabled={build.isPending}>
                <RefreshCw className="h-4 w-4 mr-1" />
                {build.isPending
                  ? t("cash.settle.rebuilding", "Rebuilding…")
                  : t("cash.settle.rebuild", "Rebuild expected")}
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <Label className="text-xs">{t("common.from", "From")}</Label>
              <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">{t("common.to", "To")}</Label>
              <Input
                type="date"
                value={to}
                min={from}
                max={todayStr()}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">{t("common.status", "Status")}</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t("cash.settle.all", "All")}</SelectItem>
                  <SelectItem value="EXPECTED">{t("cash.settle.status.EXPECTED", "Awaiting")}</SelectItem>
                  <SelectItem value="SETTLED">{t("cash.settle.status.SETTLED", "Settled")}</SelectItem>
                  <SelectItem value="SHORT">{t("cash.settle.status.SHORT", "Short")}</SelectItem>
                  <SelectItem value="DISPUTED">{t("cash.settle.status.DISPUTED", "Disputed")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t("cash.settle.channel", "Channel")}</Label>
              <Select value={channelId} onValueChange={setChannelId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t("cash.settle.allChannels", "All channels")}</SelectItem>
                  {nonCashChannels.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {summary ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatTile
                label={t("cash.settle.expected", "Expected")}
                value={formatINR(summary.expectedPaise)}
                hint={t("cash.settle.channelDays", "{n} channel-days", { n: summary.count })}
              />
              <StatTile
                label={t("cash.settle.credited", "Credited by bank")}
                value={formatINR(summary.settledPaise)}
                tone="good"
              />
              <StatTile
                label={t("cash.settle.mdr", "MDR paid")}
                value={formatINR(summary.mdrPaise)}
                hint={t("cash.settle.mdrHint", "Fee deducted")}
              />
              <StatTile
                label={t("cash.settle.short", "Short")}
                value={formatINR(summary.shortfallPaise)}
                hint={t("cash.settle.shortHint", "{shortCount} short · {openCount} still awaiting {openAmount}", {
                  shortCount: summary.shortfallCount,
                  openCount: summary.unreconciledCount,
                  openAmount: formatINR(summary.unreconciledExpectedPaise),
                })}
                tone={Number(summary.shortfallPaise) > 0 ? "danger" : "good"}
              />
            </div>
          ) : null}

          {settlementsQ.isLoading ? (
            <Loading />
          ) : settlementsQ.error ? (
            <EmptyState title={t("cash.settle.loadFailed", "Could not load settlements")} hint={apiError(settlementsQ.error)} />
          ) : rows.length === 0 ? (
            <EmptyState
              title={t("cash.settle.empty", "Nothing to reconcile in this range")}
              hint={
                owner
                  ? t(
                      "cash.settle.emptyOwner",
                      "Press Rebuild expected to pull the card and UPI collections from locked shifts.",
                    )
                  : t(
                      "cash.settle.emptyStaff",
                      "Ask the owner to rebuild the expected settlements for this range.",
                    )
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.date", "Date")}</TableHead>
                    <TableHead>{t("cash.settle.channel", "Channel")}</TableHead>
                    <TableHead className="text-right">{t("cash.settle.expected", "Expected")}</TableHead>
                    <TableHead className="text-right">{t("cash.settle.colCredited", "Credited")}</TableHead>
                    <TableHead className="text-right">MDR</TableHead>
                    <TableHead className="text-right">{t("cash.settle.colDifference", "Difference")}</TableHead>
                    <TableHead>{t("common.status", "Status")}</TableHead>
                    {owner ? <TableHead /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((b) => {
                    const short = b.status === "SHORT";
                    return (
                      <TableRow key={b.id} className={short ? "bg-destructive/5" : undefined}>
                        <TableCell className="whitespace-nowrap">
                          {b.businessDate.slice(0, 10)}
                          {b.settledOn ? (
                            <span className="block text-xs text-muted-foreground">
                              {t("cash.settle.creditedOn", "credited {date}", {
                                date: b.settledOn.slice(0, 10),
                              })}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {b.channel.name}
                          <span className="block text-xs text-muted-foreground">
                            {b.channel.kind}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatINR(b.expectedPaise)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatINR(b.settledPaise)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatINR(b.mdrPaise)}
                        </TableCell>
                        <TableCell className="text-right">
                          {short ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-destructive">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              <Money paise={b.differencePaise} />
                            </span>
                          ) : (
                            <Money paise={b.differencePaise} emphasise />
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[b.status]}>
                            {t(`cash.settle.status.${b.status}`, b.status === "EXPECTED" ? "Awaiting" : b.status)}
                          </Badge>
                        </TableCell>
                        {owner ? (
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => setEditing(b)}>
                              {t("cash.settle.recordBtn", "Record")}
                            </Button>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SettleDialog({ batch, onClose }: { batch: SettlementRow; onClose: () => void }) {
  const { t } = useT();
  const qc = useQueryClient();
  const accountsQ = useBankAccounts();
  const accounts = accountsQ.data ?? [];

  const rupees = (paise: string) => (Number(paise) / 100).toFixed(2);
  const [settled, setSettled] = useState(rupees(batch.settledPaise));
  const [mdr, setMdr] = useState(rupees(batch.mdrPaise));
  const [settledOn, setSettledOn] = useState(batch.settledOn?.slice(0, 10) ?? todayStr());
  const [bankAccountId, setBankAccountId] = useState(batch.bankAccount?.id ?? NONE);
  const [reference, setReference] = useState(batch.reference ?? "");
  const [dispute, setDispute] = useState(batch.status === "DISPUTED");

  useEffect(() => {
    setSettled(rupees(batch.settledPaise));
    setMdr(rupees(batch.mdrPaise));
  }, [batch.id, batch.settledPaise, batch.mdrPaise]);

  // The server recomputes this; shown live so the shortfall is obvious first.
  const liveDifference =
    BigInt(rupeesToPaise(settled || "0")) +
    BigInt(rupeesToPaise(mdr || "0")) -
    bigOf(batch.expectedPaise);

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.patch(`/api/cash-bank/settlements/${batch.id}`, {
          settledPaise: rupeesToPaise(settled || "0"),
          mdrPaise: rupeesToPaise(mdr || "0"),
          settledOn: settledOn || null,
          bankAccountId: bankAccountId === NONE ? null : bankAccountId,
          reference: reference.trim() || null,
          ...(dispute ? { status: "DISPUTED" } : {}),
        })
      ).data,
    onSuccess: () => {
      toast.success(t("cash.settle.saved", "Settlement recorded"));
      qc.invalidateQueries({ queryKey: ["cash-settlements"] });
      onClose();
    },
    onError: (e) => toast.error(apiError(e, t("cash.settle.saveFailed", "Could not record the settlement"))),
  });

  return (
    <Dialog open onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {batch.channel.name} · {batch.businessDate.slice(0, 10)}
          </DialogTitle>
          <DialogDescription>
            {t(
              "cash.settle.dialogDesc",
              "Expected {amount} on this day. Enter what the bank credited and the fee it deducted.",
              { amount: formatINR(batch.expectedPaise) },
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{t("cash.settle.creditedAmt", "Credited by bank (₹)")}</Label>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={settled}
                onChange={(e) => setSettled(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">{t("cash.settle.mdrAmt", "MDR / fee (₹)")}</Label>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={mdr}
                onChange={(e) => setMdr(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{t("cash.settle.creditedDate", "Credited on")}</Label>
              <Input
                type="date"
                value={settledOn}
                max={todayStr()}
                onChange={(e) => setSettledOn(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">{t("cash.settle.intoAccount", "Into account")}</Label>
              <Select value={bankAccountId} onValueChange={setBankAccountId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t("cash.settle.notRecorded", "Not recorded")}</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {accountLabel(a)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">{t("cash.settle.reference", "Reference (optional)")}</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>

          <div
            className={
              liveDifference === 0n
                ? "rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3"
                : "rounded-md border border-destructive/50 bg-destructive/5 p-3"
            }
          >
            <p className="text-sm">
              {t("cash.settle.diffLine", "Difference (credited + MDR − expected):")}{" "}
              <span className="font-semibold">
                <Money paise={liveDifference} />
              </span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {liveDifference === 0n
                ? t("cash.settle.diffZero", "Reconciles exactly — this will be marked SETTLED.")
                : liveDifference < 0n
                  ? t(
                      "cash.settle.diffShort",
                      "Money is missing — this will be marked SHORT. Chase the aggregator.",
                    )
                  : t(
                      "cash.settle.diffOver",
                      "More was credited than was taken — this will be marked DISPUTED.",
                    )}
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={dispute} onChange={(e) => setDispute(e.target.checked)} />
            {t("cash.settle.flagDispute", "Flag as disputed regardless of the numbers")}
          </label>

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={onClose}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? t("common.saving", "Saving…") : t("common.save", "Save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

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
        d.message ?? `Rebuilt: ${d.created} new, ${d.updated} updated, ${d.removed} removed`,
      );
      qc.invalidateQueries({ queryKey: ["cash-settlements"] });
    },
    onError: (e) => toast.error(apiError(e, "Could not rebuild the expected settlements")),
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
              <CardTitle>Card &amp; UPI settlement</CardTitle>
              <CardDescription>
                What the pump took on each channel against what the bank actually credited, net of
                MDR. This is where digital money quietly goes missing.
              </CardDescription>
            </div>
            {owner ? (
              <Button variant="outline" onClick={() => build.mutate()} disabled={build.isPending}>
                <RefreshCw className="h-4 w-4 mr-1" />
                {build.isPending ? "Rebuilding…" : "Rebuild expected"}
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <Label className="text-xs">From</Label>
              <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                value={to}
                min={from}
                max={todayStr()}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All</SelectItem>
                  <SelectItem value="EXPECTED">Awaiting</SelectItem>
                  <SelectItem value="SETTLED">Settled</SelectItem>
                  <SelectItem value="SHORT">Short</SelectItem>
                  <SelectItem value="DISPUTED">Disputed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Channel</Label>
              <Select value={channelId} onValueChange={setChannelId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All channels</SelectItem>
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
              <StatTile label="Expected" value={formatINR(summary.expectedPaise)} hint={`${summary.count} channel-days`} />
              <StatTile label="Credited by bank" value={formatINR(summary.settledPaise)} tone="good" />
              <StatTile label="MDR paid" value={formatINR(summary.mdrPaise)} hint="Fee deducted" />
              <StatTile
                label="Short"
                value={formatINR(summary.shortfallPaise)}
                hint={`${summary.shortfallCount} short · ${summary.unreconciledCount} still awaiting ${formatINR(summary.unreconciledExpectedPaise)}`}
                tone={Number(summary.shortfallPaise) > 0 ? "danger" : "good"}
              />
            </div>
          ) : null}

          {settlementsQ.isLoading ? (
            <Loading />
          ) : settlementsQ.error ? (
            <EmptyState title="Could not load settlements" hint={apiError(settlementsQ.error)} />
          ) : rows.length === 0 ? (
            <EmptyState
              title="Nothing to reconcile in this range"
              hint={
                owner
                  ? "Press Rebuild expected to pull the card and UPI collections from locked shifts."
                  : "Ask the owner to rebuild the expected settlements for this range."
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead className="text-right">Expected</TableHead>
                    <TableHead className="text-right">Credited</TableHead>
                    <TableHead className="text-right">MDR</TableHead>
                    <TableHead className="text-right">Difference</TableHead>
                    <TableHead>Status</TableHead>
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
                              credited {b.settledOn.slice(0, 10)}
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
                            {b.status === "EXPECTED" ? "AWAITING" : b.status}
                          </Badge>
                        </TableCell>
                        {owner ? (
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => setEditing(b)}>
                              Record
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
      toast.success("Settlement recorded");
      qc.invalidateQueries({ queryKey: ["cash-settlements"] });
      onClose();
    },
    onError: (e) => toast.error(apiError(e, "Could not record the settlement")),
  });

  return (
    <Dialog open onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {batch.channel.name} · {batch.businessDate.slice(0, 10)}
          </DialogTitle>
          <DialogDescription>
            Expected {formatINR(batch.expectedPaise)} on this day. Enter what the bank credited and
            the fee it deducted.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Credited by bank (₹)</Label>
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
              <Label className="text-xs">MDR / fee (₹)</Label>
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
              <Label className="text-xs">Credited on</Label>
              <Input
                type="date"
                value={settledOn}
                max={todayStr()}
                onChange={(e) => setSettledOn(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Into account</Label>
              <Select value={bankAccountId} onValueChange={setBankAccountId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not recorded</SelectItem>
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
            <Label className="text-xs">Reference (optional)</Label>
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
              Difference (credited + MDR − expected):{" "}
              <span className="font-semibold">
                <Money paise={liveDifference} />
              </span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {liveDifference === 0n
                ? "Reconciles exactly — this will be marked SETTLED."
                : liveDifference < 0n
                  ? "Money is missing — this will be marked SHORT. Chase the aggregator."
                  : "More was credited than was taken — this will be marked DISPUTED."}
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={dispute} onChange={(e) => setDispute(e.target.checked)} />
            Flag as disputed regardless of the numbers
          </label>

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

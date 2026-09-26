"use client";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, can } from "@/lib/api";
import { apiError } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { formatINR } from "@/lib/utils";
import { EmptyState, Loading, Money, StatTile, bigOf } from "./shared";
import { useEmployees } from "./movements";

// ₹ face value of every note and coin, in paise. Mirrors the server so the live
// total the counter shows matches what the server will store.
const DENOMS = [
  { key: "note500", label: "₹500", valuePaise: 50000n, kind: "note" },
  { key: "note200", label: "₹200", valuePaise: 20000n, kind: "note" },
  { key: "note100", label: "₹100", valuePaise: 10000n, kind: "note" },
  { key: "note50", label: "₹50", valuePaise: 5000n, kind: "note" },
  { key: "note20", label: "₹20", valuePaise: 2000n, kind: "note" },
  { key: "note10", label: "₹10", valuePaise: 1000n, kind: "note" },
  { key: "coin20", label: "₹20", valuePaise: 2000n, kind: "coin" },
  { key: "coin10", label: "₹10", valuePaise: 1000n, kind: "coin" },
  { key: "coin5", label: "₹5", valuePaise: 500n, kind: "coin" },
  { key: "coin2", label: "₹2", valuePaise: 200n, kind: "coin" },
  { key: "coin1", label: "₹1", valuePaise: 100n, kind: "coin" },
] as const;

type DenomKey = (typeof DENOMS)[number]["key"];
type Counts = Record<DenomKey, string>;

const EMPTY_COUNTS = DENOMS.reduce((acc, d) => {
  acc[d.key] = "";
  return acc;
}, {} as Counts);

const NONE = "__none__";

type Shift = { id: string; reportDate: string; shiftType: string; status: string };

type CountResponse = {
  shift: { id: string; status: string; closingCashPaise: string };
  count: Record<string, unknown> | null;
  counts: Record<DenomKey, number>;
  countedTotalPaise: string;
  expectedCashPaise: string;
  expectedSource: "HANDOVERS" | "CASH_COLLECTIONS";
  handedOverPaise: string;
  accountablePaise: string;
  cashCollectionsPaise: string;
  handoverCount: number;
  closingCashPaise: string;
  differencePaise: string;
  hasCount: boolean;
};

export function CashCountSection() {
  const qc = useQueryClient();
  const employeesQ = useEmployees();
  const employees = employeesQ.data ?? [];

  const shiftsQ = useQuery<Shift[]>({
    queryKey: ["cash-shifts"],
    queryFn: async () => (await api.get("/api/shifts")).data,
  });
  const shifts = shiftsQ.data ?? [];

  const [shiftId, setShiftId] = useState("");
  useEffect(() => {
    if (!shiftId && shifts.length > 0) setShiftId(shifts[0].id);
  }, [shifts, shiftId]);

  const countQ = useQuery<CountResponse>({
    queryKey: ["cash-count", shiftId],
    queryFn: async () =>
      (await api.get(`/api/cash-bank/shifts/${shiftId}/denomination-count`)).data,
    enabled: Boolean(shiftId),
  });

  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [countedById, setCountedById] = useState(NONE);
  const [notes, setNotes] = useState("");

  // Whenever a different shift is opened, load what was counted before.
  useEffect(() => {
    const data = countQ.data;
    if (!data) return;
    const next = { ...EMPTY_COUNTS };
    for (const d of DENOMS) {
      const n = Number(data.counts?.[d.key] ?? 0);
      next[d.key] = n ? String(n) : "";
    }
    setCounts(next);
    setCountedById((data.count?.countedById as string | null) ?? NONE);
    setNotes((data.count?.notes as string | null) ?? "");
  }, [countQ.data]);

  // Live total, in BigInt paise — the same sum the server recomputes on save.
  const liveTotalPaise = useMemo(
    () =>
      DENOMS.reduce(
        (sum, d) => sum + BigInt(Math.max(0, Math.trunc(Number(counts[d.key] || 0)))) * d.valuePaise,
        0n,
      ),
    [counts],
  );

  const expectedPaise = bigOf(countQ.data?.expectedCashPaise);
  const livePieces = DENOMS.reduce(
    (n, d) => n + Math.max(0, Math.trunc(Number(counts[d.key] || 0))),
    0,
  );
  const liveDifference = liveTotalPaise - expectedPaise;

  const save = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        countedById: countedById === NONE ? null : countedById,
        notes: notes.trim() || null,
      };
      for (const d of DENOMS) body[d.key] = Math.max(0, Math.trunc(Number(counts[d.key] || 0)));
      return (await api.put(`/api/cash-bank/shifts/${shiftId}/denomination-count`, body)).data;
    },
    onSuccess: () => {
      toast.success("Cash count saved");
      qc.invalidateQueries({ queryKey: ["cash-count", shiftId] });
    },
    onError: (e) => toast.error(apiError(e, "Could not save the count")),
  });

  const locked = countQ.data?.shift.status === "LOCKED";
  const editable = can("canEditCollections") && !locked;

  if (shiftsQ.isLoading) return <Loading label="Loading shifts…" />;
  if (shiftsQ.error)
    return <EmptyState title="Could not load shifts" hint={apiError(shiftsQ.error)} />;
  if (shifts.length === 0)
    return (
      <EmptyState
        title="No shift reports yet"
        hint="Create a shift report first — a note count belongs to a shift."
      />
    );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Physical note count</CardTitle>
          <CardDescription>
            Count the drawer note by note. The total is worked out for you and checked against what
            the shift says should be there.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Shift</Label>
              <Select value={shiftId} onValueChange={setShiftId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a shift" />
                </SelectTrigger>
                <SelectContent>
                  {shifts.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.reportDate.slice(0, 10)} · {s.shiftType} · {s.status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Counted by</Label>
              <Select value={countedById} onValueChange={setCountedById} disabled={!editable}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not recorded</SelectItem>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {countQ.isLoading ? (
            <Loading />
          ) : countQ.error ? (
            <EmptyState title="Could not load this shift's count" hint={apiError(countQ.error)} />
          ) : (
            <>
              {locked ? (
                <Badge variant="secondary">
                  This shift is locked — the count can no longer be changed
                </Badge>
              ) : null}

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatTile
                  label="Counted"
                  value={formatINR(liveTotalPaise)}
                  hint={`${livePieces} note${livePieces === 1 ? "" : "s"} / coin${livePieces === 1 ? "" : "s"}`}
                />
                <StatTile
                  label="Expected"
                  value={formatINR(expectedPaise)}
                  hint={
                    countQ.data?.expectedSource === "HANDOVERS"
                      ? `From ${countQ.data.handoverCount} hand-over${countQ.data.handoverCount === 1 ? "" : "s"}`
                      : "From cash collections (no hand-over recorded)"
                  }
                />
                <StatTile
                  label="Difference"
                  value={<Money paise={liveDifference} />}
                  hint={
                    liveDifference === 0n
                      ? "Tallies exactly"
                      : liveDifference < 0n
                        ? "Short — cash is missing"
                        : "Excess — more cash than accounted for"
                  }
                  tone={liveDifference === 0n ? "good" : liveDifference < 0n ? "danger" : "warn"}
                />
                <StatTile
                  label="Shift closing cash"
                  value={formatINR(countQ.data?.closingCashPaise ?? 0)}
                  hint="As computed on the shift report"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(["note", "coin"] as const).map((kind) => (
                  <div key={kind} className="rounded-md border p-3">
                    <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                      {kind === "note" ? "Notes" : "Coins"}
                    </p>
                    <div className="space-y-2">
                      {DENOMS.filter((d) => d.kind === kind).map((d) => {
                        const n = Math.max(0, Math.trunc(Number(counts[d.key] || 0)));
                        return (
                          <div key={d.key} className="flex items-center gap-2">
                            <span className="w-14 text-sm font-medium">{d.label}</span>
                            <Input
                              type="number"
                              min="0"
                              step="1"
                              inputMode="numeric"
                              value={counts[d.key]}
                              disabled={!editable}
                              placeholder="0"
                              onChange={(e) =>
                                setCounts((c) => ({ ...c, [d.key]: e.target.value }))
                              }
                              className="w-24"
                            />
                            <span className="text-sm text-muted-foreground tabular-nums ml-auto">
                              {formatINR(BigInt(n) * d.valuePaise)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <Label className="text-xs">Notes</Label>
                <Input
                  value={notes}
                  disabled={!editable}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. ₹500 short, attendant to bring tomorrow"
                />
              </div>

              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm text-muted-foreground">
                  {countQ.data?.hasCount
                    ? "A count is already saved for this shift; saving replaces it."
                    : "No count saved for this shift yet."}
                </p>
                <div className="flex gap-2">
                  {editable ? (
                    <Button
                      variant="outline"
                      onClick={() => setCounts(EMPTY_COUNTS)}
                      disabled={save.isPending}
                    >
                      Clear
                    </Button>
                  ) : null}
                  <Button onClick={() => save.mutate()} disabled={!editable || save.isPending}>
                    {save.isPending ? "Saving…" : "Save count"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

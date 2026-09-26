"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatINR, formatLitres } from "@/lib/utils";
import { apiError, Employee } from "@/lib/types";
import { toast } from "sonner";
import { format } from "date-fns";
import { AlertTriangle, BookLock, Wand2 } from "lucide-react";
import {
  CASH_MODE_HELP,
  CASH_MODE_LABELS,
  CashReconciliation,
  inputToPaise,
  paise,
  paiseToInput,
} from "@/lib/books";

type Draft = { amount: string; notes: string };

const NO_CASHIER = "NONE";

export function CashReconciliationTab({
  shift,
  disabled,
}: {
  shift: { id: string; status: string };
  disabled: boolean;
}) {
  const qc = useQueryClient();
  const shiftId = shift.id;

  const { data, isLoading } = useQuery<CashReconciliation>({
    queryKey: ["shift-cash-recon", shiftId],
    queryFn: async () => (await api.get(`/api/shifts/${shiftId}/cash-reconciliation`)).data,
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["employees"],
    queryFn: async () => (await api.get("/api/employees")).data,
  });

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  // Seed the inputs from what was already recorded, falling back to the cash the
  // attendant has already been credited with in the Collections tab.
  useEffect(() => {
    if (!data) return;
    const next: Record<string, Draft> = {};
    for (const r of data.rows) {
      next[r.employeeId] = {
        amount: paiseToInput(
          r.receivedCashPaise !== null ? r.receivedCashPaise : r.suggestedReceivedPaise,
        ),
        notes: r.notes ?? "",
      };
    }
    setDrafts(next);
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const handovers = (data?.rows ?? [])
        .filter((r) => (drafts[r.employeeId]?.amount ?? "") !== "")
        .map((r) => ({
          employeeId: r.employeeId,
          receivedCashPaise: inputToPaise(drafts[r.employeeId].amount),
          notes: drafts[r.employeeId].notes.trim() || null,
        }));
      return (await api.put(`/api/shifts/${shiftId}/cash-handovers`, { handovers })).data;
    },
    onSuccess: () => {
      toast.success("Cash handovers saved");
      qc.invalidateQueries({ queryKey: ["shift-cash-recon", shiftId] });
      qc.invalidateQueries({ queryKey: ["shift", shiftId] });
    },
    onError: (e) => toast.error(apiError(e, "Could not save the handovers")),
  });

  const setCashier = useMutation({
    mutationFn: async (cashierEmployeeId: string | null) =>
      (await api.put(`/api/shifts/${shiftId}/cashier`, { cashierEmployeeId })).data,
    onSuccess: () => {
      toast.success("Shift cashier updated");
      qc.invalidateQueries({ queryKey: ["shift-cash-recon", shiftId] });
      qc.invalidateQueries({ queryKey: ["shift", shiftId] });
    },
    onError: (e) => toast.error(apiError(e, "Could not set the cashier")),
  });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }
  if (!data) return null;

  const readOnly = disabled || data.status === "LOCKED";
  const rows = data.rows;

  const liveVariance = (expectedPaise: string, amount: string | undefined) => {
    if (amount === undefined || amount === "") return null;
    return Number(inputToPaise(amount)) - paise(expectedPaise);
  };

  const totalExpected = rows.reduce((s, r) => s + paise(r.expectedCashPaise), 0);
  const totalReceived = rows.reduce(
    (s, r) => s + Number(inputToPaise(drafts[r.employeeId]?.amount || "0")),
    0,
  );
  const totalVariance = rows.some((r) => (drafts[r.employeeId]?.amount ?? "") !== "")
    ? totalReceived - totalExpected
    : null;

  return (
    <div className="space-y-4">
      {/* Mode + ledger posting status */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary">{CASH_MODE_LABELS[data.mode]}</Badge>
                {data.ledgerPostedAt ? (
                  <Badge variant="success" className="gap-1">
                    <BookLock className="h-3 w-3" /> Posted to the books on{" "}
                    {format(new Date(data.ledgerPostedAt), "dd MMM yyyy, HH:mm")}
                  </Badge>
                ) : (
                  <Badge variant="outline">Not yet posted to the books</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1.5 max-w-2xl">
                {CASH_MODE_HELP[data.mode]} You can change this under Pump Setup.
              </p>
            </div>
            {data.mode === "POOLED_CASHIER" && (
              <div>
                <Label className="text-xs">Shift cashier</Label>
                <Select
                  value={data.cashierEmployeeId ?? NO_CASHIER}
                  onValueChange={(v) => setCashier.mutate(v === NO_CASHIER ? null : v)}
                  disabled={readOnly || setCashier.isPending}
                >
                  <SelectTrigger className="w-56 mt-1">
                    <SelectValue placeholder="Pick the cashier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_CASHIER}>Nobody assigned</SelectItem>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {readOnly && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2">
              This shift is {data.status.toLowerCase()} — the handover figures are frozen. Unlock
              the shift to change them; the ledger entries will be reversed and re-posted.
            </p>
          )}
        </CardContent>
      </Card>

      {paise(data.unattributedSalesPaise) > 0 && (
        <div className="flex items-start gap-2 rounded-md border-2 border-red-300 bg-red-50 p-3 text-sm">
          <AlertTriangle className="h-5 w-5 text-red-700 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold text-red-900">
              {formatINR(data.unattributedSalesPaise)} of fuel is nobody&apos;s responsibility
            </div>
            <div className="text-red-800">
              {data.mode === "POOLED_CASHIER" && !data.cashierEmployeeId
                ? "No shift cashier has been picked, so the whole shift's cash is unaccounted for. Pick the cashier above."
                : "Fuel was dispensed on nozzles with no attendant assigned, so that cash cannot be pinned on anyone. Assign the nozzles under the Employees tab."}
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Cash Reconciliation</CardTitle>
          <CardDescription>
            What each person should have handed over, against what they actually did. Expected
            cash = fuel they dispensed − credit they gave out − money that came in digitally.
            Expenses they paid out of the drawer are shown for context only and are{" "}
            <span className="font-medium">not</span> deducted — collections in FuelBook are
            recorded gross of expenses.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {rows.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center">
              <div className="font-medium">Nobody to reconcile yet</div>
              <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                {data.mode === "POOLED_CASHIER"
                  ? "Pick the shift cashier above and the whole shift's cash will be reconciled against them."
                  : "Assign attendants to nozzles under the Employees tab, and enter the meter readings — then each attendant's expected cash appears here."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Person</TableHead>
                    <TableHead className="text-right">Fuel dispensed</TableHead>
                    <TableHead className="text-right">Credit given</TableHead>
                    <TableHead className="text-right">Digital taken</TableHead>
                    <TableHead className="text-right">Expected cash</TableHead>
                    <TableHead className="text-right w-36">Cash handed over</TableHead>
                    <TableHead className="text-right">Short / Excess</TableHead>
                    <TableHead className="min-w-[10rem]">Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const draft = drafts[r.employeeId];
                    const variance = liveVariance(r.expectedCashPaise, draft?.amount);
                    return (
                      <TableRow key={r.employeeId}>
                        <TableCell>
                          <div className="font-medium">{r.employeeName}</div>
                          <div className="text-xs text-muted-foreground">
                            {r.nozzleCodes.length
                              ? `Nozzles ${r.nozzleCodes.join(", ")}`
                              : data.mode === "POOLED_CASHIER"
                                ? "Whole shift"
                                : "No nozzle assigned"}
                          </div>
                          {paise(r.expensesPaidPaise) > 0 && (
                            <div className="text-xs text-muted-foreground">
                              Paid {formatINR(r.expensesPaidPaise)} of expenses from the drawer
                              (not deducted)
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatINR(r.salesValuePaise)}
                          <div className="text-xs text-muted-foreground">
                            {formatLitres(r.salesQuantityMl)} L
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatINR(r.creditIssuedPaise)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatINR(r.nonCashCollectedPaise)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-medium">
                          {formatINR(r.expectedCashPaise)}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            inputMode="decimal"
                            className="text-right"
                            placeholder="Not recorded"
                            value={draft?.amount ?? ""}
                            disabled={readOnly}
                            onChange={(e) =>
                              setDrafts((d) => ({
                                ...d,
                                [r.employeeId]: {
                                  amount: e.target.value,
                                  notes: d[r.employeeId]?.notes ?? "",
                                },
                              }))
                            }
                          />
                          {!readOnly && (
                            <button
                              type="button"
                              className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                              onClick={() =>
                                setDrafts((d) => ({
                                  ...d,
                                  [r.employeeId]: {
                                    amount: paiseToInput(r.expectedCashPaise),
                                    notes: d[r.employeeId]?.notes ?? "",
                                  },
                                }))
                              }
                            >
                              <Wand2 className="h-3 w-3" /> Matched exactly
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {variance === null ? (
                            <span className="text-xs text-muted-foreground">Not recorded</span>
                          ) : variance === 0 ? (
                            <Badge variant="success">Tallies</Badge>
                          ) : variance < 0 ? (
                            <div>
                              <div className="font-mono font-medium text-red-700">
                                {formatINR(Math.abs(variance))}
                              </div>
                              <div className="text-[11px] text-red-700">
                                short — recoverable from them
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div className="font-mono font-medium text-green-700">
                                {formatINR(variance)}
                              </div>
                              <div className="text-[11px] text-green-700">excess in the drawer</div>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            placeholder="Optional"
                            maxLength={500}
                            value={draft?.notes ?? ""}
                            disabled={readOnly}
                            onChange={(e) =>
                              setDrafts((d) => ({
                                ...d,
                                [r.employeeId]: {
                                  amount: d[r.employeeId]?.amount ?? "",
                                  notes: e.target.value,
                                },
                              }))
                            }
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={4} className="font-semibold">
                      Total
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {formatINR(totalExpected)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {formatINR(totalReceived)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {totalVariance === null
                        ? "—"
                        : totalVariance === 0
                          ? "Tallies"
                          : `${totalVariance < 0 ? "Short " : "Excess "}${formatINR(
                              Math.abs(totalVariance),
                            )}`}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}

          {!readOnly && rows.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground max-w-xl">
                Saving records the whole set at once. Clear someone&apos;s amount to remove their
                handover record entirely. Shortages become money that person owes you (account
                1300) once the shift is locked.
              </p>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save handovers"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

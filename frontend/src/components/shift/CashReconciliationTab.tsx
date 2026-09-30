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
import { useT } from "@/lib/i18n";
import { useDateLocale } from "@/lib/i18n/core";
import { AlertTriangle, BookLock, Wand2 } from "lucide-react";
import {
  CASH_MODE_HELP,
  CASH_MODE_LABELS,
  CashReconciliation,
  CashReconRow,
  inputToPaise,
  paise,
  paiseToInput,
} from "@/lib/books";
import { CashDrop, CashDropsPanel, dropTimeLabel } from "./CashDropsPanel";

type Draft = { amount: string; notes: string };

// The reconciliation payload now carries the mid-shift drops as well.
type ReconRow = CashReconRow & {
  droppedMidShiftPaise: string;
  drops: Omit<CashDrop, "fromEmployee">[];
  remainingToHandOverPaise: string;
};

type Recon = Omit<CashReconciliation, "rows" | "totals"> & {
  rows: ReconRow[];
  totals: CashReconciliation["totals"] & {
    droppedMidShiftPaise: string;
    dropCount: number;
  };
};

const NO_CASHIER = "NONE";

export function CashReconciliationTab({
  shift,
  disabled,
}: {
  shift: { id: string; status: string; reportDate?: string };
  disabled: boolean;
}) {
  const { t } = useT();
  const locale = useDateLocale();
  const qc = useQueryClient();
  const shiftId = shift.id;

  const { data, isLoading } = useQuery<Recon>({
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
      toast.success(t("shift.handover.saved", "Cash handovers saved"));
      qc.invalidateQueries({ queryKey: ["shift-cash-recon", shiftId] });
      qc.invalidateQueries({ queryKey: ["shift", shiftId] });
    },
    onError: (e) => toast.error(apiError(e, t("shift.handover.saveFailed", "Could not save the handovers"))),
  });

  const setCashier = useMutation({
    mutationFn: async (cashierEmployeeId: string | null) =>
      (await api.put(`/api/shifts/${shiftId}/cashier`, { cashierEmployeeId })).data,
    onSuccess: () => {
      toast.success(t("shift.handover.cashierUpdated", "Shift cashier updated"));
      qc.invalidateQueries({ queryKey: ["shift-cash-recon", shiftId] });
      qc.invalidateQueries({ queryKey: ["shift", shiftId] });
    },
    onError: (e) => toast.error(apiError(e, t("shift.handover.cashierFailed", "Could not set the cashier"))),
  });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">{t("common.loading", "Loading…")}</div>;
  }
  if (!data) return null;

  const readOnly = disabled || data.status === "LOCKED";
  const rows = data.rows;

  const liveVariance = (expectedPaise: string, amount: string | undefined) => {
    if (amount === undefined || amount === "") return null;
    return Number(inputToPaise(amount)) - paise(expectedPaise);
  };

  const totalExpected = rows.reduce((s, r) => s + paise(r.expectedCashPaise), 0);
  const totalDropped = rows.reduce((s, r) => s + paise(r.droppedMidShiftPaise), 0);
  const totalRemaining = rows.reduce((s, r) => s + paise(r.remainingToHandOverPaise), 0);
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
                <Badge variant="secondary">{t(`cashmode.${data.mode}.label`, CASH_MODE_LABELS[data.mode])}</Badge>
                {data.ledgerPostedAt ? (
                  <Badge variant="success" className="gap-1">
                    <BookLock className="h-3 w-3" />{" "}
                    {t("shift.handover.postedOn", "Posted to the books on {when}", {
                      when: format(new Date(data.ledgerPostedAt), "dd MMM yyyy, HH:mm", { locale }),
                    })}
                  </Badge>
                ) : (
                  <Badge variant="outline">{t("shift.handover.notPosted", "Not yet posted to the books")}</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1.5 max-w-2xl">
                {t(`cashmode.${data.mode}.help`, CASH_MODE_HELP[data.mode])} {t("shift.handover.changeUnderSetup", "You can change this under Pump Setup.")}
              </p>
            </div>
            {data.mode === "POOLED_CASHIER" && (
              <div>
                <Label className="text-xs">{t("shift.handover.cashier", "Shift cashier")}</Label>
                <Select
                  value={data.cashierEmployeeId ?? NO_CASHIER}
                  onValueChange={(v) => setCashier.mutate(v === NO_CASHIER ? null : v)}
                  disabled={readOnly || setCashier.isPending}
                >
                  <SelectTrigger className="w-56 mt-1">
                    <SelectValue placeholder={t("shift.handover.pickCashier", "Pick the cashier")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_CASHIER}>{t("shift.handover.noCashier", "Nobody assigned")}</SelectItem>
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
              {t(
                "shift.handover.frozen",
                "This shift is {status} — the handover figures are frozen. Unlock the shift to change them; the ledger entries will be reversed and re-posted.",
                { status: t(`shift.status.${data.status}`, data.status.toLowerCase()) },
              )}
            </p>
          )}
        </CardContent>
      </Card>

      {paise(data.unattributedSalesPaise) > 0 && (
        <div className="flex items-start gap-2 rounded-md border-2 border-red-300 bg-red-50 p-3 text-sm">
          <AlertTriangle className="h-5 w-5 text-red-700 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold text-red-900">
              {t("shift.handover.nobodysResponsibility", "{amount} of fuel is nobody's responsibility", {
                amount: formatINR(data.unattributedSalesPaise),
              })}
            </div>
            <div className="text-red-800">
              {data.mode === "POOLED_CASHIER" && !data.cashierEmployeeId
                ? t(
                    "shift.handover.noCashierPicked",
                    "No shift cashier has been picked, so the whole shift's cash is unaccounted for. Pick the cashier above.",
                  )
                : t(
                    "shift.handover.noAttendant",
                    "Fuel was dispensed on nozzles with no attendant assigned, so that cash cannot be pinned on anyone. Assign the nozzles under the Employees tab.",
                  )}
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("shift.handover.title", "Cash Reconciliation")}</CardTitle>
          <CardDescription>
            {t(
              "shift.handover.descA",
              "What each person should have handed over, against what they actually did. Expected cash = fuel they dispensed − credit they gave out − money that came in digitally. Expenses they paid out of the drawer are shown for context only and are ",
            )}
            <span className="font-medium">{t("shift.handover.descNot", "not")}</span>
            {t(
              "shift.handover.descB",
              " deducted — collections in FuelBook are recorded gross of expenses. Cash they already handed in during the shift counts towards the same figure, so what is still outstanding is expected cash minus what was handed in mid-shift.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {rows.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center">
              <div className="font-medium">{t("shift.handover.emptyTitle", "Nobody to reconcile yet")}</div>
              <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                {data.mode === "POOLED_CASHIER"
                  ? t(
                      "shift.handover.emptyPooled",
                      "Pick the shift cashier above and the whole shift's cash will be reconciled against them.",
                    )
                  : t(
                      "shift.handover.emptyPerAttendant",
                      "Assign attendants to nozzles under the Employees tab, and enter the meter readings — then each attendant's expected cash appears here.",
                    )}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("shift.handover.person", "Person")}</TableHead>
                    <TableHead className="text-right">{t("shift.handover.fuelDispensed", "Fuel dispensed")}</TableHead>
                    <TableHead className="text-right">{t("shift.handover.creditGiven", "Credit given")}</TableHead>
                    <TableHead className="text-right">{t("shift.handover.digitalTaken", "Digital taken")}</TableHead>
                    <TableHead className="text-right">{t("shift.handover.expectedCash", "Expected cash")}</TableHead>
                    <TableHead className="text-right">{t("shift.handover.handedMidShift", "Handed in mid-shift")}</TableHead>
                    <TableHead className="text-right">{t("shift.handover.stillOutstanding", "Still outstanding")}</TableHead>
                    <TableHead className="text-right w-36">{t("shift.handover.cashHandedOver", "Cash handed over")}</TableHead>
                    <TableHead className="text-right">{t("shift.handover.shortExcess", "Short / Excess")}</TableHead>
                    <TableHead className="min-w-[10rem]">{t("common.notes", "Notes")}</TableHead>
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
                              ? t("shift.handover.nozzlesList", "Nozzles {codes}", { codes: r.nozzleCodes.join(", ") })
                              : data.mode === "POOLED_CASHIER"
                                ? t("shift.handover.wholeShift", "Whole shift")
                                : t("shift.handover.noNozzle", "No nozzle assigned")}
                          </div>
                          {paise(r.expensesPaidPaise) > 0 && (
                            <div className="text-xs text-muted-foreground">
                              {t("shift.handover.paidFromDrawer", "Paid {amount} of expenses from the drawer (not deducted)", {
                                amount: formatINR(r.expensesPaidPaise),
                              })}
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
                        <TableCell className="text-right font-mono">
                          {paise(r.droppedMidShiftPaise) > 0 ? (
                            <>
                              {formatINR(r.droppedMidShiftPaise)}
                              <div className="text-[11px] font-sans text-muted-foreground">
                                {t(
                                  r.drops.length === 1 ? "shift.handover.dropsOne" : "shift.handover.dropsMany",
                                  r.drops.length === 1 ? "{n} drop — {times}" : "{n} drops — {times}",
                                  {
                                    n: r.drops.length,
                                    times: r.drops
                                      .map((d) => dropTimeLabel(d.occurredAt, shift.reportDate, locale))
                                      .join(", "),
                                  },
                                )}
                              </div>
                            </>
                          ) : (
                            <span className="text-xs font-sans text-muted-foreground">{t("shift.handover.nothing", "Nothing")}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatINR(r.remainingToHandOverPaise)}
                          <div className="text-[11px] font-sans text-muted-foreground">
                            {t("shift.handover.stillToHandOver", "still to hand over")}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            inputMode="decimal"
                            className="text-right"
                            placeholder={t("shift.handover.notRecorded", "Not recorded")}
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
                              <Wand2 className="h-3 w-3" /> {t("shift.handover.matchedExactly", "Matched exactly")}
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {variance === null ? (
                            <span className="text-xs text-muted-foreground">{t("shift.handover.notRecorded", "Not recorded")}</span>
                          ) : variance === 0 ? (
                            <Badge variant="success">{t("shift.handover.tallies", "Tallies")}</Badge>
                          ) : variance < 0 ? (
                            <div>
                              <div className="font-mono font-medium text-red-700">
                                {formatINR(Math.abs(variance))}
                              </div>
                              <div className="text-[11px] text-red-700">
                                {t("shift.handover.shortRecoverable", "short — recoverable from them")}
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div className="font-mono font-medium text-green-700">
                                {formatINR(variance)}
                              </div>
                              <div className="text-[11px] text-green-700">{t("shift.handover.excessDrawer", "excess in the drawer")}</div>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            placeholder={t("common.optional", "Optional")}
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
                      {t("common.total", "Total")}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {formatINR(totalExpected)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {formatINR(totalDropped)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {formatINR(totalRemaining)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {formatINR(totalReceived)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {totalVariance === null
                        ? "—"
                        : totalVariance === 0
                          ? t("shift.handover.tallies", "Tallies")
                          : totalVariance < 0
                            ? t("shift.handover.totalShort", "Short {amount}", {
                                amount: formatINR(Math.abs(totalVariance)),
                              })
                            : t("shift.handover.totalExcess", "Excess {amount}", {
                                amount: formatINR(Math.abs(totalVariance)),
                              })}
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
                {t(
                  "shift.handover.saveNote",
                  "Saving records the whole set at once — the amount is seeded from what they have already handed in. Clear someone's amount to remove their handover record entirely. Shortages become money that person owes you (account 1300) once the shift is locked.",
                )}
              </p>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? t("common.saving", "Saving…") : t("shift.handover.save", "Save handovers")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <CashDropsPanel
        shiftId={shiftId}
        reportDate={shift.reportDate}
        readOnly={readOnly}
        employees={employees}
        attendants={rows.map((r) => ({ employeeId: r.employeeId, employeeName: r.employeeName }))}
        cashierEmployeeId={data.cashierEmployeeId}
      />
    </div>
  );
}

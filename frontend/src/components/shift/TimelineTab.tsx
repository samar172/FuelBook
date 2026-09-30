"use client";
import { useQuery } from "@tanstack/react-query";
import { format, isSameDay } from "date-fns";
import {
  AlertTriangle,
  BookCheck,
  BookX,
  Banknote,
  ClipboardCheck,
  Fuel,
  Lock,
  Receipt,
  UserCheck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatINR, formatLitres } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { useDateLocale } from "@/lib/i18n/core";

type Kind = "SHIFT" | "STAFF" | "SALE" | "MONEY" | "STOCK" | "EXPENSE" | "CHECK" | "BOOKS";

type TimelineEvent = {
  at: string;
  kind: Kind;
  code: string;
  actor: string | null;
  amountPaise?: string | number | null;
  quantityMl?: string | number | null;
  vars?: Record<string, string | number | null>;
};

type Timeline = {
  shift: {
    id: string;
    reportDate: string;
    shiftType: string;
    status: string;
    openedAt: string | null;
    submittedAt: string | null;
    lockedAt: string | null;
    ledgerPostedAt: string | null;
  };
  totals: {
    salesPaise: string | number;
    collectionsPaise: string | number;
    creditIssuedPaise: string | number;
    expensesPaise: string | number;
    discrepancyMl: string | number;
    discrepancyFlag: boolean;
  };
  firstEventAt: string | null;
  lastEventAt: string | null;
  eventCount: number;
  events: TimelineEvent[];
};

const KIND_STYLE: Record<Kind, { icon: LucideIcon; cls: string }> = {
  SHIFT: { icon: Lock, cls: "bg-slate-100 text-slate-700 border-slate-300" },
  STAFF: { icon: UserCheck, cls: "bg-sky-50 text-sky-700 border-sky-200" },
  SALE: { icon: Receipt, cls: "bg-violet-50 text-violet-700 border-violet-200" },
  MONEY: { icon: Banknote, cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  STOCK: { icon: Fuel, cls: "bg-amber-50 text-amber-700 border-amber-200" },
  EXPENSE: { icon: Wallet, cls: "bg-rose-50 text-rose-700 border-rose-200" },
  CHECK: { icon: ClipboardCheck, cls: "bg-teal-50 text-teal-700 border-teal-200" },
  BOOKS: { icon: BookCheck, cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
};

// English sentence per code. Hindi lives in dict/shift.ts under the same key, written
// as a whole sentence because the word order differs.
const SENTENCES: Record<string, string> = {
  "shift.opened": "{shiftType} shift opened",
  "shift.submitted": "Shift submitted",
  "shift.locked": "Shift locked",
  "shift.unlock": "Shift unlocked for editing",
  "shift.readings.save": "Nozzle readings saved ({count})",
  "shift.stock.save": "Stock saved ({count} tanks)",
  "shift.roster.save": "Employee roster saved ({count})",
  "shift.collections.save": "Collections saved ({count})",
  "shift.outstanding.save": "Outstanding received saved ({count})",
  "shift.expenses.save": "Expenses saved ({count})",
  "roster.assigned": "{name} assigned to {nozzle}",
  "attendance.signedIn": "{name} signed in",
  "attendance.markedIn": "{name} marked present",
  "attendance.markedOut": "{name} marked out",
  "tanker.received": "Tanker received into {tank} (bill {bill})",
  "credit.sold": "{fuel} on credit to {customer} ({vehicle})",
  "outstanding.received": "Payment received from {customer}",
  "cash.moved": "Cash moved: {from} → {to}{purpose}",
  "handover.recorded": "{name} handed over cash{variance}",
  "dip.recorded": "Dip in {tank}: {dipMm} mm",
  "measure.passed": "Measure check passed on {nozzle} ({varianceMl} ml)",
  "measure.failed": "Measure check FAILED on {nozzle} ({varianceMl} ml)",
  "cash.counted": "Cash counted",
  "books.posted": "Posted to the books: {narration}",
};

const PARTY_EN: Record<string, string> = {
  ATTENDANT: "attendant",
  CASHIER: "cashier",
  OFFICE_SAFE: "office safe",
  OWNER: "owner",
  BANK: "bank",
  VENDOR: "vendor",
  OTHER: "other",
};

function Time({ at, locale }: { at: string; locale: ReturnType<typeof useDateLocale> }) {
  return <>{format(new Date(at), "h:mm a", { locale })}</>;
}

export function TimelineTab({ shiftId }: { shiftId: string }) {
  const { t } = useT();
  const locale = useDateLocale();

  const { data, isLoading, isError } = useQuery<Timeline>({
    queryKey: ["shift-timeline", shiftId],
    queryFn: async () => (await api.get(`/api/shifts/${shiftId}/timeline`)).data,
  });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">{t("common.loading", "Loading…")}</div>;
  }
  if (isError || !data) {
    return (
      <div className="text-sm text-destructive">
        {t("shift.tl.loadFailed", "Could not load the timeline")}
      </div>
    );
  }

  const { shift, totals, events } = data;

  const sentence = (e: TimelineEvent): string => {
    const v: Record<string, string | number> = {};
    for (const [k, val] of Object.entries(e.vars ?? {})) v[k] = val ?? "";
    if (e.code === "shift.opened") {
      v.shiftType = t(`shift.type.${v.shiftType}`, String(v.shiftType));
    }
    if (typeof v.fuel === "string" && v.fuel) v.fuel = t(`shift.fuel.${v.fuel}`, v.fuel);
    if (e.code === "cash.moved") {
      const party = (p: unknown) => t(`shift.tl.party.${p}`, PARTY_EN[String(p)] ?? String(p ?? ""));
      v.from = party(v.from);
      v.to = v.toName ? String(v.toName) : party(v.to);
      v.purpose = v.purpose ? ` · ${v.purpose}` : "";
    }
    if (e.code === "handover.recorded") {
      const vp = Number(v.variancePaise ?? 0);
      v.variance =
        vp === 0
          ? ""
          : vp < 0
            ? ` · ${t("shift.tl.short", "short {amount}", { amount: formatINR(Math.abs(vp)) })}`
            : ` · ${t("shift.tl.excess", "excess {amount}", { amount: formatINR(vp) })}`;
    }
    return t(`shift.tl.${e.code}`, SENTENCES[e.code] ?? e.code, v);
  };

  const opened = shift.openedAt;
  const headerTimes: { label: string; at: string | null }[] = [
    { label: t("shift.tl.opened", "Opened"), at: opened },
    { label: t("shift.tl.submitted", "Submitted"), at: shift.submittedAt },
    { label: t("shift.tl.locked", "Locked"), at: shift.lockedAt },
  ];
  const stamp = (at: string) => format(new Date(at), "d MMM, h:mm a", { locale });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="grid grid-cols-3 gap-3">
            {headerTimes.map((h) => (
              <div key={h.label} className="min-w-0">
                <div className="text-xs text-muted-foreground">{h.label}</div>
                <div className="font-mono text-sm font-semibold">
                  {h.at ? stamp(h.at) : "—"}
                </div>
              </div>
            ))}
          </div>
          <div>
            {shift.ledgerPostedAt ? (
              <Badge variant="success" className="gap-1">
                <BookCheck className="h-3 w-3" />
                {t("shift.tl.posted", "Posted to the books {when}", { when: stamp(shift.ledgerPostedAt) })}
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1">
                <BookX className="h-3 w-3" />
                {t("shift.tl.notPosted", "Not yet posted to the books")}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Total label={t("shift.detail.statTotalSales", "Total Sales")} value={formatINR(totals.salesPaise)} />
        <Total label={t("shift.detail.statCollections", "Collections")} value={formatINR(totals.collectionsPaise)} />
        <Total label={t("shift.detail.statCreditIssued", "Credit Issued")} value={formatINR(totals.creditIssuedPaise)} />
        <Total label={t("shift.detail.statExpenses", "Expenses")} value={formatINR(totals.expensesPaise)} />
      </div>

      {totals.discrepancyFlag && (
        <div className="flex items-start gap-2 rounded-md border-2 border-amber-300 bg-amber-50 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div className="text-amber-900">
            <span className="font-semibold">
              {t("shift.tl.discrepancy", "Meter and stock do not match on this shift.")}
            </span>{" "}
            {t("shift.tl.discrepancyMl", "Difference: {litres} L. Check the Reconciliation tab.", {
              litres: formatLitres(totals.discrepancyMl),
            })}
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-2 sm:p-4">
          {events.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {t("shift.tl.empty", "Nothing has been recorded on this shift yet.")}
            </div>
          ) : (
            <ol className="relative">
              {events.map((e, i) => {
                const prev = events[i - 1];
                const at = new Date(e.at);
                const newDay = !prev || !isSameDay(new Date(prev.at), at);
                const newHour =
                  !newDay && prev && format(new Date(prev.at), "H") !== format(at, "H");
                const { icon: Icon, cls } = KIND_STYLE[e.kind] ?? KIND_STYLE.SHIFT;
                const hasAmt = e.amountPaise !== undefined && e.amountPaise !== null;
                const hasQty = e.quantityMl !== undefined && e.quantityMl !== null;
                const failed = e.code === "measure.failed";
                return (
                  <li key={`${e.at}-${e.code}-${i}`}>
                    {newDay && (
                      <div className="sticky top-0 z-10 -mx-1 bg-card/95 px-1 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {format(at, "EEE, d MMM", { locale })}
                      </div>
                    )}
                    <div
                      className={`flex gap-2 py-2 sm:gap-3 ${newHour ? "mt-1 border-t border-dashed pt-3" : ""}`}
                    >
                      <div className="w-[4.25rem] shrink-0 pt-1 text-right font-mono text-xs font-semibold tabular-nums sm:w-20 sm:text-sm">
                        <Time at={e.at} locale={locale} />
                      </div>
                      <span
                        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                          failed ? "border-red-300 bg-red-50 text-red-700" : cls
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm ${failed ? "font-semibold text-red-700" : ""}`}>
                          {sentence(e)}
                          {e.actor && (
                            <span className="text-muted-foreground"> — {e.actor}</span>
                          )}
                        </div>
                        {(hasAmt || hasQty) && (
                          <div className="mt-0.5 flex flex-wrap gap-x-3 font-mono text-xs text-muted-foreground">
                            {hasAmt && <span>{formatINR(e.amountPaise as string | number)}</span>}
                            {hasQty && <span>{formatLitres(e.quantityMl as string | number)} L</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-0.5 text-base font-semibold sm:text-lg">{value}</div>
      </CardContent>
    </Card>
  );
}

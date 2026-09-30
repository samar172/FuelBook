"use client";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatINR, FUEL_LABELS } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  ACCOUNT_PLAIN,
  ACCOUNT_TYPE_LABELS,
  AccountType,
  Range,
  SOURCE_LABELS,
  daysAgoStr,
  todayStr,
} from "@/lib/books";

type TFn = ReturnType<typeof useT>["t"];

// Translated display strings for the fixed chart of accounts. The constants in
// lib/books.ts stay as the English fallback; account names come from the API
// but are fixed system names, so they are looked up by code.
export const acctName = (t: TFn, code: string, fallback: string) =>
  t(`books.acct.${code}`, fallback);
export const acctPlain = (t: TFn, code: string) => {
  const en = ACCOUNT_PLAIN[code];
  return en ? t(`books.plain.${code}`, en) : "";
};
export const typeLabel = (t: TFn, type: AccountType) =>
  t(`books.type.${type}`, ACCOUNT_TYPE_LABELS[type] ?? type);
export const sourceLabel = (t: TFn, source: string) =>
  t(`books.source.${source}`, SOURCE_LABELS[source as keyof typeof SOURCE_LABELS] ?? source);
export const fuelLabel = (t: TFn, fuel: string) =>
  t(`books.fuel.${fuel}`, FUEL_LABELS[fuel] ?? fuel);

/**
 * From/To with 7d / 30d / 90d quick buttons — the same control the Reports page uses,
 * so the two sections feel like one app.
 */
export function DateRangeBar({
  range,
  onChange,
  children,
}: {
  range: Range;
  onChange: (r: Range) => void;
  children?: React.ReactNode;
}) {
  const { t } = useT();
  const [draft, setDraft] = useState<Range>(range);

  const quick = (days: number) => {
    const next = { from: daysAgoStr(days - 1), to: todayStr() };
    setDraft(next);
    onChange(next);
  };

  return (
    <Card>
      <CardContent className="p-4 flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs">{t("common.from", "From")}</Label>
          <Input
            type="date"
            value={draft.from}
            max={draft.to}
            onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
            className="w-40"
          />
        </div>
        <div>
          <Label className="text-xs">{t("common.to", "To")}</Label>
          <Input
            type="date"
            value={draft.to}
            min={draft.from}
            max={todayStr()}
            onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
            className="w-40"
          />
        </div>
        <Button onClick={() => onChange(draft)}>{t("common.apply", "Apply")}</Button>
        {children}
        <div className="flex gap-1 ml-auto">
          <Button size="sm" variant="outline" onClick={() => quick(7)}>
            {t("books.range.7d", "7d")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => quick(30)}>
            {t("books.range.30d", "30d")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => quick(90)}>
            {t("books.range.90d", "90d")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** A single "as on" date, for the point-in-time statements. */
export function AsOfBar({
  asOf,
  onChange,
  children,
}: {
  asOf: string;
  onChange: (d: string) => void;
  children?: React.ReactNode;
}) {
  const { t } = useT();
  const [draft, setDraft] = useState(asOf);
  return (
    <Card>
      <CardContent className="p-4 flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs">{t("books.asOn", "Balances as on")}</Label>
          <Input
            type="date"
            value={draft}
            max={todayStr()}
            onChange={(e) => setDraft(e.target.value)}
            className="w-40"
          />
        </div>
        <Button onClick={() => onChange(draft)}>{t("common.apply", "Apply")}</Button>
        {children}
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={() => {
            setDraft(todayStr());
            onChange(todayStr());
          }}
        >
          {t("common.today", "Today")}
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * The health signal for a trial balance or balance sheet. A ledger that does not
 * balance is an alarm, not a footnote, so this is loud and sits above the numbers.
 */
export function BalanceCheck({
  balanced,
  differencePaise,
  okTitle,
  okBody,
  badTitle,
}: {
  balanced: boolean | undefined;
  differencePaise: string | number | undefined;
  okTitle: string;
  okBody: string;
  badTitle: string;
}) {
  const { t } = useT();
  if (balanced === undefined) return null;
  // The amount is bold, so split the sentence around a marker to keep word order per language.
  const outBy = t("books.check.outBy", "Out by {amount}.", { amount: "\u0001" }).split("\u0001");
  if (balanced) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm">
        <CheckCircle2 className="h-4 w-4 text-green-700 mt-0.5 shrink-0" />
        <div>
          <div className="font-medium text-green-900">{okTitle}</div>
          <div className="text-green-800">{okBody}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 rounded-md border-2 border-red-300 bg-red-50 p-3 text-sm">
      <AlertTriangle className="h-5 w-5 text-red-700 mt-0.5 shrink-0" />
      <div>
        <div className="font-semibold text-red-900">{badTitle}</div>
        <div className="text-red-800">
          {outBy[0]}
          <span className="font-semibold">{formatINR(differencePaise ?? 0)}</span>
          {outBy[1]}{" "}
          {t(
            "books.check.badBody",
            "The books are not trustworthy until this is explained — nothing here is deleted, so the cause will be in the journal. Check the most recent entries and tell whoever maintains FuelBook.",
          )}
        </div>
      </div>
    </div>
  );
}

/** Dr / Cr chip, so which side a number sits on is never ambiguous. */
export function SideBadge({ side }: { side: "Dr" | "Cr" }) {
  const { t } = useT();
  return (
    <Badge variant={side === "Dr" ? "secondary" : "outline"} className="font-mono text-[10px]">
      {t(`books.side.${side}`, side)}
    </Badge>
  );
}

/** Empty-state block used whenever a statement has nothing to show yet. */
export function EmptyBooks({ title, body }: { title?: string; body?: string }) {
  const { t } = useT();
  return (
    <div className="rounded-md border border-dashed p-8 text-center">
      <div className="font-medium">{title ?? t("books.empty.title", "Nothing in the books yet")}</div>
      <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
        {body ??
          t(
            "books.empty.body",
            "Journal entries are written automatically when you lock a shift. Lock a shift report (or post a manual entry) and it will show up here.",
          )}
      </p>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "green" | "amber" | "red" | "primary";
}) {
  const cls =
    accent === "green"
      ? "text-green-700"
      : accent === "amber"
        ? "text-amber-700"
        : accent === "red"
          ? "text-red-700"
          : accent === "primary"
            ? "text-primary"
            : "";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-lg font-semibold mt-1 ${cls}`}>{value}</div>
        {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
      </CardContent>
    </Card>
  );
}

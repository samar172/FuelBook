"use client";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/utils";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Range, daysAgoStr, todayStr } from "@/lib/books";

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
          <Label className="text-xs">From</Label>
          <Input
            type="date"
            value={draft.from}
            max={draft.to}
            onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
            className="w-40"
          />
        </div>
        <div>
          <Label className="text-xs">To</Label>
          <Input
            type="date"
            value={draft.to}
            min={draft.from}
            max={todayStr()}
            onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
            className="w-40"
          />
        </div>
        <Button onClick={() => onChange(draft)}>Apply</Button>
        {children}
        <div className="flex gap-1 ml-auto">
          <Button size="sm" variant="outline" onClick={() => quick(7)}>
            7d
          </Button>
          <Button size="sm" variant="outline" onClick={() => quick(30)}>
            30d
          </Button>
          <Button size="sm" variant="outline" onClick={() => quick(90)}>
            90d
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
  const [draft, setDraft] = useState(asOf);
  return (
    <Card>
      <CardContent className="p-4 flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs">Balances as on</Label>
          <Input
            type="date"
            value={draft}
            max={todayStr()}
            onChange={(e) => setDraft(e.target.value)}
            className="w-40"
          />
        </div>
        <Button onClick={() => onChange(draft)}>Apply</Button>
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
          Today
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
  if (balanced === undefined) return null;
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
          Out by <span className="font-semibold">{formatINR(differencePaise ?? 0)}</span>. The
          books are not trustworthy until this is explained — nothing here is deleted, so the
          cause will be in the journal. Check the most recent entries and tell whoever
          maintains FuelBook.
        </div>
      </div>
    </div>
  );
}

/** Dr / Cr chip, so which side a number sits on is never ambiguous. */
export function SideBadge({ side }: { side: "Dr" | "Cr" }) {
  return (
    <Badge variant={side === "Dr" ? "secondary" : "outline"} className="font-mono text-[10px]">
      {side}
    </Badge>
  );
}

/** Empty-state block used whenever a statement has nothing to show yet. */
export function EmptyBooks({
  title = "Nothing in the books yet",
  body = "Journal entries are written automatically when you lock a shift. Lock a shift report (or post a manual entry) and it will show up here.",
}: {
  title?: string;
  body?: string;
}) {
  return (
    <div className="rounded-md border border-dashed p-8 text-center">
      <div className="font-medium">{title}</div>
      <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">{body}</p>
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

"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, ArrowRight, CheckCircle2, RotateCcw } from "lucide-react";

const STORAGE_KEY = "fuelbook.guide.firstShiftStep";

type WalkStep = {
  screen: string;
  title: string;
  href: string;
  linkLabel: string;
  enter: string[];
  tip?: string;
};

const STEPS: WalkStep[] = [
  {
    screen: "Pump Setup",
    title: "Check the pump is described correctly",
    href: "/settings/pump",
    linkLabel: "Open Pump Setup",
    enter: [
      "Pump name, address, city and state.",
      "Every underground tank, with the fuel it holds.",
      "Every nozzle, attached to the tank it draws from.",
      "Your payment channels — at least one marked CASH.",
      "Time slots, if you collect in blocks, each tagged Day or Night.",
    ],
    tip: "A tank with no nozzle can never show a sale, so check each tank has at least one.",
  },
  {
    screen: "Fuel Rates",
    title: "Put today's rate against every fuel",
    href: "/rates",
    linkLabel: "Open Fuel Rates",
    enter: ["The current selling rate for each fuel your tanks hold."],
    tip: "Litres times rate is the sale value. An unpriced fuel cannot be valued.",
  },
  {
    screen: "Expense Categories",
    title: "Name the heads you spend under",
    href: "/expenses",
    linkLabel: "Open Expense Categories",
    enter: ["Electricity, salary, tea, repairs, generator diesel — whatever you actually spend on."],
  },
  {
    screen: "Employees",
    title: "Add the staff who will work the shift",
    href: "/employees",
    linkLabel: "Open Employees",
    enter: ["Each attendant and cashier by name."],
    tip: "Sales and cash are pinned to the attendant on the nozzle, so the names must exist first.",
  },
  {
    screen: "Shift Reports",
    title: "Create the shift",
    href: "/shifts/new",
    linkLabel: "Create a shift",
    enter: ["The date.", "Day or Night."],
    tip: "Opening readings, tank stock, expense opening balances and the crew are filled in from the previous shift of the same type. For your very first shift, enter the opening readings yourself.",
  },
  {
    screen: "The shift — nozzles",
    title: "Set the crew and enter closing meter readings",
    href: "/shifts",
    linkLabel: "Open Shift Reports",
    enter: [
      "Who worked which nozzle — correct anything carried over.",
      "The closing reading on every nozzle at shift end.",
    ],
    tip: "Sales = closing − opening − test litres.",
  },
  {
    screen: "The shift — stock",
    title: "Record dips and any tanker load",
    href: "/shifts",
    linkLabel: "Open Shift Reports",
    enter: [
      "The dip reading for each tank, and the closing stock.",
      "Any tanker load received during the shift, and which tank it went into.",
    ],
  },
  {
    screen: "The shift — money in",
    title: "Enter collections and credit sales",
    href: "/shifts",
    linkLabel: "Open Shift Reports",
    enter: [
      "Collections split by payment channel, and by time slot if you use slots.",
      "Every credit sale, naming the customer and the vehicle.",
    ],
    tip: "Only slots tagged for this shift type appear here.",
  },
  {
    screen: "The shift — money out and testing",
    title: "Enter expenses and the nozzle tests",
    href: "/shifts",
    linkLabel: "Open Shift Reports",
    enter: [
      "Each expense, under one of your expense heads.",
      "The Weights & Measures test litres drawn on each nozzle.",
    ],
  },
  {
    screen: "The shift — cash",
    title: "Record cash drops and settle each attendant",
    href: "/shifts",
    linkLabel: "Open Shift Reports",
    enter: [
      "Any cash handed in during the shift — the time is recorded, and who took it.",
      "The cash each attendant finally hands over.",
    ],
    tip: "Expected cash = their nozzle sales − credit they gave − digital payments they took. Expenses they paid from the drawer are shown but not deducted. A shortfall becomes money they owe.",
  },
  {
    screen: "The shift — finish",
    title: "Submit, then Lock",
    href: "/shifts",
    linkLabel: "Open Shift Reports",
    enter: ["Submit to mark the shift complete.", "Lock to freeze it."],
    tip: "Locking updates customer balances and posts the shift to the ledger. Unlocking posts mirror entries; nothing is deleted.",
  },
  {
    screen: "Books and Reports",
    title: "See what the shift did to your accounts",
    href: "/books",
    linkLabel: "Open Books",
    enter: [
      "Trial balance, P&L and balance sheet in Books.",
      "Sales and expense analysis in Reports.",
    ],
    tip: "The ledger starts from your first locked shift. Bank deposits, staff advances and cash sent to the bank are posted on demand from Books — safe to run repeatedly.",
  },
];

const readStored = (): number => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return 0;
    const n = Number(raw);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(STEPS.length - 1, Math.trunc(n)));
  } catch {
    return 0;
  }
};

export default function FirstShiftWalkthrough() {
  // Start at 0 so the server and first client render agree, then restore.
  const [index, setIndex] = useState(0);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    setIndex(readStored());
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(index));
    } catch {
      // Storage unavailable (private window, blocked cookies) — the walkthrough
      // still works, it just will not resume next time.
    }
  }, [index, restored]);

  const step = STEPS[index];
  const isFirst = index === 0;
  const isLast = index === STEPS.length - 1;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Walk me through the first shift</CardTitle>
          <CardDescription>
            Twelve steps, in the order you will actually use the screens. Move through them at your
            own pace — this page remembers where you stopped.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">
                Step {index + 1} of {STEPS.length}
              </span>
              {index > 0 && (
                <Button size="sm" variant="ghost" onClick={() => setIndex(0)}>
                  <RotateCcw className="mr-1 h-3.5 w-3.5" /> Start over
                </Button>
              )}
            </div>
            <div className="h-2 overflow-hidden rounded bg-slate-100">
              <div
                className="h-full bg-slate-900"
                style={{ width: `${((index + 1) / STEPS.length) * 100}%` }}
              />
            </div>
          </div>

          <div className="rounded-md border p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{step.screen}</Badge>
              {isLast && <Badge variant="success">Last step</Badge>}
            </div>
            <div className="text-lg font-semibold leading-snug">{step.title}</div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                What to enter
              </div>
              <ul className="mt-1 space-y-1 text-sm">
                {step.enter.map((line) => (
                  <li key={line} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
            {step.tip && (
              <p className="rounded-md bg-slate-50 p-2.5 text-sm text-slate-700">{step.tip}</p>
            )}
            <Button asChild className="w-full sm:w-auto">
              <Link href={step.href}>
                {step.linkLabel} <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              disabled={isFirst}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
            >
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Button>
            <Button
              className="w-full sm:w-auto"
              disabled={isLast}
              onClick={() => setIndex((i) => Math.min(STEPS.length - 1, i + 1))}
            >
              Next <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>

          {isLast && (
            <p className="text-sm text-muted-foreground">
              That is the whole loop. Every shift after this one is the same, and most of it is
              already filled in for you.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All steps</CardTitle>
          <CardDescription>Jump straight to any step.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {STEPS.map((s, i) => (
            <button
              key={s.title}
              type="button"
              onClick={() => setIndex(i)}
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                i === index ? "bg-primary text-primary-foreground" : "hover:bg-slate-100"
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                  i === index ? "bg-white/20" : i < index ? "bg-green-100 text-green-900" : "bg-slate-100"
                }`}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate">{s.title}</span>
            </button>
          ))}
          <Separator className="my-2" />
          <p className="px-1 text-xs text-muted-foreground">
            Your place is kept in this browser only. If it cannot be saved, the walkthrough simply
            starts at step 1 each time.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

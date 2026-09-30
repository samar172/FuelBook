"use client";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, Circle, AlertTriangle, ArrowRight } from "lucide-react";
import type { OnboardingResponse, OnboardingStep } from "./types";
import { useT } from "@/lib/i18n";

// The checklist text comes from the API. It ships stable keys and the raw numbers
// alongside the English sentence, so it can be rendered in Hindi rather than
// translated after the fact.
function useStepText() {
  const { t } = useT();
  return {
    stepTitle: (s: OnboardingStep) => t(s.titleKey ?? "", s.title),
    stepWhy: (s: OnboardingStep) => t(s.whyKey ?? "", s.why),
    stepDetail: (s: OnboardingStep) =>
      s.detailKey ? t(s.detailKey, s.detail, s.detailVars ?? undefined) : s.detail,
  };
}

function StatusBadge({ status }: { status: OnboardingStep["status"] }) {
  const { t } = useT();
  if (status === "DONE") return <Badge variant="success">{t("guide.statusDone", "Done")}</Badge>;
  if (status === "ATTENTION") return <Badge variant="warning">{t("guide.statusAttention", "Needs a look")}</Badge>;
  return <Badge variant="secondary">{t("guide.statusTodo", "Not done")}</Badge>;
}

function StatusIcon({ status }: { status: OnboardingStep["status"] }) {
  if (status === "DONE")
    return <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" aria-hidden />;
  if (status === "ATTENTION")
    return <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />;
  return <Circle className="h-5 w-5 shrink-0 text-slate-300" aria-hidden />;
}

function StepRow({
  step,
  index,
  isNext,
}: {
  step: OnboardingStep;
  index: number;
  isNext: boolean;
}) {
  const { t } = useT();
  const { stepTitle, stepWhy, stepDetail } = useStepText();
  const tone =
    step.status === "ATTENTION"
      ? "border-amber-200 bg-amber-50"
      : step.status === "DONE"
        ? "border-slate-200 bg-white"
        : "border-slate-200 bg-white";
  return (
    <div
      className={`rounded-md border p-3 ${tone} ${isNext ? "ring-2 ring-primary ring-offset-1" : ""}`}
    >
      <div className="flex items-start gap-3">
        <StatusIcon status={step.status} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground font-mono">{index}.</span>
            <span className="font-medium">{stepTitle(step)}</span>
            <StatusBadge status={step.status} />
            {isNext && <Badge>{t("guide.doThisNext", "Do this next")}</Badge>}
            {!step.required && <Badge variant="outline">{t("guide.optional", "Optional")}</Badge>}
          </div>
          <p className="text-sm">{stepDetail(step)}</p>
          <p className="text-xs text-muted-foreground">{stepWhy(step)}</p>
        </div>
        <Button asChild size="sm" variant={isNext ? "default" : "outline"} className="shrink-0">
          <Link href={step.href}>
            {step.status === "DONE" ? t("guide.open", "Open") : t("guide.go", "Go")}
            <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

export default function SetupChecklist({ data }: { data: OnboardingResponse }) {
  const { t } = useT();
  const { stepTitle, stepWhy, stepDetail } = useStepText();
  const required = data.steps.filter((s) => s.required);
  const optional = data.steps.filter((s) => !s.required);
  const attention = data.steps.filter((s) => s.status === "ATTENTION");
  const optionalDone = optional.filter((s) => s.status === "DONE").length;
  const nextStep = data.steps.find((s) => s.id === data.nextStepId) || null;
  const pct = Math.max(0, Math.min(100, data.progress.percent));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {data.progress.allRequiredDone
              ? t("guide.pumpIsSetUp", "Your pump is set up")
              : t("guide.whereSetupStands", "Where your setup stands")}
          </CardTitle>
          <CardDescription>
            {t("guide.readFromYourData", "{pump} — this is read from your pump's own data, not a fixed list.", { pump: data.pump.name })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-2xl font-semibold">{pct}%</span>
              <span className="text-sm text-muted-foreground">
                {t("guide.neededDone", "{done} of {total} needed steps done", {
                  done: data.progress.requiredDone,
                  total: data.progress.requiredTotal,
                })}
                {optional.length > 0 &&
                  t("guide.optionalDone", " · {done} of {total} optional done", {
                    done: optionalDone,
                    total: optional.length,
                  })}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded bg-slate-100">
              <div
                className={`h-full ${data.progress.allRequiredDone ? "bg-green-600" : "bg-slate-900"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {data.progress.allRequiredDone ? (
            <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm">
              <div className="font-medium text-green-900">
                {t("guide.nothingPending", "Everything needed for a shift is in place. Nothing is pending.")}
              </div>
              <p className="mt-1 text-green-900/80">
                {data.readyForFirstShift
                  ? t("guide.goToShifts", "Go straight to Shift Reports and open the shift for today.")
                  : t("guide.openShiftsWhenReady", "Open Shift Reports when you are ready to record the next shift.")}
              </p>
              <Button asChild size="sm" className="mt-2">
                <Link href="/shifts/new">{t("guide.createAShift", "Create a shift")}</Link>
              </Button>
            </div>
          ) : nextStep ? (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("guide.nextStep", "Next step")}
              </div>
              <div className="mt-0.5 font-medium">{stepTitle(nextStep)}</div>
              <p className="mt-1">{stepDetail(nextStep)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{stepWhy(nextStep)}</p>
              <Button asChild size="sm" className="mt-2">
                <Link href={nextStep.href}>
                  {t("guide.openIt", "Open it")} <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          ) : null}

          {attention.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium text-amber-900">
                <AlertTriangle className="h-4 w-4" aria-hidden />
                {attention.length === 1
                  ? t("guide.onePartlyDone", "One step is partly done")
                  : t("guide.manyPartlyDone", "{count} steps are partly done", { count: attention.length })}
              </div>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-amber-900/90">
                {attention.map((s) => (
                  <li key={s.id}>
                    <span className="font-medium">{stepTitle(s)}:</span> {stepDetail(s)}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-amber-900/70">
                {t(
                  "guide.warningsNotFailures",
                  "These are warnings, not failures — the pump still works, but the numbers read better once they are fixed."
                )}
              </p>
            </div>
          )}

          <div className="text-xs text-muted-foreground">
            {t("guide.cashHandoverMode", "Cash handover mode:")}{" "}
            <span className="font-medium">
              {data.pump.cashHandoverMode === "POOLED_CASHIER"
                ? t("guide.cashModePooled", "Pooled cashier — attendants hand cash to one cashier")
                : t("guide.cashModePerAttendant", "Per attendant — each attendant settles their own cash")}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("guide.neededFirstShift", "Needed before your first shift")}</CardTitle>
          <CardDescription>
            {t("guide.neededFirstShiftDesc", "Without these a shift cannot be recorded properly.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {required.map((s, i) => (
            <StepRow
              key={s.id}
              step={s}
              index={i + 1}
              isNext={s.id === data.nextStepId}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("guide.worthDoingSoon", "Worth doing soon")}</CardTitle>
          <CardDescription>
            {t(
              "guide.worthDoingSoonDesc",
              "Optional. Skip any of these and the pump still runs — they simply give you better numbers."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {optional.map((s, i) => (
            <StepRow
              key={s.id}
              step={s}
              index={i + 1}
              isNext={s.id === data.nextStepId && data.progress.allRequiredDone}
            />
          ))}
        </CardContent>
      </Card>

      <Separator />
    </div>
  );
}

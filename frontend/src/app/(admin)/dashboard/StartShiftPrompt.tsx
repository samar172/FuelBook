"use client";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { api, can } from "@/lib/api";
import { apiError } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { useDateLocale } from "@/lib/i18n/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Current = {
  window: { reportDate: string; shiftType: "DAY" | "NIGHT"; startsAtMin: number };
  shift: { id: string } | null;
  exists: boolean;
  autoStartShift: boolean;
};

// Shown only while the shift that should be running has not been started.
export default function StartShiftPrompt() {
  const { t } = useT();
  const dateLocale = useDateLocale();
  const qc = useQueryClient();
  const canCreate = can("canCreateShift");

  const cur = useQuery<Current>({
    queryKey: ["shifts-current"],
    queryFn: async () => (await api.get("/api/shifts/current")).data,
    refetchInterval: 60000,
  });

  const start = useMutation({
    mutationFn: async () =>
      (await api.post("/api/shifts/ensure-current")).data as { shift: { id: string } },
    onSuccess: () => {
      toast.success(t("compliance.shiftPrompt.started", "Shift started"));
      qc.invalidateQueries({ queryKey: ["shifts-current"] });
      qc.invalidateQueries({ queryKey: ["dashboard-today"] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const d = cur.data;
  if (!d || d.exists) return null;

  const shiftName =
    d.window.shiftType === "NIGHT"
      ? t("compliance.att.nightShift", "Night shift")
      : t("compliance.att.dayShift", "Day shift");
  const dateLabel = format(parseISO(d.window.reportDate.slice(0, 10)), "EEE, d MMM", { locale: dateLocale });
  const startedId = start.data?.shift?.id;

  return (
    <Card className="border-amber-300">
      <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="font-medium">
            {t("compliance.shiftPrompt.notStarted", "{shift} for {date} has not been started", {
              shift: shiftName,
              date: dateLabel,
            })}
          </div>
          {d.autoStartShift && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {t(
                "compliance.shiftPrompt.autoNote",
                "It will also open by itself when someone signs in."
              )}
            </p>
          )}
        </div>
        {startedId ? (
          <Link href={`/shifts/${startedId}`}>
            <Button variant="outline">{t("compliance.shiftPrompt.open", "Open the shift")}</Button>
          </Link>
        ) : (
          canCreate && (
            <Button onClick={() => start.mutate()} disabled={start.isPending}>
              <PlayCircle className="h-4 w-4 mr-1" />
              {start.isPending
                ? t("compliance.shiftPrompt.starting", "Starting…")
                : t("compliance.shiftPrompt.startNow", "Start it now")}
            </Button>
          )
        )}
      </CardContent>
    </Card>
  );
}

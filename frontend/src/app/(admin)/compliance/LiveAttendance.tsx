"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { LogIn, LogOut, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { api, can } from "@/lib/api";
import { apiError } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { useDateLocale } from "@/lib/i18n/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ATTENDANCE_LABELS, type AttendanceStatus, type ShiftType } from "./types";

type LiveStaff = {
  id: string;
  name: string;
  code: string | null;
  designation: string | null;
  attendanceId: string | null;
  status: AttendanceStatus | null;
  source: "MANUAL" | "LOGIN" | "ROSTER" | null;
  checkInAt: string | null;
  checkOutAt: string | null;
};

type LiveResponse = {
  attendanceDate: string;
  shiftType: ShiftType;
  shift: { id: string } | null;
  autoMarkAttendance: boolean;
  staff: LiveStaff[];
};

const SOURCE_EN = {
  MANUAL: "Marked by a person",
  LOGIN: "From their sign-in",
  ROSTER: "From the roster",
} as const;

export default function LiveAttendance() {
  const { t } = useT();
  const dateLocale = useDateLocale();
  const qc = useQueryClient();
  const canManage = can("canManageEmployees");
  const [busy, setBusy] = useState<string | null>(null);

  const live = useQuery<LiveResponse>({
    queryKey: ["compliance", "attendance-current"],
    queryFn: async () => (await api.get("/api/compliance/attendance/current")).data,
    refetchInterval: 30000,
  });

  const act = useMutation({
    mutationFn: async (v: { kind: "in" | "out"; ids: string[] }) => {
      setBusy(v.ids.length === 1 ? v.ids[0] : "*");
      return (
        await api.post(`/api/compliance/attendance/mark-${v.kind}`, {
          employeeIds: v.ids,
          shiftReportId: live.data?.shift?.id,
        })
      ).data;
    },
    onSuccess: (_r, v) => {
      toast.success(
        v.kind === "in"
          ? t("compliance.live.markedIn", "Marked in")
          : t("compliance.live.markedOut", "Marked out")
      );
      qc.invalidateQueries({ queryKey: ["compliance"] });
    },
    onError: (e) => toast.error(apiError(e)),
    onSettled: () => setBusy(null),
  });

  const d = live.data;
  const shiftName = d
    ? d.shiftType === "NIGHT"
      ? t("compliance.att.nightShift", "Night shift")
      : t("compliance.att.dayShift", "Day shift")
    : "";
  const dateLabel = d ? format(parseISO(d.attendanceDate.slice(0, 10)), "EEE, d MMM yyyy", { locale: dateLocale }) : "";
  const timeOf = (iso: string) => format(new Date(iso), "p", { locale: dateLocale });
  const sourceLabel = (s: NonNullable<LiveStaff["source"]>) =>
    t(`compliance.live.source.${s}`, SOURCE_EN[s]);

  const unmarked = (d?.staff ?? []).filter((s) => !s.status);
  const inCount = (d?.staff ?? []).filter((s) => s.status === "PRESENT" || s.status === "HALF_DAY").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCheck className="h-5 w-5" />
          {t("compliance.live.title", "Who's in now")}
        </CardTitle>
        <CardDescription>
          {d ? (
            <span className="font-medium text-foreground">
              {t("compliance.live.forShift", "Marks below are for: {shift}, {date}", {
                shift: shiftName,
                date: dateLabel,
              })}
            </span>
          ) : (
            t("compliance.live.loading", "Loading…")
          )}
          <span className="block mt-1">
            {t(
              "compliance.live.rule",
              "A mark made by a person always wins. If someone is marked absent or half day, signing in will not change it."
            )}
            {d?.autoMarkAttendance
              ? " " + t("compliance.live.autoOn", "Sign-ins also mark staff present automatically.")
              : ""}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {live.isError ? (
          <p className="text-sm text-destructive">{apiError(live.error)}</p>
        ) : !d ? null : d.staff.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("compliance.att.noStaff", "No active employees yet. Add staff under Employees first.")}
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">
                {t("compliance.live.count", "{in} of {total} in", { in: inCount, total: d.staff.length })}
              </span>
              {canManage && unmarked.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={act.isPending}
                  onClick={() => act.mutate({ kind: "in", ids: unmarked.map((s) => s.id) })}
                >
                  <LogIn className="h-4 w-4 mr-1" />
                  {t("compliance.live.markAllIn", "Mark all {n} unmarked in", { n: unmarked.length })}
                </Button>
              )}
            </div>
            <ul className="space-y-2">
              {d.staff.map((s) => {
                const canOut =
                  (s.status === "PRESENT" || s.status === "HALF_DAY") && s.checkInAt && !s.checkOutAt;
                const rowBusy = busy === s.id || busy === "*";
                return (
                  <li key={s.id} className="rounded-lg border p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{s.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {s.code ? `${s.code} · ` : ""}
                        {s.designation ?? ""}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                        {s.status ? (
                          <>
                            <Badge variant={s.status === "PRESENT" ? "success" : "secondary"}>
                              {t(`compliance.att.${s.status}`, ATTENDANCE_LABELS[s.status])}
                            </Badge>
                            {s.checkInAt && (
                              <span>
                                {t("compliance.live.inAt", "In {time}", { time: timeOf(s.checkInAt) })}
                              </span>
                            )}
                            {s.checkOutAt && (
                              <span>
                                {t("compliance.live.outAt", "Out {time}", { time: timeOf(s.checkOutAt) })}
                              </span>
                            )}
                            {s.source && (
                              <span className="text-muted-foreground">· {sourceLabel(s.source)}</span>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground">
                            {t("compliance.live.notMarked", "Not marked yet")}
                          </span>
                        )}
                      </div>
                    </div>
                    {canManage && (!s.status || canOut) && (
                      <Button
                        className="h-12 min-w-[6.5rem] shrink-0"
                        variant={s.status ? "outline" : "default"}
                        disabled={act.isPending}
                        onClick={() => act.mutate({ kind: s.status ? "out" : "in", ids: [s.id] })}
                      >
                        {s.status ? <LogOut className="h-4 w-4 mr-1" /> : <LogIn className="h-4 w-4 mr-1" />}
                        {rowBusy
                          ? "…"
                          : s.status
                          ? t("compliance.live.markOut", "Mark out")
                          : t("compliance.live.markIn", "Mark in")}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

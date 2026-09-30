"use client";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, can } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiError, type Employee } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";
import { CheckCheck, Save } from "lucide-react";
import { useT } from "@/lib/i18n";
import LiveAttendance from "./LiveAttendance";
import {
  ATTENDANCE_CELL_CLASS,
  ATTENDANCE_LABELS,
  ATTENDANCE_SHORT,
  type AttendanceRow,
  type AttendanceStatus,
  type RegisterResponse,
} from "./types";

const WHOLE_DAY = "__day__";
const STATUSES: AttendanceStatus[] = ["PRESENT", "ABSENT", "HALF_DAY", "LEAVE", "WEEKLY_OFF"];

type Draft = { status: AttendanceStatus; overtimeMinutes: string };

export default function AttendanceSection() {
  const qc = useQueryClient();
  const canManage = can("canManageEmployees");
  const { t } = useT();
  const attName = (s: AttendanceStatus) => t(`compliance.att.${s}`, ATTENDANCE_LABELS[s]);
  const attShort = (s: AttendanceStatus) => t(`compliance.attShort.${s}`, ATTENDANCE_SHORT[s]);

  const today = format(new Date(), "yyyy-MM-dd");
  const [date, setDate] = useState(today);
  const [shift, setShift] = useState<string>(WHOLE_DAY);
  const [month, setMonth] = useState(today.slice(0, 7));

  const employees = useQuery<Employee[]>({
    queryKey: ["employees", false],
    queryFn: async () => (await api.get("/api/employees")).data,
  });

  // Rows already marked for this date, so re-opening the marker shows the truth
  // instead of a blank slate.
  const existing = useQuery<AttendanceRow[]>({
    queryKey: ["compliance", "attendance", date],
    queryFn: async () =>
      (await api.get(`/api/compliance/attendance?from=${date}&to=${date}`)).data,
    enabled: Boolean(date),
  });

  const register = useQuery<RegisterResponse>({
    queryKey: ["compliance", "register", month],
    queryFn: async () =>
      (await api.get(`/api/compliance/attendance/register?month=${month}`)).data,
    enabled: /^\d{4}-\d{2}$/.test(month),
  });

  const shiftType = shift === WHOLE_DAY ? null : shift;

  const savedForShift = useMemo(() => {
    const map = new Map<string, AttendanceRow>();
    for (const r of existing.data ?? []) {
      if ((r.shiftType ?? null) === shiftType) map.set(r.employeeId, r);
    }
    return map;
  }, [existing.data, shiftType]);

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  // Reset the draft whenever the date or shift changes, seeded from whatever is
  // already saved for that slot.
  useEffect(() => {
    const next: Record<string, Draft> = {};
    for (const [employeeId, row] of savedForShift) {
      next[employeeId] = {
        status: row.status,
        overtimeMinutes: row.overtimeMinutes ? String(row.overtimeMinutes) : "",
      };
    }
    setDrafts(next);
  }, [date, shift, savedForShift]);

  const staff = employees.data ?? [];
  const markedCount = Object.keys(drafts).length;

  const setStatus = (employeeId: string, status: AttendanceStatus) =>
    setDrafts((d) => {
      // Tapping the same status again clears the mark — quick undo on a phone.
      if (d[employeeId]?.status === status) {
        const rest = { ...d };
        delete rest[employeeId];
        return rest;
      }
      return { ...d, [employeeId]: { status, overtimeMinutes: d[employeeId]?.overtimeMinutes ?? "" } };
    });

  const setOvertime = (employeeId: string, value: string) =>
    setDrafts((d) =>
      d[employeeId] ? { ...d, [employeeId]: { ...d[employeeId], overtimeMinutes: value } } : d
    );

  const markAllPresent = () =>
    setDrafts((d) => {
      const next = { ...d };
      for (const e of staff) {
        next[e.id] = { status: "PRESENT", overtimeMinutes: next[e.id]?.overtimeMinutes ?? "" };
      }
      return next;
    });

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.put("/api/compliance/attendance/bulk", {
          attendanceDate: date,
          shiftType,
          entries: Object.entries(drafts).map(([employeeId, d]) => ({
            employeeId,
            status: d.status,
            overtimeMinutes: Number(d.overtimeMinutes) || 0,
          })),
        })
      ).data as { created: number; updated: number },
    onSuccess: (r) => {
      toast.success(
        t("compliance.att.saved", "Attendance saved — {created} new, {updated} updated", {
          created: r.created,
          updated: r.updated,
        })
      );
      qc.invalidateQueries({ queryKey: ["compliance"] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <div className="space-y-6">
      <LiveAttendance />
      {/* ===== Marker ===== */}
      <Card>
        <CardHeader>
          <CardTitle>{t("compliance.att.markTitle", "Mark attendance")}</CardTitle>
          <CardDescription>
            {t(
              "compliance.att.markDesc",
              "Pick the date and shift, then tap a letter against each person. Tap the same letter again to clear it. Leave the shift as “Whole day” for a single daily mark."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">{t("common.date", "Date")}</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">{t("compliance.att.shift", "Shift")}</Label>
              <Select value={shift} onValueChange={setShift}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={WHOLE_DAY}>{t("compliance.att.wholeDay", "Whole day")}</SelectItem>
                  <SelectItem value="DAY">{t("compliance.att.dayShift", "Day shift")}</SelectItem>
                  <SelectItem value="NIGHT">{t("compliance.att.nightShift", "Night shift")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {canManage && (
              <div className="flex items-end">
                <Button variant="outline" className="w-full" onClick={markAllPresent} disabled={staff.length === 0}>
                  <CheckCheck className="h-4 w-4 mr-1" /> {t("compliance.att.allPresent", "All present")}
                </Button>
              </div>
            )}
          </div>

          {employees.isLoading ? (
            <p className="text-sm text-muted-foreground">{t("compliance.att.loadingStaff", "Loading staff…")}</p>
          ) : employees.isError ? (
            <p className="text-sm text-destructive">{apiError(employees.error)}</p>
          ) : staff.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("compliance.att.noStaff", "No active employees yet. Add staff under Employees first.")}
            </p>
          ) : (
            <div className="space-y-2">
              {staff.map((e) => {
                const draft = drafts[e.id];
                const saved = savedForShift.get(e.id);
                return (
                  <div key={e.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{e.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {e.code ? `${e.code} · ` : ""}
                          {e.designation || t("compliance.att.attendant", "Attendant")}
                          {saved
                            ? t("compliance.att.savedAs", " · saved as {status}", {
                                status: attName(saved.status),
                              })
                            : ""}
                        </div>
                      </div>
                      {draft && (
                        <div className="w-28">
                          <Input
                            type="number"
                            min={0}
                            max={1440}
                            inputMode="numeric"
                            placeholder={t("compliance.att.otPh", "OT mins")}
                            value={draft.overtimeMinutes}
                            onChange={(ev) => setOvertime(e.id, ev.target.value)}
                          />
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-5 gap-1.5 mt-2">
                      {STATUSES.map((s) => (
                        <button
                          key={s}
                          type="button"
                          disabled={!canManage}
                          onClick={() => setStatus(e.id, s)}
                          className={cn(
                            "rounded-md border py-2 text-xs font-semibold transition-colors disabled:opacity-50",
                            draft?.status === s
                              ? ATTENDANCE_CELL_CLASS[s] + " border-transparent ring-2 ring-offset-1 ring-foreground/20"
                              : "bg-background hover:bg-muted"
                          )}
                          title={attName(s)}
                        >
                          <span className="block text-base leading-none">
                            {attShort(s)}
                          </span>
                          <span className="block text-[10px] font-normal mt-0.5 truncate">
                            {attName(s)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {canManage && staff.length > 0 && (
            <Button
              className="w-full"
              disabled={markedCount === 0 || save.isPending}
              onClick={() => save.mutate()}
            >
              <Save className="h-4 w-4 mr-1" />
              {save.isPending
                ? t("common.saving", "Saving…")
                : t("compliance.att.saveMarks", "Save {count} mark(s)", { count: markedCount })}
            </Button>
          )}
          {!canManage && (
            <p className="text-xs text-muted-foreground">
              {t(
                "compliance.att.viewOnly",
                "You can view attendance but not change it (needs the “manage employees” permission)."
              )}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ===== Monthly register ===== */}
      <Card>
        <CardHeader className="gap-2">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle>{t("compliance.att.registerTitle", "Monthly register")}</CardTitle>
              <CardDescription>
                {t(
                  "compliance.att.legend",
                  "P present · A absent · H half day · L leave · W weekly off. Two letters in a cell means both shifts were marked."
                )}
              </CardDescription>
            </div>
            <div className="w-40">
              <Label className="text-xs">{t("compliance.att.month", "Month")}</Label>
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {register.isLoading ? (
            <p className="text-sm text-muted-foreground">{t("compliance.att.loadingRegister", "Loading register…")}</p>
          ) : register.isError ? (
            <p className="text-sm text-destructive">{apiError(register.error)}</p>
          ) : !register.data || register.data.register.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t(
                "compliance.att.emptyRegister",
                "Nothing to show for this month — no staff on the roll and no attendance marked."
              )}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-background z-10 min-w-[140px]">
                      {t("compliance.att.employee", "Employee")}
                    </TableHead>
                    {register.data.days.map((d) => (
                      <TableHead key={d} className="text-center px-1 text-[10px]">
                        {d.slice(8)}
                      </TableHead>
                    ))}
                    {STATUSES.map((s) => (
                      <TableHead key={s} className="text-center px-2" title={attName(s)}>
                        {attShort(s)}
                      </TableHead>
                    ))}
                    <TableHead className="text-center px-2">
                      {t("compliance.att.otMinsHead", "OT mins")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {register.data.register.map((r) => (
                    <TableRow key={r.employee.id}>
                      <TableCell className="sticky left-0 bg-background z-10">
                        <div className="font-medium text-sm">{r.employee.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.employee.code || r.employee.designation || ""}
                          {r.employee.isActive ? "" : t("compliance.att.inactiveSuffix", " · inactive")}
                        </div>
                      </TableCell>
                      {r.cells.map((c) => (
                        <TableCell key={c.date} className="p-0.5 text-center">
                          {c.marks.length === 0 ? (
                            <span className="text-muted-foreground/40 text-xs">·</span>
                          ) : (
                            <div className="flex justify-center gap-0.5">
                              {c.marks.map((m) => (
                                <span
                                  key={m.id}
                                  title={`${attName(m.status)}${
                                    m.shiftType
                                      ? t("compliance.att.cellShift", " ({shift})", {
                                          shift:
                                            m.shiftType === "DAY"
                                              ? t("compliance.att.dayShift", "Day shift")
                                              : t("compliance.att.nightShift", "Night shift"),
                                        })
                                      : ""
                                  }${
                                    m.overtimeMinutes
                                      ? t("compliance.att.cellOt", " · {mins} OT mins", {
                                          mins: m.overtimeMinutes,
                                        })
                                      : ""
                                  }`}
                                  className={cn(
                                    "inline-block rounded px-1 text-[10px] font-bold",
                                    ATTENDANCE_CELL_CLASS[m.status]
                                  )}
                                >
                                  {attShort(m.status)}
                                </span>
                              ))}
                            </div>
                          )}
                        </TableCell>
                      ))}
                      <TableCell className="text-center text-sm tabular-nums">
                        {r.totals.present}
                      </TableCell>
                      <TableCell className="text-center text-sm tabular-nums">
                        {r.totals.absent}
                      </TableCell>
                      <TableCell className="text-center text-sm tabular-nums">
                        {r.totals.halfDay}
                      </TableCell>
                      <TableCell className="text-center text-sm tabular-nums">
                        {r.totals.leave}
                      </TableCell>
                      <TableCell className="text-center text-sm tabular-nums">
                        {r.totals.weeklyOff}
                      </TableCell>
                      <TableCell className="text-center text-sm tabular-nums">
                        {r.totals.overtimeMinutes}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-semibold bg-muted/50">
                    <TableCell className="sticky left-0 bg-muted/50 z-10">
                      {t("compliance.att.allStaff", "All staff")}
                    </TableCell>
                    <TableCell colSpan={register.data.days.length} />
                    <TableCell className="text-center tabular-nums">
                      {register.data.grandTotals.present}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {register.data.grandTotals.absent}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {register.data.grandTotals.halfDay}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {register.data.grandTotals.leave}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {register.data.grandTotals.weeklyOff}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {register.data.grandTotals.overtimeMinutes}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

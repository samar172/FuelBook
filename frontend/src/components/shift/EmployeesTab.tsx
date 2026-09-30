"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiError, Employee, toDateInput } from "@/lib/types";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { Plus, Trash2 } from "lucide-react";
import { LastSaved } from "./LastSaved";

type Row = {
  nozzleId: string;
  employeeId: string;
};

type AttendanceRow = {
  employeeId: string;
  attendanceDate: string;
  shiftType: "DAY" | "NIGHT" | null;
  status: "PRESENT" | "ABSENT" | "HALF_DAY" | "LEAVE" | "WEEKLY_OFF";
};

// Marks that mean the person actually turned up.
const ON_DUTY_STATUSES = ["PRESENT", "HALF_DAY"];

export function EmployeesTab({ shift, disabled }: { shift: any; disabled: boolean }) {
  const { t } = useT();
  const qc = useQueryClient();
  const reportDate = toDateInput(shift.reportDate);
  const shiftType: string | undefined = shift.shiftType;

  const { data: nozzles = [] } = useQuery({
    queryKey: ["nozzles"],
    queryFn: async () => (await api.get("/api/setup/nozzles")).data,
  });
  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["employees"],
    queryFn: async () => (await api.get("/api/employees")).data,
  });

  // Who was marked present for this shift, so the picker leads with them.
  const { data: attendance = [] } = useQuery<AttendanceRow[]>({
    queryKey: ["attendance", reportDate],
    enabled: !!reportDate,
    queryFn: async () =>
      (await api.get("/api/compliance/attendance", { params: { from: reportDate, to: reportDate } }))
        .data,
  });

  const [showAll, setShowAll] = useState(false);

  const [rows, setRows] = useState<Row[]>(() =>
    (shift.employeeAssignments || []).map((a: any) => ({
      nozzleId: a.nozzleId,
      employeeId: a.employeeId,
    }))
  );

  // A whole-day mark (shiftType null) counts for both shifts.
  const onDuty = new Set(
    attendance
      .filter(
        (a) =>
          ON_DUTY_STATUSES.includes(a.status) &&
          (a.shiftType === null || !shiftType || a.shiftType === shiftType),
      )
      .map((a) => a.employeeId),
  );
  // Attendance not marked at all for this shift — fall back to everyone, quietly.
  const hasAttendance = employees.some((e) => onDuty.has(e.id));
  const restrict = hasAttendance && !showAll;

  const onDutyEmployees = employees.filter((e) => onDuty.has(e.id));
  // Never hide a choice that is already made, even if that person was marked absent.
  const optionsFor = (employeeId: string): Employee[] => {
    if (!restrict) return employees;
    if (!employeeId || onDuty.has(employeeId)) return onDutyEmployees;
    const picked = employees.find((e) => e.id === employeeId);
    return picked ? [...onDutyEmployees, picked] : onDutyEmployees;
  };

  const save = useMutation({
    mutationFn: async () => {
      return (
        await api.put(`/api/shifts/${shift.id}/employee-assignments`, {
          assignments: rows.map((r) => ({ nozzleId: r.nozzleId, employeeId: r.employeeId })),
        })
      ).data;
    },
    onSuccess: () => {
      toast.success(t("shift.employees.saved", "Employee assignments saved"));
      qc.invalidateQueries({ queryKey: ["shift", shift.id] });
    },
    onError: (e) => toast.error(apiError(e, t("common.failed", "Something went wrong"))),
  });

  const defaultEmployeeId = (restrict ? onDutyEmployees[0]?.id : employees[0]?.id) || "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("shift.employees.title", "Employees")}</CardTitle>
        <CardDescription>
          {t(
            "shift.employees.desc",
            "Assign which employee ran each nozzle during this shift — feeds their ledger. This is carried forward from the last {shiftWord} shift when the shift is created, so usually you only need to fix the exceptions.",
            {
              shiftWord:
                shiftType === "NIGHT" ? t("shift.word.night", "night") : t("shift.word.day", "day"),
            },
          )}
        </CardDescription>
        <LastSaved shiftId={shift.id} panel="roster" />
      </CardHeader>
      <CardContent className="space-y-4">
        {hasAttendance && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">
              {showAll
                ? t("shift.employees.showingAll", "Showing all active staff. {n} marked present for this shift.", {
                    n: onDutyEmployees.length,
                  })
                : t("shift.employees.showingOnDuty", "Showing the {n} staff marked present for this shift.", {
                    n: onDutyEmployees.length,
                  })}
            </p>
            <Button size="sm" variant="ghost" onClick={() => setShowAll((v) => !v)}>
              {showAll
                ? t("shift.employees.showOnDuty", "Show only staff on duty")
                : t("shift.employees.showAllStaff", "Show all staff")}
            </Button>
          </div>
        )}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("shift.employees.nozzle", "Nozzle")}</TableHead>
                <TableHead>{t("shift.employees.employee", "Employee")}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, idx) => (
                <TableRow key={idx}>
                  <TableCell>
                    <Select
                      value={r.nozzleId}
                      onValueChange={(v) =>
                        setRows((rs) => rs.map((x, i) => (i === idx ? { ...x, nozzleId: v } : x)))
                      }
                      disabled={disabled}
                    >
                      <SelectTrigger className="min-w-[140px]"><SelectValue placeholder={t("shift.employees.nozzle", "Nozzle")} /></SelectTrigger>
                      <SelectContent>
                        {nozzles.map((n: any) => (
                          <SelectItem key={n.id} value={n.id}>{n.code}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={r.employeeId}
                      onValueChange={(v) =>
                        setRows((rs) => rs.map((x, i) => (i === idx ? { ...x, employeeId: v } : x)))
                      }
                      disabled={disabled}
                    >
                      <SelectTrigger className="min-w-[160px]"><SelectValue placeholder={t("shift.employees.employee", "Employee")} /></SelectTrigger>
                      <SelectContent>
                        {optionsFor(r.employeeId).map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.name}
                            {restrict && !onDuty.has(e.id) ? t("shift.employees.notPresent", " (not marked present)") : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {!disabled && (
                      <Button size="icon" variant="ghost" onClick={() => setRows((rs) => rs.filter((_, i) => i !== idx))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    {t("shift.employees.empty", "No employees assigned yet.")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {!disabled && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setRows((rs) => [...rs, { nozzleId: nozzles[0]?.id || "", employeeId: defaultEmployeeId }])
              }
              disabled={nozzles.length === 0 || employees.length === 0}
            >
              <Plus className="h-4 w-4 mr-1" /> {t("common.addRow", "Add row")}
            </Button>
            {employees.length === 0 && (
              <span className="text-xs text-muted-foreground">{t("shift.employees.addFirst", "Add employees under the Employees page first.")}</span>
            )}
          </div>
        )}
        {!disabled && (
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? t("common.saving", "Saving…") : t("shift.employees.save", "Save assignments")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

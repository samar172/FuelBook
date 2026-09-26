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
import { Plus, Trash2 } from "lucide-react";

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
      toast.success("Employee assignments saved");
      qc.invalidateQueries({ queryKey: ["shift", shift.id] });
    },
    onError: (e) => toast.error(apiError(e, "Failed")),
  });

  const defaultEmployeeId = (restrict ? onDutyEmployees[0]?.id : employees[0]?.id) || "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Employees</CardTitle>
        <CardDescription>
          Assign which employee ran each nozzle during this shift — feeds their ledger. This is
          carried forward from the last {shiftType === "NIGHT" ? "night" : "day"} shift when the
          shift is created, so usually you only need to fix the exceptions.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasAttendance && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">
              {showAll
                ? `Showing all active staff. ${onDutyEmployees.length} marked present for this shift.`
                : `Showing the ${onDutyEmployees.length} staff marked present for this shift.`}
            </p>
            <Button size="sm" variant="ghost" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Show only staff on duty" : "Show all staff"}
            </Button>
          </div>
        )}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nozzle</TableHead>
                <TableHead>Employee</TableHead>
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
                      <SelectTrigger className="min-w-[140px]"><SelectValue placeholder="Nozzle" /></SelectTrigger>
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
                      <SelectTrigger className="min-w-[160px]"><SelectValue placeholder="Employee" /></SelectTrigger>
                      <SelectContent>
                        {optionsFor(r.employeeId).map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.name}
                            {restrict && !onDuty.has(e.id) ? " (not marked present)" : ""}
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
                    No employees assigned yet.
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
              <Plus className="h-4 w-4 mr-1" /> Add row
            </Button>
            {employees.length === 0 && (
              <span className="text-xs text-muted-foreground">Add employees under the Employees page first.</span>
            )}
          </div>
        )}
        {!disabled && (
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save assignments"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

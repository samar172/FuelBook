"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

type Row = {
  nozzleId: string;
  employeeId: string;
};

export function EmployeesTab({ shift, disabled }: { shift: any; disabled: boolean }) {
  const qc = useQueryClient();
  const { data: nozzles = [] } = useQuery({
    queryKey: ["nozzles"],
    queryFn: async () => (await api.get("/api/setup/nozzles")).data,
  });
  const { data: employees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => (await api.get("/api/employees")).data,
  });

  const [rows, setRows] = useState<Row[]>(() =>
    (shift.employeeAssignments || []).map((a: any) => ({
      nozzleId: a.nozzleId,
      employeeId: a.employeeId,
    }))
  );

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
    onError: (e: any) => toast.error(e?.response?.data?.error || "Failed"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Employees</CardTitle>
        <CardDescription>
          Assign which employee ran each nozzle during this shift — feeds their ledger.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
                      {employees.map((e: any) => (
                        <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
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
        {!disabled && (
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setRows((rs) => [...rs, { nozzleId: nozzles[0]?.id || "", employeeId: employees[0]?.id || "" }])
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

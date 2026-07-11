"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatINR, formatLitres, FUEL_LABELS } from "@/lib/utils";
import { format } from "date-fns";

export default function EmployeeLedgerPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { data, isLoading } = useQuery({
    queryKey: ["employee-ledger", id],
    queryFn: async () => (await api.get(`/api/employees/${id}/ledger`)).data,
  });

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (!data) return null;
  const { employee, assignments } = data;

  const shiftsWorked = new Set(assignments.map((a: any) => a.shiftReport.id)).size;
  const totalLitresMl = assignments.reduce((acc: bigint, a: any) => acc + BigInt(a.litresMl), 0n);
  const totalValuePaise = assignments.reduce((acc: bigint, a: any) => acc + BigInt(a.valuePaise), 0n);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold break-words">{employee.name}</h1>
        <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-sm sm:text-base">
          <span>Phone: {employee.phone || "-"}</span>
          <span>{employee.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Shifts Worked</div><div className="text-xl font-semibold">{shiftsWorked}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total Litres Dispensed</div><div className="text-xl font-semibold">{formatLitres(totalLitresMl)} L</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total Value</div><div className="text-xl font-semibold">{formatINR(totalValuePaise)}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Shift assignments</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Shift</TableHead><TableHead>Nozzle</TableHead>
              <TableHead>Fuel</TableHead><TableHead>Litres</TableHead><TableHead>Value</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {assignments.map((a: any) => (
                <TableRow key={a.id}>
                  <TableCell>{format(new Date(a.shiftReport.reportDate), "dd MMM yyyy")}</TableCell>
                  <TableCell>{a.shiftReport.shiftType}</TableCell>
                  <TableCell className="font-mono">{a.nozzle.code}</TableCell>
                  <TableCell>{FUEL_LABELS[a.nozzle.fuelType] || a.nozzle.fuelType}</TableCell>
                  <TableCell>{formatLitres(a.litresMl)}</TableCell>
                  <TableCell>{formatINR(a.valuePaise)}</TableCell>
                </TableRow>
              ))}
              {assignments.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No shift assignments yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

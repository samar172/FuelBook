"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/utils";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

export default function ShiftsListPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["shifts"],
    queryFn: async () => (await api.get("/api/shifts")).data,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Shift Reports</h1>
          <p className="text-muted-foreground text-sm sm:text-base">Daily shift entries — replaces the manual Excel</p>
        </div>
        <Link href="/shifts/new">
          <Button>+ New Shift</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent shifts</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : !data || data.length === 0 ? (
            <div className="text-sm text-muted-foreground">No shifts yet. Create your first one.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Shift</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sales</TableHead>
                  <TableHead>Expenses</TableHead>
                  <TableHead>Closing Cash</TableHead>
                  <TableHead>Reconcile</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((s: any) => (
                  <TableRow key={s.id} className="cursor-pointer">
                    <TableCell>
                      <Link href={`/shifts/${s.id}`}>{format(new Date(s.reportDate), "dd MMM yyyy")}</Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/shifts/${s.id}`}>
                        <Badge variant={s.shiftType === "DAY" ? "default" : "secondary"}>{s.shiftType}</Badge>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{s.status}</Badge>
                    </TableCell>
                    <TableCell>{formatINR(s.totalSalesPaise)}</TableCell>
                    <TableCell>{formatINR(s.totalExpensesPaise)}</TableCell>
                    <TableCell className="font-medium">{formatINR(s.closingCashPaise)}</TableCell>
                    <TableCell>
                      {s.discrepancyFlag ? (
                        <Badge variant="warning">Flagged</Badge>
                      ) : (
                        <Badge variant="success">OK</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

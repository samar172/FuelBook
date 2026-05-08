"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatINR, formatLitres } from "@/lib/utils";
import { format } from "date-fns";

export default function TankerReceiptsPage() {
  const { data = [] } = useQuery({
    queryKey: ["tanker-receipts"],
    queryFn: async () => (await api.get("/api/tanker-receipts")).data,
  });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl sm:text-3xl font-bold">Tanker Receipts</h1>
      <p className="text-muted-foreground text-sm sm:text-base">Fuel deliveries received. Add a new one from inside a Shift &raquo; Stock tab.</p>
      <Card>
        <CardHeader><CardTitle className="text-base">Recent receipts</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Tank</TableHead><TableHead>Litres</TableHead>
              <TableHead>Rate / L</TableHead><TableHead>Total Cost</TableHead><TableHead>Bill</TableHead>
              <TableHead>Vendor</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.map((t: any) => (
                <TableRow key={t.id}>
                  <TableCell>{format(new Date(t.receivedAt), "dd MMM yyyy HH:mm")}</TableCell>
                  <TableCell>{t.tank?.name || "-"}</TableCell>
                  <TableCell>{formatLitres(t.receivedMl)} L</TableCell>
                  <TableCell>{t.ratePaise ? formatINR(t.ratePaise) : "-"}</TableCell>
                  <TableCell>{t.totalCostPaise ? formatINR(t.totalCostPaise) : "-"}</TableCell>
                  <TableCell>{t.billNo || "-"}</TableCell>
                  <TableCell>{t.vendorName || "-"}</TableCell>
                </TableRow>
              ))}
              {data.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No tanker receipts yet</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

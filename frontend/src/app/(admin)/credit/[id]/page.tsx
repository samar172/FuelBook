"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatINR, formatLitres, FUEL_LABELS } from "@/lib/utils";
import { format } from "date-fns";

export default function CreditLedgerPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { data, isLoading } = useQuery({
    queryKey: ["credit-ledger", id],
    queryFn: async () => (await api.get(`/api/credit/customers/${id}/ledger`)).data,
  });

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (!data) return null;
  const { customer, sales, receipts } = data;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold break-words">{customer.name}</h1>
        <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-sm sm:text-base">
          <span>Vehicle: {customer.vehicleNo || "-"}</span>
          <span>Phone: {customer.phone || "-"}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Credit Limit</div><div className="text-xl font-semibold">{formatINR(customer.creditLimitPaise)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Outstanding Balance</div><div className="text-xl font-semibold text-amber-700">{formatINR(customer.currentBalancePaise)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Status</div><div className="text-xl">{customer.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Credit sales</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Fuel</TableHead><TableHead>Qty (L)</TableHead>
              <TableHead>Total</TableHead><TableHead>Paid Now</TableHead><TableHead>Credited</TableHead>
              <TableHead>Vehicle</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {sales.map((s: any) => (
                <TableRow key={s.id}>
                  <TableCell>{format(new Date(s.saleAt), "dd MMM yy")}</TableCell>
                  <TableCell>{FUEL_LABELS[s.fuelType] || s.fuelType}</TableCell>
                  <TableCell>{formatLitres(s.quantityMl)}</TableCell>
                  <TableCell>{formatINR(s.totalAmountPaise)}</TableCell>
                  <TableCell className="text-green-700">{formatINR(s.amountPaidPaise)}</TableCell>
                  <TableCell className="text-amber-700 font-medium">{formatINR(s.amountCreditPaise)}</TableCell>
                  <TableCell>{s.vehicleNo || "-"}</TableCell>
                </TableRow>
              ))}
              {sales.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No credit sales</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Outstanding payments received</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Amount</TableHead><TableHead>Reference</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {receipts.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell>{format(new Date(r.receivedAt), "dd MMM yy")}</TableCell>
                  <TableCell className="font-medium text-green-700">{formatINR(r.amountPaise)}</TableCell>
                  <TableCell>{r.reference || "-"}</TableCell>
                </TableRow>
              ))}
              {receipts.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No payments received yet</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatINR, formatLitres, FUEL_LABELS } from "@/lib/utils";
import { ArrowDownCircle, ArrowUpCircle, AlertTriangle, CheckCircle } from "lucide-react";

export function ReconciliationTab({ shift }: { shift: any }) {
  const { data: rates } = useQuery({
    queryKey: ["fuel-rates"],
    queryFn: async () => (await api.get("/api/setup/fuel-rates")).data,
  });
  const cashIn = BigInt(shift.totalSalesPaise) - BigInt(shift.totalCreditIssuedPaise);
  const expectedCollections = cashIn + BigInt(shift.totalOutstandingReceivedPaise);
  const collected = BigInt(shift.totalCollectionsPaise);
  const diff = collected - expectedCollections;
  const matched = diff > -100n && diff < 100n; // < ₹1

  // Aggregate per-fuel meter vs stock
  const meterByFuel: Record<string, number> = {};
  for (const r of shift.nozzleReadings) {
    const sale = Math.max(0, Number(r.closingReadingMl) - Number(r.openingReadingMl) - Number(r.testingMl));
    meterByFuel[r.fuelType] = (meterByFuel[r.fuelType] || 0) + sale;
  }
  const purchaseByTank: Record<string, number> = {};
  for (const t of shift.tankerReceipts || []) {
    purchaseByTank[t.tankId] = (purchaseByTank[t.tankId] || 0) + Number(t.receivedMl);
  }
  const stockByFuel: Record<string, number> = {};
  for (const e of shift.stockEntries) {
    const purchase = purchaseByTank[e.tankId] || 0;
    const sale = Math.max(0, Number(e.openingStockMl) + purchase - Number(e.closingStockMl));
    stockByFuel[e.fuelType] = (stockByFuel[e.fuelType] || 0) + sale;
  }
  const fuels = Array.from(new Set([...Object.keys(meterByFuel), ...Object.keys(stockByFuel)]));

  // Employee summary — litres/value attributed via nozzle assignments, same
  // "litres × current rate" convention as the employee ledger endpoint.
  const readingByNozzle: Record<string, any> = {};
  for (const r of shift.nozzleReadings) readingByNozzle[r.nozzleId] = r;
  const currentRates: Record<string, any> = rates?.current || {};

  const employeeTotals = new Map<
    string,
    { name: string; nozzles: Set<string>; saleMl: number; valuePaise: number }
  >();
  for (const a of shift.employeeAssignments || []) {
    const reading = readingByNozzle[a.nozzleId];
    const saleMl = reading
      ? Math.max(0, Number(reading.closingReadingMl) - Number(reading.openingReadingMl) - Number(reading.testingMl))
      : 0;
    const ratePaise = Number(currentRates[a.nozzle.fuelType]?.ratePaise || 0);
    const valuePaise = (saleMl * ratePaise) / 1000;
    const existing = employeeTotals.get(a.employeeId);
    if (existing) {
      existing.nozzles.add(a.nozzle.code);
      existing.saleMl += saleMl;
      existing.valuePaise += valuePaise;
    } else {
      employeeTotals.set(a.employeeId, {
        name: a.employee.name,
        nozzles: new Set([a.nozzle.code]),
        saleMl,
        valuePaise,
      });
    }
  }
  const employeeRows = Array.from(employeeTotals.values());
  const employeeTotalMl = employeeRows.reduce((acc, r) => acc + r.saleMl, 0);
  const employeeTotalValuePaise = employeeRows.reduce((acc, r) => acc + r.valuePaise, 0);

  return (
    <div className="space-y-4">
      <Card className={matched ? "border-green-200" : "border-amber-300"}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {matched ? <CheckCircle className="h-5 w-5 text-green-600" /> : <AlertTriangle className="h-5 w-5 text-amber-600" />}
            Cash Flow — Where the money went
            {matched ? <Badge variant="success">Matched</Badge> : <Badge variant="warning">Difference {formatINR(diff)}</Badge>}
          </CardTitle>
          <CardDescription>
            Sales generate money. Some is paid in cash/UPI/card now, some becomes credit. Plus any
            past credit collected today. The total of these should match what's in the collections tab.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b">
                <td className="py-2">Total Sales (qty × rate)</td>
                <td className="text-right font-medium">{formatINR(shift.totalSalesPaise)}</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pl-4 text-muted-foreground">− Credit Issued (not collected today)</td>
                <td className="text-right text-red-600">- {formatINR(shift.totalCreditIssuedPaise)}</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pl-4 text-muted-foreground">+ Outstanding Received (past credit)</td>
                <td className="text-right text-green-600">+ {formatINR(shift.totalOutstandingReceivedPaise)}</td>
              </tr>
              <tr className="border-b font-semibold">
                <td className="py-2">Expected money received</td>
                <td className="text-right">{formatINR(expectedCollections)}</td>
              </tr>
              <tr className="border-b">
                <td className="py-2">Actual collections (cash + UPI + card + bank)</td>
                <td className="text-right">{formatINR(collected)}</td>
              </tr>
              <tr className={matched ? "" : "bg-amber-50"}>
                <td className="py-2 font-semibold">Difference</td>
                <td className="text-right font-semibold">
                  {diff >= 0n ? "+ " : "- "}{formatINR(diff < 0n ? -diff : diff)}
                </td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Employee Summary</CardTitle>
          <CardDescription>
            Who worked which nozzle(s) this shift, and how much of today&apos;s sales they&apos;re
            responsible for — credit sales, collections and expenses aren&apos;t tied to a specific
            employee, so only fuel sold via their assigned nozzles is shown here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Nozzles</TableHead>
                <TableHead className="text-right">Litres</TableHead>
                <TableHead className="text-right">Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employeeRows.map((r, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="font-mono">{Array.from(r.nozzles).join(", ")}</TableCell>
                  <TableCell className="text-right">{formatLitres(r.saleMl)}</TableCell>
                  <TableCell className="text-right">{formatINR(r.valuePaise)}</TableCell>
                </TableRow>
              ))}
              {employeeRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No employees assigned to this shift yet — use the Employees tab.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            {employeeRows.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2} className="font-bold">Total</TableCell>
                  <TableCell className="text-right font-bold">{formatLitres(employeeTotalMl)}</TableCell>
                  <TableCell className="text-right font-bold">{formatINR(employeeTotalValuePaise)}</TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cash Position</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b"><td className="py-2">Opening Cash</td><td className="text-right">{formatINR(shift.openingCashPaise)}</td></tr>
              <tr className="border-b"><td className="py-2 pl-4">+ Cash from sales (sales − credit issued)</td><td className="text-right text-green-600">+ {formatINR(BigInt(shift.totalSalesPaise) - BigInt(shift.totalCreditIssuedPaise))}</td></tr>
              <tr className="border-b"><td className="py-2 pl-4">+ Outstanding received</td><td className="text-right text-green-600">+ {formatINR(shift.totalOutstandingReceivedPaise)}</td></tr>
              <tr className="border-b"><td className="py-2 pl-4">− Total expenses</td><td className="text-right text-red-600">- {formatINR(shift.totalExpensesPaise)}</td></tr>
              <tr className="border-t-2"><td className="py-2 font-bold">Closing Cash</td><td className="text-right font-bold text-lg">{formatINR(shift.closingCashPaise)}</td></tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quantity Reconciliation — Meter vs Stock</CardTitle>
          <CardDescription>
            Two independent measures of how much fuel was sold. They should match within tolerance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left py-2">Fuel</th>
                <th className="text-right">By meter (L)</th>
                <th className="text-right">By stock (L)</th>
                <th className="text-right">Diff (L)</th>
              </tr>
            </thead>
            <tbody>
              {fuels.map((f) => {
                const meter = meterByFuel[f] || 0;
                const stock = stockByFuel[f] || 0;
                const diff = meter - stock;
                return (
                  <tr key={f} className="border-b">
                    <td className="py-2">{FUEL_LABELS[f] || f}</td>
                    <td className="text-right">{formatLitres(meter)}</td>
                    <td className="text-right">{formatLitres(stock)}</td>
                    <td className={`text-right ${Math.abs(diff) > 500 ? "text-amber-600 font-semibold" : ""}`}>
                      {formatLitres(diff)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatINR, formatLitres, FUEL_LABELS } from "@/lib/utils";
import { ArrowDownCircle, ArrowUpCircle, AlertTriangle, CheckCircle } from "lucide-react";

export function ReconciliationTab({ shift }: { shift: any }) {
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

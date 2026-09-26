"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn, formatINR, formatLitres, FUEL_LABELS } from "@/lib/utils";
import { AlertTriangle, CheckCircle } from "lucide-react";

type ReconRow = {
  employeeId: string;
  employeeName: string;
  nozzleCodes: string[];
  salesQuantityMl: string;
  salesValuePaise: string;
  creditIssuedPaise: string;
  nonCashCollectedPaise: string;
  expectedCashPaise: string;
  settledCashPaise: string;
  differencePaise: string;
  droppedMidShiftPaise: string;
  handoverRecorded: boolean;
};

type ReconResponse = {
  rows: ReconRow[];
  unattributedSalesPaise: string;
  totals: {
    salesValuePaise: string;
    creditIssuedPaise: string;
    nonCashCollectedPaise: string;
    expectedCashPaise: string;
    settledCashPaise: string;
    differencePaise: string;
    droppedMidShiftPaise: string;
    awaitingHandover: number;
    dropCount: number;
  };
};

export function ReconciliationTab({ shift }: { shift: any }) {
  // The same figures the Cash Handover tab works from, so the two can never
  // disagree: sales per attendant, what they gave on credit or took digitally,
  // the cash that leaves them owing, and what has actually been settled.
  const { data: recon } = useQuery<ReconResponse>({
    queryKey: ["shift-cash-recon", shift.id],
    queryFn: async () => (await api.get(`/api/shifts/${shift.id}/cash-reconciliation`)).data,
  });
  const settlementRows = recon?.rows ?? [];
  const st = recon?.totals;
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

  // Per-attendant sales and settlement come from /cash-reconciliation (see the
  // query above) rather than being recomputed here, so this tab and the Cash
  // Handover tab can never show different numbers for the same shift.

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
          <CardTitle>Employee Sales vs Cash Settled</CardTitle>
          <CardDescription>
            What each attendant sold, and how much of it has reached the office. Cash due is
            their fuel sales less the credit they gave and the card/UPI they took — the rest is
            cash they owe. Settled counts mid-shift drops and their end-of-shift hand-over.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Nozzles</TableHead>
                <TableHead className="text-right">Litres</TableHead>
                <TableHead className="text-right">Fuel sold</TableHead>
                <TableHead className="text-right">Credit given</TableHead>
                <TableHead className="text-right">Digital taken</TableHead>
                <TableHead className="text-right">Cash due</TableHead>
                <TableHead className="text-right">Settled</TableHead>
                <TableHead className="text-right">Difference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {settlementRows.map((r) => {
                const diff = BigInt(r.differencePaise);
                const short = diff < 0n;
                return (
                  <TableRow key={r.employeeId}>
                    <TableCell className="font-medium">{r.employeeName}</TableCell>
                    <TableCell className="font-mono text-xs">{r.nozzleCodes.join(", ") || "—"}</TableCell>
                    <TableCell className="text-right">{formatLitres(r.salesQuantityMl)}</TableCell>
                    <TableCell className="text-right">{formatINR(r.salesValuePaise)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatINR(r.creditIssuedPaise)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatINR(r.nonCashCollectedPaise)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatINR(r.expectedCashPaise)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatINR(r.settledCashPaise)}
                      {!r.handoverRecorded && (
                        <div className="text-[11px] text-muted-foreground">hand-over not recorded</div>
                      )}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-semibold",
                        diff === 0n ? "text-green-700" : short ? "text-red-700" : "text-amber-700"
                      )}
                    >
                      {diff === 0n ? "settled" : formatINR(diff)}
                      {short && (
                        <div className="text-[11px] font-normal text-muted-foreground">
                          still to come in
                        </div>
                      )}
                      {diff > 0n && (
                        <div className="text-[11px] font-normal text-muted-foreground">excess</div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {settlementRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    No employees assigned to this shift yet — use the Employees tab.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            {settlementRows.length > 0 && st && (
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3} className="font-bold">Total</TableCell>
                  <TableCell className="text-right font-bold">{formatINR(st.salesValuePaise)}</TableCell>
                  <TableCell className="text-right font-bold">{formatINR(st.creditIssuedPaise)}</TableCell>
                  <TableCell className="text-right font-bold">{formatINR(st.nonCashCollectedPaise)}</TableCell>
                  <TableCell className="text-right font-bold">{formatINR(st.expectedCashPaise)}</TableCell>
                  <TableCell className="text-right font-bold">{formatINR(st.settledCashPaise)}</TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-bold",
                      BigInt(st.differencePaise) === 0n
                        ? "text-green-700"
                        : BigInt(st.differencePaise) < 0n
                          ? "text-red-700"
                          : "text-amber-700"
                    )}
                  >
                    {BigInt(st.differencePaise) === 0n ? "settled" : formatINR(st.differencePaise)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>

          {st && BigInt(st.differencePaise) < 0n && (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              {formatINR(-BigInt(st.differencePaise))} of this shift&apos;s sales has not been
              settled yet
              {st.awaitingHandover > 0
                ? ` — ${st.awaitingHandover} attendant(s) have no hand-over recorded.`
                : "."}{" "}
              Record it on the <span className="font-medium">Cash Handover</span> tab. A shortfall
              left at lock time becomes money that attendant owes.
            </p>
          )}
          {recon && BigInt(recon.unattributedSalesPaise) > 0n && (
            <p className="mt-2 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-900">
              {formatINR(recon.unattributedSalesPaise)} was dispensed on nozzles with nobody
              assigned, so it is not anyone&apos;s responsibility. Assign them on the Employees tab.
            </p>
          )}
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

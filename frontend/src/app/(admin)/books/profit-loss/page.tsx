"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatINR, formatLitres, FUEL_LABELS } from "@/lib/utils";
import { ACCOUNT_PLAIN, ProfitLoss, Range, defaultRange, paise } from "@/lib/books";
import { DateRangeBar, EmptyBooks, StatCard } from "../_components/controls";

export default function ProfitLossPage() {
  const [range, setRange] = useState<Range>(defaultRange);

  const { data, isLoading } = useQuery<ProfitLoss>({
    queryKey: ["ledger", "profit-loss", range],
    queryFn: async () =>
      (await api.get(`/api/ledger/profit-loss?from=${range.from}&to=${range.to}`)).data,
  });

  const net = paise(data?.netProfitPaise);
  const gross = paise(data?.grossMarginPaise);
  const fuelSales = paise(data?.fuelSalesPaise);
  const marginPct = fuelSales > 0 ? (gross / fuelSales) * 100 : 0;
  const nothing =
    data && paise(data.totalIncomePaise) === 0 && paise(data.totalExpensesPaise) === 0;

  return (
    <div className="space-y-4">
      <DateRangeBar range={range} onChange={setRange} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Income"
          value={formatINR(data?.totalIncomePaise ?? 0)}
          hint="Everything you earned"
        />
        <StatCard
          label="Expenses"
          value={formatINR(data?.totalExpensesPaise ?? 0)}
          hint="Fuel cost + running costs"
          accent="red"
        />
        <StatCard
          label={net >= 0 ? "Profit" : "Loss"}
          value={formatINR(data?.netProfitPaise ?? 0)}
          hint="Income minus expenses"
          accent={net >= 0 ? "green" : "red"}
        />
        <StatCard
          label="Gross margin on fuel"
          value={formatINR(data?.grossMarginPaise ?? 0)}
          hint={`Sale value minus cost — ${marginPct.toFixed(2)}% of fuel sales`}
          accent="primary"
        />
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground text-center">
            Loading…
          </CardContent>
        </Card>
      ) : nothing ? (
        <Card>
          <CardContent className="p-4">
            <EmptyBooks
              title="No income or expenses in this range"
              body="The profit & loss is built from locked shifts. Lock a shift report and its sales, fuel cost and expenses will appear here."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profit &amp; Loss</CardTitle>
              <CardDescription>
                {range.from} to {range.to} — what you earned, what it cost, what is left.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="bg-slate-50">
                    <TableCell colSpan={2} className="font-semibold text-xs uppercase tracking-wide">
                      Income — money you earned
                    </TableCell>
                  </TableRow>
                  {(data?.income ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={2} className="text-muted-foreground text-sm">
                        No income booked in this range.
                      </TableCell>
                    </TableRow>
                  )}
                  {(data?.income ?? []).map((r) => (
                    <TableRow key={r.accountId}>
                      <TableCell>
                        <div className="font-medium">
                          <span className="font-mono text-xs text-muted-foreground mr-1.5">
                            {r.code}
                          </span>
                          {r.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {ACCOUNT_PLAIN[r.code] ?? ""}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatINR(r.balancePaise)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell className="font-medium">Total income</TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {formatINR(data?.totalIncomePaise ?? 0)}
                    </TableCell>
                  </TableRow>

                  <TableRow className="bg-slate-50">
                    <TableCell colSpan={2} className="font-semibold text-xs uppercase tracking-wide">
                      Expenses — what it cost you
                    </TableCell>
                  </TableRow>
                  {(data?.expenses ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={2} className="text-muted-foreground text-sm">
                        No expenses booked in this range.
                      </TableCell>
                    </TableRow>
                  )}
                  {(data?.expenses ?? []).map((r) => (
                    <TableRow key={r.accountId}>
                      <TableCell>
                        <div className="font-medium">
                          <span className="font-mono text-xs text-muted-foreground mr-1.5">
                            {r.code}
                          </span>
                          {r.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {ACCOUNT_PLAIN[r.code] ?? ""}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatINR(r.balancePaise)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell className="font-medium">Total expenses</TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {formatINR(data?.totalExpensesPaise ?? 0)}
                    </TableCell>
                  </TableRow>
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-semibold">
                      {net >= 0 ? "Net profit" : "Net loss"}
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono font-bold ${
                        net >= 0 ? "text-green-700" : "text-red-700"
                      }`}
                    >
                      {formatINR(data?.netProfitPaise ?? 0)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Fuel margin</CardTitle>
                <CardDescription>
                  What the fuel sold for, against what it cost you to buy.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Fuel sold for</div>
                    <div className="font-semibold">{formatINR(data?.fuelSalesPaise ?? 0)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Cost of that fuel</div>
                    <div className="font-semibold">{formatINR(data?.cogsPaise ?? 0)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">You kept</div>
                    <div className="font-semibold text-green-700">
                      {formatINR(data?.grossMarginPaise ?? 0)}
                    </div>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fuel</TableHead>
                      <TableHead className="text-right">Litres</TableHead>
                      <TableHead className="text-right">Sale value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.salesByFuel ?? []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground">
                          No fuel sales in this range.
                        </TableCell>
                      </TableRow>
                    )}
                    {(data?.salesByFuel ?? []).map((f) => (
                      <TableRow key={f.fuelType}>
                        <TableCell>{FUEL_LABELS[f.fuelType] ?? f.fuelType}</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatLitres(f.quantityMl)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatINR(f.amountPaise)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Running costs by category</CardTitle>
                <CardDescription>
                  Operating expenses booked in this range, split by category.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.expensesByCategory ?? []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-muted-foreground">
                          No operating expenses in this range.
                        </TableCell>
                      </TableRow>
                    )}
                    {(data?.expensesByCategory ?? []).map((c) => (
                      <TableRow key={c.categoryId ?? c.name}>
                        <TableCell>{c.name}</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatINR(c.amountPaise)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

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
import { formatINR, formatLitres } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { ProfitLoss, Range, defaultRange, paise } from "@/lib/books";
import {
  DateRangeBar,
  EmptyBooks,
  StatCard,
  acctName,
  acctPlain,
  fuelLabel,
} from "../_components/controls";

export default function ProfitLossPage() {
  const { t } = useT();
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
          label={t("books.pl.income", "Income")}
          value={formatINR(data?.totalIncomePaise ?? 0)}
          hint={t("books.pl.incomeHint", "Everything you earned")}
        />
        <StatCard
          label={t("books.pl.expenses", "Expenses")}
          value={formatINR(data?.totalExpensesPaise ?? 0)}
          hint={t("books.pl.expensesHint", "Fuel cost + running costs")}
          accent="red"
        />
        <StatCard
          label={net >= 0 ? t("books.pl.profit", "Profit") : t("books.pl.loss", "Loss")}
          value={formatINR(data?.netProfitPaise ?? 0)}
          hint={t("books.pl.netHint", "Income minus expenses")}
          accent={net >= 0 ? "green" : "red"}
        />
        <StatCard
          label={t("books.pl.grossMargin", "Gross margin on fuel")}
          value={formatINR(data?.grossMarginPaise ?? 0)}
          hint={t("books.pl.grossMarginHint", "Sale value minus cost — {pct}% of fuel sales", {
            pct: marginPct.toFixed(2),
          })}
          accent="primary"
        />
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground text-center">
            {t("common.loading", "Loading…")}
          </CardContent>
        </Card>
      ) : nothing ? (
        <Card>
          <CardContent className="p-4">
            <EmptyBooks
              title={t("books.pl.emptyTitle", "No income or expenses in this range")}
              body={t(
                "books.pl.emptyBody",
                "The profit & loss is built from locked shifts. Lock a shift report and its sales, fuel cost and expenses will appear here.",
              )}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("books.nav.profitLoss", "Profit & Loss")}</CardTitle>
              <CardDescription>
                {t("books.pl.desc", "{from} to {to} — what you earned, what it cost, what is left.", {
                  from: range.from,
                  to: range.to,
                })}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("books.col.account", "Account")}</TableHead>
                    <TableHead className="text-right">{t("common.amount", "Amount")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="bg-slate-50">
                    <TableCell colSpan={2} className="font-semibold text-xs uppercase tracking-wide">
                      {t("books.pl.incomeHead", "Income — money you earned")}
                    </TableCell>
                  </TableRow>
                  {(data?.income ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={2} className="text-muted-foreground text-sm">
                        {t("books.pl.noIncome", "No income booked in this range.")}
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
                          {acctName(t, r.code, r.name)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {acctPlain(t, r.code)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatINR(r.balancePaise)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell className="font-medium">{t("books.pl.totalIncome", "Total income")}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {formatINR(data?.totalIncomePaise ?? 0)}
                    </TableCell>
                  </TableRow>

                  <TableRow className="bg-slate-50">
                    <TableCell colSpan={2} className="font-semibold text-xs uppercase tracking-wide">
                      {t("books.pl.expensesHead", "Expenses — what it cost you")}
                    </TableCell>
                  </TableRow>
                  {(data?.expenses ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={2} className="text-muted-foreground text-sm">
                        {t("books.pl.noExpenses", "No expenses booked in this range.")}
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
                          {acctName(t, r.code, r.name)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {acctPlain(t, r.code)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatINR(r.balancePaise)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell className="font-medium">{t("books.pl.totalExpenses", "Total expenses")}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {formatINR(data?.totalExpensesPaise ?? 0)}
                    </TableCell>
                  </TableRow>
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-semibold">
                      {net >= 0 ? t("books.pl.netProfit", "Net profit") : t("books.pl.netLoss", "Net loss")}
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
                <CardTitle className="text-base">{t("books.pl.fuelMargin", "Fuel margin")}</CardTitle>
                <CardDescription>
                  {t(
                    "books.pl.fuelMarginDesc",
                    "What the fuel sold for, against what it cost you to buy.",
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">
                      {t("books.pl.fuelSoldFor", "Fuel sold for")}
                    </div>
                    <div className="font-semibold">{formatINR(data?.fuelSalesPaise ?? 0)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">
                      {t("books.pl.fuelCost", "Cost of that fuel")}
                    </div>
                    <div className="font-semibold">{formatINR(data?.cogsPaise ?? 0)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">
                      {t("books.pl.youKept", "You kept")}
                    </div>
                    <div className="font-semibold text-green-700">
                      {formatINR(data?.grossMarginPaise ?? 0)}
                    </div>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("books.pl.colFuel", "Fuel")}</TableHead>
                      <TableHead className="text-right">{t("common.litres", "Litres")}</TableHead>
                      <TableHead className="text-right">{t("books.pl.colSaleValue", "Sale value")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.salesByFuel ?? []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground">
                          {t("books.pl.noFuelSales", "No fuel sales in this range.")}
                        </TableCell>
                      </TableRow>
                    )}
                    {(data?.salesByFuel ?? []).map((f) => (
                      <TableRow key={f.fuelType}>
                        <TableCell>{fuelLabel(t, f.fuelType)}</TableCell>
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
                <CardTitle className="text-base">
                  {t("books.pl.byCategory", "Running costs by category")}
                </CardTitle>
                <CardDescription>
                  {t(
                    "books.pl.byCategoryDesc",
                    "Operating expenses booked in this range, split by category.",
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("books.pl.colCategory", "Category")}</TableHead>
                      <TableHead className="text-right">{t("common.amount", "Amount")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.expensesByCategory ?? []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-muted-foreground">
                          {t("books.pl.noOpex", "No operating expenses in this range.")}
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

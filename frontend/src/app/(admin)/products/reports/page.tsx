"use client";
// Non-fuel retail reports: which line earns, what is on the shelf, and how stock
// moved. Revenue is always NET of GST — the tax collected is the government's,
// never margin.
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatINR } from "@/lib/utils";
import { format, parseISO, subDays } from "date-fns";
import { useT } from "@/lib/i18n";
import { useDateLocale } from "@/lib/i18n/core";
import { ArrowLeft } from "lucide-react";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  UNIT_LABELS,
  type MarginReport,
  type MovementSummary,
  type StockReport,
} from "../types";

const ALL = "__all__";
const todayStr = () => new Date().toISOString().slice(0, 10);
const daysAgoStr = (d: number) => subDays(new Date(), d).toISOString().slice(0, 10);

export default function ProductReportsPage() {
  const { t } = useT();
  const locale = useDateLocale();
  const [from, setFrom] = useState(daysAgoStr(29));
  const [to, setTo] = useState(todayStr());
  const [category, setCategory] = useState(ALL);
  const [groupBy, setGroupBy] = useState<"day" | "month">("day");

  const rangeQs = `from=${from}&to=${to}`;
  const catQs = category !== ALL ? `&category=${category}` : "";

  const marginQ = useQuery<MarginReport>({
    queryKey: ["product-reports", "margin", from, to, category],
    queryFn: async () => (await api.get(`/api/products/reports/margin?${rangeQs}${catQs}`)).data,
  });
  const stockQ = useQuery<StockReport>({
    queryKey: ["product-reports", "stock", category],
    queryFn: async () =>
      (await api.get(`/api/products/reports/stock?${catQs.replace(/^&/, "")}`)).data,
  });
  const summaryQ = useQuery<MovementSummary>({
    queryKey: ["product-reports", "summary", from, to, groupBy],
    queryFn: async () =>
      (await api.get(`/api/products/reports/movement-summary?${rangeQs}&groupBy=${groupBy}`)).data,
  });

  const margin = marginQ.data;
  const stock = stockQ.data;
  const summary = summaryQ.data;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/products"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5 mr-1" /> {t("products.title", "Non-Fuel Retail")}
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold mt-1">{t("products.reportsTitle", "Non-Fuel Reports")}</h1>
        <p className="text-muted-foreground text-sm sm:text-base">
          {t("products.reportsSubtitle", "Margin, stock and movement for lubes, AdBlue, accessories and services.")}
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <Label className="text-xs">{t("common.from", "From")}</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">{t("common.to", "To")}</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">{t("products.category", "Category")}</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t("products.allCategories", "All categories")}</SelectItem>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {t(`products.category.${c}`, CATEGORY_LABELS[c])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t("products.groupMovementBy", "Group movement by")}</Label>
              <Select value={groupBy} onValueChange={(v) => setGroupBy(v as "day" | "month")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">{t("products.day", "Day")}</SelectItem>
                  <SelectItem value="month">{t("products.month", "Month")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="margin">
        <TabsList>
          <TabsTrigger value="margin">{t("products.tab.margin", "Margin")}</TabsTrigger>
          <TabsTrigger value="stock">{t("products.tab.stock", "Stock")}</TabsTrigger>
          <TabsTrigger value="movement">{t("products.tab.movement", "Movement")}</TabsTrigger>
        </TabsList>

        {/* ---------------- MARGIN ---------------- */}
        <TabsContent value="margin" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">{t("products.revenueNet", "Revenue (net of GST)")}</CardTitle>
              </CardHeader>
              <CardContent className="text-xl font-bold">
                {formatINR(margin?.totals.revenueNetPaise || "0")}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">{t("products.gstCollected", "GST collected")}</CardTitle>
              </CardHeader>
              <CardContent className="text-xl font-bold">
                {formatINR(margin?.totals.gstPaise || "0")}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">{t("products.cogs", "Cost of goods")}</CardTitle>
              </CardHeader>
              <CardContent className="text-xl font-bold">
                {formatINR(margin?.totals.cogsPaise || "0")}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">{t("products.grossMargin", "Gross margin")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold text-green-700">
                  {formatINR(margin?.totals.marginPaise || "0")}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("products.marginPctOfRevenue", "{pct}% of net revenue", { pct: (margin?.totals.marginPct ?? 0).toFixed(1) })}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t("products.byCategory", "By category")}</CardTitle>
              <CardDescription>{t("products.byCategoryHint", "Where the non-fuel money comes from.")}</CardDescription>
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("products.category", "Category")}</TableHead>
                      <TableHead className="text-right">{t("products.qtySold", "Qty sold")}</TableHead>
                      <TableHead className="text-right">{t("products.revenueNetShort", "Revenue (net)")}</TableHead>
                      <TableHead className="text-right">{t("products.cogsShort", "COGS")}</TableHead>
                      <TableHead className="text-right">{t("products.margin", "Margin")}</TableHead>
                      <TableHead className="text-right">{t("products.marginPct", "Margin %")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(margin?.categories || []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          {marginQ.isLoading ? t("common.loading", "Loading…") : t("products.noSalesInWindow", "No non-fuel sales in this window.")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      margin!.categories.map((c) => (
                        <TableRow key={c.category}>
                          <TableCell className="font-medium">
                            {t(`products.category.${c.category}`, CATEGORY_LABELS[c.category])}
                          </TableCell>
                          <TableCell className="text-right">{c.quantitySold}</TableCell>
                          <TableCell className="text-right">
                            {formatINR(c.revenueNetPaise)}
                          </TableCell>
                          <TableCell className="text-right">{formatINR(c.cogsPaise)}</TableCell>
                          <TableCell className="text-right font-medium">
                            {formatINR(c.marginPaise)}
                          </TableCell>
                          <TableCell className="text-right">{c.marginPct.toFixed(1)}%</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("products.byProduct", "By product")}</CardTitle>
              <CardDescription>
                {t("products.byProductHint", "Ranked by margin contribution — the top rows are the lines worth pushing.")}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("products.product", "Product")}</TableHead>
                      <TableHead className="text-right">{t("products.qtySold", "Qty sold")}</TableHead>
                      <TableHead className="text-right">{t("products.revenueNetShort", "Revenue (net)")}</TableHead>
                      <TableHead className="text-right">{t("products.gst", "GST")}</TableHead>
                      <TableHead className="text-right">{t("products.cogsShort", "COGS")}</TableHead>
                      <TableHead className="text-right">{t("products.margin", "Margin")}</TableHead>
                      <TableHead className="text-right">{t("products.marginPct", "Margin %")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(margin?.products || []).filter((p) => p.quantitySold !== 0).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          {marginQ.isLoading
                            ? t("common.loading", "Loading…")
                            : t("products.nothingSold", "Nothing sold in this window. Record a sale from the catalog to see margin here.")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      margin!.products
                        .filter((p) => p.quantitySold !== 0)
                        .map((p) => (
                          <TableRow key={p.productId}>
                            <TableCell>
                              <Link
                                href={`/products/${p.productId}`}
                                className="font-medium hover:underline"
                              >
                                {p.name}
                              </Link>
                              <div className="text-xs text-muted-foreground font-mono">
                                {p.sku} · {p.gstRateBp / 100}% {t("products.gst", "GST")}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">{p.quantitySold}</TableCell>
                            <TableCell className="text-right">
                              {formatINR(p.revenueNetPaise)}
                            </TableCell>
                            <TableCell className="text-right">{formatINR(p.gstPaise)}</TableCell>
                            <TableCell className="text-right">{formatINR(p.cogsPaise)}</TableCell>
                            <TableCell className="text-right font-medium">
                              {formatINR(p.marginPaise)}
                            </TableCell>
                            <TableCell className="text-right">
                              {p.marginPct.toFixed(1)}%
                            </TableCell>
                          </TableRow>
                        ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- STOCK ---------------- */}
        <TabsContent value="stock" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">{t("products.inventoryValue", "Inventory value")}</CardTitle>
              </CardHeader>
              <CardContent className="text-xl font-bold">
                {formatINR(stock?.totals.totalValuePaise || "0")}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">{t("products.belowReorder", "Below reorder")}</CardTitle>
              </CardHeader>
              <CardContent className="text-xl font-bold text-amber-700">
                {stock?.totals.belowReorderCount ?? 0}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">{t("products.outOfStock", "Out of stock")}</CardTitle>
              </CardHeader>
              <CardContent className="text-xl font-bold">
                {stock?.totals.outOfStockCount ?? 0}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t("products.stockOnHand", "Stock on hand")}</CardTitle>
              <CardDescription>
                {t("products.stockValuedHint", "Valued at weighted-average cost, net of input GST.")}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("products.product", "Product")}</TableHead>
                      <TableHead className="text-right">{t("products.qty", "Qty")}</TableHead>
                      <TableHead className="text-right">{t("products.avgCost", "Avg cost")}</TableHead>
                      <TableHead className="text-right">{t("products.value", "Value")}</TableHead>
                      <TableHead className="text-right">{t("products.reorderAtCol", "Reorder at")}</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(stock?.rows || []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          {stockQ.isLoading ? t("common.loading", "Loading…") : t("products.noActiveInCategory", "No active products in this category.")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      stock!.rows.map((r) => (
                        <TableRow key={r.productId}>
                          <TableCell>
                            <Link
                              href={`/products/${r.productId}`}
                              className="font-medium hover:underline"
                            >
                              {r.name}
                            </Link>
                            <div className="text-xs text-muted-foreground font-mono">
                              {r.sku} · {t(`products.unit.${r.unit}`, UNIT_LABELS[r.unit])}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{r.quantity}</TableCell>
                          <TableCell className="text-right">{formatINR(r.avgCostPaise)}</TableCell>
                          <TableCell className="text-right font-medium">
                            {formatINR(r.valuePaise)}
                          </TableCell>
                          <TableCell className="text-right">
                            {r.reorderLevelQty || "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {r.belowReorder && <Badge variant="warning">{t("products.reorderBadge", "reorder")}</Badge>}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- MOVEMENT ---------------- */}
        <TabsContent value="movement" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("products.purchasesVsSales", "Purchases vs sales")}</CardTitle>
              <CardDescription>
                {groupBy === "day"
                  ? t("products.perDayHint", "Per day. Amounts are net of GST; adjustments are stock corrections and carry no tax.")
                  : t("products.perMonthHint", "Per month. Amounts are net of GST; adjustments are stock corrections and carry no tax.")}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("products.period", "Period")}</TableHead>
                      <TableHead className="text-right">{t("products.purchasedQty", "Purchased qty")}</TableHead>
                      <TableHead className="text-right">{t("products.purchases", "Purchases")}</TableHead>
                      <TableHead className="text-right">{t("products.soldQty", "Sold qty")}</TableHead>
                      <TableHead className="text-right">{t("products.salesNet", "Sales (net)")}</TableHead>
                      <TableHead className="text-right">{t("products.gst", "GST")}</TableHead>
                      <TableHead className="text-right">{t("products.adjInOut", "Adj. in / out")}</TableHead>
                      <TableHead className="text-right">{t("products.retInOut", "Ret. in / out")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(summary?.periods || []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                          {summaryQ.isLoading
                            ? t("common.loading", "Loading…")
                            : t("products.noMovementInWindow", "No stock movement in this window.")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      <>
                        {summary!.periods.map((b) => (
                          <TableRow key={b.period}>
                            <TableCell className="whitespace-nowrap">
                              {groupBy === "day"
                                ? format(parseISO(b.period), "dd MMM yy", { locale })
                                : format(parseISO(b.period + "-01"), "MMM yyyy", { locale })}
                            </TableCell>
                            <TableCell className="text-right">{b.purchaseQty}</TableCell>
                            <TableCell className="text-right">
                              {formatINR(b.purchasePaise)}
                            </TableCell>
                            <TableCell className="text-right">{b.saleQty}</TableCell>
                            <TableCell className="text-right">
                              {formatINR(b.saleNetPaise)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatINR(b.saleGstPaise)}
                            </TableCell>
                            <TableCell className="text-right">
                              {b.adjustmentInQty} / {b.adjustmentOutQty}
                            </TableCell>
                            <TableCell className="text-right">
                              {b.returnInQty} / {b.returnOutQty}
                            </TableCell>
                          </TableRow>
                        ))}
                        {summary && (
                          <TableRow className="font-semibold">
                            <TableCell>{t("common.total", "Total")}</TableCell>
                            <TableCell className="text-right">
                              {summary.totals.purchaseQty}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatINR(summary.totals.purchasePaise)}
                            </TableCell>
                            <TableCell className="text-right">{summary.totals.saleQty}</TableCell>
                            <TableCell className="text-right">
                              {formatINR(summary.totals.saleNetPaise)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatINR(summary.totals.saleGstPaise)}
                            </TableCell>
                            <TableCell className="text-right">
                              {summary.totals.adjustmentInQty} / {summary.totals.adjustmentOutQty}
                            </TableCell>
                            <TableCell className="text-right">
                              {summary.totals.returnInQty} / {summary.totals.returnOutQty}
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

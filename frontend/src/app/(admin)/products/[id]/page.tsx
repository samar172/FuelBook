"use client";
// One non-fuel product: its pricing, its stock and cost basis, and the full
// movement history behind that stock.
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api, can } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { NoMatchRow } from "@/components/ui/sortable-table";
import { formatINR } from "@/lib/utils";
import { format, parseISO, subDays } from "date-fns";
import { useT } from "@/lib/i18n";
import { useDateLocale } from "@/lib/i18n/core";
import { ArrowLeft, Pencil, ShoppingCart, Truck } from "lucide-react";
import { ProductDialog } from "../product-dialog";
import { MovementDialog } from "../movement-dialog";
import {
  CATEGORY_LABELS,
  KINDS,
  KIND_LABELS,
  UNIT_LABELS,
  big,
  packLabel,
  splitGst,
  type Movement,
  type MovementKind,
  type ProductDetail,
} from "../types";

const ALL = "__all__";
const todayStr = () => new Date().toISOString().slice(0, 10);
const daysAgoStr = (d: number) => subDays(new Date(), d).toISOString().slice(0, 10);

export default function ProductDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { t } = useT();
  const locale = useDateLocale();
  const canManage = can("canManagePump");
  const canMove = can("canEditExpenses");

  const [from, setFrom] = useState(daysAgoStr(89));
  const [to, setTo] = useState(todayStr());
  const [kind, setKind] = useState(ALL);

  const [formOpen, setFormOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveKind, setMoveKind] = useState<MovementKind>("SALE");

  const productQ = useQuery<ProductDetail>({
    queryKey: ["product", id],
    queryFn: async () => (await api.get(`/api/products/${id}`)).data,
  });

  const qs = new URLSearchParams({ from, to });
  if (kind !== ALL) qs.set("kind", kind);
  const movementsQ = useQuery<Movement[]>({
    queryKey: ["product-movements", id, from, to, kind],
    queryFn: async () => (await api.get(`/api/products/${id}/movements?${qs}`)).data,
  });

  if (productQ.isLoading) return <div className="text-muted-foreground">{t("common.loading", "Loading…")}</div>;
  if (!productQ.data) return <div className="text-muted-foreground">{t("products.notFound", "Product not found.")}</div>;

  const p = productQ.data;
  const stockless = p.unit === "SERVICE" || p.category === "SERVICE";
  const movements = movementsQ.data || [];

  // Margin at today's prices: MRP is quoted GST-inclusive, so the tax inside it
  // is not margin. Cost is the average cost actually in stock where there is
  // stock, otherwise the catalog purchase price.
  const mrpSplit = splitGst(big(p.sellingPricePaise), p.gstRateBp, true);
  const unitCost = p.stockQuantity > 0 ? big(p.avgCostPaise) : big(p.purchasePricePaise);
  const unitMargin = mrpSplit.taxable - unitCost;
  const unitMarginPct =
    mrpSplit.taxable > 0n ? Number((unitMargin * 10000n) / mrpSplit.taxable) / 100 : 0;

  const openMovement = (k: MovementKind) => {
    setMoveKind(k);
    setMoveOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link
            href="/products"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> {t("products.title", "Non-Fuel Retail")}
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold mt-1">{p.name}</h1>
          <p className="text-muted-foreground text-sm">
            <span className="font-mono">{p.sku}</span> · {t(`products.category.${p.category}`, CATEGORY_LABELS[p.category])} ·{" "}
            {t(`products.unit.${p.unit}`, UNIT_LABELS[p.unit])}
            {p.packSizeMl ? ` · ${packLabel(p)}` : ""}
            {p.hsnCode ? ` · ${t("products.hsnValue", "HSN {code}", { code: p.hsnCode })}` : ""}
            {!p.isActive && (
              <Badge variant="secondary" className="ml-2">
                {t("products.inactiveBadge", "inactive")}
              </Badge>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canMove && p.isActive && (
            <>
              <Button variant="outline" onClick={() => openMovement("SALE")}>
                <ShoppingCart className="h-4 w-4 mr-1" /> {t("products.recordSale", "Record sale")}
              </Button>
              <Button variant="outline" onClick={() => openMovement("PURCHASE")}>
                <Truck className="h-4 w-4 mr-1" /> {t("products.recordPurchase", "Record purchase")}
              </Button>
            </>
          )}
          {canManage && (
            <Button onClick={() => setFormOpen(true)}>
              <Pencil className="h-4 w-4 mr-1" /> {t("common.edit", "Edit")}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{t("products.stockOnHand", "Stock on hand")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stockless ? "—" : `${p.stockQuantity} ${t(`products.unit.${p.unit}`, UNIT_LABELS[p.unit])}`}
            </div>
            {!stockless && p.belowReorder && (
              <Badge variant="warning" className="mt-1">
                {t("products.atOrBelowReorder", "at or below reorder level {n}", { n: p.reorderLevelQty })}
              </Badge>
            )}
            {stockless && (
              <p className="text-xs text-muted-foreground">{t("products.serviceHoldsNoStock", "A service holds no stock.")}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{t("products.stockValue", "Stock value")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatINR(p.stockValuePaise)}</div>
            <p className="text-xs text-muted-foreground">
              {t("products.avgCostPerUnit", "Avg cost {amount} / {unit}", { amount: formatINR(p.avgCostPaise), unit: t(`products.unit.${p.unit}`, UNIT_LABELS[p.unit]).toLowerCase() })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{t("products.mrpAndGst", "MRP & GST")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatINR(p.sellingPricePaise)}</div>
            <p className="text-xs text-muted-foreground">
              {t("products.gstSplitHint", "{pct}% GST — {taxable} taxable + {gst} tax", {
                pct: p.gstRateBp / 100,
                taxable: formatINR(mrpSplit.taxable.toString()),
                gst: formatINR(mrpSplit.gst.toString()),
              })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{t("products.marginPerUnit", "Margin per unit")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${unitMargin < 0n ? "text-destructive" : "text-green-700"}`}
            >
              {formatINR(unitMargin.toString())}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("products.marginPctOfNet", "{pct}% of net revenue, at cost {cost}", { pct: unitMarginPct.toFixed(1), cost: formatINR(unitCost.toString()) })}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="gap-3">
          <CardTitle>{t("products.movementHistory", "Movement history")}</CardTitle>
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
              <Label className="text-xs">{t("products.kindFilter", "Kind")}</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t("products.allKinds", "All kinds")}</SelectItem>
                  {KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {t(`products.kind.${k}`, KIND_LABELS[k])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.date", "Date")}</TableHead>
                  <TableHead>{t("products.kindFilter", "Kind")}</TableHead>
                  <TableHead className="text-right">{t("products.qty", "Qty")}</TableHead>
                  <TableHead className="text-right">{t("products.unitPrice", "Unit price")}</TableHead>
                  <TableHead className="text-right">{t("products.taxable", "Taxable")}</TableHead>
                  <TableHead className="text-right">{t("products.gst", "GST")}</TableHead>
                  <TableHead className="text-right">{t("common.total", "Total")}</TableHead>
                  <TableHead>{t("products.reference", "Reference")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movementsQ.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      {t("common.loading", "Loading…")}
                    </TableCell>
                  </TableRow>
                ) : movements.length === 0 ? (
                  <NoMatchRow
                    colSpan={8}
                    filtered={kind !== ALL}
                    onClear={() => setKind(ALL)}
                    emptyMessage={t("products.noMovements", "No movements in this window. Record a purchase to bring opening stock in.")}
                  />
                ) : (
                  movements.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(parseISO(m.occurredAt), "dd MMM yy", { locale })}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            m.kind === "SALE"
                              ? "default"
                              : m.kind === "PURCHASE"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {t(`products.kind.${m.kind}`, KIND_LABELS[m.kind])}
                        </Badge>
                        <span
                          className={`ml-2 text-xs ${m.direction === "IN" ? "text-green-700" : "text-muted-foreground"}`}
                        >
                          {m.direction}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {m.direction === "IN" ? "+" : "−"}
                        {m.quantity}
                      </TableCell>
                      <TableCell className="text-right">{formatINR(m.unitPricePaise)}</TableCell>
                      <TableCell className="text-right">{formatINR(m.taxablePaise)}</TableCell>
                      <TableCell className="text-right">{formatINR(m.gstPaise)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatINR(m.totalPaise)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {m.reference || "—"}
                        {m.customerId && (
                          <div title={t("products.onCreditTitle", "Informational only — not added to the fuel credit balance")}>
                            {t("products.onCreditFlag", "on credit")}
                          </div>
                        )}
                        {m.notes && <div>{m.notes}</div>}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground px-6 pt-3">
            {t("products.creditFootnote", "A sale marked \"on credit\" is recorded against the customer for reference only — it is NOT added to their fuel credit balance, which is kept by the fuel credit module.")}
          </p>
        </CardContent>
      </Card>

      <ProductDialog open={formOpen} onOpenChange={setFormOpen} product={p} />
      <MovementDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        product={p}
        defaultKind={moveKind}
      />
    </div>
  );
}

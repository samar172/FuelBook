"use client";
// NON-FUEL RETAIL catalog: lubricants, AdBlue, accessories and services.
// Fuel margin is fixed and thin; this is the part of the forecourt that earns.
import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, can } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  FilterChip,
  NoMatchRow,
  SortableHead,
  sortBig,
  useTableSort,
} from "@/components/ui/sortable-table";
import { formatINR } from "@/lib/utils";
import { apiError } from "@/lib/types";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { BarChart3, Package, Plus, ShoppingCart, Truck } from "lucide-react";
import { ProductDialog } from "./product-dialog";
import { MovementDialog } from "./movement-dialog";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  UNIT_LABELS,
  big,
  packLabel,
  type MovementKind,
  type Product,
} from "./types";

const ALL = "__all__";

type Filters = { q: string; category: string; active: string; lowStockOnly: boolean };
const EMPTY: Filters = { q: "", category: ALL, active: ALL, lowStockOnly: false };

export default function ProductsPage() {
  const { t } = useT();
  const qc = useQueryClient();
  const canManage = can("canManagePump");
  const canMove = can("canEditExpenses");

  const { data = [], isLoading } = useQuery<Product[]>({
    queryKey: ["products"],
    queryFn: async () => (await api.get("/api/products")).data,
  });

  const [f, setF] = useState<Filters>(EMPTY);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) =>
    setF((cur) => ({ ...cur, [k]: v }));

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveProduct, setMoveProduct] = useState<Product | null>(null);
  const [moveKind, setMoveKind] = useState<MovementKind>("SALE");

  const openMovement = (p: Product, kind: MovementKind) => {
    setMoveProduct(p);
    setMoveKind(kind);
    setMoveOpen(true);
  };

  // The whole catalog is loaded in one call, so filter and sort in the browser.
  const filtered = useMemo(() => {
    const needle = f.q.trim().toLowerCase();
    return data.filter((p) => {
      if (needle) {
        const hay = [p.sku, p.name, p.hsnCode || ""].join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (f.category !== ALL && p.category !== f.category) return false;
      if (f.active === "active" && !p.isActive) return false;
      if (f.active === "inactive" && p.isActive) return false;
      if (f.lowStockOnly && !p.belowReorder) return false;
      return true;
    });
  }, [data, f]);

  const { rows, sortProps } = useTableSort<Product>(
    filtered,
    {
      sku: (p) => p.sku,
      name: (p) => p.name,
      category: (p) => p.category,
      stock: (p) => p.stockQuantity,
      value: (p) => sortBig(p.stockValuePaise),
      selling: (p) => sortBig(p.sellingPricePaise),
      gst: (p) => p.gstRateBp,
      status: (p) => (p.isActive ? 0 : 1),
    },
    { key: "name", dir: "asc" },
  );

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (f.q.trim())
    chips.push({ key: "q", label: t("products.searchChip", "Search: {q}", { q: f.q.trim() }), clear: () => set("q", "") });
  if (f.category !== ALL)
    chips.push({
      key: "cat",
      label: t(`products.category.${f.category}`, CATEGORY_LABELS[f.category as keyof typeof CATEGORY_LABELS] || f.category),
      clear: () => set("category", ALL),
    });
  if (f.active !== ALL)
    chips.push({
      key: "active",
      label: f.active === "active" ? t("products.activeOnly", "Active only") : t("products.inactiveOnly", "Inactive only"),
      clear: () => set("active", ALL),
    });
  if (f.lowStockOnly)
    chips.push({ key: "low", label: t("products.lowStock", "Low stock"), clear: () => set("lowStockOnly", false) });
  const filteredOn = chips.length > 0;

  const totals = useMemo(
    () => ({
      count: data.length,
      value: data.reduce((acc, p) => acc + big(p.stockValuePaise), 0n),
      low: data.filter((p) => p.belowReorder && p.isActive).length,
    }),
    [data],
  );

  const retire = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/api/products/${id}`)).data,
    onSuccess: (res) => {
      toast.success(
        res?.deleted
          ? t("products.deleted", "Product deleted")
          : t("products.deactivated", "Product deactivated — its movement history is kept"),
      );
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">{t("products.title", "Non-Fuel Retail")}</h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            {t("products.subtitle", "Lubricants, AdBlue, accessories and services — the GST-bearing lines that carry real margin.")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/products/reports">
              <BarChart3 className="h-4 w-4 mr-1" /> {t("products.reports", "Reports")}
            </Link>
          </Button>
          {canManage && (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1" /> {t("products.addProduct", "Add product")}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{t("products.productsCount", "Products")}</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{totals.count}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{t("products.inventoryValue", "Inventory value")}</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {formatINR(totals.value.toString())}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{t("products.belowReorderLevel", "Below reorder level")}</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {totals.low > 0 ? (
              <button
                type="button"
                className="text-amber-700 underline-offset-2 hover:underline"
                onClick={() => set("lowStockOnly", true)}
              >
                {totals.low}
              </button>
            ) : (
              0
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="gap-3">
          <CardTitle>{t("products.catalog", "Catalog")}</CardTitle>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <Input
              placeholder={t("products.searchPlaceholder", "Search SKU, name or HSN")}
              value={f.q}
              onChange={(e) => set("q", e.target.value)}
              className="sm:col-span-2"
            />
            <Select value={f.category} onValueChange={(v) => set("category", v)}>
              <SelectTrigger>
                <SelectValue placeholder={t("products.allCategories", "All categories")} />
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
            <Select value={f.active} onValueChange={(v) => set("active", v)}>
              <SelectTrigger>
                <SelectValue placeholder={t("products.activeAndInactive", "Active & inactive")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("products.activeAndInactive", "Active & inactive")}</SelectItem>
                <SelectItem value="active">{t("products.activeOnly", "Active only")}</SelectItem>
                <SelectItem value="inactive">{t("products.inactiveOnly", "Inactive only")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant={f.lowStockOnly ? "default" : "outline"}
              onClick={() => set("lowStockOnly", !f.lowStockOnly)}
            >
              {t("products.lowStockOnly", "Low stock only")}
            </Button>
            {chips.map((c) => (
              <FilterChip key={c.key} label={c.label} onRemove={c.clear} />
            ))}
            {filteredOn && (
              <Button size="sm" variant="ghost" onClick={() => setF(EMPTY)}>
                {t("common.clearAll", "Clear all")}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          {isLoading ? (
            <div className="text-muted-foreground px-6 py-8">{t("common.loading", "Loading…")}</div>
          ) : data.length === 0 ? (
            <div className="px-6 py-10 text-center space-y-3">
              <Package className="h-8 w-8 mx-auto text-muted-foreground" />
              <div className="font-medium">{t("products.emptyTitle", "No non-fuel products yet")}</div>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                {t("products.emptyBody", "Start with the lubes you actually stock — a 1 L engine oil, a 500 ml pack, an AdBlue can. Add the SKU, the purchase price and the MRP, then record a purchase to bring the opening stock in.")}
              </p>
              {canManage ? (
                <Button
                  onClick={() => {
                    setEditing(null);
                    setFormOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" /> {t("products.addFirst", "Add the first product")}
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("products.askOwner", "Ask the owner or manager to set the catalog up.")}
                </p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHead {...sortProps("sku")}>
                      {t("products.sku", "SKU")}
                    </SortableHead>
                    <SortableHead {...sortProps("name")}>
                      {t("products.product", "Product")}
                    </SortableHead>
                    <SortableHead {...sortProps("category")}>
                      {t("products.category", "Category")}
                    </SortableHead>
                    <SortableHead {...sortProps("stock")} align="right">
                      {t("products.stock", "Stock")}
                    </SortableHead>
                    <SortableHead {...sortProps("value")} align="right">
                      {t("products.stockValue", "Stock value")}
                    </SortableHead>
                    <SortableHead {...sortProps("selling")} align="right">
                      {t("products.mrp", "MRP")}
                    </SortableHead>
                    <SortableHead {...sortProps("gst")} align="right">
                      {t("products.gst", "GST")}
                    </SortableHead>
                    <TableHead className="text-right">{t("common.actions", "Actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <NoMatchRow
                      colSpan={8}
                      filtered={filteredOn}
                      onClear={() => setF(EMPTY)}
                      emptyMessage={t("products.noProducts", "No products.")}
                    />
                  ) : (
                    rows.map((p) => {
                      const stockless = p.unit === "SERVICE" || p.category === "SERVICE";
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                          <TableCell>
                            <Link
                              href={`/products/${p.id}`}
                              className="font-medium hover:underline"
                            >
                              {p.name}
                            </Link>
                            <div className="text-xs text-muted-foreground">
                              {t(`products.unit.${p.unit}`, UNIT_LABELS[p.unit])}
                              {p.packSizeMl ? ` · ${packLabel(p)}` : ""}
                              {p.hsnCode ? ` · ${t("products.hsnValue", "HSN {code}", { code: p.hsnCode })}` : ""}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {t(`products.category.${p.category}`, CATEGORY_LABELS[p.category])}
                          </TableCell>
                          <TableCell className="text-right">
                            {stockless ? (
                              <span className="text-muted-foreground text-xs">{t("products.notStocked", "not stocked")}</span>
                            ) : (
                              <div className="flex items-center justify-end gap-2">
                                <span>{p.stockQuantity}</span>
                                {p.belowReorder && (
                                  <Badge variant="warning" title={t("products.reorderAt", "Reorder at {n}", { n: p.reorderLevelQty })}>
                                    {t("products.reorderBadge", "reorder")}
                                  </Badge>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatINR(p.stockValuePaise)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatINR(p.sellingPricePaise)}
                          </TableCell>
                          <TableCell className="text-right">{p.gstRateBp / 100}%</TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            {!p.isActive && (
                              <Badge variant="secondary" className="mr-2">
                                {t("products.inactiveBadge", "inactive")}
                              </Badge>
                            )}
                            {canMove && p.isActive && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="mr-1"
                                  onClick={() => openMovement(p, "SALE")}
                                >
                                  <ShoppingCart className="h-3.5 w-3.5 sm:mr-1" />
                                  <span className="hidden sm:inline">{t("products.sell", "Sell")}</span>
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="mr-1"
                                  onClick={() => openMovement(p, "PURCHASE")}
                                >
                                  <Truck className="h-3.5 w-3.5 sm:mr-1" />
                                  <span className="hidden sm:inline">{t("products.buy", "Buy")}</span>
                                </Button>
                              </>
                            )}
                            {canManage && (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setEditing(p);
                                    setFormOpen(true);
                                  }}
                                >
                                  {t("common.edit", "Edit")}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive"
                                  disabled={retire.isPending}
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        t("products.retireConfirm", "Retire \"{name}\"? If it has movements it is deactivated, not deleted.", { name: p.name }),
                                      )
                                    )
                                      retire.mutate(p.id);
                                  }}
                                >
                                  {t("products.retire", "Retire")}
                                </Button>
                              </>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ProductDialog open={formOpen} onOpenChange={setFormOpen} product={editing} />
      <MovementDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        product={moveProduct}
        defaultKind={moveKind}
      />
    </div>
  );
}

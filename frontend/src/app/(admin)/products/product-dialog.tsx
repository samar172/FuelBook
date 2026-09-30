"use client";
// Add / edit a non-fuel product. GST is entered as a PERCENTAGE (what the
// invoice shows) and converted to basis points for the API; prices are typed in
// rupees and converted to BigInt paise without touching floating point.
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatINR } from "@/lib/utils";
import { apiError } from "@/lib/types";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  GST_RATE_OPTIONS,
  UNITS,
  UNIT_LABELS,
  bpToPct,
  pctToBp,
  paiseToRupeesInput,
  rupeesInputToPaise,
  splitGst,
  type Product,
  type ProductCategory,
  type ProductUnit,
} from "./types";

type Form = {
  sku: string;
  name: string;
  category: ProductCategory;
  unit: ProductUnit;
  packSize: string; // ml
  purchase: string; // rupees
  selling: string; // rupees
  gstPct: string;
  hsnCode: string;
  reorder: string;
};

const EMPTY: Form = {
  sku: "",
  name: "",
  category: "LUBRICANT",
  unit: "PIECE",
  packSize: "",
  purchase: "",
  selling: "",
  gstPct: "18",
  hsnCode: "",
  reorder: "0",
};

export function ProductDialog({
  open,
  onOpenChange,
  product,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product?: Product | null;
}) {
  const { t } = useT();
  const qc = useQueryClient();
  const [f, setF] = useState<Form>(EMPTY);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((c) => ({ ...c, [k]: v }));

  useEffect(() => {
    if (!open) return;
    setF(
      product
        ? {
            sku: product.sku,
            name: product.name,
            category: product.category,
            unit: product.unit,
            packSize: product.packSizeMl ? String(product.packSizeMl) : "",
            purchase: paiseToRupeesInput(product.purchasePricePaise),
            selling: paiseToRupeesInput(product.sellingPricePaise),
            gstPct: bpToPct(product.gstRateBp),
            hsnCode: product.hsnCode || "",
            reorder: String(product.reorderLevelQty),
          }
        : EMPTY,
    );
  }, [open, product]);

  const gstRateBp = pctToBp(f.gstPct);
  const purchasePaise = rupeesInputToPaise(f.purchase);
  const sellingPaise = rupeesInputToPaise(f.selling);

  // Margin preview treats the selling price as GST-INCLUSIVE (an MRP) and the
  // purchase price as the ex-GST cost, which is how a pump actually buys and
  // sells: the tax in the selling price is never margin.
  const sellSplit = splitGst(sellingPaise, gstRateBp, true);
  const marginPaise = sellSplit.taxable - purchasePaise;
  const marginPct =
    sellSplit.taxable > 0n ? Number((marginPaise * 10000n) / sellSplit.taxable) / 100 : 0;

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        sku: f.sku.trim().toUpperCase(),
        name: f.name.trim(),
        category: f.category,
        unit: f.unit,
        packSizeMl: f.packSize.trim() === "" ? null : String(Math.round(Number(f.packSize))),
        purchasePricePaise: purchasePaise.toString(),
        sellingPricePaise: sellingPaise.toString(),
        gstRateBp,
        hsnCode: f.hsnCode.trim() === "" ? null : f.hsnCode.trim(),
        reorderLevelQty: Math.max(0, Math.round(Number(f.reorder) || 0)),
      };
      return product
        ? (await api.patch(`/api/products/${product.id}`, payload)).data
        : (await api.post("/api/products", payload)).data;
    },
    onSuccess: () => {
      toast.success(product ? t("products.productUpdated", "Product updated") : t("products.productAdded", "Product added"));
      qc.invalidateQueries({ queryKey: ["products"] });
      if (product) qc.invalidateQueries({ queryKey: ["product", product.id] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const invalid = f.sku.trim() === "" || f.name.trim() === "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product ? t("products.editProduct", "Edit product") : t("products.addProduct", "Add product")}</DialogTitle>
          <DialogDescription>
            {t("products.dialogDescription", "Lubes, AdBlue, accessories and services. These lines are under GST — unlike fuel.")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>{t("products.sku", "SKU")}</Label>
              <Input
                value={f.sku}
                onChange={(e) => set("sku", e.target.value.toUpperCase())}
                placeholder="MAK-4T-1L"
                className="uppercase"
              />
              <p className="text-xs text-muted-foreground mt-1">{t("products.skuHint", "Unique for this pump.")}</p>
            </div>
            <div>
              <Label>{t("common.name", "Name")}</Label>
              <Input
                value={f.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Mak 4T Plus 20W-40 1L"
              />
            </div>
            <div>
              <Label>{t("products.category", "Category")}</Label>
              <Select value={f.category} onValueChange={(v) => set("category", v as ProductCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {t(`products.category.${c}`, CATEGORY_LABELS[c])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("products.unit", "Unit")}</Label>
              <Select value={f.unit} onValueChange={(v) => set("unit", v as ProductUnit)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {t(`products.unit.${u}`, UNIT_LABELS[u])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {f.unit === "SERVICE" && (
                <p className="text-xs text-muted-foreground mt-1">
                  {t("products.serviceNoStock", "A service holds no stock — selling one never depletes inventory.")}
                </p>
              )}
            </div>
            <div>
              <Label>{t("products.packSize", "Pack size (ml)")}</Label>
              <Input
                type="number"
                inputMode="numeric"
                value={f.packSize}
                onChange={(e) => set("packSize", e.target.value)}
                placeholder="1000"
              />
            </div>
            <div>
              <Label>{t("products.hsnCode", "HSN code")}</Label>
              <Input
                value={f.hsnCode}
                onChange={(e) => set("hsnCode", e.target.value)}
                placeholder="27101980"
              />
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>{t("products.purchasePrice", "Purchase price, ex-GST (₹)")}</Label>
              <Input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={f.purchase}
                onChange={(e) => set("purchase", e.target.value)}
              />
            </div>
            <div>
              <Label>{t("products.sellingPrice", "Selling price / MRP (₹)")}</Label>
              <Input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={f.selling}
                onChange={(e) => set("selling", e.target.value)}
              />
            </div>
            <div>
              <Label>{t("products.gstRate", "GST rate (%)")}</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={f.gstPct}
                  onChange={(e) => set("gstPct", e.target.value)}
                  className="w-24"
                />
                <div className="flex flex-wrap gap-1">
                  {GST_RATE_OPTIONS.map((bp) => (
                    <Button
                      key={bp}
                      type="button"
                      size="sm"
                      variant={gstRateBp === bp ? "default" : "outline"}
                      onClick={() => set("gstPct", bpToPct(bp))}
                    >
                      {bp / 100}%
                    </Button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t("products.gstStoredAs", "Stored as basis points ({bp} bp).", { bp: gstRateBp })}
              </p>
            </div>
            <div>
              <Label>{t("products.reorderLevel", "Reorder level (qty)")}</Label>
              <Input
                type="number"
                inputMode="numeric"
                value={f.reorder}
                onChange={(e) => set("reorder", e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t("products.reorderZeroHint", "0 turns the low-stock warning off.")}
              </p>
            </div>
          </div>

          <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
            <div className="font-medium">{t("products.marginPreview", "Margin preview (MRP treated as GST-inclusive)")}</div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("products.taxableInMrp", "Taxable value in MRP")}</span>
              <span>{formatINR(sellSplit.taxable.toString())}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("products.gstInMrp", "GST in MRP")}</span>
              <span>{formatINR(sellSplit.gst.toString())}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("products.cost", "Cost")}</span>
              <span>{formatINR(purchasePaise.toString())}</span>
            </div>
            <Separator className="my-1" />
            <div className="flex justify-between font-semibold">
              <span>{t("products.marginPerUnit", "Margin per unit")}</span>
              <span className={marginPaise < 0n ? "text-destructive" : "text-green-700"}>
                {formatINR(marginPaise.toString())} ({marginPct.toFixed(1)}%)
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button disabled={invalid || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? t("common.saving", "Saving…") : product ? t("products.saveChanges", "Save changes") : t("products.addProduct", "Add product")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

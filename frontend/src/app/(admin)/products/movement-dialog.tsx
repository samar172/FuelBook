"use client";
// Record a sale / purchase / return / adjustment at the counter.
//
// The GST breakdown and margin shown here use the exact same BigInt formulas the
// API applies, so what the operator sees before saving is what gets stored.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import {
  KIND_LABELS,
  KINDS,
  UNIT_LABELS,
  big,
  paiseToRupeesInput,
  rupeesInputToPaise,
  splitGst,
  type Direction,
  type MovementKind,
  type Product,
} from "./types";

const NONE = "__none__";

type Customer = { id: string; name: string; code: string | null; isActive: boolean };

export function MovementDialog({
  open,
  onOpenChange,
  product,
  defaultKind = "SALE",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: Product | null;
  defaultKind?: MovementKind;
}) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<MovementKind>(defaultKind);
  const [direction, setDirection] = useState<Direction>("IN");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [inclusive, setInclusive] = useState(true);
  const [customerId, setCustomerId] = useState(NONE);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [occurredAt, setOccurredAt] = useState("");

  const customersQ = useQuery<Customer[]>({
    queryKey: ["credit-customers"],
    queryFn: async () => (await api.get("/api/credit/customers")).data,
    enabled: open && kind === "SALE",
  });
  const customers = useMemo(
    () => (customersQ.data || []).filter((c) => c.isActive),
    [customersQ.data],
  );

  // Reset to sensible defaults each time the sheet opens: a sale is quoted at the
  // MRP (GST-inclusive), a purchase off an invoice (GST-exclusive).
  useEffect(() => {
    if (!open || !product) return;
    setKind(defaultKind);
    setDirection(defaultKind === "RETURN" ? "IN" : defaultKind === "SALE" ? "OUT" : "IN");
    setQty("1");
    setPrice(
      paiseToRupeesInput(
        defaultKind === "SALE" ? product.sellingPricePaise : product.purchasePricePaise,
      ),
    );
    setInclusive(defaultKind === "SALE");
    setCustomerId(NONE);
    setReference("");
    setNotes("");
    setOccurredAt("");
  }, [open, product, defaultKind]);

  // Switching kind re-picks the price basis for that kind.
  const changeKind = (k: MovementKind) => {
    setKind(k);
    setDirection(k === "SALE" ? "OUT" : "IN");
    setInclusive(k === "SALE");
    if (product) {
      setPrice(
        paiseToRupeesInput(
          k === "SALE" ? product.sellingPricePaise : product.purchasePricePaise,
        ),
      );
    }
  };

  const stockless = product?.unit === "SERVICE" || product?.category === "SERVICE";
  const quantity = Math.max(0, Math.round(Number(qty) || 0));
  const unitPaise = rupeesInputToPaise(price);
  const lineAmount = BigInt(quantity) * unitPaise;
  const taxed = kind !== "ADJUSTMENT"; // a stock correction is not a taxable supply
  const split = taxed
    ? splitGst(lineAmount, product?.gstRateBp ?? 0, inclusive)
    : { taxable: lineAmount, gst: 0n, gross: lineAmount };

  const effectiveDirection: Direction =
    kind === "SALE" ? "OUT" : kind === "PURCHASE" ? "IN" : direction;

  // COGS preview at the current weighted-average cost, which is what the server
  // will relieve from stock on an outward movement.
  const avgCost = product ? big(product.avgCostPaise) : 0n;
  const cogs = effectiveDirection === "OUT" && !stockless ? avgCost * BigInt(quantity) : 0n;
  const margin = split.taxable - cogs;
  const marginPct = split.taxable > 0n ? Number((margin * 10000n) / split.taxable) / 100 : 0;

  const overSell =
    effectiveDirection === "OUT" && !stockless && quantity > (product?.stockQuantity ?? 0);

  const save = useMutation({
    mutationFn: async () => {
      if (!product) throw new Error("No product selected");
      return (
        await api.post(`/api/products/${product.id}/movements`, {
          kind,
          direction: effectiveDirection,
          quantity,
          unitPricePaise: unitPaise.toString(),
          priceIsGstInclusive: taxed ? inclusive : false,
          customerId: kind === "SALE" && customerId !== NONE ? customerId : undefined,
          reference: reference.trim() === "" ? null : reference.trim(),
          notes: notes.trim() === "" ? null : notes.trim(),
          occurredAt: occurredAt === "" ? undefined : occurredAt,
        })
      ).data;
    },
    onSuccess: () => {
      toast.success(`${KIND_LABELS[kind]} recorded`);
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["product", product?.id] });
      qc.invalidateQueries({ queryKey: ["product-movements"] });
      qc.invalidateQueries({ queryKey: ["product-reports"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(apiError(e)),
  });


  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record movement</DialogTitle>
          <DialogDescription>
            {product.sku} · {product.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-1">
            {KINDS.map((k) => (
              <Button
                key={k}
                type="button"
                size="sm"
                variant={kind === k ? "default" : "outline"}
                onClick={() => changeKind(k)}
              >
                {KIND_LABELS[k]}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">In stock</span>
            <Badge variant={product.stockQuantity <= 0 ? "destructive" : "secondary"}>
              {stockless ? "not stocked" : `${product.stockQuantity} ${UNIT_LABELS[product.unit]}`}
            </Badge>
            {!stockless && (
              <>
                <span className="text-muted-foreground">Avg cost</span>
                <span>{formatINR(avgCost.toString())}</span>
              </>
            )}
          </div>

          {(kind === "ADJUSTMENT" || kind === "RETURN") && (
            <div>
              <Label>Direction</Label>
              <div className="flex gap-1 mt-1">
                <Button
                  type="button"
                  size="sm"
                  variant={direction === "IN" ? "default" : "outline"}
                  onClick={() => setDirection("IN")}
                >
                  IN — stock increases
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={direction === "OUT" ? "default" : "outline"}
                  onClick={() => setDirection("OUT")}
                >
                  OUT — stock decreases
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {kind === "RETURN"
                  ? direction === "IN"
                    ? "Goods coming back from a customer; they re-enter stock at average cost."
                    : "Goods going back to the supplier."
                  : direction === "IN"
                    ? "Stock found / opening stock entry. Not a taxable supply, so no GST."
                    : "Damage, leakage or internal use, valued at average cost. No GST."}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Quantity ({UNIT_LABELS[product.unit]})</Label>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
              {overSell && (
                <p className="text-xs text-destructive mt-1">
                  Only {product.stockQuantity} in stock — the server will reject this.
                </p>
              )}
            </div>
            <div>
              <Label>Price per unit (₹)</Label>
              <Input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">Leave blank for right now.</p>
            </div>
            <div>
              <Label>Reference</Label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Invoice / bill no"
              />
            </div>
          </div>

          {taxed && (
            <div>
              <Label>Price basis</Label>
              <div className="flex gap-1 mt-1">
                <Button
                  type="button"
                  size="sm"
                  variant={inclusive ? "default" : "outline"}
                  onClick={() => setInclusive(true)}
                >
                  GST-inclusive (MRP)
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={!inclusive ? "default" : "outline"}
                  onClick={() => setInclusive(false)}
                >
                  GST-exclusive (+ tax)
                </Button>
              </div>
            </div>
          )}

          {kind === "SALE" && (
            <div>
              <Label>Credit customer (optional)</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Cash sale" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Cash sale</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      {c.code ? ` (${c.code})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-amber-700 mt-1">
                Noted against the customer for reference only. A lube sale on credit is
                <strong> not</strong> added to their fuel credit balance — collect it separately.
              </p>
            </div>
          )}

          <div>
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
            <div className="font-medium">
              {taxed ? `GST breakdown @ ${product.gstRateBp / 100}%` : "Value"}
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Taxable value</span>
              <span>{formatINR(split.taxable.toString())}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">GST</span>
              <span>{formatINR(split.gst.toString())}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>{kind === "SALE" ? "Customer pays" : "Total"}</span>
              <span>{formatINR(split.gross.toString())}</span>
            </div>
            {kind === "SALE" && !stockless && (
              <>
                <Separator className="my-1" />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cost of goods (avg cost)</span>
                  <span>{formatINR(cogs.toString())}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Gross margin</span>
                  <span className={margin < 0n ? "text-destructive" : "text-green-700"}>
                    {formatINR(margin.toString())} ({marginPct.toFixed(1)}%)
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={quantity <= 0 || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? "Saving…" : `Record ${KIND_LABELS[kind].toLowerCase()}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatLitres, FUEL_LABELS, litresToMl, mlToLitres, rupeesToPaise } from "@/lib/utils";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { Plus } from "lucide-react";
import { LastSaved } from "./LastSaved";

export function StockTab({ shift, disabled }: { shift: any; disabled: boolean }) {
  const { t } = useT();
  const qc = useQueryClient();
  const [entries, setEntries] = useState(() =>
    shift.stockEntries.map((e: any) => ({
      tankId: e.tankId,
      name: e.tank.name,
      fuelType: e.fuelType,
      capacityMl: e.tank.capacityMl,
      openingMl: e.openingStockMl,
      closingMl: e.closingStockMl,
    }))
  );
  const [showReceipt, setShowReceipt] = useState(false);

  // purchase per tank (sum of tanker receipts for this shift)
  const purchaseByTank: Record<string, number> = {};
  for (const rc of shift.tankerReceipts || []) {
    purchaseByTank[rc.tankId] = (purchaseByTank[rc.tankId] || 0) + Number(rc.receivedMl);
  }

  const save = useMutation({
    mutationFn: async () => {
      return (await api.put(`/api/shifts/${shift.id}/stock-entries`, {
        entries: entries.map((e: any) => ({
          tankId: e.tankId,
          openingStockMl: e.openingMl === "" ? "0" : String(e.openingMl),
          closingStockMl: e.closingMl === "" ? "0" : String(e.closingMl),
        })),
      })).data;
    },
    onSuccess: () => {
      toast.success(t("shift.stock.saved", "Stock saved"));
      qc.invalidateQueries({ queryKey: ["shift", shift.id] });
    },
  });

  // Keep the field empty while typing — only coerce to "0" ml at save time,
  // otherwise a derived `value` snaps an empty input straight back to 0.
  const update = (idx: number, field: string, valueLitres: string) => {
    const ml = valueLitres === "" ? "" : litresToMl(valueLitres);
    setEntries((es: any[]) => es.map((e, i) => (i === idx ? { ...e, [field]: ml } : e)));
  };

  return (
    <Card>
      <CardHeader className="flex-row justify-between items-start">
        <div>
          <CardTitle>{t("shift.stock.title", "Stock")}</CardTitle>
          <CardDescription>
            {t(
              "shift.stock.desc",
              "Opening stock auto-filled. Enter closing stock per tank. Sale is computed from opening + purchase - closing.",
            )}
          </CardDescription>
          <LastSaved shiftId={shift.id} panel="stock" />
        </div>
        {!disabled && (
          <Dialog open={showReceipt} onOpenChange={setShowReceipt}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-1" /> {t("shift.stock.tankerReceipt", "Tanker Receipt")}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t("shift.stock.addTankerReceipt", "Add Tanker Receipt")}</DialogTitle>
              </DialogHeader>
              <TankerReceiptForm
                shiftId={shift.id}
                tanks={entries}
                onSuccess={() => {
                  setShowReceipt(false);
                  qc.invalidateQueries({ queryKey: ["shift", shift.id] });
                }}
              />
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("shift.stock.tank", "Tank")}</TableHead>
              <TableHead>{t("shift.stock.fuel", "Fuel")}</TableHead>
              <TableHead>{t("shift.stock.opening", "Opening (L)")}</TableHead>
              <TableHead>{t("shift.stock.purchase", "Purchase (L)")}</TableHead>
              <TableHead>{t("shift.stock.closing", "Closing (L)")}</TableHead>
              <TableHead className="text-right">{t("shift.stock.saleByStock", "Sale by stock (L)")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((e: any, idx: number) => {
              const purchase = purchaseByTank[e.tankId] || 0;
              const sale = Math.max(0, Number(e.openingMl) + purchase - Number(e.closingMl)) / 1000;
              return (
                <TableRow key={e.tankId}>
                  <TableCell className="font-medium">{e.name}</TableCell>
                  <TableCell>{t(`shift.fuel.${e.fuelType}`, FUEL_LABELS[e.fuelType] || e.fuelType)}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.001"
                      disabled={disabled}
                      value={e.openingMl === "" ? "" : mlToLitres(e.openingMl)}
                      onChange={(ev) => update(idx, "openingMl", ev.target.value)}
                      className="max-w-[140px]"
                    />
                  </TableCell>
                  <TableCell>{formatLitres(purchase)}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.001"
                      disabled={disabled}
                      value={e.closingMl === "" ? "" : mlToLitres(e.closingMl)}
                      onChange={(ev) => update(idx, "closingMl", ev.target.value)}
                      className="max-w-[140px]"
                    />
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {sale.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {!disabled && (
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? t("common.saving", "Saving…") : t("shift.stock.save", "Save stock")}
          </Button>
        )}
        {(shift.tankerReceipts || []).length > 0 && (
          <div>
            <div className="text-sm font-semibold mb-2">{t("shift.stock.receiptsThisShift", "Tanker Receipts (this shift)")}</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("shift.stock.tank", "Tank")}</TableHead>
                  <TableHead>{t("common.litres", "Litres")}</TableHead>
                  <TableHead>{t("shift.stock.bill", "Bill")}</TableHead>
                  <TableHead>{t("shift.stock.vendor", "Vendor")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shift.tankerReceipts.map((rc: any) => (
                  <TableRow key={rc.id}>
                    <TableCell>{entries.find((e: any) => e.tankId === rc.tankId)?.name}</TableCell>
                    <TableCell>{formatLitres(rc.receivedMl)} L</TableCell>
                    <TableCell>{rc.billNo || "-"}</TableCell>
                    <TableCell>{rc.vendorName || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TankerReceiptForm({
  shiftId,
  tanks,
  onSuccess,
}: {
  shiftId: string;
  tanks: any[];
  onSuccess: () => void;
}) {
  const { t } = useT();
  const [tankId, setTankId] = useState(tanks[0]?.tankId || "");
  const [litres, setLitres] = useState("");
  const [rate, setRate] = useState("");
  const [billNo, setBillNo] = useState("");
  const [vendor, setVendor] = useState("");

  const submit = useMutation({
    mutationFn: async () => {
      return (await api.post(`/api/tanker-receipts`, {
        shiftReportId: shiftId,
        tankId,
        receivedMl: litresToMl(litres),
        ratePaise: rate ? rupeesToPaise(rate) : undefined,
        billNo: billNo || undefined,
        vendorName: vendor || undefined,
      })).data;
    },
    onSuccess: () => {
      toast.success(t("shift.stock.receiptAdded", "Tanker receipt added"));
      onSuccess();
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || t("common.failed", "Something went wrong")),
  });

  return (
    <div className="space-y-3">
      <div>
        <Label>{t("shift.stock.tank", "Tank")}</Label>
        <Select value={tankId} onValueChange={setTankId}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {tanks.map((tk: any) => (
              <SelectItem key={tk.tankId} value={tk.tankId}>
                {tk.name} ({t(`shift.fuel.${tk.fuelType}`, FUEL_LABELS[tk.fuelType] || tk.fuelType)})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>{t("shift.stock.litresReceived", "Litres received")}</Label>
        <Input type="number" step="0.001" value={litres} onChange={(e) => setLitres(e.target.value)} />
      </div>
      <div>
        <Label>{t("shift.stock.ratePerLitre", "Rate / litre (₹) — optional")}</Label>
        <Input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
      </div>
      <div>
        <Label>{t("shift.stock.billNo", "Bill no")}</Label>
        <Input value={billNo} onChange={(e) => setBillNo(e.target.value)} />
      </div>
      <div>
        <Label>{t("shift.stock.vendor", "Vendor")}</Label>
        <Input value={vendor} onChange={(e) => setVendor(e.target.value)} />
      </div>
      <Button onClick={() => submit.mutate()} disabled={!tankId || !litres || submit.isPending}>
        {submit.isPending ? t("common.saving", "Saving…") : t("shift.stock.addReceipt", "Add receipt")}
      </Button>
    </div>
  );
}

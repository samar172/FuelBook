"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatINR, formatLitres, FUEL_LABELS, litresToMl, paiseToRupees, rupeesToPaise } from "@/lib/utils";
import { apiError, primaryVehicle, vehicleSummary, type CreditCustomer } from "@/lib/types";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

const OTHER_VEHICLE = "__other__";

export function CreditSalesTab({ shift, disabled }: { shift: any; disabled: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const del = useMutation({
    mutationFn: async (saleId: string) => api.delete(`/api/shifts/${shift.id}/credit-sales/${saleId}`),
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["shift", shift.id] });
    },
  });

  const totalCredit = (shift.creditSales || []).reduce((a: number, s: any) => a + Number(s.amountCreditPaise), 0);
  const totalPaid = (shift.creditSales || []).reduce((a: number, s: any) => a + Number(s.amountPaidPaise), 0);
  const totalAmount = (shift.creditSales || []).reduce((a: number, s: any) => a + Number(s.totalAmountPaise), 0);

  return (
    <Card>
      <CardHeader className="flex-row justify-between items-start">
        <div>
          <CardTitle>Credit Sales</CardTitle>
          <CardDescription>
            Sales where the customer doesn't pay in full. Example: Vijay buys ₹10,000 of diesel,
            pays ₹5,000 cash today, owes ₹5,000. Both halves are tracked here.
          </CardDescription>
        </div>
        {!disabled && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-1" /> Add credit sale</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Add Credit Sale</DialogTitle>
                <DialogDescription>Split-payment supported (cash now + credit balance).</DialogDescription>
              </DialogHeader>
              <CreditSaleForm
                shiftId={shift.id}
                onSuccess={() => {
                  setOpen(false);
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
              <TableHead>Customer</TableHead>
              <TableHead>Vehicle</TableHead>
              <TableHead>Fuel</TableHead>
              <TableHead>Qty (L)</TableHead>
              <TableHead>Total (₹)</TableHead>
              <TableHead>Paid Now (₹)</TableHead>
              <TableHead>Credit (₹)</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(shift.creditSales || []).map((s: any) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.customer?.name}</TableCell>
                <TableCell className="font-mono uppercase">{s.vehicle?.vehicleNo || s.vehicleNo || "-"}</TableCell>
                <TableCell>{FUEL_LABELS[s.fuelType] || s.fuelType}</TableCell>
                <TableCell>{formatLitres(s.quantityMl)}</TableCell>
                <TableCell>{formatINR(s.totalAmountPaise)}</TableCell>
                <TableCell className="text-green-700">{formatINR(s.amountPaidPaise)}</TableCell>
                <TableCell className="text-amber-700 font-medium">{formatINR(s.amountCreditPaise)}</TableCell>
                <TableCell>
                  {!disabled && (
                    <Button size="icon" variant="ghost" onClick={() => del.mutate(s.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {(shift.creditSales || []).length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                  No credit sales recorded yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="border rounded-md p-3">
            <div className="text-xs text-muted-foreground">Total credit-sale value</div>
            <div className="font-semibold">{formatINR(totalAmount)}</div>
          </div>
          <div className="border rounded-md p-3">
            <div className="text-xs text-muted-foreground">Cash collected at sale</div>
            <div className="font-semibold text-green-700">{formatINR(totalPaid)}</div>
          </div>
          <div className="border rounded-md p-3">
            <div className="text-xs text-muted-foreground">Added to outstanding</div>
            <div className="font-semibold text-amber-700">{formatINR(totalCredit)}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CreditSaleForm({ shiftId, onSuccess }: { shiftId: string; onSuccess: () => void }) {
  const { data: customers = [] } = useQuery<CreditCustomer[]>({
    queryKey: ["credit-customers"],
    queryFn: async () => (await api.get("/api/credit/customers")).data,
  });
  const { data: rates } = useQuery({
    queryKey: ["fuel-rates"],
    queryFn: async () => (await api.get("/api/setup/fuel-rates")).data,
  });
  const { data: channels = [] } = useQuery({
    queryKey: ["payment-channels"],
    queryFn: async () => (await api.get("/api/setup/payment-channels")).data,
  });

  const [customerId, setCustomerId] = useState("");
  const [fuelType, setFuelType] = useState("HSD");
  const [litres, setLitres] = useState("");
  const [rateRupees, setRateRupees] = useState("");
  const [paidRupees, setPaidRupees] = useState("0");
  // "" = nothing picked yet, OTHER_VEHICLE = free-text for an unregistered vehicle.
  const [vehicleId, setVehicleId] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [paidViaChannelId, setPaidViaChannelId] = useState<string | undefined>();

  // Pre-fill rate on fuel change
  const setFuelAndRate = (f: string) => {
    setFuelType(f);
    const r = rates?.current?.[f]?.ratePaise;
    if (r) setRateRupees(paiseToRupees(r).toString());
  };

  const total = (parseFloat(litres || "0") * parseFloat(rateRupees || "0")).toFixed(2);
  const credit = (parseFloat(total) - parseFloat(paidRupees || "0")).toFixed(2);

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const customerVehicles = (selectedCustomer?.vehicles || []).filter((v) => v.isActive);

  const pickCustomer = (id: string) => {
    setCustomerId(id);
    // Vehicles belong to a customer, so any earlier pick no longer applies.
    const next = customers.find((c) => c.id === id);
    const primary = primaryVehicle(next?.vehicles);
    setVehicleId(primary ? primary.id : "");
    setVehicleNo("");
  };

  const submit = useMutation({
    mutationFn: async () => {
      return (await api.post(`/api/shifts/${shiftId}/credit-sales`, {
        customerId,
        fuelType,
        quantityMl: litresToMl(litres),
        ratePaise: rupeesToPaise(rateRupees),
        totalAmountPaise: rupeesToPaise(total),
        amountPaidPaise: rupeesToPaise(paidRupees),
        amountCreditPaise: rupeesToPaise(credit),
        paidViaChannelId: paidViaChannelId || null,
        vehicleId: vehicleId && vehicleId !== OTHER_VEHICLE ? vehicleId : null,
        vehicleNo: vehicleId === OTHER_VEHICLE ? vehicleNo.trim().toUpperCase() : undefined,
      })).data;
    },
    onSuccess: () => {
      toast.success("Credit sale recorded");
      onSuccess();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <div className="space-y-3">
      <div>
        <Label>Customer</Label>
        <Select value={customerId} onValueChange={pickCustomer}>
          <SelectTrigger><SelectValue placeholder="Pick customer" /></SelectTrigger>
          <SelectContent>
            {customers.filter((c) => c.isActive).map((c) => {
              const summary = vehicleSummary(c.vehicles);
              return (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} {summary ? `(${summary})` : ""} — owes {formatINR(c.currentBalancePaise)}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Fuel</Label>
          <Select value={fuelType} onValueChange={setFuelAndRate}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="HSD">Diesel</SelectItem>
              <SelectItem value="MS">Petrol</SelectItem>
              <SelectItem value="MS_POWER">MS Power</SelectItem>
              <SelectItem value="CNG">CNG</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Vehicle</Label>
          <Select value={vehicleId} onValueChange={setVehicleId} disabled={!customerId}>
            <SelectTrigger>
              <SelectValue placeholder={customerId ? "Pick vehicle" : "Pick a customer first"} />
            </SelectTrigger>
            <SelectContent>
              {customerVehicles.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.vehicleNo}
                  {v.isPrimary ? " (primary)" : ""}
                </SelectItem>
              ))}
              <SelectItem value={OTHER_VEHICLE}>Other / not registered</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {vehicleId === OTHER_VEHICLE && (
        <div>
          <Label>Vehicle no</Label>
          <Input
            value={vehicleNo}
            onChange={(e) => setVehicleNo(e.target.value.toUpperCase())}
            className="uppercase font-mono"
            placeholder="MH12AB1234"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Recorded on this sale only. Register it on the customer to reuse it.
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <Label>Quantity (L)</Label>
          <Input type="number" step="0.001" value={litres} onChange={(e) => setLitres(e.target.value)} />
        </div>
        <div>
          <Label>Rate / L (₹)</Label>
          <Input type="number" step="0.01" value={rateRupees} onChange={(e) => setRateRupees(e.target.value)} />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <Label>Total (₹)</Label>
          <Input value={total} readOnly className="bg-slate-50" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Paid now (₹)</Label>
          <Input type="number" step="0.01" value={paidRupees} onChange={(e) => setPaidRupees(e.target.value)} />
        </div>
        <div>
          <Label>Paid via</Label>
          <Select value={paidViaChannelId} onValueChange={setPaidViaChannelId}>
            <SelectTrigger><SelectValue placeholder="Cash / UPI / Card" /></SelectTrigger>
            <SelectContent>
              {channels.map((c: any) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="rounded-md border p-3 bg-amber-50 text-sm">
        Credit balance added: <span className="font-semibold">₹{credit}</span>
      </div>
      <Button
        onClick={() => submit.mutate()}
        disabled={submit.isPending || !customerId || !litres || !rateRupees}
        className="w-full"
      >
        {submit.isPending ? "Saving…" : "Record Credit Sale"}
      </Button>
    </div>
  );
}

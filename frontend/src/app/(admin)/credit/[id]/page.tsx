"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, can } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatINR, formatLitres, FUEL_LABELS, litresToMl, mlToLitres, rupeesToPaise, paiseToRupees } from "@/lib/utils";
import {
  apiError,
  VEHICLE_TYPES,
  VEHICLE_TYPE_LABELS,
  type CreditCustomer,
  type FuelType,
  type Vehicle,
  type VehicleType,
} from "@/lib/types";
import { format } from "date-fns";
import { toast } from "sonner";
import { Pencil, Plus, Star, Trash2 } from "lucide-react";

type LedgerSale = {
  id: string;
  saleAt: string;
  fuelType: string;
  quantityMl: string;
  totalAmountPaise: string;
  amountPaidPaise: string;
  amountCreditPaise: string;
  vehicleId: string | null;
  vehicleNo: string | null;
  vehicle: Vehicle | null;
};

type LedgerReceipt = {
  id: string;
  receivedAt: string;
  amountPaise: string;
  reference: string | null;
};

type Ledger = { customer: CreditCustomer; sales: LedgerSale[]; receipts: LedgerReceipt[] };

const FUEL_TYPES: FuelType[] = ["HSD", "MS", "MS_POWER", "CNG"];

export default function CreditLedgerPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const qc = useQueryClient();
  const canManage = can("canManageCreditCustomers");
  const [profileOpen, setProfileOpen] = useState(false);
  const [vehicleDialog, setVehicleDialog] = useState<{ mode: "add" } | { mode: "edit"; vehicle: Vehicle } | null>(null);

  const { data, isLoading } = useQuery<Ledger>({
    queryKey: ["credit-ledger", id],
    queryFn: async () => (await api.get(`/api/credit/customers/${id}/ledger`)).data,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["credit-ledger", id] });
    qc.invalidateQueries({ queryKey: ["credit-customers"] });
  };

  const setPrimary = useMutation({
    mutationFn: async (vehicleId: string) =>
      (await api.patch(`/api/credit/vehicles/${vehicleId}`, { isPrimary: true })).data,
    onSuccess: () => {
      toast.success("Primary vehicle updated");
      refresh();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const removeVehicle = useMutation({
    mutationFn: async (vehicleId: string) =>
      (await api.delete(`/api/credit/vehicles/${vehicleId}`)).data as
        | { deleted: true }
        | { deleted: false; deactivated: true; salesCount: number },
    onSuccess: (res) => {
      if (res.deleted) {
        toast.success("Vehicle removed");
      } else {
        toast.success(
          `Vehicle retired — kept because it appears in ${res.salesCount} past ${res.salesCount === 1 ? "sale" : "sales"}`
        );
      }
      refresh();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (!data) return null;
  const { customer, sales, receipts } = data;
  const vehicles = customer.vehicles || [];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold break-words">{customer.name}</h1>
          <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-sm sm:text-base">
            {customer.code && <span className="font-mono">{customer.code}</span>}
            <span>Phone: {customer.phone || "-"}</span>
            {customer.contactPerson && <span>Contact: {customer.contactPerson}</span>}
          </div>
        </div>
        {canManage && (
          <Button variant="outline" onClick={() => setProfileOpen(true)}>
            <Pencil className="h-4 w-4 mr-1" /> Edit profile
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Credit Limit</div><div className="text-xl font-semibold">{formatINR(customer.creditLimitPaise)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Outstanding Balance</div><div className="text-xl font-semibold text-amber-700">{formatINR(customer.currentBalancePaise)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Status</div><div className="text-xl">{customer.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <CardTitle className="text-base">Vehicles</CardTitle>
          {canManage && (
            <Button size="sm" onClick={() => setVehicleDialog({ mode: "add" })}>
              <Plus className="h-4 w-4 mr-1" /> Add vehicle
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {vehicles.length === 0 ? (
            <p className="text-sm text-muted-foreground">No vehicles registered for this customer yet.</p>
          ) : (
            <div className="space-y-2">
              {vehicles.map((v) => (
                <div
                  key={v.id}
                  className={`flex items-start justify-between gap-3 border rounded-md p-3 ${v.isActive ? "" : "opacity-50"}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-medium uppercase">{v.vehicleNo}</span>
                      {v.isPrimary && v.isActive && <Badge variant="success">Primary</Badge>}
                      {!v.isActive && <Badge variant="secondary">Retired</Badge>}
                      <Badge variant="outline">{VEHICLE_TYPE_LABELS[v.type] || v.type}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                      {v.makeModel && <span>{v.makeModel}</span>}
                      {v.fuelType && <span>Usual fuel: {FUEL_LABELS[v.fuelType] || v.fuelType}</span>}
                      {v.capacityMl && Number(v.capacityMl) > 0 && <span>Tank: {formatLitres(v.capacityMl, 0)} L</span>}
                      {v.notes && <span>{v.notes}</span>}
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1 shrink-0">
                      {v.isActive && !v.isPrimary && (
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Make primary"
                          onClick={() => setPrimary.mutate(v.id)}
                          disabled={setPrimary.isPending}
                        >
                          <Star className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" title="Edit" onClick={() => setVehicleDialog({ mode: "edit", vehicle: v })}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {v.isActive && (
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Remove / retire"
                          onClick={() => removeVehicle.mutate(v.id)}
                          disabled={removeVehicle.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Profile</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
            <Field label="Contact person" value={customer.contactPerson} />
            <Field label="Phone" value={customer.phone} />
            <Field label="Alternate phone" value={customer.altPhone} />
            <Field label="Email" value={customer.email} />
            <Field label="GSTIN" value={customer.gstin} mono />
            <Field label="Payment terms" value={customer.paymentTermsDays === 0 ? "Due immediately" : `${customer.paymentTermsDays} days`} />
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">Address</dt>
              <dd className="font-medium break-words">
                {[customer.addressLine, customer.city, customer.state, customer.pincode].filter(Boolean).join(", ") || "-"}
              </dd>
            </div>
            <Field label="Notes" value={customer.notes} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Credit sales</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Fuel</TableHead><TableHead>Qty (L)</TableHead>
              <TableHead>Total</TableHead><TableHead>Paid Now</TableHead><TableHead>Credited</TableHead>
              <TableHead>Vehicle</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {sales.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{format(new Date(s.saleAt), "dd MMM yy")}</TableCell>
                  <TableCell>{FUEL_LABELS[s.fuelType] || s.fuelType}</TableCell>
                  <TableCell>{formatLitres(s.quantityMl)}</TableCell>
                  <TableCell>{formatINR(s.totalAmountPaise)}</TableCell>
                  <TableCell className="text-green-700">{formatINR(s.amountPaidPaise)}</TableCell>
                  <TableCell className="text-amber-700 font-medium">{formatINR(s.amountCreditPaise)}</TableCell>
                  <TableCell className="font-mono uppercase">{s.vehicle?.vehicleNo || s.vehicleNo || "-"}</TableCell>
                </TableRow>
              ))}
              {sales.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No credit sales</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Outstanding payments received</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Amount</TableHead><TableHead>Reference</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {receipts.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{format(new Date(r.receivedAt), "dd MMM yy")}</TableCell>
                  <TableCell className="font-medium text-green-700">{formatINR(r.amountPaise)}</TableCell>
                  <TableCell>{r.reference || "-"}</TableCell>
                </TableRow>
              ))}
              {receipts.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No payments received yet</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit customer</DialogTitle></DialogHeader>
          <CustomerProfileForm
            customer={customer}
            onSuccess={() => {
              setProfileOpen(false);
              refresh();
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={vehicleDialog !== null} onOpenChange={(o) => !o && setVehicleDialog(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{vehicleDialog?.mode === "edit" ? "Edit vehicle" : "Add vehicle"}</DialogTitle>
          </DialogHeader>
          {vehicleDialog && (
            <VehicleForm
              customerId={customer.id}
              vehicle={vehicleDialog.mode === "edit" ? vehicleDialog.vehicle : undefined}
              onSuccess={() => {
                setVehicleDialog(null);
                refresh();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`font-medium break-words ${mono ? "font-mono" : ""}`}>{value || "-"}</dd>
    </div>
  );
}

function VehicleForm({
  customerId,
  vehicle,
  onSuccess,
}: {
  customerId: string;
  vehicle?: Vehicle;
  onSuccess: () => void;
}) {
  const [vehicleNo, setVehicleNo] = useState(vehicle?.vehicleNo || "");
  const [type, setType] = useState<VehicleType>(vehicle?.type || "OTHER");
  const [makeModel, setMakeModel] = useState(vehicle?.makeModel || "");
  const [fuelType, setFuelType] = useState<string>(vehicle?.fuelType || "none");
  const [capacityLitres, setCapacityLitres] = useState(
    vehicle?.capacityMl && Number(vehicle.capacityMl) > 0 ? String(mlToLitres(vehicle.capacityMl)) : ""
  );
  const [isPrimary, setIsPrimary] = useState(vehicle?.isPrimary ?? false);
  const [isActive, setIsActive] = useState(vehicle?.isActive ?? true);
  const [notes, setNotes] = useState(vehicle?.notes || "");

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        vehicleNo: vehicleNo.trim().toUpperCase(),
        type,
        makeModel: makeModel.trim() || null,
        fuelType: fuelType === "none" ? null : fuelType,
        capacityMl: capacityLitres === "" ? undefined : litresToMl(capacityLitres),
        isPrimary,
        notes: notes.trim() || null,
      };
      if (vehicle) {
        return (await api.patch(`/api/credit/vehicles/${vehicle.id}`, { ...body, isActive })).data;
      }
      return (await api.post(`/api/credit/customers/${customerId}/vehicles`, body)).data;
    },
    onSuccess: () => {
      toast.success(vehicle ? "Vehicle updated" : "Vehicle added");
      onSuccess();
    },
    onError: (e) => toast.error(apiError(e, "Could not save the vehicle")),
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label>Vehicle no</Label>
          <Input
            value={vehicleNo}
            onChange={(e) => setVehicleNo(e.target.value.toUpperCase())}
            className="uppercase font-mono"
            placeholder="MH12AB1234"
          />
        </div>
        <div>
          <Label>Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as VehicleType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {VEHICLE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{VEHICLE_TYPE_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Make / model</Label>
          <Input value={makeModel} onChange={(e) => setMakeModel(e.target.value)} placeholder="Tata 1109" />
        </div>
        <div>
          <Label>Usual fuel</Label>
          <Select value={fuelType} onValueChange={setFuelType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Not set —</SelectItem>
              {FUEL_TYPES.map((f) => (
                <SelectItem key={f} value={f}>{FUEL_LABELS[f]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Tank capacity (L)</Label>
          <Input type="number" step="0.001" value={capacityLitres} onChange={(e) => setCapacityLitres(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label>Notes</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} className="h-4 w-4" />
          Primary vehicle for this customer
        </label>
        {vehicle && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4" />
            Active (in use)
          </label>
        )}
      </div>

      <Button onClick={() => save.mutate()} disabled={vehicleNo.trim().length < 4 || save.isPending} className="w-full">
        {save.isPending ? "Saving…" : vehicle ? "Save changes" : "Add vehicle"}
      </Button>
      {vehicleNo.trim().length > 0 && vehicleNo.trim().length < 4 && (
        <p className="text-xs text-destructive">Vehicle number is too short.</p>
      )}
    </div>
  );
}

function CustomerProfileForm({ customer, onSuccess }: { customer: CreditCustomer; onSuccess: () => void }) {
  const [name, setName] = useState(customer.name);
  const [code, setCode] = useState(customer.code || "");
  const [contactPerson, setContactPerson] = useState(customer.contactPerson || "");
  const [phone, setPhone] = useState(customer.phone || "");
  const [altPhone, setAltPhone] = useState(customer.altPhone || "");
  const [email, setEmail] = useState(customer.email || "");
  const [gstin, setGstin] = useState(customer.gstin || "");
  const [addressLine, setAddressLine] = useState(customer.addressLine || "");
  const [city, setCity] = useState(customer.city || "");
  const [state, setState] = useState(customer.state || "");
  const [pincode, setPincode] = useState(customer.pincode || "");
  const [limit, setLimit] = useState(String(paiseToRupees(customer.creditLimitPaise)));
  const [terms, setTerms] = useState(String(customer.paymentTermsDays ?? 0));
  const [notes, setNotes] = useState(customer.notes || "");
  const [isActive, setIsActive] = useState(customer.isActive);

  // Empty inputs are sent as null so a previously stored value is actually cleared.
  const orNull = (v: string) => (v.trim() === "" ? null : v.trim());

  const save = useMutation({
    mutationFn: async () =>
      (await api.patch(`/api/credit/customers/${customer.id}`, {
        name: name.trim(),
        code: orNull(code),
        contactPerson: orNull(contactPerson),
        phone: orNull(phone),
        altPhone: orNull(altPhone),
        email: orNull(email),
        gstin: orNull(gstin),
        addressLine: orNull(addressLine),
        city: orNull(city),
        state: orNull(state),
        pincode: orNull(pincode),
        creditLimitPaise: rupeesToPaise(limit || "0"),
        paymentTermsDays: terms === "" ? 0 : Number(terms),
        notes: orNull(notes),
        isActive,
      })).data,
    onSuccess: () => {
      toast.success("Customer updated");
      onSuccess();
    },
    onError: (e) => toast.error(apiError(e, "Could not save the customer")),
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><Label>Customer code</Label><Input value={code} onChange={(e) => setCode(e.target.value)} /></div>
        <div><Label>Contact person</Label><Input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} /></div>
        <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        <div><Label>Alternate phone</Label><Input value={altPhone} onChange={(e) => setAltPhone(e.target.value)} /></div>
        <div className="sm:col-span-2"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      </div>

      <Separator />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><Label>Credit limit (₹)</Label><Input type="number" step="0.01" value={limit} onChange={(e) => setLimit(e.target.value)} /></div>
        <div>
          <Label>Payment terms (days)</Label>
          <Input type="number" min="0" max="365" value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="0 = due immediately" />
        </div>
        <div className="sm:col-span-2"><Label>GSTIN</Label><Input value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} className="uppercase" placeholder="27AAAAA0000A1Z5" /></div>
        <div className="sm:col-span-2"><Label>Address</Label><Input value={addressLine} onChange={(e) => setAddressLine(e.target.value)} /></div>
        <div><Label>City</Label><Input value={city} onChange={(e) => setCity(e.target.value)} /></div>
        <div><Label>State</Label><Input value={state} onChange={(e) => setState(e.target.value)} /></div>
        <div><Label>Pincode</Label><Input value={pincode} onChange={(e) => setPincode(e.target.value)} maxLength={6} /></div>
        <div className="sm:col-span-2"><Label>Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4" />
        Active customer
      </label>

      <Button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending} className="w-full">
        {save.isPending ? "Saving…" : "Save changes"}
      </Button>
    </div>
  );
}

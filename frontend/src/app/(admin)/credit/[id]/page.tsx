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
import { useT } from "@/lib/i18n";
import { useDateLocale } from "@/lib/i18n/core";
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
  const { t } = useT();
  const locale = useDateLocale();
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
      toast.success(t("credit.primaryUpdated", "Primary vehicle updated"));
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
        toast.success(t("credit.vehicleRemoved", "Vehicle removed"));
      } else {
        toast.success(
          res.salesCount === 1
            ? t("credit.vehicleRetiredOne", "Vehicle retired — kept because it appears in 1 past sale")
            : t("credit.vehicleRetiredMany", "Vehicle retired — kept because it appears in {n} past sales", { n: res.salesCount })
        );
      }
      refresh();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  if (isLoading) return <div className="text-muted-foreground">{t("common.loading", "Loading…")}</div>;
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
            <span>{t("credit.phoneValue", "Phone: {v}", { v: customer.phone || "-" })}</span>
            {customer.contactPerson && <span>{t("credit.contactValue", "Contact: {v}", { v: customer.contactPerson })}</span>}
          </div>
        </div>
        {canManage && (
          <Button variant="outline" onClick={() => setProfileOpen(true)}>
            <Pencil className="h-4 w-4 mr-1" /> {t("credit.editProfile", "Edit profile")}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{t("credit.creditLimitShort", "Credit Limit")}</div><div className="text-xl font-semibold">{formatINR(customer.creditLimitPaise)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{t("credit.outstandingBalance", "Outstanding Balance")}</div><div className="text-xl font-semibold text-amber-700">{formatINR(customer.currentBalancePaise)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{t("common.status", "Status")}</div><div className="text-xl">{customer.isActive ? <Badge variant="success">{t("common.active", "Active")}</Badge> : <Badge variant="secondary">{t("common.inactive", "Inactive")}</Badge>}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <CardTitle className="text-base">{t("credit.vehicles", "Vehicles")}</CardTitle>
          {canManage && (
            <Button size="sm" onClick={() => setVehicleDialog({ mode: "add" })}>
              <Plus className="h-4 w-4 mr-1" /> {t("credit.addVehicle", "Add vehicle")}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {vehicles.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("credit.noVehicles", "No vehicles registered for this customer yet.")}</p>
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
                      {v.isPrimary && v.isActive && <Badge variant="success">{t("credit.primary", "Primary")}</Badge>}
                      {!v.isActive && <Badge variant="secondary">{t("credit.retired", "Retired")}</Badge>}
                      <Badge variant="outline">{t(`credit.vType.${v.type}`, VEHICLE_TYPE_LABELS[v.type] || v.type)}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                      {v.makeModel && <span>{v.makeModel}</span>}
                      {v.fuelType && <span>{t("credit.usualFuelValue", "Usual fuel: {fuel}", { fuel: t(`credit.fuelType.${v.fuelType}`, FUEL_LABELS[v.fuelType] || v.fuelType) })}</span>}
                      {v.capacityMl && Number(v.capacityMl) > 0 && <span>{t("credit.tankValue", "Tank: {litres} L", { litres: formatLitres(v.capacityMl, 0) })}</span>}
                      {v.notes && <span>{v.notes}</span>}
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1 shrink-0">
                      {v.isActive && !v.isPrimary && (
                        <Button
                          size="sm"
                          variant="ghost"
                          title={t("credit.makePrimary", "Make primary")}
                          onClick={() => setPrimary.mutate(v.id)}
                          disabled={setPrimary.isPending}
                        >
                          <Star className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" title={t("common.edit", "Edit")} onClick={() => setVehicleDialog({ mode: "edit", vehicle: v })}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {v.isActive && (
                        <Button
                          size="sm"
                          variant="ghost"
                          title={t("credit.removeRetire", "Remove / retire")}
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
        <CardHeader><CardTitle className="text-base">{t("credit.profile", "Profile")}</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
            <Field label={t("credit.contactPerson", "Contact person")} value={customer.contactPerson} />
            <Field label={t("common.phone", "Phone")} value={customer.phone} />
            <Field label={t("credit.altPhone", "Alternate phone")} value={customer.altPhone} />
            <Field label={t("credit.email", "Email")} value={customer.email} />
            <Field label={t("credit.gstin", "GSTIN")} value={customer.gstin} mono />
            <Field label={t("credit.paymentTerms", "Payment terms")} value={customer.paymentTermsDays === 0 ? t("credit.dueImmediately", "Due immediately") : t("credit.daysValue", "{n} days", { n: customer.paymentTermsDays })} />
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">{t("credit.address", "Address")}</dt>
              <dd className="font-medium break-words">
                {[customer.addressLine, customer.city, customer.state, customer.pincode].filter(Boolean).join(", ") || "-"}
              </dd>
            </div>
            <Field label={t("common.notes", "Notes")} value={customer.notes} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{t("credit.creditSales", "Credit sales")}</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>{t("common.date", "Date")}</TableHead><TableHead>{t("credit.fuel", "Fuel")}</TableHead><TableHead>{t("credit.qtyL", "Qty (L)")}</TableHead>
              <TableHead>{t("common.total", "Total")}</TableHead><TableHead>{t("credit.paidNow", "Paid Now")}</TableHead><TableHead>{t("credit.credited", "Credited")}</TableHead>
              <TableHead>{t("credit.vehicle", "Vehicle")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {sales.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{format(new Date(s.saleAt), "dd MMM yy", { locale })}</TableCell>
                  <TableCell>{t(`credit.fuelType.${s.fuelType}`, FUEL_LABELS[s.fuelType] || s.fuelType)}</TableCell>
                  <TableCell>{formatLitres(s.quantityMl)}</TableCell>
                  <TableCell>{formatINR(s.totalAmountPaise)}</TableCell>
                  <TableCell className="text-green-700">{formatINR(s.amountPaidPaise)}</TableCell>
                  <TableCell className="text-amber-700 font-medium">{formatINR(s.amountCreditPaise)}</TableCell>
                  <TableCell className="font-mono uppercase">{s.vehicle?.vehicleNo || s.vehicleNo || "-"}</TableCell>
                </TableRow>
              ))}
              {sales.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">{t("credit.noCreditSales", "No credit sales")}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{t("credit.receipts", "Outstanding payments received")}</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>{t("common.date", "Date")}</TableHead><TableHead>{t("common.amount", "Amount")}</TableHead><TableHead>{t("credit.reference", "Reference")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {receipts.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{format(new Date(r.receivedAt), "dd MMM yy", { locale })}</TableCell>
                  <TableCell className="font-medium text-green-700">{formatINR(r.amountPaise)}</TableCell>
                  <TableCell>{r.reference || "-"}</TableCell>
                </TableRow>
              ))}
              {receipts.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">{t("credit.noReceipts", "No payments received yet")}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("credit.editCustomer", "Edit customer")}</DialogTitle></DialogHeader>
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
            <DialogTitle>{vehicleDialog?.mode === "edit" ? t("credit.editVehicle", "Edit vehicle") : t("credit.addVehicle", "Add vehicle")}</DialogTitle>
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
  const { t } = useT();
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
      toast.success(vehicle ? t("credit.vehicleUpdated", "Vehicle updated") : t("credit.vehicleAdded", "Vehicle added"));
      onSuccess();
    },
    onError: (e) => toast.error(apiError(e, t("credit.saveVehicleFailed", "Could not save the vehicle"))),
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label>{t("credit.vehicleNo", "Vehicle no")}</Label>
          <Input
            value={vehicleNo}
            onChange={(e) => setVehicleNo(e.target.value.toUpperCase())}
            className="uppercase font-mono"
            placeholder="MH12AB1234"
          />
        </div>
        <div>
          <Label>{t("credit.vehicleType", "Type")}</Label>
          <Select value={type} onValueChange={(v) => setType(v as VehicleType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {VEHICLE_TYPES.map((vt) => (
                <SelectItem key={vt} value={vt}>{t(`credit.vType.${vt}`, VEHICLE_TYPE_LABELS[vt])}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>{t("credit.makeModel", "Make / model")}</Label>
          <Input value={makeModel} onChange={(e) => setMakeModel(e.target.value)} placeholder="Tata 1109" />
        </div>
        <div>
          <Label>{t("credit.usualFuel", "Usual fuel")}</Label>
          <Select value={fuelType} onValueChange={setFuelType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("credit.notSet", "— Not set —")}</SelectItem>
              {FUEL_TYPES.map((f) => (
                <SelectItem key={f} value={f}>{t(`credit.fuelType.${f}`, FUEL_LABELS[f])}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>{t("credit.tankCapacity", "Tank capacity (L)")}</Label>
          <Input type="number" step="0.001" value={capacityLitres} onChange={(e) => setCapacityLitres(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label>{t("common.notes", "Notes")}</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} className="h-4 w-4" />
          {t("credit.primaryVehicleCheck", "Primary vehicle for this customer")}
        </label>
        {vehicle && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4" />
            {t("credit.activeInUse", "Active (in use)")}
          </label>
        )}
      </div>

      <Button onClick={() => save.mutate()} disabled={vehicleNo.trim().length < 4 || save.isPending} className="w-full">
        {save.isPending ? t("common.saving", "Saving…") : vehicle ? t("credit.saveChanges", "Save changes") : t("credit.addVehicle", "Add vehicle")}
      </Button>
      {vehicleNo.trim().length > 0 && vehicleNo.trim().length < 4 && (
        <p className="text-xs text-destructive">{t("credit.vehicleNoTooShort", "Vehicle number is too short.")}</p>
      )}
    </div>
  );
}

function CustomerProfileForm({ customer, onSuccess }: { customer: CreditCustomer; onSuccess: () => void }) {
  const { t } = useT();
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
      toast.success(t("credit.customerUpdated", "Customer updated"));
      onSuccess();
    },
    onError: (e) => toast.error(apiError(e, t("credit.saveCustomerFailed", "Could not save the customer"))),
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2"><Label>{t("common.name", "Name")}</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><Label>{t("credit.customerCode", "Customer code")}</Label><Input value={code} onChange={(e) => setCode(e.target.value)} /></div>
        <div><Label>{t("credit.contactPerson", "Contact person")}</Label><Input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} /></div>
        <div><Label>{t("common.phone", "Phone")}</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        <div><Label>{t("credit.altPhone", "Alternate phone")}</Label><Input value={altPhone} onChange={(e) => setAltPhone(e.target.value)} /></div>
        <div className="sm:col-span-2"><Label>{t("credit.email", "Email")}</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      </div>

      <Separator />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><Label>{t("credit.creditLimit", "Credit limit (₹)")}</Label><Input type="number" step="0.01" value={limit} onChange={(e) => setLimit(e.target.value)} /></div>
        <div>
          <Label>{t("credit.paymentTermsDays", "Payment terms (days)")}</Label>
          <Input type="number" min="0" max="365" value={terms} onChange={(e) => setTerms(e.target.value)} placeholder={t("credit.termsPlaceholder", "0 = due immediately")} />
        </div>
        <div className="sm:col-span-2"><Label>{t("credit.gstin", "GSTIN")}</Label><Input value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} className="uppercase" placeholder="27AAAAA0000A1Z5" /></div>
        <div className="sm:col-span-2"><Label>{t("credit.address", "Address")}</Label><Input value={addressLine} onChange={(e) => setAddressLine(e.target.value)} /></div>
        <div><Label>{t("credit.city", "City")}</Label><Input value={city} onChange={(e) => setCity(e.target.value)} /></div>
        <div><Label>{t("credit.state", "State")}</Label><Input value={state} onChange={(e) => setState(e.target.value)} /></div>
        <div><Label>{t("credit.pincode", "Pincode")}</Label><Input value={pincode} onChange={(e) => setPincode(e.target.value)} maxLength={6} /></div>
        <div className="sm:col-span-2"><Label>{t("common.notes", "Notes")}</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4" />
        {t("credit.activeCustomer", "Active customer")}
      </label>

      <Button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending} className="w-full">
        {save.isPending ? t("common.saving", "Saving…") : t("credit.saveChanges", "Save changes")}
      </Button>
    </div>
  );
}

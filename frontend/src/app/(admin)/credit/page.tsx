"use client";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatINR, rupeesToPaise } from "@/lib/utils";
import { apiError, primaryVehicle, type CreditCustomer } from "@/lib/types";
import { toast } from "sonner";
import Link from "next/link";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { useT } from "@/lib/i18n";

const ALL = "__all__";

type Filters = {
  q: string;
  active: string;
  outstandingOnly: boolean;
  overLimitOnly: boolean;
};

const EMPTY: Filters = { q: "", active: ALL, outstandingOnly: false, overLimitOnly: false };

export default function CreditCustomersPage() {
  const { t } = useT();
  const qc = useQueryClient();
  const { data = [] } = useQuery<CreditCustomer[]>({
    queryKey: ["credit-customers"],
    queryFn: async () => (await api.get("/api/credit/customers")).data,
  });
  const [open, setOpen] = useState(false);
  const [showBilling, setShowBilling] = useState(false);

  const [f, setF] = useState<Filters>(EMPTY);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) =>
    setF((cur) => ({ ...cur, [k]: v }));

  // The whole customer list is already loaded, so filter and sort in the browser.
  const filtered = useMemo(() => {
    const needle = f.q.trim().toLowerCase();
    return data.filter((c) => {
      if (needle) {
        const hay = [
          c.name,
          c.code || "",
          c.phone || "",
          c.altPhone || "",
          c.contactPerson || "",
          ...(c.vehicles || []).map((v) => v.vehicleNo),
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (f.active === "active" && !c.isActive) return false;
      if (f.active === "inactive" && c.isActive) return false;
      if (f.outstandingOnly && Number(c.currentBalancePaise) <= 0) return false;
      if (
        f.overLimitOnly &&
        !(Number(c.creditLimitPaise) > 0 && Number(c.currentBalancePaise) > Number(c.creditLimitPaise))
      )
        return false;
      return true;
    });
  }, [data, f]);

  const sorted = useTableSort<CreditCustomer>(
    filtered,
    {
      name: (c) => c.name,
      vehicle: (c) => primaryVehicle(c.vehicles)?.vehicleNo,
      phone: (c) => c.phone,
      limit: (c) => sortBig(c.creditLimitPaise),
      outstanding: (c) => sortBig(c.currentBalancePaise),
      util: (c) =>
        Number(c.creditLimitPaise) > 0
          ? (Number(c.currentBalancePaise) / Number(c.creditLimitPaise)) * 100
          : 0,
      status: (c) => (c.isActive ? 0 : 1),
    },
    { key: "outstanding", dir: "desc" },
  );

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (f.q.trim()) chips.push({ key: "q", label: t("credit.searchChip", "Search: {q}", { q: f.q.trim() }), clear: () => set("q", "") });
  if (f.active !== ALL)
    chips.push({ key: "active", label: f.active === "active" ? t("credit.activeOnly", "Active only") : t("credit.inactiveOnly", "Inactive only"), clear: () => set("active", ALL) });
  if (f.outstandingOnly)
    chips.push({ key: "out", label: t("credit.hasOutstanding", "Has outstanding"), clear: () => set("outstandingOnly", false) });
  if (f.overLimitOnly)
    chips.push({ key: "over", label: t("credit.overLimit", "Over credit limit"), clear: () => set("overLimitOnly", false) });
  const active = chips.length > 0;
  const clearAll = () => setF(EMPTY);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [altPhone, setAltPhone] = useState("");
  const [email, setEmail] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [limit, setLimit] = useState("");
  const [terms, setTerms] = useState("");
  const [gstin, setGstin] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setName(""); setCode(""); setContactPerson(""); setPhone(""); setAltPhone("");
    setEmail(""); setVehicle(""); setLimit(""); setTerms(""); setGstin("");
    setAddressLine(""); setCity(""); setState(""); setPincode(""); setNotes("");
    setShowBilling(false);
  };

  const create = useMutation({
    mutationFn: async () =>
      (await api.post("/api/credit/customers", {
        name,
        code: code || undefined,
        contactPerson: contactPerson || undefined,
        phone: phone || undefined,
        altPhone: altPhone || undefined,
        email: email || undefined,
        vehicleNo: vehicle ? vehicle.trim().toUpperCase() : undefined,
        creditLimitPaise: rupeesToPaise(limit || "0"),
        paymentTermsDays: terms === "" ? undefined : Number(terms),
        gstin: gstin || undefined,
        addressLine: addressLine || undefined,
        city: city || undefined,
        state: state || undefined,
        pincode: pincode || undefined,
        notes: notes || undefined,
      })).data,
    onSuccess: () => {
      toast.success(t("credit.customerAdded", "Customer added"));
      setOpen(false);
      reset();
      qc.invalidateQueries({ queryKey: ["credit-customers"] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">{t("credit.title", "Credit Customers")}</h1>
          <p className="text-muted-foreground text-sm sm:text-base">{t("credit.subtitle", "Customers who buy on credit and pay later")}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> {t("credit.addCustomer", "Add customer")}</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{t("credit.addDialogTitle", "Add Credit Customer")}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2"><Label>{t("common.name", "Name")}</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
                <div><Label>{t("credit.customerCode", "Customer code")}</Label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("common.optional", "Optional")} /></div>
                <div><Label>{t("credit.contactPerson", "Contact person")}</Label><Input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} /></div>
                <div><Label>{t("common.phone", "Phone")}</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
                <div><Label>{t("credit.altPhone", "Alternate phone")}</Label><Input value={altPhone} onChange={(e) => setAltPhone(e.target.value)} /></div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>{t("credit.firstVehicleNo", "First vehicle no")}</Label>
                  <Input
                    value={vehicle}
                    onChange={(e) => setVehicle(e.target.value.toUpperCase())}
                    placeholder="MH12AB1234"
                    className="uppercase"
                  />
                  <p className="text-xs text-muted-foreground mt-1">{t("credit.firstVehicleHint", "Registered as the primary vehicle. More can be added later.")}</p>
                </div>
                <div><Label>{t("credit.creditLimit", "Credit limit (₹)")}</Label><Input type="number" step="0.01" value={limit} onChange={(e) => setLimit(e.target.value)} /></div>
                <div>
                  <Label>{t("credit.paymentTermsDays", "Payment terms (days)")}</Label>
                  <Input type="number" min="0" max="365" value={terms} onChange={(e) => setTerms(e.target.value)} placeholder={t("credit.termsPlaceholder", "0 = due immediately")} />
                </div>
              </div>

              <Separator />

              <button
                type="button"
                onClick={() => setShowBilling((v) => !v)}
                className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                {showBilling ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                {t("credit.billingSection", "Billing address & GSTIN (optional)")}
              </button>

              {showBilling && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2"><Label>{t("credit.email", "Email")}</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                  <div className="sm:col-span-2"><Label>{t("credit.gstin", "GSTIN")}</Label><Input value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} className="uppercase" placeholder="27AAAAA0000A1Z5" /></div>
                  <div className="sm:col-span-2"><Label>{t("credit.address", "Address")}</Label><Input value={addressLine} onChange={(e) => setAddressLine(e.target.value)} /></div>
                  <div><Label>{t("credit.city", "City")}</Label><Input value={city} onChange={(e) => setCity(e.target.value)} /></div>
                  <div><Label>{t("credit.state", "State")}</Label><Input value={state} onChange={(e) => setState(e.target.value)} /></div>
                  <div><Label>{t("credit.pincode", "Pincode")}</Label><Input value={pincode} onChange={(e) => setPincode(e.target.value)} maxLength={6} /></div>
                  <div className="sm:col-span-2"><Label>{t("common.notes", "Notes")}</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
                </div>
              )}

              <Button onClick={() => create.mutate()} disabled={!name || create.isPending} className="w-full">
                {create.isPending ? t("common.saving", "Saving…") : t("common.add", "Add")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <Label className="text-xs">{t("common.search", "Search")}</Label>
              <Input
                placeholder={t("credit.searchPlaceholder", "Name, code, phone or vehicle no")}
                value={f.q}
                onChange={(e) => set("q", e.target.value)}
              />
            </div>
            <div className="min-w-0">
              <Label className="text-xs">{t("common.status", "Status")}</Label>
              <Select value={f.active} onValueChange={(v) => set("active", v)}>
                <SelectTrigger className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t("credit.allCustomers", "All customers")}</SelectItem>
                  <SelectItem value="active">{t("credit.activeOnly", "Active only")}</SelectItem>
                  <SelectItem value="inactive">{t("credit.inactiveOnly", "Inactive only")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={f.outstandingOnly}
                onChange={(e) => set("outstandingOnly", e.target.checked)}
              />
              {t("credit.hasOutstandingOnly", "Has outstanding only")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={f.overLimitOnly}
                onChange={(e) => set("overLimitOnly", e.target.checked)}
              />
              {t("credit.overLimitOnly", "Over credit limit only")}
            </label>
          </div>

          {active && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
              {chips.map((c) => (
                <FilterChip key={c.key} label={c.label} onRemove={c.clear} />
              ))}
              <Button size="sm" variant="ghost" onClick={clearAll}>
                {t("common.clearAll", "Clear all")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {active ? t("credit.countOf", "{shown} of {total} customers", { shown: sorted.rows.length, total: data.length }) : t("credit.allCustomers", "All customers")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead {...sorted.sortProps("name")}>{t("common.name", "Name")}</SortableHead>
                <SortableHead {...sorted.sortProps("vehicle")}>{t("credit.vehicle", "Vehicle")}</SortableHead>
                <SortableHead {...sorted.sortProps("phone")}>{t("common.phone", "Phone")}</SortableHead>
                <SortableHead {...sorted.sortProps("limit")} align="right">{t("credit.limit", "Limit")}</SortableHead>
                <SortableHead {...sorted.sortProps("outstanding")} align="right">{t("credit.outstanding", "Outstanding")}</SortableHead>
                <SortableHead {...sorted.sortProps("util")} align="right">{t("credit.util", "Util %")}</SortableHead>
                <SortableHead {...sorted.sortProps("status")}>{t("common.status", "Status")}</SortableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.rows.map((c) => {
                const util = Number(c.creditLimitPaise) > 0 ? (Number(c.currentBalancePaise) / Number(c.creditLimitPaise)) * 100 : 0;
                const primary = primaryVehicle(c.vehicles);
                const total = c._count?.vehicles ?? c.vehicles?.length ?? 0;
                const extra = total - 1;
                return (
                  <TableRow key={c.id} className="cursor-pointer">
                    <TableCell>
                      <Link href={`/credit/${c.id}`} className="font-medium hover:underline">
                        {c.name}
                      </Link>
                      {c.code && <div className="text-xs text-muted-foreground font-mono">{c.code}</div>}
                    </TableCell>
                    <TableCell>
                      {primary ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono uppercase">{primary.vehicleNo}</span>
                          {extra > 0 && (
                            <Link href={`/credit/${c.id}`} className="shrink-0">
                              <Badge variant="outline" title={t("credit.vehiclesRegistered", "{n} vehicles registered", { n: total })}>{t("credit.moreVehicles", "+{n} more", { n: extra })}</Badge>
                            </Link>
                          )}
                        </div>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>{c.phone || "-"}</TableCell>
                    <TableCell className="text-right">{formatINR(c.creditLimitPaise)}</TableCell>
                    <TableCell className="text-right font-medium">{formatINR(c.currentBalancePaise)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={util > 90 ? "destructive" : util > 70 ? "warning" : "outline"}>
                        {util.toFixed(0)}%
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {c.isActive ? <Badge variant="success">{t("common.active", "Active")}</Badge> : <Badge variant="secondary">{t("common.inactive", "Inactive")}</Badge>}
                    </TableCell>
                  </TableRow>
                );
              })}
              {sorted.rows.length === 0 && (
                <NoMatchRow
                  colSpan={7}
                  filtered={active}
                  onClear={clearAll}
                  emptyMessage={t("credit.noCustomers", "No credit customers yet.")}
                />
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

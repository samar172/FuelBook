"use client";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, can } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  sortDate,
  useTableSort,
} from "@/components/ui/sortable-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { apiError, type Employee } from "@/lib/types";
import { toast } from "sonner";
import { format } from "date-fns";
import Link from "next/link";
import { ChevronDown, ChevronRight, Plus, UserCheck, UserX } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useDateLocale } from "@/lib/i18n/core";

const ALL = "__all__";

type Filters = { q: string; designation: string; active: string };
const EMPTY: Filters = { q: "", designation: ALL, active: ALL };

export default function EmployeesPage() {
  const qc = useQueryClient();
  const canManage = can("canManageEmployees");
  const { t } = useT();
  const locale = useDateLocale();
  const [showInactive, setShowInactive] = useState(false);

  const { data = [] } = useQuery<Employee[]>({
    queryKey: ["employees", showInactive],
    queryFn: async () =>
      (await api.get(`/api/employees${showInactive ? "?includeInactive=true" : ""}`)).data,
  });

  const [f, setF] = useState<Filters>(EMPTY);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) =>
    setF((cur) => ({ ...cur, [k]: v }));

  // Designation options come from whatever the fetched employees actually use.
  const designations = useMemo(
    () =>
      Array.from(new Set(data.map((e) => e.designation).filter((d): d is string => Boolean(d)))).sort(
        (a, b) => a.localeCompare(b),
      ),
    [data],
  );

  // The employee list is already fully loaded — filter and sort client-side.
  const filtered = useMemo(() => {
    const needle = f.q.trim().toLowerCase();
    return data.filter((e) => {
      if (needle) {
        const hay = [e.name, e.code || "", e.phone || "", e.altPhone || "", e.designation || "", e.city || ""]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (f.designation !== ALL && e.designation !== f.designation) return false;
      if (f.active === "active" && !e.isActive) return false;
      if (f.active === "inactive" && e.isActive) return false;
      return true;
    });
  }, [data, f]);

  const sorted = useTableSort<Employee>(
    filtered,
    {
      name: (e) => e.name,
      designation: (e) => e.designation,
      phone: (e) => e.phone,
      joined: (e) => sortDate(e.joiningDate),
      status: (e) => (e.isActive ? 0 : 1),
    },
    { key: "name", dir: "asc" },
  );

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (f.q.trim()) chips.push({ key: "q", label: t("employees.chipSearch", "Search: {q}", { q: f.q.trim() }), clear: () => set("q", "") });
  if (f.designation !== ALL)
    chips.push({ key: "desig", label: t("employees.chipRole", "Role: {v}", { v: f.designation }), clear: () => set("designation", ALL) });
  if (f.active !== ALL)
    chips.push({
      key: "active",
      label:
        f.active === "active"
          ? t("employees.activeOnly", "Active only")
          : t("employees.inactiveOnly", "Inactive only"),
      clear: () => set("active", ALL),
    });
  const activeFilters = chips.length > 0;
  const clearAll = () => setF(EMPTY);

  const [open, setOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [designation, setDesignation] = useState("");
  const [phone, setPhone] = useState("");
  const [altPhone, setAltPhone] = useState("");
  const [joiningDate, setJoiningDate] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setName(""); setCode(""); setDesignation(""); setPhone(""); setAltPhone("");
    setJoiningDate(""); setDateOfBirth(""); setAddressLine(""); setCity(""); setState("");
    setPincode(""); setEmergencyContactName(""); setEmergencyContactPhone(""); setNotes("");
    setShowMore(false);
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: ["employees"] });

  const create = useMutation({
    mutationFn: async () =>
      (await api.post("/api/employees", {
        name,
        code: code || undefined,
        designation: designation || undefined,
        phone: phone || undefined,
        altPhone: altPhone || undefined,
        joiningDate: joiningDate || undefined,
        dateOfBirth: dateOfBirth || undefined,
        addressLine: addressLine || undefined,
        city: city || undefined,
        state: state || undefined,
        pincode: pincode || undefined,
        emergencyContactName: emergencyContactName || undefined,
        emergencyContactPhone: emergencyContactPhone || undefined,
        notes: notes || undefined,
      })).data,
    onSuccess: () => {
      toast.success(t("employees.added", "Employee added"));
      setOpen(false);
      reset();
      invalidate();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const deactivate = useMutation({
    mutationFn: async (id: string) => (await api.post(`/api/employees/${id}/deactivate`)).data,
    onSuccess: () => {
      toast.success(t("employees.deactivated", "Employee deactivated"));
      invalidate();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const reactivate = useMutation({
    mutationFn: async (id: string) => (await api.post(`/api/employees/${id}/reactivate`)).data,
    onSuccess: () => {
      toast.success(t("employees.reactivated", "Employee reactivated"));
      invalidate();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">{t("employees.title", "Employees")}</h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            {t("employees.subtitle", "Attendants you can assign to nozzles per shift.")}
          </p>
        </div>
        {canManage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-1" /> {t("employees.add", "Add employee")}</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{t("employees.add", "Add employee")}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2"><Label>{t("common.name", "Name")}</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
                  <div><Label>{t("employees.staffCode", "Staff code")}</Label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("employees.codePh", "Optional")} /></div>
                  <div><Label>{t("employees.designation", "Designation")}</Label><Input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder={t("employees.designationPh", "Attendant")} /></div>
                  <div><Label>{t("common.phone", "Phone")}</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
                  <div><Label>{t("employees.altPhone", "Alternate phone")}</Label><Input value={altPhone} onChange={(e) => setAltPhone(e.target.value)} /></div>
                  <div><Label>{t("employees.joiningDate", "Joining date")}</Label><Input type="date" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} /></div>
                  <div><Label>{t("employees.dob", "Date of birth")}</Label><Input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} /></div>
                </div>

                <Separator />

                <button
                  type="button"
                  onClick={() => setShowMore((v) => !v)}
                  className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  {showMore ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  {t("employees.moreToggle", "Address & emergency contact (optional)")}
                </button>

                {showMore && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2"><Label>{t("employees.address", "Address")}</Label><Input value={addressLine} onChange={(e) => setAddressLine(e.target.value)} /></div>
                    <div><Label>{t("employees.city", "City")}</Label><Input value={city} onChange={(e) => setCity(e.target.value)} /></div>
                    <div><Label>{t("employees.state", "State")}</Label><Input value={state} onChange={(e) => setState(e.target.value)} /></div>
                    <div><Label>{t("employees.pincode", "Pincode")}</Label><Input value={pincode} onChange={(e) => setPincode(e.target.value)} maxLength={6} /></div>
                    <div><Label>{t("employees.emergencyContact", "Emergency contact")}</Label><Input value={emergencyContactName} onChange={(e) => setEmergencyContactName(e.target.value)} /></div>
                    <div><Label>{t("employees.emergencyPhone", "Emergency phone")}</Label><Input value={emergencyContactPhone} onChange={(e) => setEmergencyContactPhone(e.target.value)} /></div>
                    <div className="sm:col-span-2"><Label>{t("common.notes", "Notes")}</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
                  </div>
                )}

                <Button onClick={() => create.mutate()} disabled={!name || create.isPending} className="w-full">
                  {create.isPending ? t("common.saving", "Saving…") : t("common.add", "Add")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">{t("common.search", "Search")}</Label>
              <Input
                placeholder={t("employees.searchPh", "Name, code, phone or city")}
                value={f.q}
                onChange={(e) => set("q", e.target.value)}
              />
            </div>
            <div className="min-w-0">
              <Label className="text-xs">{t("employees.designation", "Designation")}</Label>
              <Select value={f.designation} onValueChange={(v) => set("designation", v)}>
                <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t("employees.allDesignations", "All designations")}</SelectItem>
                  {designations.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0">
              <Label className="text-xs">{t("common.status", "Status")}</Label>
              <Select value={f.active} onValueChange={(v) => set("active", v)}>
                <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t("employees.allStatuses", "All statuses")}</SelectItem>
                  <SelectItem value="active">{t("employees.activeOnly", "Active only")}</SelectItem>
                  <SelectItem value="inactive">{t("employees.inactiveOnly", "Inactive only")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t(
              "employees.inactiveHint",
              "Inactive employees are only in this list when “Show inactive” is on."
            )}
          </p>
          {activeFilters && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
              {chips.map((c) => (
                <FilterChip key={c.key} label={c.label} onRemove={c.clear} />
              ))}
              <Button size="sm" variant="ghost" onClick={clearAll}>{t("common.clearAll", "Clear all")}</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <CardTitle className="text-base">
            {activeFilters
              ? t("employees.countTitle", "{n} of {total} employees", {
                  n: sorted.rows.length,
                  total: data.length,
                })
              : showInactive
                ? t("employees.allIncl", "All employees (including inactive)")
                : t("employees.activeTitle", "Active employees")}
          </CardTitle>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="h-4 w-4"
            />
            {t("employees.showInactive", "Show inactive")}
          </label>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead {...sorted.sortProps("name")}>{t("common.name", "Name")}</SortableHead>
                <SortableHead {...sorted.sortProps("designation")}>{t("employees.designation", "Designation")}</SortableHead>
                <SortableHead {...sorted.sortProps("phone")}>{t("common.phone", "Phone")}</SortableHead>
                <SortableHead {...sorted.sortProps("joined")}>{t("employees.col.joined", "Joined")}</SortableHead>
                <SortableHead {...sorted.sortProps("status")}>{t("common.status", "Status")}</SortableHead>
                {canManage && <TableHead className="text-right">{t("common.actions", "Actions")}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.rows.map((e) => (
                <TableRow key={e.id} className={e.isActive ? "" : "opacity-60"}>
                  <TableCell>
                    <Link href={`/employees/${e.id}`} className="font-medium hover:underline">
                      {e.name}
                    </Link>
                    {e.code && <div className="text-xs text-muted-foreground font-mono">{e.code}</div>}
                  </TableCell>
                  <TableCell>{e.designation || "-"}</TableCell>
                  <TableCell>{e.phone || "-"}</TableCell>
                  <TableCell>{e.joiningDate ? format(new Date(e.joiningDate), "d MMM yyyy", { locale }) : "-"}</TableCell>
                  <TableCell>
                    {e.isActive ? <Badge variant="success">{t("common.active", "Active")}</Badge> : <Badge variant="secondary">{t("common.inactive", "Inactive")}</Badge>}
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      {e.isActive ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          title={t("employees.deactivate", "Deactivate")}
                          onClick={() => deactivate.mutate(e.id)}
                          disabled={deactivate.isPending}
                        >
                          <UserX className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          title={t("employees.reactivate", "Reactivate")}
                          onClick={() => reactivate.mutate(e.id)}
                          disabled={reactivate.isPending}
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {sorted.rows.length === 0 && (
                <NoMatchRow
                  colSpan={canManage ? 6 : 5}
                  filtered={activeFilters}
                  onClear={clearAll}
                  emptyMessage={t("employees.empty", "No employees yet.")}
                />
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

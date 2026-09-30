"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, can, getAuthUser } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatINR, formatLitres, FUEL_LABELS } from "@/lib/utils";
import { apiError, toDateInput, type Employee } from "@/lib/types";
import { format } from "date-fns";
import { toast } from "sonner";
import { AlertTriangle, ArrowRightLeft, Pencil, UserCheck, UserX } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useDateLocale } from "@/lib/i18n/core";

type Assignment = {
  id: string;
  litresMl: string;
  valuePaise: string;
  shiftReport: { id: string; reportDate: string; shiftType: string };
  nozzle: { id: string; code: string; fuelType: string };
};

type EmployeeLedger = { employee: Employee; assignments: Assignment[] };

type TransferTarget = { id: string; name: string; code: string | null; city: string | null };

export default function EmployeeLedgerPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const qc = useQueryClient();
  const canManage = can("canManageEmployees");
  const { t } = useT();
  const locale = useDateLocale();
  const fmtDate = (iso: string | null | undefined) =>
    iso ? format(new Date(iso), "d MMM yyyy", { locale }) : null;
  const [editOpen, setEditOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const router = useRouter();
  // Moving staff between pumps is the owner's call; the API refuses anyone else.
  const isOwner = getAuthUser()?.role === "OWNER";

  const { data, isLoading } = useQuery<EmployeeLedger>({
    queryKey: ["employee-ledger", id],
    queryFn: async () => (await api.get(`/api/employees/${id}/ledger`)).data,
  });

  // No other pump in the business means there is nowhere to move anyone, so the
  // action is not shown at all.
  const { data: transferTargets = [] } = useQuery<TransferTarget[]>({
    queryKey: ["employee-transfer-targets", id],
    queryFn: async () => (await api.get(`/api/employees/${id}/transfer-targets`)).data,
    enabled: isOwner,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["employee-ledger", id] });
    qc.invalidateQueries({ queryKey: ["employees"] });
  };

  const toggleActive = useMutation({
    mutationFn: async (activate: boolean) =>
      (await api.post(`/api/employees/${id}/${activate ? "reactivate" : "deactivate"}`)).data,
    onSuccess: (_res, activate) => {
      toast.success(
        activate
          ? t("employees.reactivated", "Employee reactivated")
          : t("employees.deactivated", "Employee deactivated")
      );
      refresh();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  if (isLoading) return <div className="text-muted-foreground">{t("common.loading", "Loading…")}</div>;
  if (!data) return null;
  const { employee, assignments } = data;

  const shiftsWorked = new Set(assignments.map((a) => a.shiftReport.id)).size;
  const totalLitresMl = assignments.reduce((acc: bigint, a) => acc + BigInt(a.litresMl), 0n);
  const totalValuePaise = assignments.reduce((acc: bigint, a) => acc + BigInt(a.valuePaise), 0n);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold break-words">{employee.name}</h1>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-sm sm:text-base">
            {employee.code && <span className="font-mono">{employee.code}</span>}
            {employee.designation && <span>{employee.designation}</span>}
            <span>{t("employees.phoneLine", "Phone: {phone}", { phone: employee.phone || "-" })}</span>
            <span>{employee.isActive ? <Badge variant="success">{t("common.active", "Active")}</Badge> : <Badge variant="secondary">{t("common.inactive", "Inactive")}</Badge>}</span>
          </div>
        </div>
        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4 mr-1" /> {t("employees.editDetails", "Edit details")}
            </Button>
            {isOwner && transferTargets.length > 0 && (
              <Button variant="outline" onClick={() => setTransferOpen(true)}>
                <ArrowRightLeft className="h-4 w-4 mr-1" />{" "}
                {t("employees.transfer", "Move to another pump")}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => toggleActive.mutate(!employee.isActive)}
              disabled={toggleActive.isPending}
            >
              {employee.isActive ? (
                <><UserX className="h-4 w-4 mr-1" /> {t("employees.deactivate", "Deactivate")}</>
              ) : (
                <><UserCheck className="h-4 w-4 mr-1" /> {t("employees.reactivate", "Reactivate")}</>
              )}
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{t("employees.shiftsWorked", "Shifts Worked")}</div><div className="text-xl font-semibold">{shiftsWorked}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{t("employees.totalLitres", "Total Litres Dispensed")}</div><div className="text-xl font-semibold">{formatLitres(totalLitresMl)} L</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{t("employees.totalValue", "Total Value")}</div><div className="text-xl font-semibold">{formatINR(totalValuePaise)}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{t("employees.employment", "Employment details")}</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
            <Field label={t("employees.designation", "Designation")} value={employee.designation} />
            <Field label={t("employees.joiningDate", "Joining date")} value={fmtDate(employee.joiningDate)} />
            <Field label={t("employees.exitDate", "Exit date")} value={fmtDate(employee.exitDate)} />
            <Field label={t("employees.dob", "Date of birth")} value={fmtDate(employee.dateOfBirth)} />
            <Field label={t("common.phone", "Phone")} value={employee.phone} />
            <Field label={t("employees.altPhone", "Alternate phone")} value={employee.altPhone} />
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">{t("employees.address", "Address")}</dt>
              <dd className="font-medium break-words">
                {[employee.addressLine, employee.city, employee.state, employee.pincode].filter(Boolean).join(", ") || "-"}
              </dd>
            </div>
            <Field
              label={t("employees.emergencyContact", "Emergency contact")}
              value={
                [employee.emergencyContactName, employee.emergencyContactPhone].filter(Boolean).join(" · ") || null
              }
            />
            <Field label={t("common.notes", "Notes")} value={employee.notes} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{t("employees.assignments", "Shift assignments")}</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>{t("common.date", "Date")}</TableHead><TableHead>{t("employees.col.shift", "Shift")}</TableHead><TableHead>{t("employees.col.nozzle", "Nozzle")}</TableHead>
              <TableHead>{t("employees.col.fuel", "Fuel")}</TableHead><TableHead>{t("employees.col.litres", "Litres")}</TableHead><TableHead>{t("employees.col.value", "Value")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {assignments.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{format(new Date(a.shiftReport.reportDate), "d MMM yyyy", { locale })}</TableCell>
                  <TableCell>{t(`employees.shiftType.${a.shiftReport.shiftType}`, a.shiftReport.shiftType)}</TableCell>
                  <TableCell className="font-mono">{a.nozzle.code}</TableCell>
                  <TableCell>{t(`shift.fuel.${a.nozzle.fuelType}`, FUEL_LABELS[a.nozzle.fuelType] || a.nozzle.fuelType)}</TableCell>
                  <TableCell>{formatLitres(a.litresMl)}</TableCell>
                  <TableCell>{formatINR(a.valuePaise)}</TableCell>
                </TableRow>
              ))}
              {assignments.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">{t("employees.noAssignments", "No shift assignments yet")}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("employees.transferTitle", "Move {name} to another pump", { name: employee.name })}</DialogTitle>
          </DialogHeader>
          <TransferForm
            employee={employee}
            targets={transferTargets}
            onSuccess={() => {
              setTransferOpen(false);
              // They now belong to another pump, so this page's data no longer
              // exists for the pump we are signed in to — go back to the list.
              qc.removeQueries({ queryKey: ["employee-ledger", id] });
              qc.invalidateQueries({ queryKey: ["employees"] });
              router.push("/employees");
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("employees.editTitle", "Edit employee")}</DialogTitle></DialogHeader>
          <EmployeeForm
            employee={employee}
            onSuccess={() => {
              setEditOpen(false);
              refresh();
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}


/**
 * Moving a staff member to another pump of the same business. Their history is
 * deliberately left behind — past shifts, cash and dues belong to the pump where
 * they happened, which is what makes "whose cash is this" answerable at all.
 */
function TransferForm({
  employee,
  targets,
  onSuccess,
}: {
  employee: Employee;
  targets: TransferTarget[];
  onSuccess: () => void;
}) {
  const { t } = useT();
  const [toPumpId, setToPumpId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const move = useMutation({
    mutationFn: async () =>
      (
        await api.post(`/api/employees/${employee.id}/transfer`, {
          toPumpId,
          reason: reason.trim() === "" ? null : reason.trim(),
        })
      ).data,
    onSuccess: (res: { from?: { name: string }; to?: { name: string } }) => {
      toast.success(
        t("employees.transferred", "{name} moved from {from} to {to}", {
          name: employee.name,
          from: res?.from?.name ?? "-",
          to: res?.to?.name ?? "-",
        })
      );
      onSuccess();
    },
    onError: (e) => {
      const msg = apiError(e, t("employees.transferFailed", "Could not move this employee"));
      setError(msg);
      toast.error(msg);
    },
  });

  return (
    <div className="space-y-3">
      <div>
        <Label>{t("employees.transferTo", "Move to")}</Label>
        <Select value={toPumpId} onValueChange={setToPumpId}>
          <SelectTrigger>
            <SelectValue placeholder={t("employees.transferPick", "Choose a pump")} />
          </SelectTrigger>
          <SelectContent>
            {targets.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {[p.name, p.city].filter(Boolean).join(" · ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>{t("employees.transferReason", "Reason (optional)")}</Label>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
      </div>

      <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          {t(
            "employees.transferWarning",
            "Their past shifts, cash and dues stay with the old pump — nothing already recorded is moved. Any login they have follows them to the new pump."
          )}
        </span>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        className="w-full"
        onClick={() => {
          setError("");
          move.mutate();
        }}
        disabled={!toPumpId || move.isPending}
      >
        {move.isPending
          ? t("common.saving", "Saving…")
          : t("employees.transferConfirm", "Yes, move them")}
      </Button>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium break-words">{value || "-"}</dd>
    </div>
  );
}

function EmployeeForm({ employee, onSuccess }: { employee: Employee; onSuccess: () => void }) {
  const { t } = useT();
  const [name, setName] = useState(employee.name);
  const [code, setCode] = useState(employee.code || "");
  const [designation, setDesignation] = useState(employee.designation || "");
  const [phone, setPhone] = useState(employee.phone || "");
  const [altPhone, setAltPhone] = useState(employee.altPhone || "");
  const [dateOfBirth, setDateOfBirth] = useState(toDateInput(employee.dateOfBirth));
  const [joiningDate, setJoiningDate] = useState(toDateInput(employee.joiningDate));
  const [exitDate, setExitDate] = useState(toDateInput(employee.exitDate));
  const [addressLine, setAddressLine] = useState(employee.addressLine || "");
  const [city, setCity] = useState(employee.city || "");
  const [state, setState] = useState(employee.state || "");
  const [pincode, setPincode] = useState(employee.pincode || "");
  const [ecName, setEcName] = useState(employee.emergencyContactName || "");
  const [ecPhone, setEcPhone] = useState(employee.emergencyContactPhone || "");
  const [notes, setNotes] = useState(employee.notes || "");

  // Empty inputs are sent as null so a previously stored value is actually cleared.
  const orNull = (v: string) => (v.trim() === "" ? null : v.trim());

  const save = useMutation({
    mutationFn: async () =>
      (await api.patch(`/api/employees/${employee.id}`, {
        name: name.trim(),
        code: orNull(code),
        designation: orNull(designation),
        phone: orNull(phone),
        altPhone: orNull(altPhone),
        dateOfBirth: orNull(dateOfBirth),
        joiningDate: orNull(joiningDate),
        exitDate: orNull(exitDate),
        addressLine: orNull(addressLine),
        city: orNull(city),
        state: orNull(state),
        pincode: orNull(pincode),
        emergencyContactName: orNull(ecName),
        emergencyContactPhone: orNull(ecPhone),
        notes: orNull(notes),
      })).data,
    onSuccess: () => {
      toast.success(t("employees.updated", "Employee updated"));
      onSuccess();
    },
    onError: (e) => toast.error(apiError(e, t("employees.saveFailed", "Could not save the employee"))),
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2"><Label>{t("common.name", "Name")}</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><Label>{t("employees.staffCode", "Staff code")}</Label><Input value={code} onChange={(e) => setCode(e.target.value)} /></div>
        <div><Label>{t("employees.designation", "Designation")}</Label><Input value={designation} onChange={(e) => setDesignation(e.target.value)} /></div>
        <div><Label>{t("common.phone", "Phone")}</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        <div><Label>{t("employees.altPhone", "Alternate phone")}</Label><Input value={altPhone} onChange={(e) => setAltPhone(e.target.value)} /></div>
      </div>

      <Separator />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div><Label>{t("employees.joiningDate", "Joining date")}</Label><Input type="date" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} /></div>
        <div><Label>{t("employees.exitDate", "Exit date")}</Label><Input type="date" value={exitDate} onChange={(e) => setExitDate(e.target.value)} /></div>
        <div><Label>{t("employees.dob", "Date of birth")}</Label><Input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} /></div>
      </div>

      <Separator />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2"><Label>{t("employees.address", "Address")}</Label><Input value={addressLine} onChange={(e) => setAddressLine(e.target.value)} /></div>
        <div><Label>{t("employees.city", "City")}</Label><Input value={city} onChange={(e) => setCity(e.target.value)} /></div>
        <div><Label>{t("employees.state", "State")}</Label><Input value={state} onChange={(e) => setState(e.target.value)} /></div>
        <div><Label>{t("employees.pincode", "Pincode")}</Label><Input value={pincode} onChange={(e) => setPincode(e.target.value)} maxLength={6} /></div>
        <div><Label>{t("employees.emergencyContact", "Emergency contact")}</Label><Input value={ecName} onChange={(e) => setEcName(e.target.value)} /></div>
        <div><Label>{t("employees.emergencyPhone", "Emergency phone")}</Label><Input value={ecPhone} onChange={(e) => setEcPhone(e.target.value)} /></div>
        <div className="sm:col-span-2"><Label>{t("common.notes", "Notes")}</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      </div>

      <Button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending} className="w-full">
        {save.isPending ? t("common.saving", "Saving…") : t("employees.saveChanges", "Save changes")}
      </Button>
    </div>
  );
}

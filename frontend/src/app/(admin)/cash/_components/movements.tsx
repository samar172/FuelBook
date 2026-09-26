"use client";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { api, can } from "@/lib/api";
import { apiError, type Employee } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatINR, rupeesToPaise } from "@/lib/utils";
import {
  CASH_LOCATIONS,
  EmptyState,
  LOCATION_SHORT,
  Loading,
  Money,
  PERSONAL_LOCATIONS,
  daysAgoStr,
  todayStr,
} from "./shared";

const NONE = "__none__";
const ALL = "__all__";

export type MovementDefaults = {
  fromLocation?: string;
  fromEmployeeId?: string | null;
  toLocation?: string;
  toEmployeeId?: string | null;
};

type MovementRow = {
  id: string;
  occurredAt: string;
  fromLocation: string;
  toLocation: string;
  amountPaise: string;
  purpose: string | null;
  reference: string | null;
  notes: string | null;
  cashDepositId: string | null;
  journalEntryId: string | null;
  fromEmployee: { id: string; name: string; code: string | null } | null;
  toEmployee: { id: string; name: string; code: string | null } | null;
  shiftReport: { id: string; reportDate: string; shiftType: string } | null;
  cashDeposit: { id: string; slipNo: string | null; status: string } | null;
};

export const useEmployees = () =>
  useQuery<Employee[]>({
    queryKey: ["cash-employees"],
    queryFn: async () => (await api.get("/api/employees")).data,
  });

const partyLabel = (
  location: string,
  employee: { name: string; code: string | null } | null,
) => (employee ? `${LOCATION_SHORT[location] ?? location} · ${employee.name}` : LOCATION_SHORT[location] ?? location);

// ===================== RECORD A MOVEMENT =====================

export function MovementDialog({
  open,
  onOpenChange,
  defaults,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaults?: MovementDefaults;
}) {
  const qc = useQueryClient();
  const employeesQ = useEmployees();
  const employees = employeesQ.data ?? [];

  const [amount, setAmount] = useState("");
  const [fromLocation, setFromLocation] = useState("CASHIER");
  const [fromEmployeeId, setFromEmployeeId] = useState(NONE);
  const [toLocation, setToLocation] = useState("OFFICE_SAFE");
  const [toEmployeeId, setToEmployeeId] = useState(NONE);
  const [occurredAt, setOccurredAt] = useState(todayStr());
  const [purpose, setPurpose] = useState("");
  const [reference, setReference] = useState("");

  // Re-seed whenever the dialog opens so "hand over from this person" works.
  useEffect(() => {
    if (!open) return;
    setAmount("");
    setFromLocation(defaults?.fromLocation ?? "CASHIER");
    setFromEmployeeId(defaults?.fromEmployeeId ?? NONE);
    setToLocation(defaults?.toLocation ?? "OFFICE_SAFE");
    setToEmployeeId(defaults?.toEmployeeId ?? NONE);
    setOccurredAt(todayStr());
    setPurpose("");
    setReference("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const fromNeedsPerson = PERSONAL_LOCATIONS.includes(fromLocation);
  const toNeedsPerson = PERSONAL_LOCATIONS.includes(toLocation);

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post("/api/cash-bank/movements", {
          fromLocation,
          fromEmployeeId: fromNeedsPerson && fromEmployeeId !== NONE ? fromEmployeeId : null,
          toLocation,
          toEmployeeId: toNeedsPerson && toEmployeeId !== NONE ? toEmployeeId : null,
          amountPaise: rupeesToPaise(amount || "0"),
          occurredAt,
          purpose: purpose.trim() || null,
          reference: reference.trim() || null,
        })
      ).data,
    onSuccess: () => {
      toast.success("Cash movement recorded");
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["cash-position"] });
      qc.invalidateQueries({ queryKey: ["cash-movements"] });
    },
    onError: (e) => toast.error(apiError(e, "Could not record the movement")),
  });

  const amountValid = Number(amount) > 0;
  const blocked =
    !amountValid ||
    (fromNeedsPerson && fromEmployeeId === NONE) ||
    (toNeedsPerson && toEmployeeId === NONE) ||
    (fromLocation === toLocation &&
      (fromNeedsPerson ? fromEmployeeId : NONE) === (toNeedsPerson ? toEmployeeId : NONE));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record a cash movement</DialogTitle>
          <DialogDescription>
            Who handed how much to whom. Recording it here is what keeps the cash position true.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Amount (₹)</Label>
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="text-lg"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">From</p>
              <Select value={fromLocation} onValueChange={setFromLocation}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CASH_LOCATIONS.filter((l) => l !== "BANK").map((l) => (
                    <SelectItem key={l} value={l}>
                      {LOCATION_SHORT[l]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fromNeedsPerson ? (
                <Select value={fromEmployeeId} onValueChange={setFromEmployeeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Who?" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Pick a person…</SelectItem>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name}
                        {e.code ? ` (${e.code})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
            </div>

            <div className="space-y-2 rounded-md border p-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">To</p>
              <Select value={toLocation} onValueChange={setToLocation}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CASH_LOCATIONS.map((l) => (
                    <SelectItem key={l} value={l}>
                      {LOCATION_SHORT[l]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {toNeedsPerson ? (
                <Select value={toEmployeeId} onValueChange={setToEmployeeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Who?" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Pick a person…</SelectItem>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name}
                        {e.code ? ` (${e.code})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
            </div>
          </div>

          {toLocation === "BANK" ? (
            <p className="text-xs text-amber-600">
              For a bank deposit, use the Deposits tab instead — it records the slip number and
              creates this movement for you.
            </p>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">On</Label>
              <Input
                type="date"
                max={todayStr()}
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Reference (optional)</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Purpose (optional)</Label>
            <Input
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. shift close hand-over, owner took cash"
            />
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => create.mutate()} disabled={blocked || create.isPending}>
              {create.isPending ? "Saving…" : "Record movement"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ===================== THE TRAIL =====================

export function MovementsSection() {
  const qc = useQueryClient();
  const employeesQ = useEmployees();
  const employees = employeesQ.data ?? [];

  const [from, setFrom] = useState(daysAgoStr(29));
  const [to, setTo] = useState(todayStr());
  const [employeeId, setEmployeeId] = useState(ALL);
  const [location, setLocation] = useState(ALL);
  const [dialogOpen, setDialogOpen] = useState(false);

  const qs = useMemo(() => {
    const p = new URLSearchParams({ from, to });
    if (employeeId !== ALL) p.set("employeeId", employeeId);
    if (location !== ALL) p.set("location", location);
    return p.toString();
  }, [from, to, employeeId, location]);

  const movementsQ = useQuery<{ movements: MovementRow[]; count: number; totalPaise: string }>({
    queryKey: ["cash-movements", qs],
    queryFn: async () => (await api.get(`/api/cash-bank/movements?${qs}`)).data,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/api/cash-bank/movements/${id}`)).data,
    onSuccess: () => {
      toast.success("Movement deleted");
      qc.invalidateQueries({ queryKey: ["cash-movements"] });
      qc.invalidateQueries({ queryKey: ["cash-position"] });
    },
    onError: (e) => toast.error(apiError(e, "Could not delete the movement")),
  });

  const editable = can("canEditCollections");
  const rows = movementsQ.data?.movements ?? [];

  return (
    <div className="space-y-4">
      <MovementDialog open={dialogOpen} onOpenChange={setDialogOpen} />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle>Custody trail</CardTitle>
              <CardDescription>
                Every recorded hand-over, in the order it happened.
              </CardDescription>
            </div>
            {editable ? (
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> Record movement
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <Label className="text-xs">From</Label>
              <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                value={to}
                min={from}
                max={todayStr()}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Person</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Everyone</SelectItem>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Location</Label>
              <Select value={location} onValueChange={setLocation}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Anywhere</SelectItem>
                  {CASH_LOCATIONS.map((l) => (
                    <SelectItem key={l} value={l}>
                      {LOCATION_SHORT[l]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {movementsQ.isLoading ? (
            <Loading />
          ) : movementsQ.error ? (
            <EmptyState
              title="Could not load the trail"
              hint={apiError(movementsQ.error, "Try a shorter date range")}
            />
          ) : rows.length === 0 ? (
            <EmptyState
              title="No cash movements in this range"
              hint={
                editable
                  ? "Record the first hand-over and the cash position starts answering for itself."
                  : "Nothing has been recorded for these filters."
              }
            />
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {rows.length} movement{rows.length === 1 ? "" : "s"} ·{" "}
                <span className="font-medium text-foreground">
                  {formatINR(movementsQ.data!.totalPaise)}
                </span>{" "}
                moved
              </p>
              <ul className="divide-y rounded-md border">
                {rows.map((m) => (
                  <li key={m.id} className="p-3 flex flex-wrap items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap text-sm font-medium">
                        <span>{partyLabel(m.fromLocation, m.fromEmployee)}</span>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span>{partyLabel(m.toLocation, m.toEmployee)}</span>
                        {m.cashDeposit ? (
                          <Badge variant="secondary">
                            Deposit{m.cashDeposit.slipNo ? ` · ${m.cashDeposit.slipNo}` : ""}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {m.occurredAt.slice(0, 10)}
                        {m.purpose ? ` · ${m.purpose}` : ""}
                        {m.reference ? ` · ref ${m.reference}` : ""}
                        {m.shiftReport
                          ? ` · shift ${m.shiftReport.reportDate.slice(0, 10)} ${m.shiftReport.shiftType}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold tabular-nums">
                        <Money paise={m.amountPaise} />
                      </span>
                      {editable && !m.cashDepositId && !m.journalEntryId ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Delete movement"
                          onClick={() => {
                            if (window.confirm("Delete this cash movement?")) remove.mutate(m.id);
                          }}
                          disabled={remove.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

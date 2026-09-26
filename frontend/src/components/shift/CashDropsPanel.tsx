"use client";
// Mid-shift cash drops: an attendant handing cash to the shift cashier or the
// office safe partway through the shift, with the time it actually happened.
// Drops count towards what that attendant owes at the end of the shift.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatINR } from "@/lib/utils";
import { apiError, Employee } from "@/lib/types";
import { toast } from "sonner";
import { format, isSameDay } from "date-fns";
import { HandCoins, Plus, Trash2, X } from "lucide-react";
import { inputToPaise, paise } from "@/lib/books";

export type DropLocation = "CASHIER" | "OFFICE_SAFE";

export type CashDrop = {
  id: string;
  amountPaise: string;
  occurredAt: string;
  fromEmployee: { id: string; name: string; code: string | null };
  toLocation: DropLocation;
  toEmployee: { id: string; name: string } | null;
  purpose: string | null;
  notes: string | null;
};

type DropsResponse = { drops: CashDrop[]; totalPaise: string };

const OFFICE_SAFE_LABEL = "the office safe";

// An <input type="datetime-local"> value for a Date, in local time.
const toLocalInput = (d: Date): string => format(d, "yyyy-MM-dd'T'HH:mm");

// Where the cash went, in the owner's words.
export const dropDestination = (d: CashDrop): string =>
  d.toLocation === "OFFICE_SAFE"
    ? OFFICE_SAFE_LABEL
    : d.toEmployee
      ? `${d.toEmployee.name} (cashier)`
      : "the cashier";

// "2:45 PM", or "24 Sep, 11:50 PM" when the drop is not on the report date —
// night shifts run past midnight.
export const dropTimeLabel = (occurredAt: string, reportDate?: string): string => {
  const when = new Date(occurredAt);
  const sameDay = reportDate ? isSameDay(when, new Date(reportDate)) : true;
  return sameDay ? format(when, "h:mm a") : format(when, "d MMM, h:mm a");
};

type Form = {
  employeeId: string;
  amount: string;
  toLocation: DropLocation;
  toEmployeeId: string;
  occurredAt: string;
  purpose: string;
  notes: string;
};

const emptyForm = (employeeId: string, cashierEmployeeId: string | null): Form => ({
  employeeId,
  amount: "",
  toLocation: "CASHIER",
  toEmployeeId: cashierEmployeeId ?? "",
  occurredAt: toLocalInput(new Date()),
  purpose: "",
  notes: "",
});

export function CashDropsPanel({
  shiftId,
  reportDate,
  readOnly,
  employees,
  attendants,
  cashierEmployeeId,
}: {
  shiftId: string;
  reportDate?: string;
  readOnly: boolean;
  employees: Employee[];
  /** The people this shift reconciles against — offered first in the picker. */
  attendants: { employeeId: string; employeeName: string }[];
  cashierEmployeeId: string | null;
}) {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<DropsResponse>({
    queryKey: ["shift-cash-drops", shiftId],
    queryFn: async () => (await api.get(`/api/shifts/${shiftId}/cash-drops`)).data,
  });

  const [form, setForm] = useState<Form | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["shift-cash-drops", shiftId] });
    qc.invalidateQueries({ queryKey: ["shift-cash-recon", shiftId] });
    qc.invalidateQueries({ queryKey: ["shift", shiftId] });
  };

  const create = useMutation({
    mutationFn: async (f: Form) => {
      if (!f.employeeId) throw new Error("Say who handed the cash in");
      const amountPaise = inputToPaise(f.amount);
      if (paise(amountPaise) <= 0) throw new Error("Enter how much cash was handed in");
      if (!f.occurredAt) throw new Error("Say when the cash was handed in");
      return (
        await api.post(`/api/shifts/${shiftId}/cash-drops`, {
          employeeId: f.employeeId,
          amountPaise,
          toLocation: f.toLocation,
          toEmployeeId: f.toLocation === "CASHIER" ? f.toEmployeeId || undefined : undefined,
          // datetime-local is local time — send a real instant.
          occurredAt: new Date(f.occurredAt).toISOString(),
          purpose: f.purpose.trim() || undefined,
          notes: f.notes.trim() || undefined,
        })
      ).data;
    },
    onSuccess: () => {
      toast.success("Cash drop recorded");
      setForm(null);
      refresh();
    },
    onError: (e) => toast.error(apiError(e, "Could not record the cash drop")),
  });

  const remove = useMutation({
    mutationFn: async (movementId: string) =>
      (await api.delete(`/api/shifts/${shiftId}/cash-drops/${movementId}`)).data,
    onSuccess: () => {
      toast.success("Cash drop deleted");
      refresh();
    },
    // A 409 means it is already posted to the books — show what the server said.
    onError: (e) => toast.error(apiError(e, "Could not delete the cash drop")),
  });

  const drops = data?.drops ?? [];
  const attendantIds = new Set(attendants.map((a) => a.employeeId));
  const pickList = [
    ...employees.filter((e) => attendantIds.has(e.id)),
    ...employees.filter((e) => !attendantIds.has(e.id)),
  ];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <HandCoins className="h-4 w-4" /> Cash handed in during the shift
          </CardTitle>
          <CardDescription>
            Every time an attendant passes cash to the cashier or drops it in the office safe,
            record it here with the time. It counts towards what they owe at the end of the shift.
          </CardDescription>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Handed in so far</div>
            <div className="font-mono font-semibold">{formatINR(data?.totalPaise ?? 0)}</div>
          </div>
          {!readOnly && !form && (
            <Button size="sm" onClick={() => setForm(emptyForm(attendants[0]?.employeeId ?? "", cashierEmployeeId))}>
              <Plus className="h-4 w-4 mr-1" /> Record cash drop
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!readOnly && form && (
          <div className="rounded-md border bg-muted/30 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Record a cash drop</div>
              <Button size="icon" variant="ghost" onClick={() => setForm(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Who handed it in</Label>
                <Select
                  value={form.employeeId}
                  onValueChange={(v) => setForm({ ...form, employeeId: v })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Pick the attendant" />
                  </SelectTrigger>
                  <SelectContent>
                    {pickList.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Amount (₹)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  className="mt-1 text-right"
                  placeholder="0.00"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Handed to</Label>
                <Select
                  value={form.toLocation}
                  onValueChange={(v) => setForm({ ...form, toLocation: v as DropLocation })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASHIER">The shift cashier</SelectItem>
                    <SelectItem value="OFFICE_SAFE">The office safe</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Time it happened</Label>
                <Input
                  type="datetime-local"
                  className="mt-1"
                  value={form.occurredAt}
                  onChange={(e) => setForm({ ...form, occurredAt: e.target.value })}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Defaults to now — change it if you are writing it up a bit late.
                </p>
              </div>
              {form.toLocation === "CASHIER" && (
                <div>
                  <Label className="text-xs">Which cashier took it</Label>
                  <Select
                    value={form.toEmployeeId || "DEFAULT"}
                    onValueChange={(v) => setForm({ ...form, toEmployeeId: v === "DEFAULT" ? "" : v })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DEFAULT">
                        {cashierEmployeeId
                          ? "The shift cashier"
                          : "The shift cashier (none set yet)"}
                      </SelectItem>
                      {employees
                        .filter((e) => e.id !== form.employeeId)
                        .map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="sm:col-span-2">
                <Label className="text-xs">Note (optional)</Label>
                <Input
                  className="mt-1"
                  maxLength={500}
                  placeholder="e.g. counted together at the counter"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setForm(null)}>
                Cancel
              </Button>
              <Button onClick={() => create.mutate(form)} disabled={create.isPending}>
                {create.isPending ? "Saving…" : "Record drop"}
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : drops.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center">
            <div className="font-medium">No cash handed in yet</div>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              {readOnly
                ? "Nobody handed cash in partway through this shift."
                : "When someone hands cash over partway through the shift, record it here so the time is on the books."}
            </p>
          </div>
        ) : (
          <ol className="space-y-2">
            {drops.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-md border p-3"
              >
                <Badge variant="outline" className="font-mono shrink-0">
                  {dropTimeLabel(d.occurredAt, reportDate)}
                </Badge>
                <div className="min-w-0 flex-1">
                  <div className="text-sm">
                    <span className="font-mono font-semibold">{formatINR(d.amountPaise)}</span>{" "}
                    from <span className="font-medium">{d.fromEmployee.name}</span> to{" "}
                    <span className="font-medium">{dropDestination(d)}</span>
                  </div>
                  {(d.purpose || d.notes) && (
                    <div className="text-xs text-muted-foreground">
                      {[d.purpose, d.notes].filter(Boolean).join(" — ")}
                    </div>
                  )}
                </div>
                {!readOnly && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="shrink-0"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(d.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

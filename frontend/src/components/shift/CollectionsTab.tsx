"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatINR, paiseToRupees, rupeesToPaise } from "@/lib/utils";
import { apiError } from "@/lib/types";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { Plus, Trash2 } from "lucide-react";
import { LastSaved } from "./LastSaved";

type Row = {
  channelId: string;
  timeSlotId?: string | null;
  amountPaise: string;
  reference?: string;
  // Who took this money. Without it, an attendant's expected cash cannot be
  // reduced by the card/UPI they collected, and they look short at hand-over.
  employeeId?: string | null;
};

type TimeSlot = {
  id: string;
  name: string;
  sortOrder: number;
  shiftType: "DAY" | "NIGHT" | null;
  isActive: boolean;
};

const NO_SLOT = "none";
const NO_STAFF = "none";

export function CollectionsTab({ shift, disabled }: { shift: any; disabled: boolean }) {
  const { t } = useT();
  const qc = useQueryClient();
  const shiftType: string | undefined = shift.shiftType;

  const { data: channels = [] } = useQuery({
    queryKey: ["payment-channels"],
    queryFn: async () => (await api.get("/api/setup/payment-channels")).data,
  });

  // Only the slots that apply to this kind of shift (the API also returns
  // untagged slots, which apply to both).
  const { data: slots = [], isLoading: slotsLoading } = useQuery<TimeSlot[]>({
    queryKey: ["payment-time-slots", shiftType ?? "ALL"],
    queryFn: async () =>
      (
        await api.get("/api/setup/payment-time-slots", {
          params: shiftType ? { shiftType } : undefined,
        })
      ).data,
  });

  // Every slot, so a row that already points at a slot meant for the other
  // shift still shows its name instead of going blank.
  const { data: allSlots = [] } = useQuery<TimeSlot[]>({
    queryKey: ["payment-time-slots"],
    queryFn: async () => (await api.get("/api/setup/payment-time-slots")).data,
  });

  // The crew on this shift first — that is who normally hands money in.
  const shiftStaff: { id: string; name: string }[] = Array.from(
    new Map(
      (shift.employeeAssignments || [])
        .filter((a: any) => a.employee)
        .map((a: any) => [a.employee.id, { id: a.employee.id, name: a.employee.name }])
    ).values()
  ) as { id: string; name: string }[];

  const { data: allStaff = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["employees"],
    queryFn: async () => (await api.get("/api/employees")).data,
  });
  const staffOptions = shiftStaff.length
    ? [...shiftStaff, ...allStaff.filter((e) => !shiftStaff.some((s2) => s2.id === e.id))]
    : allStaff;

  const [rows, setRows] = useState<Row[]>(() =>
    (shift.paymentCollections || []).map((c: any) => ({
      channelId: c.channelId,
      timeSlotId: c.timeSlotId,
      amountPaise: c.amountPaise,
      reference: c.reference,
      employeeId: c.employeeId ?? null,
    }))
  );

  const total = rows.reduce((acc, r) => acc + Number(r.amountPaise || 0), 0);

  // The slots offered in a row's dropdown: this shift's slots, plus whatever
  // that row is already set to.
  const optionsFor = (row: Row): TimeSlot[] => {
    if (!row.timeSlotId || slots.some((s) => s.id === row.timeSlotId)) return slots;
    const extra = allSlots.find((s) => s.id === row.timeSlotId);
    return extra ? [...slots, extra] : slots;
  };

  const save = useMutation({
    mutationFn: async () => {
      return (await api.put(`/api/shifts/${shift.id}/payment-collections`, {
        collections: rows.map((r) => ({
          channelId: r.channelId,
          timeSlotId: r.timeSlotId || null,
          amountPaise: r.amountPaise === "" ? "0" : r.amountPaise,
          reference: r.reference,
          employeeId: r.employeeId || null,
        })),
      })).data;
    },
    onSuccess: () => {
      toast.success(t("shift.collections.saved", "Collections saved"));
      qc.invalidateQueries({ queryKey: ["shift", shift.id] });
    },
    onError: (e) => toast.error(apiError(e, t("common.failed", "Something went wrong"))),
  });

  const noSlotsForShift = !slotsLoading && slots.length === 0;
  const shiftKey = shiftType === "NIGHT" ? "night" : shiftType === "DAY" ? "day" : "this";
  const shiftWord = t(`shift.word.${shiftKey}`, shiftKey);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("shift.collections.title", "Payment Collections")}</CardTitle>
        <CardDescription>
          {t(
            "shift.collections.desc",
            "Money received via Cash, Card POS, UPI (Paytm/PhonePe), wallets, bank deposits — split by time slot if you want. Only the slots set up for {shiftWord} shifts are offered. Naming who took each amount matters: card and UPI they collected is deducted from the cash that attendant owes at hand-over.",
            { shiftWord },
          )}
        </CardDescription>
        <LastSaved shiftId={shift.id} panel="collections" />
      </CardHeader>
      <CardContent className="space-y-4">
        {noSlotsForShift && (
          <p className="rounded-md border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground">
            {t(
              "shift.collections.noSlotsA",
              "No time slots are set up for {shiftWord} shifts, so collections here are recorded without a slot. Add one under ",
              { shiftWord },
            )}
            <span className="font-medium">{t("shift.collections.setupPath", "Pump Setup → Time Slots")}</span>
            {t("shift.collections.noSlotsB", " and tag it {tag} if you want this shift's money split by time of day.", {
              tag:
                shiftKey === "this"
                  ? t("shift.collections.dayOrNight", "Day or Night")
                  : `“${shiftWord}”`,
            })}
          </p>
        )}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("shift.collections.channel", "Channel")}</TableHead>
                {!noSlotsForShift && <TableHead>{t("shift.collections.timeSlot", "Time Slot")}</TableHead>}
                <TableHead>{t("shift.collections.takenBy", "Taken by")}</TableHead>
                <TableHead>{t("shift.collections.amount", "Amount (₹)")}</TableHead>
                <TableHead>{t("shift.collections.reference", "Reference")}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, idx) => (
                <TableRow key={idx}>
                  <TableCell>
                    <Select
                      value={r.channelId}
                      onValueChange={(v) => setRows(rs => rs.map((x, i) => i === idx ? { ...x, channelId: v } : x))}
                      disabled={disabled}
                    >
                      <SelectTrigger className="min-w-[160px]"><SelectValue placeholder={t("shift.collections.channel", "Channel")} /></SelectTrigger>
                      <SelectContent>
                        {channels.map((c: any) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  {!noSlotsForShift && (
                    <TableCell>
                      <Select
                        value={r.timeSlotId || NO_SLOT}
                        onValueChange={(v) => setRows(rs => rs.map((x, i) => i === idx ? { ...x, timeSlotId: v === NO_SLOT ? null : v } : x))}
                        disabled={disabled}
                      >
                        <SelectTrigger className="min-w-[140px]"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_SLOT}>{t("shift.collections.none", "— None —")}</SelectItem>
                          {optionsFor(r).map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  )}
                  <TableCell>
                    <Select
                      value={r.employeeId || NO_STAFF}
                      onValueChange={(v) =>
                        setRows(rs => rs.map((x, i) => i === idx ? { ...x, employeeId: v === NO_STAFF ? null : v } : x))
                      }
                      disabled={disabled}
                    >
                      <SelectTrigger className="min-w-[140px]"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_STAFF}>{t("shift.collections.notRecorded", "— Not recorded —")}</SelectItem>
                        {staffOptions.map((e) => (
                          <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      disabled={disabled}
                      value={r.amountPaise === "" ? "" : paiseToRupees(r.amountPaise)}
                      onChange={(e) =>
                        setRows(rs => rs.map((x, i) => i === idx ? { ...x, amountPaise: e.target.value === "" ? "" : rupeesToPaise(e.target.value) } : x))
                      }
                      className="max-w-[140px]"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      disabled={disabled}
                      value={r.reference || ""}
                      onChange={(e) =>
                        setRows(rs => rs.map((x, i) => i === idx ? { ...x, reference: e.target.value } : x))
                      }
                    />
                  </TableCell>
                  <TableCell>
                    {!disabled && (
                      <Button size="icon" variant="ghost" onClick={() => setRows(rs => rs.filter((_, i) => i !== idx))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={noSlotsForShift ? 4 : 5}
                    className="text-center text-muted-foreground"
                  >
                    {t("shift.collections.empty", "Nothing collected yet.")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {!disabled && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setRows(rs => [
                  ...rs,
                  {
                    channelId: channels[0]?.id || "",
                    // With exactly one slot to choose from there is nothing to
                    // decide — pick it for them.
                    timeSlotId: slots.length === 1 ? slots[0].id : null,
                    amountPaise: "0",
                  },
                ])
              }
            >
              <Plus className="h-4 w-4 mr-1" /> {t("common.addRow", "Add row")}
            </Button>
          )}
          <div className="text-sm">
            {t("shift.collections.total", "Total collected")}: <span className="font-semibold">{formatINR(total)}</span>
          </div>
        </div>
        {!disabled && (
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? t("common.saving", "Saving…") : t("shift.collections.save", "Save collections")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

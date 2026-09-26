"use client";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format, parseISO, subDays } from "date-fns";
import { ShiftLite, SHIFT_LABELS } from "./types";

// Dips and nozzle tests always belong to a shift, so both logs share one picker.
// It defaults to the newest shift, which is nearly always the one being worked on.
export function ShiftPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const { data: shifts = [], isLoading } = useQuery<ShiftLite[]>({
    queryKey: ["wet-stock-shifts"],
    queryFn: async () =>
      (
        await api.get("/api/shifts", {
          params: {
            from: subDays(new Date(), 45).toISOString().slice(0, 10),
            to: new Date().toISOString().slice(0, 10),
          },
        })
      ).data,
  });

  useEffect(() => {
    if (!value && shifts.length) onChange(shifts[0].id);
  }, [shifts, value, onChange]);

  const current = shifts.find((s) => s.id === value);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="flex-1 min-w-0">
        <Label htmlFor="wet-shift">Shift</Label>
        <Select value={value || undefined} onValueChange={onChange} disabled={!shifts.length}>
          <SelectTrigger id="wet-shift" className="mt-1">
            <SelectValue
              placeholder={isLoading ? "Loading shifts…" : "No shifts in the last 45 days"}
            />
          </SelectTrigger>
          <SelectContent>
            {shifts.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {format(parseISO(s.reportDate), "dd MMM yyyy")} · {SHIFT_LABELS[s.shiftType]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {current ? (
        <Badge
          variant={
            current.status === "LOCKED"
              ? "secondary"
              : current.status === "SUBMITTED"
                ? "warning"
                : "outline"
          }
          className="w-fit"
        >
          {current.status === "LOCKED"
            ? "Locked — read only"
            : current.status === "SUBMITTED"
              ? "Submitted"
              : "Draft"}
        </Badge>
      ) : null}
    </div>
  );
}

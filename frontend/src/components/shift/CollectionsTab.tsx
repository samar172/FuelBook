"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatINR, paiseToRupees, rupeesToPaise } from "@/lib/utils";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

type Row = {
  channelId: string;
  timeSlotId?: string | null;
  amountPaise: string;
  reference?: string;
};

export function CollectionsTab({ shift, disabled }: { shift: any; disabled: boolean }) {
  const qc = useQueryClient();
  const { data: channels = [] } = useQuery({
    queryKey: ["payment-channels"],
    queryFn: async () => (await api.get("/api/setup/payment-channels")).data,
  });
  const { data: slots = [] } = useQuery({
    queryKey: ["payment-time-slots"],
    queryFn: async () => (await api.get("/api/setup/payment-time-slots")).data,
  });

  const [rows, setRows] = useState<Row[]>(() =>
    (shift.paymentCollections || []).map((c: any) => ({
      channelId: c.channelId,
      timeSlotId: c.timeSlotId,
      amountPaise: c.amountPaise,
      reference: c.reference,
    }))
  );

  const total = rows.reduce((acc, r) => acc + Number(r.amountPaise || 0), 0);

  const save = useMutation({
    mutationFn: async () => {
      return (await api.put(`/api/shifts/${shift.id}/payment-collections`, {
        collections: rows.map((r) => ({
          channelId: r.channelId,
          timeSlotId: r.timeSlotId || null,
          amountPaise: r.amountPaise === "" ? "0" : r.amountPaise,
          reference: r.reference,
        })),
      })).data;
    },
    onSuccess: () => {
      toast.success("Collections saved");
      qc.invalidateQueries({ queryKey: ["shift", shift.id] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || "Failed"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment Collections</CardTitle>
        <CardDescription>
          Money received via Cash, Card POS, UPI (Paytm/PhonePe), wallets, bank deposits — split by
          time slot if you want (Before 12 / After 12 etc.).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Channel</TableHead>
              <TableHead>Time Slot</TableHead>
              <TableHead>Amount (₹)</TableHead>
              <TableHead>Reference</TableHead>
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
                    <SelectTrigger className="min-w-[160px]"><SelectValue placeholder="Channel" /></SelectTrigger>
                    <SelectContent>
                      {channels.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Select
                    value={r.timeSlotId || "none"}
                    onValueChange={(v) => setRows(rs => rs.map((x, i) => i === idx ? { ...x, timeSlotId: v === "none" ? null : v } : x))}
                    disabled={disabled}
                  >
                    <SelectTrigger className="min-w-[140px]"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {slots.map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step="0.01"
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
          </TableBody>
        </Table>
        <div className="flex items-center justify-between">
          {!disabled && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRows(rs => [...rs, { channelId: channels[0]?.id || "", amountPaise: "0" }])}
            >
              <Plus className="h-4 w-4 mr-1" /> Add row
            </Button>
          )}
          <div className="text-sm">
            Total collected: <span className="font-semibold">{formatINR(total)}</span>
          </div>
        </div>
        {!disabled && (
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save collections"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

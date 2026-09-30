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
import { vehicleSummary, type CreditCustomer } from "@/lib/types";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { Plus, Trash2 } from "lucide-react";
import { LastSaved } from "./LastSaved";

type Row = {
  customerId?: string | null;
  customerNameRaw: string;
  amountPaise: string;
  channelId?: string | null;
  reference?: string;
};

export function OutstandingTab({ shift, disabled }: { shift: any; disabled: boolean }) {
  const { t } = useT();
  const qc = useQueryClient();
  const { data: customers = [] } = useQuery<CreditCustomer[]>({
    queryKey: ["credit-customers"],
    queryFn: async () => (await api.get("/api/credit/customers")).data,
  });
  const { data: channels = [] } = useQuery({
    queryKey: ["payment-channels"],
    queryFn: async () => (await api.get("/api/setup/payment-channels")).data,
  });

  const [rows, setRows] = useState<Row[]>(() =>
    (shift.outstandingReceipts || []).map((r: any) => ({
      customerId: r.customerId,
      customerNameRaw: r.customerNameRaw,
      amountPaise: r.amountPaise,
      channelId: r.channelId,
      reference: r.reference,
    }))
  );

  const total = rows.reduce((a, r) => a + Number(r.amountPaise || 0), 0);

  const save = useMutation({
    mutationFn: async () => {
      return (await api.put(`/api/shifts/${shift.id}/outstanding-receipts`, {
        receipts: rows.map((r) => ({
          customerId: r.customerId || null,
          customerNameRaw: r.customerNameRaw,
          amountPaise: r.amountPaise === "" ? "0" : r.amountPaise,
          channelId: r.channelId || null,
          reference: r.reference,
        })),
      })).data;
    },
    onSuccess: () => {
      toast.success(t("shift.outstanding.saved", "Outstanding receipts saved"));
      qc.invalidateQueries({ queryKey: ["shift", shift.id] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || t("common.failed", "Something went wrong")),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("shift.outstanding.title", "Outstanding Received Today")}</CardTitle>
        <CardDescription>
          {t(
            "shift.outstanding.desc",
            "Past credit balances collected from customers during this shift. These reduce the customer's outstanding balance when the shift is locked.",
          )}
        </CardDescription>
        <LastSaved shiftId={shift.id} panel="outstanding" />
      </CardHeader>
      <CardContent className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("shift.outstanding.customer", "Customer")}</TableHead>
              <TableHead>{t("shift.outstanding.amount", "Amount (₹)")}</TableHead>
              <TableHead>{t("shift.outstanding.channel", "Channel")}</TableHead>
              <TableHead>{t("shift.outstanding.reference", "Reference")}</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, idx) => (
              <TableRow key={idx}>
                <TableCell>
                  <Select
                    value={r.customerId || "raw"}
                    onValueChange={(v) =>
                      setRows((rs) =>
                        rs.map((x, i) => {
                          if (i !== idx) return x;
                          if (v === "raw") return { ...x, customerId: null };
                          const cust = customers.find((c) => c.id === v);
                          return { ...x, customerId: v, customerNameRaw: cust?.name || x.customerNameRaw };
                        })
                      )
                    }
                    disabled={disabled}
                  >
                    <SelectTrigger className="min-w-[180px]"><SelectValue placeholder={t("shift.outstanding.customer", "Customer")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="raw">{t("shift.outstanding.walkIn", "— Walk-in / unlisted —")}</SelectItem>
                      {customers.filter((c) => c.isActive).map((c) => {
                        const summary = vehicleSummary(c.vehicles);
                        return (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name} {summary ? `(${summary})` : ""}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {!r.customerId && (
                    <Input
                      placeholder={t("shift.outstanding.customerName", "Customer name")}
                      className="mt-2"
                      disabled={disabled}
                      value={r.customerNameRaw}
                      onChange={(e) =>
                        setRows((rs) => rs.map((x, i) => (i === idx ? { ...x, customerNameRaw: e.target.value } : x)))
                      }
                    />
                  )}
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step="0.01"
                    disabled={disabled}
                    value={r.amountPaise === "" ? "" : paiseToRupees(r.amountPaise)}
                    onChange={(e) =>
                      setRows((rs) =>
                        rs.map((x, i) => (i === idx ? { ...x, amountPaise: e.target.value === "" ? "" : rupeesToPaise(e.target.value) } : x))
                      )
                    }
                    className="max-w-[140px]"
                  />
                </TableCell>
                <TableCell>
                  <Select
                    value={r.channelId || "none"}
                    onValueChange={(v) =>
                      setRows((rs) =>
                        rs.map((x, i) => (i === idx ? { ...x, channelId: v === "none" ? null : v } : x))
                      )
                    }
                    disabled={disabled}
                  >
                    <SelectTrigger className="min-w-[140px]"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("shift.outstanding.none", "— None —")}</SelectItem>
                      {channels.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input
                    disabled={disabled}
                    value={r.reference || ""}
                    onChange={(e) =>
                      setRows((rs) => rs.map((x, i) => (i === idx ? { ...x, reference: e.target.value } : x)))
                    }
                  />
                </TableCell>
                <TableCell>
                  {!disabled && (
                    <Button size="icon" variant="ghost" onClick={() => setRows((rs) => rs.filter((_, i) => i !== idx))}>
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
              onClick={() => setRows((rs) => [...rs, { customerNameRaw: "", amountPaise: "0" }])}
            >
              <Plus className="h-4 w-4 mr-1" /> {t("common.addRow", "Add row")}
            </Button>
          )}
          <div className="text-sm">
            {t("shift.outstanding.total", "Total received")}: <span className="font-semibold">{formatINR(total)}</span>
          </div>
        </div>
        {!disabled && (
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? t("common.saving", "Saving…") : t("shift.outstanding.save", "Save outstanding")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

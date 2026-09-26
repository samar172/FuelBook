"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, can } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { apiError, type Employee } from "@/lib/types";
import { formatINR, rupeesToPaise } from "@/lib/utils";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { Info, Plus, Trash2 } from "lucide-react";
import type { AdvanceKind, AdvanceListResponse, BalancesResponse } from "./types";

const ALL = "__all__";

const fmtDay = (iso: string): string => format(parseISO(iso.slice(0, 10)), "dd MMM yyyy");

export default function AdvancesSection() {
  const qc = useQueryClient();
  const canManage = can("canManageEmployees");

  const [employeeFilter, setEmployeeFilter] = useState<string>(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const employees = useQuery<Employee[]>({
    queryKey: ["employees", false],
    queryFn: async () => (await api.get("/api/employees")).data,
  });

  const balances = useQuery<BalancesResponse>({
    queryKey: ["compliance", "advance-balances"],
    queryFn: async () => (await api.get("/api/compliance/advances/balances")).data,
  });

  const entries = useQuery<AdvanceListResponse>({
    queryKey: ["compliance", "advances", employeeFilter, from, to],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (employeeFilter !== ALL) params.set("employeeId", employeeFilter);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const qs = params.toString();
      return (await api.get(`/api/compliance/advances${qs ? `?${qs}` : ""}`)).data;
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["compliance"] });

  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<AdvanceKind>("ADVANCE");
  const [employeeId, setEmployeeId] = useState("");
  const [amount, setAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState(format(new Date(), "yyyy-MM-dd"));
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setKind("ADVANCE");
    setEmployeeId("");
    setAmount("");
    setOccurredOn(format(new Date(), "yyyy-MM-dd"));
    setReference("");
    setNotes("");
  };

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post("/api/compliance/advances", {
          employeeId,
          kind,
          // Rupees typed in the form become an exact paise string — no float maths.
          amountPaise: rupeesToPaise(amount),
          occurredOn,
          reference: reference || undefined,
          notes: notes || undefined,
        })
      ).data,
    onSuccess: () => {
      toast.success(kind === "ADVANCE" ? "Advance recorded" : "Repayment recorded");
      setOpen(false);
      reset();
      invalidate();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/api/compliance/advances/${id}`)).data,
    onSuccess: () => {
      toast.success("Entry deleted");
      invalidate();
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const selectedBalance =
    employeeId && balances.data
      ? balances.data.balances.find((b) => b.employee.id === employeeId)
      : undefined;

  const rows = entries.data?.rows ?? [];
  const withBalance = (balances.data?.balances ?? []).filter(
    (b) => b.advancedPaise !== "0" || b.repaidPaise !== "0"
  );

  return (
    <div className="space-y-6">
      {/* The distinction an owner must never get wrong. */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 flex gap-2">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <span className="font-semibold">Advances are money you lent to staff.</span> A till that
          came up short at shift close is a different thing entirely — shortages sit on the
          ledger&rsquo;s &ldquo;Staff Receivable — Cash Shortage&rdquo; account under Books and are
          never touched by this screen. Recording a repayment here does not forgive a shortage, and
          deleting an advance here does not clear one.
        </div>
      </div>

      {/* Balances */}
      <Card>
        <CardHeader>
          <CardTitle>Outstanding per employee</CardTitle>
          <CardDescription>Advanced minus repaid, for advances only.</CardDescription>
        </CardHeader>
        <CardContent>
          {balances.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading balances…</p>
          ) : balances.isError ? (
            <p className="text-sm text-destructive">{apiError(balances.error)}</p>
          ) : withBalance.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No advances recorded yet. Nobody owes you anything under this head.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead className="text-right">Advanced</TableHead>
                    <TableHead className="text-right">Repaid</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {withBalance.map((b) => (
                    <TableRow key={b.employee.id}>
                      <TableCell>
                        <div className="font-medium">{b.employee.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {b.employee.code || b.employee.designation || ""}
                          {b.employee.isActive ? "" : " · inactive"}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatINR(b.advancedPaise)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatINR(b.repaidPaise)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {formatINR(b.outstandingPaise)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {balances.data && (
                    <TableRow className="font-semibold bg-muted/50">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatINR(balances.data.totals.advancedPaise)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatINR(balances.data.totals.repaidPaise)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatINR(balances.data.totals.outstandingPaise)}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Entries */}
      <Card>
        <CardHeader className="gap-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle>Advance & repayment entries</CardTitle>
              <CardDescription>Every rupee lent out and paid back.</CardDescription>
            </div>
            {canManage && (
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-1" /> Record entry
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Record advance or repayment</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div>
                      <Label>Entry type</Label>
                      <Select value={kind} onValueChange={(v) => setKind(v as AdvanceKind)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ADVANCE">Advance paid to staff</SelectItem>
                          <SelectItem value="REPAYMENT">Repayment received from staff</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Employee</Label>
                      <Select value={employeeId} onValueChange={setEmployeeId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose an employee" />
                        </SelectTrigger>
                        <SelectContent>
                          {(employees.data ?? []).map((e) => (
                            <SelectItem key={e.id} value={e.id}>
                              {e.name}
                              {e.code ? ` (${e.code})` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedBalance && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Currently outstanding: {formatINR(selectedBalance.outstandingPaise)}
                          {kind === "REPAYMENT" ? " — a repayment cannot exceed this." : ""}
                        </p>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label>Amount (₹)</Label>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          inputMode="decimal"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Date</Label>
                        <Input
                          type="date"
                          value={occurredOn}
                          onChange={(e) => setOccurredOn(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Reference</Label>
                        <Input
                          value={reference}
                          onChange={(e) => setReference(e.target.value)}
                          placeholder="Optional — voucher no., UPI ref"
                        />
                      </div>
                      <div>
                        <Label>Notes</Label>
                        <Input
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Optional"
                        />
                      </div>
                    </div>
                    <Button
                      className="w-full"
                      disabled={
                        !employeeId || !amount || Number(amount) <= 0 || create.isPending
                      }
                      onClick={() => create.mutate()}
                    >
                      {create.isPending ? "Saving…" : "Save entry"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Employee</Label>
              <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All employees</SelectItem>
                  {(employees.data ?? []).map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {entries.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading entries…</p>
          ) : entries.isError ? (
            <p className="text-sm text-destructive">{apiError(entries.error)}</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {employeeFilter === ALL && !from && !to
                ? "No advances or repayments recorded yet."
                : "No entry matches these filters."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Reference</TableHead>
                    {canManage && <TableHead className="text-right">Action</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm">{fmtDay(r.occurredOn)}</TableCell>
                      <TableCell className="text-sm">{r.employee?.name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={r.kind === "ADVANCE" ? "warning" : "success"}>
                          {r.kind === "ADVANCE" ? "Advance" : "Repayment"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatINR(r.amountPaise)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.reference || "—"}
                        {r.notes && (
                          <div className="text-xs text-muted-foreground">{r.notes}</div>
                        )}
                      </TableCell>
                      {canManage && (
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={remove.isPending}
                            onClick={() => remove.mutate(r.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {entries.data && (
                    <TableRow className="font-semibold bg-muted/50">
                      <TableCell colSpan={3}>
                        Advanced {formatINR(entries.data.totals.advancedPaise)} · repaid{" "}
                        {formatINR(entries.data.totals.repaidPaise)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatINR(entries.data.totals.netPaise)}
                      </TableCell>
                      <TableCell colSpan={canManage ? 2 : 1} />
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

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
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

type Row = {
  categoryId: string;
  ref?: string;
  lastBillDate?: string | null;
  openingBalancePaise: string;
  dayExpensePaise: string;
  notes?: string;
};

export function ExpensesTab({ shift, disabled }: { shift: any; disabled: boolean }) {
  const qc = useQueryClient();
  const { data: cats = [] } = useQuery({
    queryKey: ["expense-categories"],
    queryFn: async () => (await api.get("/api/setup/expense-categories")).data,
  });

  const [rows, setRows] = useState<Row[]>(() =>
    (shift.expenseEntries || []).map((e: any) => ({
      categoryId: e.categoryId,
      ref: e.ref,
      lastBillDate: e.lastBillDate ? e.lastBillDate.slice(0, 10) : null,
      openingBalancePaise: e.openingBalancePaise,
      dayExpensePaise: e.dayExpensePaise,
      notes: e.notes,
    }))
  );

  const totalDay = rows.reduce((a, r) => a + Number(r.dayExpensePaise || 0), 0);

  const save = useMutation({
    mutationFn: async () => {
      return (await api.put(`/api/shifts/${shift.id}/expense-entries`, {
        entries: rows.map((r) => ({
          categoryId: r.categoryId,
          ref: r.ref || undefined,
          lastBillDate: r.lastBillDate || undefined,
          openingBalancePaise: r.openingBalancePaise,
          dayExpensePaise: r.dayExpensePaise,
          notes: r.notes || undefined,
        })),
      })).data;
    },
    onSuccess: () => {
      toast.success("Expenses saved");
      qc.invalidateQueries({ queryKey: ["shift", shift.id] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || "Failed"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Expenses</CardTitle>
        <CardDescription>
          Recurring categories carry their balance forward. Day expense is what was paid in this shift.
          Closing = opening + day expense.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead>Ref</TableHead>
              <TableHead>Last Bill Date</TableHead>
              <TableHead>Opening (₹)</TableHead>
              <TableHead>Day Expense (₹)</TableHead>
              <TableHead className="text-right">Closing (₹)</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, idx) => {
              const closing = Number(r.openingBalancePaise || 0) + Number(r.dayExpensePaise || 0);
              return (
                <TableRow key={idx}>
                  <TableCell>
                    <Select
                      value={r.categoryId}
                      onValueChange={(v) =>
                        setRows((rs) => rs.map((x, i) => (i === idx ? { ...x, categoryId: v } : x)))
                      }
                      disabled={disabled}
                    >
                      <SelectTrigger className="min-w-[200px]"><SelectValue placeholder="Category" /></SelectTrigger>
                      <SelectContent>
                        {cats.map((c: any) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      disabled={disabled}
                      value={r.ref || ""}
                      onChange={(e) => setRows((rs) => rs.map((x, i) => (i === idx ? { ...x, ref: e.target.value } : x)))}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="date"
                      disabled={disabled}
                      value={r.lastBillDate || ""}
                      onChange={(e) =>
                        setRows((rs) => rs.map((x, i) => (i === idx ? { ...x, lastBillDate: e.target.value || null } : x)))
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.01"
                      disabled={disabled}
                      value={paiseToRupees(r.openingBalancePaise || "0")}
                      onChange={(e) =>
                        setRows((rs) =>
                          rs.map((x, i) =>
                            i === idx ? { ...x, openingBalancePaise: rupeesToPaise(e.target.value || "0") } : x
                          )
                        )
                      }
                      className="max-w-[140px]"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.01"
                      disabled={disabled}
                      value={paiseToRupees(r.dayExpensePaise || "0")}
                      onChange={(e) =>
                        setRows((rs) =>
                          rs.map((x, i) =>
                            i === idx ? { ...x, dayExpensePaise: rupeesToPaise(e.target.value || "0") } : x
                          )
                        )
                      }
                      className="max-w-[140px]"
                    />
                  </TableCell>
                  <TableCell className="text-right font-medium">{formatINR(closing)}</TableCell>
                  <TableCell>
                    {!disabled && (
                      <Button size="icon" variant="ghost" onClick={() => setRows((rs) => rs.filter((_, i) => i !== idx))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between">
          {!disabled && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setRows((rs) => [...rs, { categoryId: cats[0]?.id || "", openingBalancePaise: "0", dayExpensePaise: "0" }])
              }
            >
              <Plus className="h-4 w-4 mr-1" /> Add row
            </Button>
          )}
          <div className="text-sm">
            Total day expense: <span className="font-semibold">{formatINR(totalDay)}</span>
          </div>
        </div>
        {!disabled && (
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save expenses"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatLitres, FUEL_LABELS, litresToMl, mlToLitres } from "@/lib/utils";
import { toast } from "sonner";

export function NozzleReadingsTab({ shift, disabled }: { shift: any; disabled: boolean }) {
  const qc = useQueryClient();
  const [readings, setReadings] = useState(() =>
    shift.nozzleReadings.map((r: any) => ({
      nozzleId: r.nozzleId,
      code: r.nozzle.code,
      fuelType: r.fuelType,
      openingMl: r.openingReadingMl,
      closingMl: r.closingReadingMl,
      testingMl: r.testingMl,
    }))
  );

  // Compute net sale per fuel type
  const totals: Record<string, { sale: number; testing: number }> = {};
  for (const r of readings) {
    const opening = Number(r.openingMl);
    const closing = Number(r.closingMl);
    const testing = Number(r.testingMl);
    const sale = Math.max(0, closing - opening - testing);
    if (!totals[r.fuelType]) totals[r.fuelType] = { sale: 0, testing: 0 };
    totals[r.fuelType].sale += sale;
    totals[r.fuelType].testing += testing;
  }

  const save = useMutation({
    mutationFn: async () => {
      return (await api.put(`/api/shifts/${shift.id}/nozzle-readings`, {
        readings: readings.map((r: any) => ({
          nozzleId: r.nozzleId,
          openingReadingMl: String(r.openingMl),
          closingReadingMl: String(r.closingMl),
          testingMl: String(r.testingMl),
        })),
      })).data;
    },
    onSuccess: () => {
      toast.success("Nozzle readings saved");
      qc.invalidateQueries({ queryKey: ["shift", shift.id] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || "Failed"),
  });

  const update = (idx: number, field: string, valueLitres: string) => {
    const ml = valueLitres === "" ? "0" : litresToMl(valueLitres);
    setReadings((rs: any[]) => rs.map((r, i) => (i === idx ? { ...r, [field]: ml } : r)));
  };

  // Group by fuel type
  const byFuel = readings.reduce((acc: any, r: any, idx: number) => {
    if (!acc[r.fuelType]) acc[r.fuelType] = [];
    acc[r.fuelType].push({ ...r, idx });
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nozzle Readings</CardTitle>
        <CardDescription>
          Opening readings are auto-filled from the previous shift. Enter closing reading and any testing
          deduction.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {Object.entries(byFuel).map(([fuel, items]) => (
          <div key={fuel}>
            <div className="text-sm font-semibold mb-2">{FUEL_LABELS[fuel] || fuel}</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nozzle</TableHead>
                  <TableHead>Opening (L)</TableHead>
                  <TableHead>Closing (L)</TableHead>
                  <TableHead>Testing (L)</TableHead>
                  <TableHead className="text-right">Sale (L)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(items as any[]).map((r) => {
                  const sale = Math.max(0, Number(r.closingMl) - Number(r.openingMl) - Number(r.testingMl)) / 1000;
                  return (
                    <TableRow key={r.nozzleId}>
                      <TableCell className="font-medium">{r.code}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.001"
                          disabled={disabled}
                          value={mlToLitres(r.openingMl)}
                          onChange={(e) => update(r.idx, "openingMl", e.target.value)}
                          className="max-w-[140px]"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.001"
                          disabled={disabled}
                          value={mlToLitres(r.closingMl)}
                          onChange={(e) => update(r.idx, "closingMl", e.target.value)}
                          className="max-w-[140px]"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.001"
                          disabled={disabled}
                          value={mlToLitres(r.testingMl)}
                          onChange={(e) => update(r.idx, "testingMl", e.target.value)}
                          className="max-w-[100px]"
                        />
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {sale.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="text-right text-sm font-semibold mt-1 pr-4">
              Net sale: {formatLitres(totals[fuel]?.sale || 0)} L (testing {formatLitres(totals[fuel]?.testing || 0)} L)
            </div>
          </div>
        ))}
        {!disabled && (
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save readings"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

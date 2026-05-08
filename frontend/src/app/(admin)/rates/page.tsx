"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatINR, FUEL_LABELS, rupeesToPaise } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "sonner";

export default function RatesPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["fuel-rates"],
    queryFn: async () => (await api.get("/api/setup/fuel-rates")).data,
  });
  const [fuelType, setFuelType] = useState("HSD");
  const [rate, setRate] = useState("");

  const update = useMutation({
    mutationFn: async () => (await api.post("/api/setup/fuel-rates", { fuelType, ratePaise: rupeesToPaise(rate) })).data,
    onSuccess: () => { toast.success("Rate updated"); setRate(""); qc.invalidateQueries({ queryKey: ["fuel-rates"] }); },
    onError: (e: any) => toast.error(e?.response?.data?.error || "Failed"),
  });

  const current = data?.current || {};
  const history = data?.all || [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl sm:text-3xl font-bold">Fuel Rates</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.keys(FUEL_LABELS).map((f) => (
          <Card key={f}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">{FUEL_LABELS[f]}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">
                {current[f]?.ratePaise ? formatINR(current[f].ratePaise) : "—"}
              </div>
              <div className="text-xs text-muted-foreground">per litre</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Update rate</CardTitle></CardHeader>
        <CardContent className="flex gap-3 items-end">
          <div>
            <Label>Fuel</Label>
            <Select value={fuelType} onValueChange={setFuelType}>
              <SelectTrigger className="min-w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.keys(FUEL_LABELS).map((f) => (
                  <SelectItem key={f} value={f}>{FUEL_LABELS[f]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>New rate (₹/L)</Label>
            <Input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
          </div>
          <Button onClick={() => update.mutate()} disabled={!rate || update.isPending}>
            {update.isPending ? "Saving…" : "Set rate"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Rate history</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Fuel</TableHead><TableHead>Rate / L</TableHead><TableHead>Effective from</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {history.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell>{FUEL_LABELS[r.fuelType] || r.fuelType}</TableCell>
                  <TableCell>{formatINR(r.ratePaise)}</TableCell>
                  <TableCell>{format(new Date(r.effectiveFrom), "dd MMM yyyy HH:mm")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

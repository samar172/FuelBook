"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { formatINR, FUEL_LABELS, rupeesToPaise } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "sonner";
import { Pencil } from "lucide-react";

const onError = (e: any) => toast.error(e?.response?.data?.error || e?.message || "Failed");

// datetime-local inputs use "yyyy-MM-ddTHH:mm" with no timezone; convert both ways.
const toDatetimeLocal = (iso: string) => format(new Date(iso), "yyyy-MM-dd'T'HH:mm");
const fromDatetimeLocal = (value: string) => new Date(value).toISOString();

export default function RatesPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["fuel-rates"],
    queryFn: async () => (await api.get("/api/setup/fuel-rates")).data,
  });
  const [fuelType, setFuelType] = useState("HSD");
  const [rate, setRate] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [editing, setEditing] = useState<any | null>(null);

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post("/api/setup/fuel-rates", {
          fuelType,
          ratePaise: rupeesToPaise(rate),
          effectiveFrom: effectiveFrom ? fromDatetimeLocal(effectiveFrom) : undefined,
        })
      ).data,
    onSuccess: () => {
      toast.success("Rate added");
      setRate("");
      setEffectiveFrom("");
      qc.invalidateQueries({ queryKey: ["fuel-rates"] });
    },
    onError,
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
        <CardHeader><CardTitle className="text-base">Add rate</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-3 items-end">
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
          <div>
            <Label>Effective from (optional, defaults to now)</Label>
            <Input
              type="datetime-local"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
          </div>
          <Button onClick={() => create.mutate()} disabled={!rate || create.isPending}>
            {create.isPending ? "Saving…" : "Set rate"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Rate history</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Fuel</TableHead><TableHead>Rate / L</TableHead><TableHead>Effective from</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {history.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell>{FUEL_LABELS[r.fuelType] || r.fuelType}</TableCell>
                  <TableCell>{formatINR(r.ratePaise)}</TableCell>
                  <TableCell>{format(new Date(r.effectiveFrom), "dd MMM yyyy HH:mm")}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" title="Edit rate" onClick={() => setEditing(r)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {history.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No rates yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <EditRateDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        rate={editing}
        onDone={() => {
          setEditing(null);
          qc.invalidateQueries({ queryKey: ["fuel-rates"] });
        }}
      />
    </div>
  );
}

function EditRateDialog({
  open,
  onOpenChange,
  rate,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rate?: any;
  onDone: () => void;
}) {
  const [rupees, setRupees] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  useEffect(() => {
    if (open && rate) {
      setRupees((Number(rate.ratePaise) / 100).toFixed(2));
      setEffectiveFrom(toDatetimeLocal(rate.effectiveFrom));
    }
  }, [open, rate]);

  const save = useMutation({
    mutationFn: async () => {
      if (!rupees || !effectiveFrom) throw new Error("Rate and effective date are required");
      return (
        await api.patch(`/api/setup/fuel-rates/${rate.id}`, {
          ratePaise: rupeesToPaise(rupees),
          effectiveFrom: fromDatetimeLocal(effectiveFrom),
        })
      ).data;
    },
    onSuccess: () => {
      toast.success("Rate updated");
      onOpenChange(false);
      onDone();
    },
    onError,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit rate — {rate ? FUEL_LABELS[rate.fuelType] || rate.fuelType : ""}</DialogTitle>
          <DialogDescription>
            Changing the effective date reorders where this rate applies in the history.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Rate (₹/L)</Label>
            <Input
              type="number"
              step="0.01"
              className="mt-1"
              value={rupees}
              onChange={(e) => setRupees(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Effective from</Label>
            <Input
              type="datetime-local"
              className="mt-1"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatINR, rupeesToPaise } from "@/lib/utils";
import { toast } from "sonner";
import Link from "next/link";
import { Plus } from "lucide-react";

export default function CreditCustomersPage() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["credit-customers"],
    queryFn: async () => (await api.get("/api/credit/customers")).data,
  });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [limit, setLimit] = useState("");

  const create = useMutation({
    mutationFn: async () =>
      (await api.post("/api/credit/customers", {
        name,
        phone: phone || undefined,
        vehicleNo: vehicle || undefined,
        creditLimitPaise: rupeesToPaise(limit || "0"),
      })).data,
    onSuccess: () => {
      toast.success("Customer added");
      setOpen(false);
      setName(""); setPhone(""); setVehicle(""); setLimit("");
      qc.invalidateQueries({ queryKey: ["credit-customers"] });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Credit Customers</h1>
          <p className="text-muted-foreground text-sm sm:text-base">Customers who buy on credit and pay later</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> Add customer</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Credit Customer</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
              <div><Label>Vehicle no</Label><Input value={vehicle} onChange={(e) => setVehicle(e.target.value)} /></div>
              <div><Label>Credit limit (₹)</Label><Input type="number" step="0.01" value={limit} onChange={(e) => setLimit(e.target.value)} /></div>
              <Button onClick={() => create.mutate()} disabled={!name || create.isPending} className="w-full">
                {create.isPending ? "Saving…" : "Add"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">All customers</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Limit</TableHead>
                <TableHead>Outstanding</TableHead>
                <TableHead>Util %</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((c: any) => {
                const util = Number(c.creditLimitPaise) > 0 ? (Number(c.currentBalancePaise) / Number(c.creditLimitPaise)) * 100 : 0;
                return (
                  <TableRow key={c.id} className="cursor-pointer">
                    <TableCell>
                      <Link href={`/credit/${c.id}`} className="font-medium hover:underline">
                        {c.name}
                      </Link>
                    </TableCell>
                    <TableCell>{c.vehicleNo || "-"}</TableCell>
                    <TableCell>{c.phone || "-"}</TableCell>
                    <TableCell>{formatINR(c.creditLimitPaise)}</TableCell>
                    <TableCell className="font-medium">{formatINR(c.currentBalancePaise)}</TableCell>
                    <TableCell>
                      <Badge variant={util > 90 ? "destructive" : util > 70 ? "warning" : "outline"}>
                        {util.toFixed(0)}%
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {c.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

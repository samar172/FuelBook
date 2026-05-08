"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export default function ExpenseCategoriesPage() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["expense-categories"],
    queryFn: async () => (await api.get("/api/setup/expense-categories")).data,
  });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [recurring, setRecurring] = useState(true);

  const create = useMutation({
    mutationFn: async () => (await api.post("/api/setup/expense-categories", { name, isRecurring: recurring })).data,
    onSuccess: () => { toast.success("Category added"); setOpen(false); setName(""); qc.invalidateQueries({ queryKey: ["expense-categories"] }); },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Expense Categories</h1>
          <p className="text-muted-foreground text-sm sm:text-base">Categories shown when entering expenses on a shift</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Add</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Expense Category</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
                Recurring (carries balance forward)
              </label>
              <Button className="w-full" onClick={() => create.mutate()} disabled={!name || create.isPending}>
                {create.isPending ? "Saving…" : "Add"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">All categories</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{c.isRecurring ? <Badge>Recurring</Badge> : <Badge variant="outline">One-time</Badge>}</TableCell>
                  <TableCell>{c.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

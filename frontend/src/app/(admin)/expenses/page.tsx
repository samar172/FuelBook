"use client";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FilterChip,
  NoMatchRow,
  SortableHead,
  useTableSort,
} from "@/components/ui/sortable-table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus } from "lucide-react";

const ALL = "__all__";

type Filters = { q: string; type: string; active: string };
const EMPTY: Filters = { q: "", type: ALL, active: ALL };

export default function ExpenseCategoriesPage() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["expense-categories"],
    queryFn: async () => (await api.get("/api/setup/expense-categories")).data,
  });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [recurring, setRecurring] = useState(true);

  const [f, setF] = useState<Filters>(EMPTY);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) =>
    setF((cur) => ({ ...cur, [k]: v }));

  // The category list is small and fully loaded — filter and sort client-side.
  const filtered = useMemo(() => {
    const needle = f.q.trim().toLowerCase();
    return (data as any[]).filter((c) => {
      if (needle && !String(c.name || "").toLowerCase().includes(needle)) return false;
      if (f.type === "recurring" && !c.isRecurring) return false;
      if (f.type === "onetime" && c.isRecurring) return false;
      if (f.active === "active" && !c.isActive) return false;
      if (f.active === "inactive" && c.isActive) return false;
      return true;
    });
  }, [data, f]);

  const sorted = useTableSort<any>(
    filtered,
    {
      name: (c) => c.name,
      type: (c) => (c.isRecurring ? "Recurring" : "One-time"),
      status: (c) => (c.isActive ? 0 : 1),
    },
    { key: "name", dir: "asc" },
  );

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (f.q.trim()) chips.push({ key: "q", label: `Search: ${f.q.trim()}`, clear: () => set("q", "") });
  if (f.type !== ALL)
    chips.push({ key: "type", label: f.type === "recurring" ? "Recurring" : "One-time", clear: () => set("type", ALL) });
  if (f.active !== ALL)
    chips.push({ key: "active", label: f.active === "active" ? "Active only" : "Inactive only", clear: () => set("active", ALL) });
  const active = chips.length > 0;
  const clearAll = () => setF(EMPTY);

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
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Search</Label>
              <Input placeholder="Category name" value={f.q} onChange={(e) => set("q", e.target.value)} />
            </div>
            <div className="min-w-0">
              <Label className="text-xs">Type</Label>
              <Select value={f.type} onValueChange={(v) => set("type", v)}>
                <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All types</SelectItem>
                  <SelectItem value="recurring">Recurring</SelectItem>
                  <SelectItem value="onetime">One-time</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0">
              <Label className="text-xs">Status</Label>
              <Select value={f.active} onValueChange={(v) => set("active", v)}>
                <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  <SelectItem value="active">Active only</SelectItem>
                  <SelectItem value="inactive">Inactive only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {active && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
              {chips.map((c) => (
                <FilterChip key={c.key} label={c.label} onRemove={c.clear} />
              ))}
              <Button size="sm" variant="ghost" onClick={clearAll}>Clear all</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {active ? `${sorted.rows.length} of ${data.length} categories` : "All categories"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <SortableHead {...sorted.sortProps("name")}>Name</SortableHead>
              <SortableHead {...sorted.sortProps("type")}>Type</SortableHead>
              <SortableHead {...sorted.sortProps("status")}>Status</SortableHead>
            </TableRow></TableHeader>
            <TableBody>
              {sorted.rows.length === 0 ? (
                <NoMatchRow
                  colSpan={3}
                  filtered={active}
                  onClear={clearAll}
                  emptyMessage="No expense categories yet."
                />
              ) : (
                sorted.rows.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.isRecurring ? <Badge>Recurring</Badge> : <Badge variant="outline">One-time</Badge>}</TableCell>
                    <TableCell>{c.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

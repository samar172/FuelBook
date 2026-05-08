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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, ShieldCheck } from "lucide-react";

const PERMISSIONS = [
  { key: "canCreateShift", label: "Create new shift" },
  { key: "canEditNozzleReadings", label: "Edit nozzle readings" },
  { key: "canEditStock", label: "Edit stock entries" },
  { key: "canEditTankerReceipts", label: "Add tanker receipts" },
  { key: "canEditCollections", label: "Edit collections" },
  { key: "canEditOutstanding", label: "Edit outstanding receipts" },
  { key: "canEditExpenses", label: "Edit expenses" },
  { key: "canEditCreditSales", label: "Add credit sales" },
  { key: "canSubmitShift", label: "Submit shift" },
  { key: "canLockShift", label: "Lock shift (final)" },
  { key: "canEditFuelRates", label: "Update fuel rates" },
  { key: "canManageCreditCustomers", label: "Manage credit customers" },
  { key: "canManageExpenseCategories", label: "Manage expense categories" },
  { key: "canManageUsers", label: "Manage users" },
  { key: "canManagePump", label: "Manage pump setup" },
  { key: "canViewReports", label: "View reports" },
  { key: "canExportReports", label: "Export reports" },
];

export default function UsersPage() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get("/api/users")).data,
  });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState<"MANAGER" | "STAFF">("MANAGER");

  const create = useMutation({
    mutationFn: async () => (await api.post("/api/users", { name, phone, pin, role })).data,
    onSuccess: () => {
      toast.success("User created");
      setOpen(false); setName(""); setPhone(""); setPin("");
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || "Failed"),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Users & Permissions</h1>
          <p className="text-muted-foreground text-sm sm:text-base">Add manager / staff and configure exactly what they can do</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Add user</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add User</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
              <div><Label>PIN (4 digits)</Label><Input type="password" value={pin} onChange={(e) => setPin(e.target.value)} /></div>
              <div>
                <Label>Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MANAGER">Manager</SelectItem>
                    <SelectItem value="STAFF">Staff</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" onClick={() => create.mutate()} disabled={!name || !phone || !pin || create.isPending}>
                {create.isPending ? "Saving…" : "Add"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {data.map((u: any) => (
        <UserCard key={u.id} user={u} />
      ))}
    </div>
  );
}

function UserCard({ user }: { user: any }) {
  const qc = useQueryClient();
  const [perms, setPerms] = useState<Record<string, boolean>>(() => {
    const p = user.permissions || {};
    const init: Record<string, boolean> = {};
    PERMISSIONS.forEach(({ key }) => (init[key] = Boolean(p[key])));
    return init;
  });

  const save = useMutation({
    mutationFn: async () => (await api.put(`/api/users/${user.id}/permissions`, perms)).data,
    onSuccess: () => { toast.success("Permissions updated"); qc.invalidateQueries({ queryKey: ["users"] }); },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4" /> {user.name}
          <Badge variant={user.role === "OWNER" ? "default" : "secondary"}>{user.role}</Badge>
          {!user.isActive && <Badge variant="destructive">Inactive</Badge>}
        </CardTitle>
        <CardDescription>{user.phone}</CardDescription>
      </CardHeader>
      <CardContent>
        {user.role === "OWNER" ? (
          <p className="text-sm text-muted-foreground">Owner has full access — no per-permission toggles.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {PERMISSIONS.map((p) => (
                <label key={p.key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(perms[p.key])}
                    onChange={(e) => setPerms((s) => ({ ...s, [p.key]: e.target.checked }))}
                  />
                  {p.label}
                </label>
              ))}
            </div>
            <Button className="mt-4" onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save permissions"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

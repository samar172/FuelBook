"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiUser, getAuthUser, setAuth } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const onError = (e: any) =>
  toast.error(e?.response?.data?.error || e?.message || "Failed");

export default function ManagePumpsPage() {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [user, setUser] = useState<ApiUser | null>(null);

  useEffect(() => {
    setUser(getAuthUser());
  }, []);

  const { data: pumps = [] } = useQuery({
    queryKey: ["setup-pumps"],
    queryFn: async () => (await api.get("/api/setup/pumps")).data,
  });

  const switchPump = useMutation({
    mutationFn: async (pumpId: string) =>
      (await api.post("/api/auth/switch-pump", { pumpId })).data,
    onSuccess: (data) => {
      const current = getAuthUser();
      if (current) {
        setAuth(data.token, {
          ...current,
          pumpId: data.user.pumpId,
          pumpName: data.user.pumpName,
        });
      }
      window.location.reload();
    },
    onError,
  });

  const deletePump = useMutation({
    mutationFn: async (pumpId: string) => {
      await api.delete(`/api/setup/pumps/${pumpId}`);
    },
    onSuccess: () => {
      toast.success("Pump deleted");
      qc.invalidateQueries({ queryKey: ["setup-pumps"] });
    },
    onError,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Manage Pumps</h1>
          <p className="text-muted-foreground">
            Add pumps to your business and switch which one you&apos;re operating.
          </p>
        </div>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add pump
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pumps</CardTitle>
          <CardDescription>
            The active pump determines which shifts, tanks and reports you see across
            the app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>City</TableHead>
                <TableHead>State</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pumps.map((p: any) => {
                const isActivePump = p.id === user?.pumpId;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="font-mono">{p.code}</TableCell>
                    <TableCell>{p.city}</TableCell>
                    <TableCell>{p.state}</TableCell>
                    <TableCell className="text-right space-x-1">
                      {isActivePump ? (
                        <Badge>Active</Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => switchPump.mutate(p.id)}
                          disabled={switchPump.isPending}
                        >
                          Switch to this pump
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Edit pump"
                        onClick={() => setEditing(p)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isActivePump || pumps.length <= 1 || deletePump.isPending}
                        title={
                          isActivePump
                            ? "Switch to a different pump before deleting this one"
                            : pumps.length <= 1
                              ? "Cannot delete your only pump"
                              : "Delete pump"
                        }
                        onClick={() => {
                          if (
                            window.confirm(
                              `Delete "${p.name}"? This can't be undone from here.`,
                            )
                          ) {
                            deletePump.mutate(p.id);
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {pumps.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No pumps yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <PumpFormDialog
        open={adding}
        onOpenChange={setAdding}
        onDone={() => qc.invalidateQueries({ queryKey: ["setup-pumps"] })}
      />
      <PumpFormDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        pump={editing}
        onDone={() => {
          setEditing(null);
          qc.invalidateQueries({ queryKey: ["setup-pumps"] });
        }}
      />
    </div>
  );
}

function PumpFormDialog({
  open,
  onOpenChange,
  pump,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pump?: any;
  onDone: () => void;
}) {
  const isEdit = !!pump;
  const [form, setForm] = useState({
    name: "",
    code: "",
    address: "",
    city: "",
    state: "",
  });
  useEffect(() => {
    if (open) {
      setForm({
        name: pump?.name ?? "",
        code: pump?.code ?? "",
        address: pump?.address ?? "",
        city: pump?.city ?? "",
        state: pump?.state ?? "",
      });
    }
  }, [open, pump]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name || !form.code || !form.address || !form.city || !form.state) {
        throw new Error("All fields are required");
      }
      if (isEdit) {
        return (
          await api.patch(`/api/setup/pumps/${pump.id}`, {
            name: form.name,
            address: form.address,
            city: form.city,
            state: form.state,
          })
        ).data;
      }
      return (await api.post("/api/setup/pumps", form)).data;
    },
    onSuccess: () => {
      toast.success(isEdit ? "Pump updated" : "Pump added");
      onOpenChange(false);
      onDone();
    },
    onError,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit pump" : "Add pump"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Code can't be changed once a pump is created."
              : "Basic details for this pump — tanks, nozzles and payment channels are configured after switching to it."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Pump name">
            <Input
              placeholder="e.g. Shree Hari Petrol Pump"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          {!isEdit && (
            <Field label="Code (short, unique to this business)">
              <Input
                placeholder="e.g. SHP2"
                maxLength={10}
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              />
            </Field>
          )}
          <Field label="Address">
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="City">
              <Input
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </Field>
            <Field label="State">
              <Input
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
              />
            </Field>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : isEdit ? "Save" : "Add pump"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

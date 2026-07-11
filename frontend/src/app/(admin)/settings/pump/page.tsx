"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { formatLitres, FUEL_LABELS } from "@/lib/utils";
import { toast } from "sonner";
import { Pencil, Plus, Power } from "lucide-react";

const FUEL_TYPES = ["HSD", "MS", "MS_POWER", "CNG"] as const;
const CHANNEL_KINDS = ["CASH", "CARD", "UPI", "BANK_DEPOSIT", "WALLET", "OTHER"] as const;

const onError = (e: any) =>
  toast.error(
    e?.response?.data?.error?.message ||
      e?.response?.data?.error ||
      e?.message ||
      "Failed",
  );

export default function PumpSetupPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Pump Setup</h1>
        <p className="text-muted-foreground">
          Configure pump details, tanks, nozzles, payment channels and time slots.
        </p>
      </div>
      <Tabs defaultValue="pump" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="pump">Pump Info</TabsTrigger>
          <TabsTrigger value="tanks">Tanks</TabsTrigger>
          <TabsTrigger value="nozzles">Nozzles</TabsTrigger>
          <TabsTrigger value="channels">Payment Channels</TabsTrigger>
          <TabsTrigger value="slots">Time Slots</TabsTrigger>
        </TabsList>
        <TabsContent value="pump"><PumpInfoSection /></TabsContent>
        <TabsContent value="tanks"><TanksSection /></TabsContent>
        <TabsContent value="nozzles"><NozzlesSection /></TabsContent>
        <TabsContent value="channels"><ChannelsSection /></TabsContent>
        <TabsContent value="slots"><TimeSlotsSection /></TabsContent>
      </Tabs>
    </div>
  );
}

// ===================== PUMP INFO =====================
function PumpInfoSection() {
  const qc = useQueryClient();
  const { data: pump } = useQuery({
    queryKey: ["pump"],
    queryFn: async () => (await api.get("/api/setup/pump")).data,
  });
  const [form, setForm] = useState({ name: "", address: "", city: "", state: "" });
  useEffect(() => {
    if (pump) setForm({ name: pump.name, address: pump.address, city: pump.city, state: pump.state });
  }, [pump]);

  const save = useMutation({
    mutationFn: async () => (await api.patch("/api/setup/pump", form)).data,
    onSuccess: () => {
      toast.success("Pump details updated");
      qc.invalidateQueries({ queryKey: ["pump"] });
    },
    onError,
  });

  if (!pump) return <div className="text-muted-foreground">Loading…</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{pump.name}</CardTitle>
        <CardDescription>
          Code: <span className="font-mono">{pump.code}</span> (cannot be changed)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl">
          <Field label="Pump name">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="State">
            <Input
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value })}
            />
          </Field>
          <Field label="Address" className="md:col-span-2">
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </Field>
          <Field label="City">
            <Input
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
          </Field>
        </div>
        <div className="mt-4">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ===================== TANKS =====================
function TanksSection() {
  const qc = useQueryClient();
  const { data: tanks = [] } = useQuery({
    queryKey: ["tanks"],
    queryFn: async () => (await api.get("/api/setup/tanks")).data,
  });

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const setActive = useMutation({
    mutationFn: async ({ id, isActive }: any) =>
      (await api.patch(`/api/setup/tanks/${id}`, { isActive })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tanks"] });
      qc.invalidateQueries({ queryKey: ["nozzles"] });
    },
    onError,
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Tanks</CardTitle>
          <CardDescription>
            Each tank holds a single fuel type. Capacity is in litres.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add tank
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Fuel</TableHead>
              <TableHead className="text-right">Capacity</TableHead>
              <TableHead>Nozzles</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tanks.map((t: any) => (
              <TableRow key={t.id} className={!t.isActive ? "opacity-60" : ""}>
                <TableCell className="font-medium">{t.name}</TableCell>
                <TableCell>{FUEL_LABELS[t.fuelType] || t.fuelType}</TableCell>
                <TableCell className="text-right">
                  {formatLitres(t.capacityMl)} L
                </TableCell>
                <TableCell>{t.nozzles?.length || 0}</TableCell>
                <TableCell>
                  {t.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(t)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setActive.mutate({ id: t.id, isActive: !t.isActive })
                    }
                    title={t.isActive ? "Deactivate" : "Activate"}
                  >
                    <Power className={`h-3.5 w-3.5 ${t.isActive ? "" : "text-muted-foreground"}`} />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {tanks.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No tanks yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <TankFormDialog
        open={adding}
        onOpenChange={setAdding}
        onDone={() => qc.invalidateQueries({ queryKey: ["tanks"] })}
      />
      <TankFormDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        tank={editing}
        onDone={() => {
          setEditing(null);
          qc.invalidateQueries({ queryKey: ["tanks"] });
        }}
      />
    </Card>
  );
}

function TankFormDialog({
  open,
  onOpenChange,
  tank,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tank?: any;
  onDone: () => void;
}) {
  const isEdit = !!tank;
  const [form, setForm] = useState({
    name: "",
    fuelType: "HSD",
    capacityLitres: "",
  });
  useEffect(() => {
    if (open) {
      setForm({
        name: tank?.name ?? "",
        fuelType: tank?.fuelType ?? "HSD",
        capacityLitres: tank ? String(Number(tank.capacityMl) / 1000) : "",
      });
    }
  }, [open, tank]);

  const save = useMutation({
    mutationFn: async () => {
      const capacity = parseFloat(form.capacityLitres);
      if (!form.name || !capacity || capacity <= 0) {
        throw new Error("Name and capacity are required");
      }
      if (isEdit) {
        return (
          await api.patch(`/api/setup/tanks/${tank.id}`, {
            name: form.name,
            capacityLitres: capacity,
          })
        ).data;
      }
      return (
        await api.post(`/api/setup/tanks`, {
          name: form.name,
          fuelType: form.fuelType,
          capacityLitres: capacity,
        })
      ).data;
    },
    onSuccess: () => {
      toast.success(isEdit ? "Tank updated" : "Tank added");
      onOpenChange(false);
      onDone();
    },
    onError,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit tank" : "Add tank"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Fuel type can't be changed once a tank is created."
              : "Tank capacity is the maximum litres it can hold."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Name">
            <Input
              placeholder="e.g. HSD-1"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          {!isEdit && (
            <Field label="Fuel type">
              <Select
                value={form.fuelType}
                onValueChange={(v) => setForm({ ...form, fuelType: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FUEL_TYPES.map((f) => (
                    <SelectItem key={f} value={f}>
                      {FUEL_LABELS[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field label="Capacity (litres)">
            <Input
              type="number"
              min={0}
              step="0.001"
              placeholder="e.g. 20000"
              value={form.capacityLitres}
              onChange={(e) => setForm({ ...form, capacityLitres: e.target.value })}
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : isEdit ? "Save" : "Add"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ===================== NOZZLES =====================
function NozzlesSection() {
  const qc = useQueryClient();
  const { data: nozzles = [] } = useQuery({
    queryKey: ["nozzles"],
    queryFn: async () => (await api.get("/api/setup/nozzles")).data,
  });
  const { data: tanks = [] } = useQuery({
    queryKey: ["tanks"],
    queryFn: async () => (await api.get("/api/setup/tanks")).data,
  });

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const setActive = useMutation({
    mutationFn: async ({ id, isActive }: any) =>
      (await api.patch(`/api/setup/nozzles/${id}`, { isActive })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nozzles"] }),
    onError,
  });

  const activeTanks = tanks.filter((t: any) => t.isActive);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Nozzles</CardTitle>
          <CardDescription>
            A nozzle belongs to one tank — its fuel type comes from that tank.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setAdding(true)} disabled={activeTanks.length === 0}>
          <Plus className="h-4 w-4 mr-1" /> Add nozzle
        </Button>
      </CardHeader>
      <CardContent>
        {activeTanks.length === 0 && (
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2 mb-3">
            Add at least one active tank before adding nozzles.
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Tank</TableHead>
              <TableHead>Fuel</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {nozzles.map((n: any) => (
              <TableRow key={n.id} className={!n.isActive ? "opacity-60" : ""}>
                <TableCell className="font-medium">{n.code}</TableCell>
                <TableCell>{n.tank?.name}</TableCell>
                <TableCell>{FUEL_LABELS[n.fuelType] || n.fuelType}</TableCell>
                <TableCell>
                  {n.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(n)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setActive.mutate({ id: n.id, isActive: !n.isActive })
                    }
                    title={n.isActive ? "Deactivate" : "Activate"}
                  >
                    <Power className={`h-3.5 w-3.5 ${n.isActive ? "" : "text-muted-foreground"}`} />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {nozzles.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No nozzles yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <NozzleFormDialog
        open={adding}
        onOpenChange={setAdding}
        tanks={activeTanks}
        onDone={() => qc.invalidateQueries({ queryKey: ["nozzles"] })}
      />
      <NozzleFormDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        nozzle={editing}
        tanks={tanks}
        onDone={() => {
          setEditing(null);
          qc.invalidateQueries({ queryKey: ["nozzles"] });
        }}
      />
    </Card>
  );
}

function NozzleFormDialog({
  open,
  onOpenChange,
  nozzle,
  tanks,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  nozzle?: any;
  tanks: any[];
  onDone: () => void;
}) {
  const isEdit = !!nozzle;
  const [form, setForm] = useState({ code: "", tankId: "" });
  useEffect(() => {
    if (open) {
      setForm({
        code: nozzle?.code ?? "",
        tankId: nozzle?.tankId ?? tanks[0]?.id ?? "",
      });
    }
  }, [open, nozzle, tanks]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.code) throw new Error("Code is required");
      if (isEdit) {
        return (
          await api.patch(`/api/setup/nozzles/${nozzle.id}`, { code: form.code })
        ).data;
      }
      if (!form.tankId) throw new Error("Pick a tank");
      return (
        await api.post(`/api/setup/nozzles`, {
          code: form.code,
          tankId: form.tankId,
        })
      ).data;
    },
    onSuccess: () => {
      toast.success(isEdit ? "Nozzle updated" : "Nozzle added");
      onOpenChange(false);
      onDone();
    },
    onError,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit nozzle" : "Add nozzle"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Tank can't be changed once a nozzle is created."
              : "Pick the tank this nozzle dispenses from."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Code">
            <Input
              placeholder="e.g. N1, HSD-1A"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </Field>
          {!isEdit && (
            <Field label="Tank">
              <Select
                value={form.tankId}
                onValueChange={(v) => setForm({ ...form, tankId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a tank" />
                </SelectTrigger>
                <SelectContent>
                  {tanks.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} — {FUEL_LABELS[t.fuelType] || t.fuelType}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : isEdit ? "Save" : "Add"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ===================== PAYMENT CHANNELS =====================
function ChannelsSection() {
  const qc = useQueryClient();
  const { data: channels = [] } = useQuery({
    queryKey: ["payment-channels"],
    queryFn: async () => (await api.get("/api/setup/payment-channels")).data,
  });

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const deactivate = useMutation({
    mutationFn: async (id: string) => api.delete(`/api/setup/payment-channels/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payment-channels"] }),
    onError,
  });
  const reactivate = useMutation({
    mutationFn: async (id: string) =>
      (await api.patch(`/api/setup/payment-channels/${id}`, { isActive: true })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payment-channels"] }),
    onError,
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Payment Channels</CardTitle>
          <CardDescription>
            Cash, card, UPI accounts, bank deposits — anywhere money lands.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add channel
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Sort</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {channels.map((c: any) => (
              <TableRow key={c.id} className={!c.isActive ? "opacity-60" : ""}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell><Badge variant="outline">{c.kind}</Badge></TableCell>
                <TableCell>{c.sortOrder}</TableCell>
                <TableCell>
                  {c.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      c.isActive ? deactivate.mutate(c.id) : reactivate.mutate(c.id)
                    }
                  >
                    <Power className={`h-3.5 w-3.5 ${c.isActive ? "" : "text-muted-foreground"}`} />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {channels.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No channels yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <ChannelFormDialog
        open={adding}
        onOpenChange={setAdding}
        onDone={() => qc.invalidateQueries({ queryKey: ["payment-channels"] })}
      />
      <ChannelFormDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        channel={editing}
        onDone={() => {
          setEditing(null);
          qc.invalidateQueries({ queryKey: ["payment-channels"] });
        }}
      />
    </Card>
  );
}

function ChannelFormDialog({
  open,
  onOpenChange,
  channel,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  channel?: any;
  onDone: () => void;
}) {
  const isEdit = !!channel;
  const [form, setForm] = useState({ name: "", kind: "CASH", sortOrder: "0" });
  useEffect(() => {
    if (open) {
      setForm({
        name: channel?.name ?? "",
        kind: channel?.kind ?? "CASH",
        sortOrder: String(channel?.sortOrder ?? 0),
      });
    }
  }, [open, channel]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name) throw new Error("Name is required");
      const body = {
        name: form.name,
        kind: form.kind,
        sortOrder: Number(form.sortOrder) || 0,
      };
      if (isEdit) {
        return (await api.patch(`/api/setup/payment-channels/${channel.id}`, body)).data;
      }
      return (await api.post(`/api/setup/payment-channels`, body)).data;
    },
    onSuccess: () => {
      toast.success(isEdit ? "Channel updated" : "Channel added");
      onOpenChange(false);
      onDone();
    },
    onError,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit channel" : "Add channel"}</DialogTitle>
          <DialogDescription>
            Used in shift collections and outstanding receipts.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Name">
            <Input
              placeholder="e.g. HDFC POS, Paytm"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Kind">
            <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CHANNEL_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>{k}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Sort order">
            <Input
              type="number"
              value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : isEdit ? "Save" : "Add"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ===================== TIME SLOTS =====================
function TimeSlotsSection() {
  const qc = useQueryClient();
  const { data: slots = [] } = useQuery({
    queryKey: ["payment-time-slots"],
    queryFn: async () => (await api.get("/api/setup/payment-time-slots")).data,
  });

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const deactivate = useMutation({
    mutationFn: async (id: string) => api.delete(`/api/setup/payment-time-slots/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payment-time-slots"] }),
    onError,
  });
  const reactivate = useMutation({
    mutationFn: async (id: string) =>
      (await api.patch(`/api/setup/payment-time-slots/${id}`, { isActive: true })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payment-time-slots"] }),
    onError,
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Time Slots</CardTitle>
          <CardDescription>
            Used to bucket collections (e.g. Before 12, After 12). Configurable by you.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add slot
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Sort</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {slots.map((s: any) => (
              <TableRow key={s.id} className={!s.isActive ? "opacity-60" : ""}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{s.sortOrder}</TableCell>
                <TableCell>
                  {s.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      s.isActive ? deactivate.mutate(s.id) : reactivate.mutate(s.id)
                    }
                  >
                    <Power className={`h-3.5 w-3.5 ${s.isActive ? "" : "text-muted-foreground"}`} />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {slots.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No time slots yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <SlotFormDialog
        open={adding}
        onOpenChange={setAdding}
        onDone={() => qc.invalidateQueries({ queryKey: ["payment-time-slots"] })}
      />
      <SlotFormDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        slot={editing}
        onDone={() => {
          setEditing(null);
          qc.invalidateQueries({ queryKey: ["payment-time-slots"] });
        }}
      />
    </Card>
  );
}

function SlotFormDialog({
  open,
  onOpenChange,
  slot,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  slot?: any;
  onDone: () => void;
}) {
  const isEdit = !!slot;
  const [form, setForm] = useState({ name: "", sortOrder: "0" });
  useEffect(() => {
    if (open) {
      setForm({ name: slot?.name ?? "", sortOrder: String(slot?.sortOrder ?? 0) });
    }
  }, [open, slot]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name) throw new Error("Name is required");
      const body = { name: form.name, sortOrder: Number(form.sortOrder) || 0 };
      if (isEdit) {
        return (await api.patch(`/api/setup/payment-time-slots/${slot.id}`, body)).data;
      }
      return (await api.post(`/api/setup/payment-time-slots`, body)).data;
    },
    onSuccess: () => {
      toast.success(isEdit ? "Slot updated" : "Slot added");
      onOpenChange(false);
      onDone();
    },
    onError,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit slot" : "Add slot"}</DialogTitle>
          <DialogDescription>
            Time slots are used to break down collections during a shift.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Name">
            <Input
              placeholder="e.g. Before 12, After 12, Full Shift"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Sort order">
            <Input
              type="number"
              value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : isEdit ? "Save" : "Add"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ===================== shared =====================
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

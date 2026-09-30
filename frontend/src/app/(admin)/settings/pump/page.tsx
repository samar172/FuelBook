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
import {
  CASH_MODE_HELP,
  CASH_MODE_LABELS,
  CashHandoverMode,
} from "@/lib/books";
import { toast } from "sonner";
import { Pencil, Plus, Power } from "lucide-react";
import { useT } from "@/lib/i18n";

const FUEL_TYPES = ["HSD", "MS", "MS_POWER", "CNG"] as const;
const CHANNEL_KINDS = ["CASH", "CARD", "UPI", "BANK_DEPOSIT", "WALLET", "OTHER"] as const;

function useOnError() {
  const { t } = useT();
  return (e: any) =>
    toast.error(
      e?.response?.data?.error?.message ||
        e?.response?.data?.error ||
        e?.message ||
        t("settings.failed", "Failed"),
    );
}

export default function PumpSetupPage() {
  const { t } = useT();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("settings.pumpSetup", "Pump Setup")}</h1>
        <p className="text-muted-foreground">
          {t("settings.pumpSetupDesc", "Configure pump details, tanks, nozzles, payment channels and time slots.")}
        </p>
      </div>
      <Tabs defaultValue="pump" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="pump">{t("settings.tabPumpInfo", "Pump Info")}</TabsTrigger>
          <TabsTrigger value="tanks">{t("settings.tabTanks", "Tanks")}</TabsTrigger>
          <TabsTrigger value="nozzles">{t("settings.tabNozzles", "Nozzles")}</TabsTrigger>
          <TabsTrigger value="channels">{t("settings.tabChannels", "Payment Channels")}</TabsTrigger>
          <TabsTrigger value="slots">{t("settings.tabSlots", "Time Slots")}</TabsTrigger>
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
  const { t } = useT();
  const onError = useOnError();
  const qc = useQueryClient();
  const { data: pump } = useQuery({
    queryKey: ["pump"],
    queryFn: async () => (await api.get("/api/setup/pump")).data,
  });
  const [form, setForm] = useState<{
    name: string;
    address: string;
    city: string;
    state: string;
    cashHandoverMode: CashHandoverMode;
  }>({ name: "", address: "", city: "", state: "", cashHandoverMode: "PER_ATTENDANT" });
  useEffect(() => {
    if (pump)
      setForm({
        name: pump.name,
        address: pump.address,
        city: pump.city,
        state: pump.state,
        cashHandoverMode: pump.cashHandoverMode ?? "PER_ATTENDANT",
      });
  }, [pump]);

  const save = useMutation({
    mutationFn: async () => (await api.patch("/api/setup/pump", form)).data,
    onSuccess: () => {
      toast.success(t("settings.pumpUpdated", "Pump details updated"));
      qc.invalidateQueries({ queryKey: ["pump"] });
    },
    onError,
  });

  const codeParts = t("settings.codeCannotChange", "Code: {code} (cannot be changed)").split("{code}");

  if (!pump) return <div className="text-muted-foreground">{t("common.loading", "Loading…")}</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{pump.name}</CardTitle>
        <CardDescription>
          {codeParts[0]}
          <span className="font-mono">{pump.code}</span>
          {codeParts[1]}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl">
          <Field label={t("settings.pumpName", "Pump name")}>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label={t("settings.state", "State")}>
            <Input
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value })}
            />
          </Field>
          <Field label={t("settings.address", "Address")} className="md:col-span-2">
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </Field>
          <Field label={t("settings.city", "City")}>
            <Input
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
          </Field>
        </div>

        <div className="mt-6 max-w-2xl">
          <h3 className="text-sm font-semibold">{t("settings.cashHandoverHeading", "How shift cash is handed over")}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t(
              "settings.cashHandoverHelp",
              "This decides who is held accountable for a cash shortage at the end of a shift, and how the Cash Handover tab on each shift report is laid out."
            )}
          </p>
          <div className="mt-2 space-y-2">
            {(["PER_ATTENDANT", "POOLED_CASHIER"] as CashHandoverMode[]).map((mode) => (
              <label
                key={mode}
                className={
                  "flex cursor-pointer items-start gap-3 rounded-md border p-3 " +
                  (form.cashHandoverMode === mode
                    ? "border-primary bg-slate-50"
                    : "hover:bg-slate-50")
                }
              >
                <input
                  type="radio"
                  name="cashHandoverMode"
                  className="mt-1"
                  checked={form.cashHandoverMode === mode}
                  onChange={() => setForm({ ...form, cashHandoverMode: mode })}
                />
                <span>
                  <span className="block text-sm font-medium">{t(mode === "PER_ATTENDANT" ? "settings.cashModePerAttendant" : "settings.cashModePooled", CASH_MODE_LABELS[mode])}</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    {t(mode === "PER_ATTENDANT" ? "settings.cashModePerAttendantHelp" : "settings.cashModePooledHelp", CASH_MODE_HELP[mode])}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className="mt-4">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? t("common.saving", "Saving…") : t("settings.saveChanges", "Save changes")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ===================== TANKS =====================
function TanksSection() {
  const { t } = useT();
  const onError = useOnError();
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
          <CardTitle className="text-base">{t("settings.tanks", "Tanks")}</CardTitle>
          <CardDescription>
            {t("settings.tanksDesc", "Each tank holds a single fuel type. Capacity is in litres.")}
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4 mr-1" /> {t("settings.addTank", "Add tank")}
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("common.name", "Name")}</TableHead>
              <TableHead>{t("settings.colFuel", "Fuel")}</TableHead>
              <TableHead className="text-right">{t("settings.colCapacity", "Capacity")}</TableHead>
              <TableHead>{t("settings.colNozzles", "Nozzles")}</TableHead>
              <TableHead>{t("common.status", "Status")}</TableHead>
              <TableHead className="text-right">{t("common.actions", "Actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tanks.map((tk: any) => (
              <TableRow key={tk.id} className={!tk.isActive ? "opacity-60" : ""}>
                <TableCell className="font-medium">{tk.name}</TableCell>
                <TableCell>{FUEL_LABELS[tk.fuelType] || tk.fuelType}</TableCell>
                <TableCell className="text-right">
                  {formatLitres(tk.capacityMl)} L
                </TableCell>
                <TableCell>{tk.nozzles?.length || 0}</TableCell>
                <TableCell>
                  {tk.isActive ? <Badge variant="success">{t("common.active", "Active")}</Badge> : <Badge variant="secondary">{t("common.inactive", "Inactive")}</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(tk)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setActive.mutate({ id: tk.id, isActive: !tk.isActive })
                    }
                    title={tk.isActive ? t("settings.deactivate", "Deactivate") : t("settings.activate", "Activate")}
                  >
                    <Power className={`h-3.5 w-3.5 ${tk.isActive ? "" : "text-muted-foreground"}`} />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {tanks.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  {t("settings.noTanks", "No tanks yet.")}
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
  const { t } = useT();
  const onError = useOnError();
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
        throw new Error(t("settings.nameAndCapacityRequired", "Name and capacity are required"));
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
      toast.success(isEdit ? t("settings.tankUpdated", "Tank updated") : t("settings.tankAdded", "Tank added"));
      onOpenChange(false);
      onDone();
    },
    onError,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("settings.editTank", "Edit tank") : t("settings.addTank", "Add tank")}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? t("settings.tankEditHelp", "Fuel type can't be changed once a tank is created.")
              : t("settings.tankAddHelp", "Tank capacity is the maximum litres it can hold.")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label={t("common.name", "Name")}>
            <Input
              placeholder={t("settings.tankNamePlaceholder", "e.g. HSD-1")}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          {!isEdit && (
            <Field label={t("settings.fuelType", "Fuel type")}>
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
          <Field label={t("settings.capacityLitres", "Capacity (litres)")}>
            <Input
              type="number"
              min={0}
              step="0.001"
              placeholder={t("settings.capacityPlaceholder", "e.g. 20000")}
              value={form.capacityLitres}
              onChange={(e) => setForm({ ...form, capacityLitres: e.target.value })}
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? t("common.saving", "Saving…") : isEdit ? t("common.save", "Save") : t("common.add", "Add")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ===================== NOZZLES =====================
function NozzlesSection() {
  const { t } = useT();
  const onError = useOnError();
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

  const activeTanks = tanks.filter((tk: any) => tk.isActive);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">{t("settings.nozzles", "Nozzles")}</CardTitle>
          <CardDescription>
            {t("settings.nozzlesDesc", "A nozzle belongs to one tank — its fuel type comes from that tank.")}
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setAdding(true)} disabled={activeTanks.length === 0}>
          <Plus className="h-4 w-4 mr-1" /> {t("settings.addNozzle", "Add nozzle")}
        </Button>
      </CardHeader>
      <CardContent>
        {activeTanks.length === 0 && (
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2 mb-3">
            {t("settings.needActiveTank", "Add at least one active tank before adding nozzles.")}
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("settings.colCode", "Code")}</TableHead>
              <TableHead>{t("settings.colTank", "Tank")}</TableHead>
              <TableHead>{t("settings.colFuel", "Fuel")}</TableHead>
              <TableHead>{t("common.status", "Status")}</TableHead>
              <TableHead className="text-right">{t("common.actions", "Actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {nozzles.map((n: any) => (
              <TableRow key={n.id} className={!n.isActive ? "opacity-60" : ""}>
                <TableCell className="font-medium">{n.code}</TableCell>
                <TableCell>{n.tank?.name}</TableCell>
                <TableCell>{FUEL_LABELS[n.fuelType] || n.fuelType}</TableCell>
                <TableCell>
                  {n.isActive ? <Badge variant="success">{t("common.active", "Active")}</Badge> : <Badge variant="secondary">{t("common.inactive", "Inactive")}</Badge>}
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
                    title={n.isActive ? t("settings.deactivate", "Deactivate") : t("settings.activate", "Activate")}
                  >
                    <Power className={`h-3.5 w-3.5 ${n.isActive ? "" : "text-muted-foreground"}`} />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {nozzles.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  {t("settings.noNozzles", "No nozzles yet.")}
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
  const { t } = useT();
  const onError = useOnError();
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
      if (!form.code) throw new Error(t("settings.codeRequired", "Code is required"));
      if (isEdit) {
        return (
          await api.patch(`/api/setup/nozzles/${nozzle.id}`, { code: form.code })
        ).data;
      }
      if (!form.tankId) throw new Error(t("settings.pickTank", "Pick a tank"));
      return (
        await api.post(`/api/setup/nozzles`, {
          code: form.code,
          tankId: form.tankId,
        })
      ).data;
    },
    onSuccess: () => {
      toast.success(isEdit ? t("settings.nozzleUpdated", "Nozzle updated") : t("settings.nozzleAdded", "Nozzle added"));
      onOpenChange(false);
      onDone();
    },
    onError,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("settings.editNozzle", "Edit nozzle") : t("settings.addNozzle", "Add nozzle")}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? t("settings.nozzleEditHelp", "Tank can't be changed once a nozzle is created.")
              : t("settings.nozzleAddHelp", "Pick the tank this nozzle dispenses from.")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label={t("settings.colCode", "Code")}>
            <Input
              placeholder={t("settings.nozzleCodePlaceholder", "e.g. N1, HSD-1A")}
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </Field>
          {!isEdit && (
            <Field label={t("settings.colTank", "Tank")}>
              <Select
                value={form.tankId}
                onValueChange={(v) => setForm({ ...form, tankId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("settings.selectTank", "Select a tank")} />
                </SelectTrigger>
                <SelectContent>
                  {tanks.map((tk) => (
                    <SelectItem key={tk.id} value={tk.id}>
                      {tk.name} — {FUEL_LABELS[tk.fuelType] || tk.fuelType}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? t("common.saving", "Saving…") : isEdit ? t("common.save", "Save") : t("common.add", "Add")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ===================== PAYMENT CHANNELS =====================
function ChannelsSection() {
  const { t } = useT();
  const onError = useOnError();
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
          <CardTitle className="text-base">{t("settings.channels", "Payment Channels")}</CardTitle>
          <CardDescription>
            {t("settings.channelsDesc", "Cash, card, UPI accounts, bank deposits — anywhere money lands.")}
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4 mr-1" /> {t("settings.addChannel", "Add channel")}
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("common.name", "Name")}</TableHead>
              <TableHead>{t("settings.colKind", "Kind")}</TableHead>
              <TableHead>{t("settings.colSort", "Sort")}</TableHead>
              <TableHead>{t("common.status", "Status")}</TableHead>
              <TableHead className="text-right">{t("common.actions", "Actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {channels.map((c: any) => (
              <TableRow key={c.id} className={!c.isActive ? "opacity-60" : ""}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell><Badge variant="outline">{c.kind}</Badge></TableCell>
                <TableCell>{c.sortOrder}</TableCell>
                <TableCell>
                  {c.isActive ? <Badge variant="success">{t("common.active", "Active")}</Badge> : <Badge variant="secondary">{t("common.inactive", "Inactive")}</Badge>}
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
                  {t("settings.noChannels", "No channels yet.")}
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
  const { t } = useT();
  const onError = useOnError();
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
      if (!form.name) throw new Error(t("settings.nameRequired", "Name is required"));
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
      toast.success(isEdit ? t("settings.channelUpdated", "Channel updated") : t("settings.channelAdded", "Channel added"));
      onOpenChange(false);
      onDone();
    },
    onError,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("settings.editChannel", "Edit channel") : t("settings.addChannel", "Add channel")}</DialogTitle>
          <DialogDescription>
            {t("settings.channelHelp", "Used in shift collections and outstanding receipts.")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label={t("common.name", "Name")}>
            <Input
              placeholder={t("settings.channelNamePlaceholder", "e.g. HDFC POS, Paytm")}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label={t("settings.kind", "Kind")}>
            <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CHANNEL_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>{k}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("settings.sortOrder", "Sort order")}>
            <Input
              type="number"
              value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel", "Cancel")}</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? t("common.saving", "Saving…") : isEdit ? t("common.save", "Save") : t("common.add", "Add")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ===================== TIME SLOTS =====================
function TimeSlotsSection() {
  const { t } = useT();
  const onError = useOnError();
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
          <CardTitle className="text-base">{t("settings.slots", "Time Slots")}</CardTitle>
          <CardDescription>
            {t(
              "settings.slotsDesc",
              "Used to bucket collections (e.g. Before 12, After 12). Tag a slot Day or Night and it only appears on that kind of shift's Collections tab."
            )}
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4 mr-1" /> {t("settings.addSlot", "Add slot")}
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("common.name", "Name")}</TableHead>
              <TableHead>{t("settings.colShownOn", "Shown on")}</TableHead>
              <TableHead>{t("settings.colSort", "Sort")}</TableHead>
              <TableHead>{t("common.status", "Status")}</TableHead>
              <TableHead className="text-right">{t("common.actions", "Actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {slots.map((s: any) => (
              <TableRow key={s.id} className={!s.isActive ? "opacity-60" : ""}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>
                  {s.shiftType === "DAY" ? (
                    <div>
                      <Badge>{t("settings.slotDay", "Day")}</Badge>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {t("settings.shownDayOnly", "Shown only on day shifts")}
                      </div>
                    </div>
                  ) : s.shiftType === "NIGHT" ? (
                    <div>
                      <Badge variant="secondary">{t("settings.slotNight", "Night")}</Badge>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {t("settings.shownNightOnly", "Shown only on night shifts")}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <Badge variant="outline">{t("settings.slotBoth", "Both")}</Badge>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {t("settings.shownEvery", "Shown on every shift")}
                      </div>
                    </div>
                  )}
                </TableCell>
                <TableCell>{s.sortOrder}</TableCell>
                <TableCell>
                  {s.isActive ? <Badge variant="success">{t("common.active", "Active")}</Badge> : <Badge variant="secondary">{t("common.inactive", "Inactive")}</Badge>}
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
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  {t("settings.noSlots", "No time slots yet.")}
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
  const { t } = useT();
  const onError = useOnError();
  const isEdit = !!slot;
  const [form, setForm] = useState({ name: "", sortOrder: "0", shiftType: "BOTH" });
  useEffect(() => {
    if (open) {
      setForm({
        name: slot?.name ?? "",
        sortOrder: String(slot?.sortOrder ?? 0),
        shiftType: slot?.shiftType ?? "BOTH",
      });
    }
  }, [open, slot]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name) throw new Error(t("settings.nameRequired", "Name is required"));
      const body = {
        name: form.name,
        sortOrder: Number(form.sortOrder) || 0,
        // null = the slot applies to both day and night shifts.
        shiftType: form.shiftType === "BOTH" ? null : form.shiftType,
      };
      if (isEdit) {
        return (await api.patch(`/api/setup/payment-time-slots/${slot.id}`, body)).data;
      }
      return (await api.post(`/api/setup/payment-time-slots`, body)).data;
    },
    onSuccess: () => {
      toast.success(isEdit ? t("settings.slotUpdated", "Slot updated") : t("settings.slotAdded", "Slot added"));
      onOpenChange(false);
      onDone();
    },
    onError,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("settings.editSlot", "Edit slot") : t("settings.addSlot", "Add slot")}</DialogTitle>
          <DialogDescription>
            {t("settings.slotHelp", "Time slots are used to break down collections during a shift.")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label={t("common.name", "Name")}>
            <Input
              placeholder={t("settings.slotNamePlaceholder", "e.g. 6 AM - 6 PM, Before 12, Full Shift")}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label={t("settings.colShownOn", "Shown on")}>
            <Select
              value={form.shiftType}
              onValueChange={(v) => setForm({ ...form, shiftType: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BOTH">{t("settings.bothShifts", "Both shifts")}</SelectItem>
                <SelectItem value="DAY">{t("settings.dayShiftsOnly", "Day shifts only")}</SelectItem>
                <SelectItem value="NIGHT">{t("settings.nightShiftsOnly", "Night shifts only")}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              {form.shiftType === "DAY"
                ? t("settings.slotDayHint", "Shown only on day shifts — night shifts will not offer this slot.")
                : form.shiftType === "NIGHT"
                  ? t("settings.slotNightHint", "Shown only on night shifts — day shifts will not offer this slot.")
                  : t("settings.slotBothHint", "Shown on every shift, day and night.")}
            </p>
          </Field>
          <Field label={t("settings.sortOrder", "Sort order")}>
            <Input
              type="number"
              value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel", "Cancel")}</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? t("common.saving", "Saving…") : isEdit ? t("common.save", "Save") : t("common.add", "Add")}
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

"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getAuthUser, setAuth, ApiUser } from "@/lib/api";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Fuel, Plus } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { LanguageSwitch } from "@/components/language-switch";

export default function SetupPage() {
  const router = useRouter();
  const { t } = useT();
  const qc = useQueryClient();
  const [user, setUser] = useState<ApiUser | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const u = getAuthUser();
    if (!u) {
      router.replace("/login");
    } else {
      setUser(u);
    }
  }, [router]);

  const { data: pumps = [] } = useQuery({
    queryKey: ["setup-pumps"],
    queryFn: async () => (await api.get("/api/setup/pumps")).data,
    enabled: !!user,
  });

  if (!user) return null;

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 flex items-center justify-center">
      <LanguageSwitch className="absolute right-4 top-4" />
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto bg-primary text-primary-foreground rounded-full p-3 w-fit mb-2">
            <Fuel className="h-6 w-6" />
          </div>
          <CardTitle>{t("auth.setupTitle", "Set up your pumps")}</CardTitle>
          <CardDescription>
            {t(
              "auth.setupDescription",
              "Add at least one pump to get started. You can add more pumps any time from Settings."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-end mb-3">
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4 mr-1" /> {t("auth.addPump", "Add pump")}
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("auth.pumpName", "Name")}</TableHead>
                <TableHead>{t("auth.pumpCode", "Code")}</TableHead>
                <TableHead>{t("auth.pumpCity", "City")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pumps.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="font-mono">{p.code}</TableCell>
                  <TableCell>{p.city}</TableCell>
                </TableRow>
              ))}
              {pumps.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    {t("auth.noPumpsYet", "No pumps yet — add your first one.")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <div className="mt-6 flex justify-end">
            <Button
              disabled={pumps.length === 0}
              onClick={() => router.push("/dashboard")}
            >
              {t("auth.continueToDashboard", "Continue to Dashboard")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <PumpFormDialog
        open={adding}
        onOpenChange={setAdding}
        onDone={() => qc.invalidateQueries({ queryKey: ["setup-pumps"] })}
      />
    </div>
  );
}

function PumpFormDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const { t } = useT();
  const onError = (e: any) =>
    toast.error(e?.response?.data?.error || e?.message || t("settings.failed", "Failed"));
  const [form, setForm] = useState({
    name: "",
    code: "",
    address: "",
    city: "",
    state: "",
  });
  useEffect(() => {
    if (open) {
      setForm({ name: "", code: "", address: "", city: "", state: "" });
    }
  }, [open]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name || !form.code || !form.address || !form.city || !form.state) {
        throw new Error(t("settings.allFieldsRequired", "All fields are required"));
      }
      return (await api.post("/api/setup/pumps", form)).data;
    },
    onSuccess: (data) => {
      if (data.token) {
        const current = getAuthUser();
        if (current) {
          setAuth(data.token, {
            ...current,
            pumpId: data.pump.id,
            pumpName: data.pump.name,
          });
        }
      }
      toast.success(t("settings.pumpAdded", "Pump added"));
      onOpenChange(false);
      onDone();
    },
    onError,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("settings.addPump", "Add pump")}</DialogTitle>
          <DialogDescription>
            {t(
              "settings.pumpAddHelpFirst",
              "Basic details for this pump — tanks, nozzles and payment channels are configured after setup."
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label={t("settings.pumpName", "Pump name")}>
            <Input
              placeholder={t("settings.pumpNamePlaceholder", "e.g. Shree Hari Petrol Pump")}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label={t("settings.pumpCodeLabel", "Code (short, unique to this business)")}>
            <Input
              placeholder={t("settings.pumpCodePlaceholder", "e.g. SHP")}
              maxLength={10}
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            />
          </Field>
          <Field label={t("settings.address", "Address")}>
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("settings.city", "City")}>
              <Input
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </Field>
            <Field label={t("settings.state", "State")}>
              <Input
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
              />
            </Field>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? t("settings.adding", "Adding…") : t("settings.addPump", "Add pump")}
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

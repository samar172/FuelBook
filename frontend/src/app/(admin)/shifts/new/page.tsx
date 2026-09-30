"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

export default function NewShiftPage() {
  const router = useRouter();
  const { t } = useT();
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [shiftType, setShiftType] = useState<"DAY" | "NIGHT">("NIGHT");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      const { data } = await api.post("/api/shifts", { reportDate: date, shiftType });
      toast.success(t("shift.new.created", "Shift created. Opening balances carried forward."));
      router.push(`/shifts/${data.id}`);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || t("shift.new.failed", "Failed to create shift"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>{t("shift.new.title", "New Shift Report")}</CardTitle>
          <CardDescription>
            {t(
              "shift.new.desc",
              "Pick the date and shift. Opening readings, stock and cash will be carried forward automatically from the previous shift.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("common.date", "Date")}</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("shift.new.shift", "Shift")}</Label>
            <Select value={shiftType} onValueChange={(v) => setShiftType(v as "DAY" | "NIGHT")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="DAY">{t("shift.new.dayShift", "Day Shift")}</SelectItem>
                <SelectItem value="NIGHT">{t("shift.new.nightShift", "Night Shift")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={submit} disabled={loading} className="w-full">
            {loading ? t("shift.new.creating", "Creating…") : t("shift.new.create", "Create Shift")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

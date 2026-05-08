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

export default function NewShiftPage() {
  const router = useRouter();
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [shiftType, setShiftType] = useState<"DAY" | "NIGHT">("NIGHT");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      const { data } = await api.post("/api/shifts", { reportDate: date, shiftType });
      toast.success("Shift created. Opening balances carried forward.");
      router.push(`/shifts/${data.id}`);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "Failed to create shift");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>New Shift Report</CardTitle>
          <CardDescription>
            Pick the date and shift. Opening readings, stock and cash will be carried forward
            automatically from the previous shift.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Shift</Label>
            <Select value={shiftType} onValueChange={(v) => setShiftType(v as "DAY" | "NIGHT")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="DAY">Day Shift</SelectItem>
                <SelectItem value="NIGHT">Night Shift</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={submit} disabled={loading} className="w-full">
            {loading ? "Creating…" : "Create Shift"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

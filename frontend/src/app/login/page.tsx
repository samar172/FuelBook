"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, setAuth } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Fuel } from "lucide-react";
import { toast } from "sonner";

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("9000000001");
  const [pin, setPin] = useState("1234");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/api/auth/login", { phone, pin });
      setAuth(data.token, data.user);
      toast.success(`Welcome, ${data.user.name}`);
      router.push("/dashboard");
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto bg-primary text-primary-foreground rounded-full p-3 w-fit mb-2">
            <Fuel className="h-6 w-6" />
          </div>
          <CardTitle>FuelBook</CardTitle>
          <CardDescription>Petrol Pump Management — Owner / Manager Sign in</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="10-digit mobile number"
                inputMode="numeric"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pin">PIN</Label>
              <Input
                id="pin"
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="4-digit PIN"
                inputMode="numeric"
                required
              />
            </div>
            <Button className="w-full" disabled={loading} type="submit">
              {loading ? "Signing in…" : "Sign in"}
            </Button>
            <p className="text-xs text-muted-foreground text-center pt-2">
              Default: 9000000001 / 1234 (owner) — change after first login.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

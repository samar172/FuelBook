"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, setAuth } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Fuel } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { LanguageSwitch } from "@/components/language-switch";

export default function RegisterPage() {
  const router = useRouter();
  const { t } = useT();
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/api/auth/register", {
        name,
        businessName,
        phone,
        pin,
      });
      setAuth(data.token, data.user);
      toast.success(t("auth.welcome", "Welcome, {name}", { name: data.user.name }));
      router.push("/setup");
    } catch (e: any) {
      toast.error(e?.response?.data?.error || t("auth.registerFailed", "Registration failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <LanguageSwitch className="absolute right-4 top-4" />
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto bg-primary text-primary-foreground rounded-full p-3 w-fit mb-2">
            <Fuel className="h-6 w-6" />
          </div>
          <CardTitle>FuelBook</CardTitle>
          <CardDescription>{t("auth.registerTagline", "Register your business as the owner")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t("auth.yourName", "Your name")}</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("auth.yourNamePlaceholder", "Owner's full name")}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="businessName">{t("auth.businessName", "Business name")}</Label>
              <Input
                id="businessName"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder={t("auth.businessNamePlaceholder", "e.g. Shree Hari Petrol Pump Business")}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">{t("common.phone", "Phone")}</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t("auth.phonePlaceholder", "10-digit mobile number")}
                inputMode="numeric"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pin">{t("auth.pin", "PIN")}</Label>
              <Input
                id="pin"
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder={t("auth.pinPlaceholder", "4-digit PIN")}
                inputMode="numeric"
                required
              />
            </div>
            <Button className="w-full" disabled={loading} type="submit">
              {loading ? t("auth.creatingAccount", "Creating account…") : t("auth.createAccount", "Create business account")}
            </Button>
            <p className="text-sm text-center pt-2">
              {t("auth.haveAccount", "Already have an account?")}{" "}
              <Link href="/login" className="underline">
                {t("auth.signIn", "Sign in")}
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

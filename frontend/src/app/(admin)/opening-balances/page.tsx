"use client";
/**
 * Opening balances — the figures the business already had on the day it started
 * using FuelBook. A pump rarely starts on 1 April, so without this the balance
 * sheet begins at zero and understates everything the owner actually holds.
 *
 * The server does the accounting: it posts one balanced journal entry with
 * Owner's Capital as the balancing figure, and re-posting replaces the previous
 * entry rather than adding to it. This screen only collects the numbers and
 * shows a live preview of what they add up to.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getAuthUser } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatINR, formatLitres, FUEL_LABELS, litresToMl, paiseToRupees, rupeesToPaise } from "@/lib/utils";
import { apiError } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import { AlertTriangle, Landmark } from "lucide-react";

type Customer = { id: string; name: string; code: string | null };
type Tank = { id: string; name: string; fuelType: string; capacityMl: string };
type Product = { id: string; sku: string; name: string; unit: string; purchasePricePaise: string };
type BankAccount = { id: string; bankName: string; accountNoLast4: string; nickname: string | null };
type Employee = { id: string; name: string; code: string | null };

type FormResponse = {
  customers: Customer[];
  tanks: Tank[];
  products: Product[];
  bankAccounts: BankAccount[];
  employees: Employee[];
  suggestedAsOnDate: string;
  hasTraded: boolean;
  existing: null | {
    entryId: string;
    asOnDate: string;
    cashInHandPaise: string;
    supplierPayablePaise: string;
    customerDues: { customerId: string; amountPaise: string }[];
    fuelStock: { tankId: string; quantityMl: string; valuePaise: string }[];
    staffAdvances: { employeeId: string; amountPaise: string }[];
    staffShortages: { employeeId: string; amountPaise: string }[];
  };
};

type Totals = {
  totalAssetsPaise: string;
  totalLiabilitiesPaise: string;
  ownersCapitalPaise: string;
};

/** Rupee text field -> paise string, with "" meaning zero. */
const toPaise = (v: string) => (v.trim() === "" ? "0" : rupeesToPaise(v));
const rupeeValue = (paise?: string) =>
  paise && paise !== "0" ? String(paiseToRupees(paise)) : "";

export default function OpeningBalancesPage() {
  const { t } = useT();
  const qc = useQueryClient();
  const isOwner = getAuthUser()?.role === "OWNER";

  const { data, isLoading } = useQuery<FormResponse>({
    queryKey: ["opening-balances"],
    queryFn: async () => (await api.get("/api/ledger/opening-balances")).data,
  });

  const [asOnDate, setAsOnDate] = useState("");
  const [cash, setCash] = useState("");
  const [payable, setPayable] = useState("");
  const [bank, setBank] = useState<Record<string, string>>({});
  const [dues, setDues] = useState<Record<string, string>>({});
  const [fuelQty, setFuelQty] = useState<Record<string, string>>({});
  const [fuelValue, setFuelValue] = useState<Record<string, string>>({});
  const [prodQty, setProdQty] = useState<Record<string, string>>({});
  const [prodValue, setProdValue] = useState<Record<string, string>>({});
  const [advances, setAdvances] = useState<Record<string, string>>({});
  const [shortages, setShortages] = useState<Record<string, string>>({});

  // Seed the form from whatever is already posted, so figures are corrected
  // rather than retyped.
  useEffect(() => {
    if (!data) return;
    setAsOnDate(data.existing?.asOnDate ?? data.suggestedAsOnDate);
    setCash(rupeeValue(data.existing?.cashInHandPaise));
    setPayable(rupeeValue(data.existing?.supplierPayablePaise));
    const pick = <T extends { amountPaise: string }>(rows: T[] | undefined, key: (r: T) => string) =>
      Object.fromEntries((rows ?? []).map((r) => [key(r), rupeeValue(r.amountPaise)]));
    setDues(pick(data.existing?.customerDues, (r) => r.customerId));
    setAdvances(pick(data.existing?.staffAdvances, (r) => r.employeeId));
    setShortages(pick(data.existing?.staffShortages, (r) => r.employeeId));
    setFuelQty(
      Object.fromEntries(
        (data.existing?.fuelStock ?? []).map((f) => [f.tankId, String(Number(f.quantityMl) / 1000)])
      )
    );
    setFuelValue(
      Object.fromEntries(
        (data.existing?.fuelStock ?? []).map((f) => [f.tankId, rupeeValue(f.valuePaise)])
      )
    );
  }, [data]);

  const payload = useMemo(
    () => ({
      asOnDate,
      cashInHandPaise: toPaise(cash),
      supplierPayablePaise: toPaise(payable),
      bankBalances: Object.entries(bank)
        .filter(([, v]) => v.trim() !== "")
        .map(([bankAccountId, v]) => ({ bankAccountId, amountPaise: toPaise(v) })),
      customerDues: Object.entries(dues)
        .filter(([, v]) => v.trim() !== "")
        .map(([customerId, v]) => ({ customerId, amountPaise: toPaise(v) })),
      fuelStock: Object.keys({ ...fuelQty, ...fuelValue })
        .filter((id) => (fuelQty[id] ?? "").trim() !== "" || (fuelValue[id] ?? "").trim() !== "")
        .map((tankId) => ({
          tankId,
          quantityMl: (fuelQty[tankId] ?? "").trim() === "" ? "0" : litresToMl(fuelQty[tankId]),
          valuePaise: toPaise(fuelValue[tankId] ?? ""),
        })),
      productStock: Object.keys({ ...prodQty, ...prodValue })
        .filter((id) => (prodQty[id] ?? "").trim() !== "" || (prodValue[id] ?? "").trim() !== "")
        .map((productId) => ({
          productId,
          quantity: Number(prodQty[productId] ?? 0) || 0,
          valuePaise: toPaise(prodValue[productId] ?? ""),
        })),
      staffAdvances: Object.entries(advances)
        .filter(([, v]) => v.trim() !== "")
        .map(([employeeId, v]) => ({ employeeId, amountPaise: toPaise(v) })),
      staffShortages: Object.entries(shortages)
        .filter(([, v]) => v.trim() !== "")
        .map(([employeeId, v]) => ({ employeeId, amountPaise: toPaise(v) })),
    }),
    [asOnDate, cash, payable, bank, dues, fuelQty, fuelValue, prodQty, prodValue, advances, shortages]
  );

  // The server owns the arithmetic, so the preview cannot drift from what posts.
  const { data: totals } = useQuery<Totals>({
    queryKey: ["opening-preview", payload],
    queryFn: async () => (await api.post("/api/ledger/opening-balances/preview", payload)).data,
    enabled: Boolean(asOnDate),
  });

  const save = useMutation({
    mutationFn: async () => (await api.post("/api/ledger/opening-balances", payload)).data,
    onSuccess: () => {
      toast.success(t("opening.saved", "Opening balances posted"));
      qc.invalidateQueries({ queryKey: ["opening-balances"] });
      qc.invalidateQueries({ queryKey: ["ledger"] });
      qc.invalidateQueries({ queryKey: ["credit-customers"] });
    },
    onError: (e) => toast.error(apiError(e, t("common.failed", "Something went wrong"))),
  });

  if (isLoading || !data) {
    return <p className="text-sm text-muted-foreground">{t("common.loading", "Loading…")}</p>;
  }

  const money = (id: string, map: Record<string, string>, set: (m: Record<string, string>) => void) => (
    <Input
      type="number"
      step="0.01"
      inputMode="decimal"
      placeholder="0.00"
      className="max-w-[160px]"
      value={map[id] ?? ""}
      onChange={(e) => set({ ...map, [id]: e.target.value })}
    />
  );

  const capital = totals ? BigInt(totals.ownersCapitalPaise) : 0n;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("opening.title", "Opening Balances")}</h1>
        <p className="text-muted-foreground max-w-3xl">
          {t(
            "opening.subtitle",
            "What the business already had on the day you started using FuelBook. Most pumps start mid-year, so fill this in once and the books will be right from day one."
          )}
        </p>
      </div>

      {data.existing && (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {t(
            "opening.alreadyPosted",
            "Opening balances are already posted for {date}. Editing here replaces them — the old entry is reversed, nothing is counted twice.",
            { date: data.existing.asOnDate }
          )}
        </p>
      )}
      {data.hasTraded && !data.existing && (
        <p className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          {t(
            "opening.tradedWarning",
            "This pump has already recorded shifts. Opening balances still work, but enter them as on the day BEFORE your first shift so nothing is counted twice."
          )}
        </p>
      )}

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-4">
          <div>
            <Label className="text-xs">{t("opening.asOn", "As on")}</Label>
            <Input
              type="date"
              className="w-44"
              value={asOnDate}
              onChange={(e) => setAsOnDate(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {t("opening.asOnHelp", "The day before you start recording shifts here.")}
            </p>
          </div>
          <div>
            <Label className="text-xs">{t("opening.cash", "Cash in hand")}</Label>
            <Input
              type="number"
              step="0.01"
              inputMode="decimal"
              placeholder="0.00"
              className="w-44"
              value={cash}
              onChange={(e) => setCash(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {t("opening.cashHelp", "Notes and coins in the drawer and the office safe.")}
            </p>
          </div>
          <div>
            <Label className="text-xs">{t("opening.payable", "What you owe the oil company")}</Label>
            <Input
              type="number"
              step="0.01"
              inputMode="decimal"
              placeholder="0.00"
              className="w-44"
              value={payable}
              onChange={(e) => setPayable(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {t("opening.payableHelp", "Unpaid tanker bills on the day you start.")}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("opening.fuel", "Fuel already in your tanks")}</CardTitle>
          <CardDescription>
            {t(
              "opening.fuelHelp",
              "Litres in each tank and what that fuel cost you. This sets the cost basis, so your first sale shows a real profit instead of counting the fuel as free."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.tanks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("opening.fuelEmpty", "No tanks yet. Add them under Pump Setup.")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("opening.fuel", "Tank")}</TableHead>
                  <TableHead>{t("opening.litres", "Litres")}</TableHead>
                  <TableHead>{t("opening.value", "Value at cost")}</TableHead>
                  <TableHead className="text-right">{t("common.rate", "Rate")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.tanks.map((tank) => {
                  const litres = Number(fuelQty[tank.id] ?? 0);
                  const value = Number(fuelValue[tank.id] ?? 0);
                  const perLitre = litres > 0 && value > 0 ? value / litres : null;
                  return (
                    <TableRow key={tank.id}>
                      <TableCell>
                        <div className="font-medium">{tank.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {FUEL_LABELS[tank.fuelType] ?? tank.fuelType} ·{" "}
                          {formatLitres(tank.capacityMl, 0)} L
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          inputMode="decimal"
                          placeholder="0"
                          className="max-w-[140px]"
                          value={fuelQty[tank.id] ?? ""}
                          onChange={(e) => setFuelQty({ ...fuelQty, [tank.id]: e.target.value })}
                        />
                      </TableCell>
                      <TableCell>{money(tank.id, fuelValue, setFuelValue)}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {perLitre
                          ? t("opening.perLitre", "{rate}/L", {
                              rate: formatINR(Math.round(perLitre * 100)),
                            })
                          : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("opening.customers", "What customers already owe you")}
          </CardTitle>
          <CardDescription>
            {t(
              "opening.customersHelp",
              "Udhaar outstanding on the day you start. Leave a customer blank if they owe nothing."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.customers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("opening.customersEmpty", "No credit customers yet.")}
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.customers.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                  <span className="min-w-0 truncate text-sm">
                    {c.name}
                    {c.code && <span className="text-xs text-muted-foreground"> · {c.code}</span>}
                  </span>
                  {money(c.id, dues, setDues)}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {data.bankAccounts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("opening.bank", "Bank balances")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {data.bankAccounts.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                <span className="text-sm">
                  <Landmark className="mr-1 inline h-3.5 w-3.5 text-muted-foreground" />
                  {b.nickname || b.bankName} ••{b.accountNoLast4}
                </span>
                {money(b.id, bank, setBank)}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {data.products.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("opening.products", "Lubes and other stock")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.name", "Name")}</TableHead>
                  <TableHead>{t("opening.quantity", "Quantity")}</TableHead>
                  <TableHead>{t("opening.value", "Value at cost")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.products.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.sku}</div>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        inputMode="numeric"
                        placeholder="0"
                        className="max-w-[120px]"
                        value={prodQty[p.id] ?? ""}
                        onChange={(e) => setProdQty({ ...prodQty, [p.id]: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>{money(p.id, prodValue, setProdValue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {data.employees.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t("opening.staffAdvances", "Advances given to staff")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.employees.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm">{e.name}</span>
                  {money(e.id, advances, setAdvances)}
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t("opening.staffShortages", "Cash shortages staff still owe")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.employees.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm">{e.name}</span>
                  {money(e.id, shortages, setShortages)}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("opening.summary", "Summary")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">
                {t("opening.totalAssets", "What the business owns")}
              </div>
              <div className="text-lg font-semibold">
                {formatINR(totals?.totalAssetsPaise ?? 0)}
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">
                {t("opening.totalLiabilities", "What the business owes")}
              </div>
              <div className="text-lg font-semibold">
                {formatINR(totals?.totalLiabilitiesPaise ?? 0)}
              </div>
            </div>
            <div className="rounded-md border p-3 bg-slate-50">
              <div className="text-xs text-muted-foreground">
                {t("opening.capital", "Your capital in the business")}
              </div>
              <div className="text-lg font-semibold">{formatINR(totals?.ownersCapitalPaise ?? 0)}</div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t(
              "opening.capitalHelp",
              "This is the balancing figure — simply what you already had in the business. It is not something you type in."
            )}
          </p>
          {capital < 0n && (
            <p className="text-xs text-amber-800">
              {t(
                "opening.capitalNegative",
                "This is negative, which means the pump started owing more than it held. Unusual, but allowed."
              )}
            </p>
          )}
          <Separator />
          <div className="flex items-center gap-3">
            <Button
              onClick={() => save.mutate()}
              disabled={!isOwner || save.isPending || !asOnDate}
            >
              {save.isPending ? t("common.saving", "Saving…") : t("opening.save", "Post opening balances")}
            </Button>
            {!isOwner && (
              <span className="text-xs text-muted-foreground">
                {t("opening.ownerOnly", "Only the owner can post opening balances.")}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

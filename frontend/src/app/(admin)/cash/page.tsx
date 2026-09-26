"use client";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PositionSection } from "./_components/position";
import { MovementsSection } from "./_components/movements";
import { CashCountSection } from "./_components/cash-count";
import { DepositsSection } from "./_components/deposits";
import { SettlementsSection } from "./_components/settlements";
import { BankSection } from "./_components/bank";

const TABS = [
  { value: "position", label: "Cash position" },
  { value: "trail", label: "Movements" },
  { value: "count", label: "Note count" },
  { value: "deposits", label: "Deposits" },
  { value: "settlement", label: "Settlement" },
  { value: "bank", label: "Bank" },
] as const;

export default function CashPage() {
  const [tab, setTab] = useState<string>("position");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Cash &amp; Bank</h1>
        <p className="text-muted-foreground text-sm">
          The cashier collected the cash — this is where it is now, where it went, and what the bank
          actually credited.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        {/* Scrolls sideways on a phone: movements get recorded standing at the pump. */}
        <div className="-mx-2 px-2 overflow-x-auto">
          <TabsList className="w-max">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="position">
          <PositionSection />
        </TabsContent>
        <TabsContent value="trail">
          <MovementsSection />
        </TabsContent>
        <TabsContent value="count">
          <CashCountSection />
        </TabsContent>
        <TabsContent value="deposits">
          <DepositsSection />
        </TabsContent>
        <TabsContent value="settlement">
          <SettlementsSection />
        </TabsContent>
        <TabsContent value="bank">
          <BankSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}

"use client";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DipLogTab } from "./DipLogTab";
import { MeasureTestsTab } from "./MeasureTestsTab";
import { VarianceTab } from "./VarianceTab";
import { DecantationTab } from "./DecantationTab";
import { DipChartTab } from "./DipChartTab";

// Wet stock control: the statutory side of a pump — what the dip says, what the
// meters say, and the paper trail that reconciles the two.
export default function WetStockPage() {
  // The dip log and the nozzle tests belong to the same shift, so the selection
  // is held here and shared between those two tabs.
  const [shiftId, setShiftId] = useState("");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Wet stock</h1>
        <p className="text-sm text-muted-foreground">
          Dips, density, Weights &amp; Measures tests, wet-stock variance and tanker decantation.
        </p>
      </div>

      <Tabs defaultValue="dips">
        <TabsList className="flex w-full flex-wrap justify-start gap-1 sm:w-auto">
          <TabsTrigger value="dips">Dip log</TabsTrigger>
          <TabsTrigger value="tests">W&amp;M tests</TabsTrigger>
          <TabsTrigger value="variance">Variance</TabsTrigger>
          <TabsTrigger value="decant">Decantation</TabsTrigger>
          <TabsTrigger value="charts">Dip charts</TabsTrigger>
        </TabsList>

        <TabsContent value="dips">
          <DipLogTab shiftId={shiftId} setShiftId={setShiftId} />
        </TabsContent>
        <TabsContent value="tests">
          <MeasureTestsTab shiftId={shiftId} setShiftId={setShiftId} />
        </TabsContent>
        <TabsContent value="variance">
          <VarianceTab />
        </TabsContent>
        <TabsContent value="decant">
          <DecantationTab />
        </TabsContent>
        <TabsContent value="charts">
          <DipChartTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

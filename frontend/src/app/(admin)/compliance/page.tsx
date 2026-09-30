"use client";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LicenceRegister from "./LicenceRegister";
import AttendanceSection from "./AttendanceSection";
import AdvancesSection from "./AdvancesSection";

export default function CompliancePage() {
  const [tab, setTab] = useState("licences");
  const { t } = useT();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">
          {t("compliance.title", "Compliance & Staff")}
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base">
          {t(
            "compliance.subtitle",
            "Licence expiries, daily attendance and staff advances — the three things that cost you a shutdown or an argument at month end."
          )}
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full sm:w-auto flex">
          <TabsTrigger value="licences" className="flex-1 sm:flex-none">
            {t("compliance.tab.licences", "Licences")}
          </TabsTrigger>
          <TabsTrigger value="attendance" className="flex-1 sm:flex-none">
            {t("compliance.tab.attendance", "Attendance")}
          </TabsTrigger>
          <TabsTrigger value="advances" className="flex-1 sm:flex-none">
            {t("compliance.tab.advances", "Advances")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="licences">
          <LicenceRegister />
        </TabsContent>
        <TabsContent value="attendance">
          <AttendanceSection />
        </TabsContent>
        <TabsContent value="advances">
          <AdvancesSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}

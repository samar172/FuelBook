"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { apiError } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle } from "lucide-react";
import SetupChecklist from "./SetupChecklist";
import WrittenGuide from "./WrittenGuide";
import FirstShiftWalkthrough from "./FirstShiftWalkthrough";
import type { OnboardingResponse } from "./types";
import { useT } from "@/lib/i18n";

export default function GuidePage() {
  const { t } = useT();
  const [tab, setTab] = useState("checklist");

  const onboardingQ = useQuery<OnboardingResponse>({
    queryKey: ["setup-onboarding"],
    queryFn: async () => (await api.get("/api/setup/onboarding")).data,
  });

  useEffect(() => {
    if (onboardingQ.error) {
      toast.error(apiError(onboardingQ.error, t("guide.progressLoadFailed", "Could not load your setup progress")));
    }
  }, [onboardingQ.error, t]);

  const data = onboardingQ.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">{t("guide.title", "Setup Guide")}</h1>
        <p className="text-muted-foreground text-sm sm:text-base">
          {t(
            "guide.subtitle",
            "How to set up the pump and run your first shift, start to finish — with a live check of what is already done here."
          )}
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full sm:w-auto flex">
          <TabsTrigger value="checklist" className="flex-1 sm:flex-none">
            {t("guide.tabProgress", "Your progress")}
          </TabsTrigger>
          <TabsTrigger value="guide" className="flex-1 sm:flex-none">
            {t("guide.tabGuide", "The guide")}
          </TabsTrigger>
          <TabsTrigger value="walkthrough" className="flex-1 sm:flex-none">
            {t("guide.tabFirstShift", "First shift")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="checklist" className="space-y-4">
          {onboardingQ.isLoading ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                {t("guide.checking", "Checking what is already set up on this pump…")}
              </CardContent>
            </Card>
          ) : onboardingQ.error ? (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="p-6 space-y-2">
                <div className="flex items-center gap-2 font-medium text-amber-900">
                  <AlertTriangle className="h-4 w-4" aria-hidden />
                  {t("guide.progressReadFailed", "Could not read your setup progress")}
                </div>
                <p className="text-sm text-amber-900/90">
                  {apiError(onboardingQ.error, t("guide.progressLoadFailed", "Could not load your setup progress"))}
                </p>
                <p className="text-sm text-amber-900/80">
                  {t("guide.tabsStillWork", "The written guide and the first-shift walkthrough still work — use the tabs above.")}
                </p>
              </CardContent>
            </Card>
          ) : data ? (
            <SetupChecklist data={data} />
          ) : null}
        </TabsContent>

        <TabsContent value="guide">
          <WrittenGuide />
        </TabsContent>

        <TabsContent value="walkthrough">
          <FirstShiftWalkthrough />
        </TabsContent>
      </Tabs>
    </div>
  );
}

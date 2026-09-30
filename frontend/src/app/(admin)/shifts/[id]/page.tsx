"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, downloadFile } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { useDateLocale } from "@/lib/i18n/core";
import { Lock, LockOpen, Send, AlertTriangle, FileSpreadsheet } from "lucide-react";

import { NozzleReadingsTab } from "@/components/shift/NozzleReadingsTab";
import { EmployeesTab } from "@/components/shift/EmployeesTab";
import { StockTab } from "@/components/shift/StockTab";
import { CollectionsTab } from "@/components/shift/CollectionsTab";
import { OutstandingTab } from "@/components/shift/OutstandingTab";
import { ExpensesTab } from "@/components/shift/ExpensesTab";
import { CreditSalesTab } from "@/components/shift/CreditSalesTab";
import { ReconciliationTab } from "@/components/shift/ReconciliationTab";
import { TimelineTab } from "@/components/shift/TimelineTab";
import { CashReconciliationTab } from "@/components/shift/CashReconciliationTab";

export default function ShiftEntryPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { t } = useT();
  const locale = useDateLocale();
  const qc = useQueryClient();

  const { data: shift, isLoading } = useQuery({
    queryKey: ["shift", id],
    queryFn: async () => (await api.get(`/api/shifts/${id}`)).data,
  });

  const submit = useMutation({
    mutationFn: async () => (await api.post(`/api/shifts/${id}/submit`)).data,
    onSuccess: () => {
      toast.success(t("shift.detail.submitted", "Shift submitted"));
      qc.invalidateQueries({ queryKey: ["shift", id] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || t("shift.detail.failed", "Failed")),
  });

  const lock = useMutation({
    mutationFn: async () => (await api.post(`/api/shifts/${id}/lock`)).data,
    onSuccess: () => {
      toast.success(t("shift.detail.locked", "Shift locked. Customer balances updated."));
      qc.invalidateQueries({ queryKey: ["shift", id] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || t("shift.detail.failed", "Failed")),
  });

  const unlock = useMutation({
    mutationFn: async () => (await api.post(`/api/shifts/${id}/unlock`)).data,
    onSuccess: () => {
      toast.success(t("shift.detail.unlocked", "Shift unlocked — back to Submitted, editable again."));
      qc.invalidateQueries({ queryKey: ["shift", id] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || t("shift.detail.failed", "Failed")),
  });

  if (isLoading) return <div className="text-muted-foreground">{t("common.loading", "Loading…")}</div>;
  if (!shift) return null;

  const isLocked = shift.status === "LOCKED";
  const isSubmitted = shift.status === "SUBMITTED";

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground flex-wrap">
            <span>{format(new Date(shift.reportDate), "EEE, dd MMM yyyy", { locale })}</span>
            <Badge variant={shift.shiftType === "DAY" ? "default" : "secondary"}>{t(`shift.type.${shift.shiftType}`, shift.shiftType)}</Badge>
            <Badge variant="outline">{t(`shift.status.${shift.status}`, shift.status)}</Badge>
            {shift.discrepancyFlag && (
              <Badge variant="warning" className="gap-1">
                <AlertTriangle className="h-3 w-3" /> {t("shift.detail.discrepancy", "Discrepancy")}
              </Badge>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold mt-1">{t("shift.detail.title", "Shift Entry")}</h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            {t("shift.detail.opening", "Opening")} {formatINR(shift.openingCashPaise)} → {t("shift.detail.closing", "Closing")}{" "}
            <span className="font-semibold text-foreground">{formatINR(shift.closingCashPaise)}</span>
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              try {
                const date = format(new Date(shift.reportDate), "yyyy-MM-dd");
                await downloadFile(
                  `/api/exports/shifts/${id}.xlsx`,
                  `shift-${date}-${shift.shiftType}.xlsx`,
                );
              } catch (e: any) {
                toast.error(e?.message || t("shift.detail.exportFailed", "Export failed"));
              }
            }}
          >
            <FileSpreadsheet className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{t("shift.detail.excel", "Excel")}</span>
          </Button>
          {!isSubmitted && !isLocked && (
            <Button size="sm" onClick={() => submit.mutate()} disabled={submit.isPending}>
              <Send className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">{t("shift.detail.submit", "Submit")}</span>
              <span className="sm:hidden">{t("shift.detail.submit", "Submit")}</span>
            </Button>
          )}
          {!isLocked && (
            <Button size="sm" variant="outline" onClick={() => lock.mutate()} disabled={lock.isPending}>
              <Lock className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">{t("shift.detail.lock", "Lock")}</span>
              <span className="sm:hidden">{t("shift.detail.lock", "Lock")}</span>
            </Button>
          )}
          {isLocked && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (
                  window.confirm(
                    t(
                      "shift.detail.unlockConfirm",
                      "Unlock this shift? It goes back to Submitted and becomes editable again. Credit customer balances posted at lock time will be reversed and re-applied when it's locked again.",
                    ),
                  )
                ) {
                  unlock.mutate();
                }
              }}
              disabled={unlock.isPending}
            >
              <LockOpen className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">{t("shift.detail.unlock", "Unlock")}</span>
              <span className="sm:hidden">{t("shift.detail.unlock", "Unlock")}</span>
            </Button>
          )}
        </div>
      </div>

      <SummaryStrip shift={shift} />

      <Tabs defaultValue="nozzles" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="timeline">{t("shift.tabs.timeline", "Timeline")}</TabsTrigger>
          <TabsTrigger value="nozzles">{t("shift.tabs.nozzles", "Nozzle Readings")}</TabsTrigger>
          <TabsTrigger value="employees">{t("shift.tabs.employees", "Employees")}</TabsTrigger>
          <TabsTrigger value="stock">{t("shift.tabs.stock", "Stock")}</TabsTrigger>
          <TabsTrigger value="collections">{t("shift.tabs.collections", "Collections")}</TabsTrigger>
          <TabsTrigger value="credit-sales">{t("shift.tabs.creditSales", "Credit Sales")}</TabsTrigger>
          <TabsTrigger value="outstanding">{t("shift.tabs.outstanding", "Outstanding Received")}</TabsTrigger>
          <TabsTrigger value="expenses">{t("shift.tabs.expenses", "Expenses")}</TabsTrigger>
          <TabsTrigger value="cash-handover">{t("shift.tabs.cashHandover", "Cash Handover")}</TabsTrigger>
          <TabsTrigger value="reconciliation">{t("shift.tabs.reconciliation", "Reconciliation")}</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline">
          <TimelineTab shiftId={id} />
        </TabsContent>
        <TabsContent value="nozzles">
          <NozzleReadingsTab shift={shift} disabled={isLocked} />
        </TabsContent>
        <TabsContent value="employees">
          <EmployeesTab shift={shift} disabled={isLocked} />
        </TabsContent>
        <TabsContent value="stock">
          <StockTab shift={shift} disabled={isLocked} />
        </TabsContent>
        <TabsContent value="collections">
          <CollectionsTab shift={shift} disabled={isLocked} />
        </TabsContent>
        <TabsContent value="credit-sales">
          <CreditSalesTab shift={shift} disabled={isLocked} />
        </TabsContent>
        <TabsContent value="outstanding">
          <OutstandingTab shift={shift} disabled={isLocked} />
        </TabsContent>
        <TabsContent value="expenses">
          <ExpensesTab shift={shift} disabled={isLocked} />
        </TabsContent>
        <TabsContent value="cash-handover">
          <CashReconciliationTab shift={shift} disabled={isLocked} />
        </TabsContent>
        <TabsContent value="reconciliation">
          <ReconciliationTab shift={shift} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryStrip({ shift }: { shift: any }) {
  const { t } = useT();
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <Stat label={t("shift.detail.statTotalSales", "Total Sales")} value={formatINR(shift.totalSalesPaise)} />
      <Stat label={t("shift.detail.statCreditIssued", "Credit Issued")} value={formatINR(shift.totalCreditIssuedPaise)} />
      <Stat label={t("shift.detail.statOutstandingRecv", "Outstanding Recv'd")} value={formatINR(shift.totalOutstandingReceivedPaise)} />
      <Stat label={t("shift.detail.statCollections", "Collections")} value={formatINR(shift.totalCollectionsPaise)} />
      <Stat label={t("shift.detail.statExpenses", "Expenses")} value={formatINR(shift.totalExpensesPaise)} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-lg font-semibold mt-0.5">{value}</div>
      </CardContent>
    </Card>
  );
}

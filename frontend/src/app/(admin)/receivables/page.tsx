"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, can } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatINR, rupeesToPaise } from "@/lib/utils";
import { apiError, type CreditCustomer } from "@/lib/types";
import { format, parseISO } from "date-fns";
import type { Locale } from "date-fns";
import { useT } from "@/lib/i18n";
import { useDateLocale } from "@/lib/i18n/core";
import { toast } from "sonner";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ClipboardCopy,
  FileText,
  Plus,
  Send,
} from "lucide-react";

const ALL = "__all__";

// Ageing here is by DUE DATE (how late the customer is against agreed terms) —
// the /reports customer-aging table ages by sale date. The two are meant to differ.
const BUCKETS = ["notYetDue", "d1_30", "d31_60", "d61_90", "d90_plus"] as const;
type Bucket = (typeof BUCKETS)[number];
const BUCKET_LABELS: Record<Bucket, string> = {
  notYetDue: "Not yet due",
  d1_30: "1–30 days late",
  d31_60: "31–60 days late",
  d61_90: "61–90 days late",
  d90_plus: "90+ days late",
};

type OldestUnpaid = {
  statementId: string | null;
  label: string;
  dueDate: string;
  daysPastDue: number;
};

type AgeingRow = {
  customerId: string;
  name: string;
  code: string | null;
  phone: string | null;
  contactPerson: string | null;
  paymentTermsDays: number;
  currentBalancePaise: string;
  openPaise: string;
  unbilledPaise: string;
  overduePaise: string;
  buckets: Record<Bucket, string>;
  oldestUnpaid: OldestUnpaid | null;
  daysPastDue: number;
  creditLimitPaise: string;
  headroomPaise: string;
  overLimit: boolean;
  statementCount: number;
};

type AgeingResponse = {
  asOf: string;
  summary: {
    buckets: Record<Bucket, string>;
    customerCount: number;
    overdueCustomers: number;
    overLimitCustomers: number;
    totalOutstandingPaise: string;
    totalOverduePaise: string;
  };
  customers: AgeingRow[];
};

type StatementRow = {
  id: string;
  statementNo: string;
  customerId: string;
  periodFrom: string;
  periodTo: string;
  dueDate: string;
  openingBalancePaise: string;
  salesPaise: string;
  receiptsPaise: string;
  closingBalancePaise: string;
  status: string;
  sentAt: string | null;
  sentVia: string | null;
  customer: { id: string; name: string; code: string | null; phone: string | null };
  derived: {
    status: string;
    paidAgainstPaise: string;
    unpaidPaise: string;
    isOverdue: boolean;
    daysPastDue: number;
  };
};

type StatementsResponse = {
  statements: StatementRow[];
  totals: {
    count: number;
    closingBalancePaise: string;
    unpaidPaise: string;
    overdueCount: number;
  };
};

type Instrument = {
  id: string;
  customerId: string;
  kind: string;
  amountPaise: string;
  receivedOn: string;
  chequeNo: string | null;
  chequeDate: string | null;
  bankName: string | null;
  utrNo: string | null;
  status: string;
  clearedOn: string | null;
  bouncedOn: string | null;
  bounceReason: string | null;
  bounceChargePaise: string | null;
  notes: string | null;
  customer: { id: string; name: string; code: string | null; phone: string | null };
};

type InstrumentsResponse = {
  instruments: Instrument[];
  totals: {
    count: number;
    pendingPaise: string;
    clearedPaise: string;
    bouncedPaise: string;
    pendingCount: number;
    bouncedCount: number;
  };
};

type Reminder = {
  customerId: string;
  name: string;
  code: string | null;
  phone: string | null;
  hasPhone: boolean;
  balancePaise: string;
  overduePaise: string;
  daysPastDue: number;
  oldestUnpaid: OldestUnpaid | null;
  overLimit: boolean;
  message: string;
};

type RemindersResponse = {
  asOf: string;
  pumpName: string;
  count: number;
  withoutPhone: number;
  totalOverduePaise: string;
  reminders: Reminder[];
};

const INSTRUMENT_KINDS = ["CHEQUE", "RTGS", "NEFT", "IMPS", "UPI", "CASH", "CARD", "OTHER"];
const STATEMENT_STATUSES = ["DRAFT", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE"];
const SENT_VIA = ["WhatsApp", "Email", "Printed", "Hand delivered", "SMS"];

const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtDay = (iso: string | null | undefined, locale: Locale) =>
  iso ? format(parseISO(iso), "dd MMM yyyy", { locale }) : "—";

const statusVariant = (
  status: string,
): "default" | "secondary" | "success" | "warning" | "destructive" | "outline" => {
  switch (status) {
    case "PAID":
    case "CLEARED":
      return "success";
    case "OVERDUE":
    case "BOUNCED":
      return "destructive";
    case "PARTIALLY_PAID":
    case "PENDING":
      return "warning";
    case "SENT":
      return "default";
    default:
      return "secondary";
  }
};

const copy = async (
  text: string,
  what: string,
  t: (key: string, fallback?: string, vars?: Record<string, string | number>) => string,
) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(t("receivables.copied", "{what} copied — paste it into WhatsApp or SMS", { what }));
  } catch {
    toast.error(t("receivables.copyFailed", "Could not copy. Select the text and copy it manually."));
  }
};

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "danger" | "warn";
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={`text-xl sm:text-2xl font-bold tabular-nums ${
            tone === "danger" ? "text-destructive" : tone === "warn" ? "text-amber-600" : ""
          }`}
        >
          {value}
        </p>
        {hint ? <p className="text-xs text-muted-foreground mt-1">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export default function ReceivablesPage() {
  const { t } = useT();
  const locale = useDateLocale();
  const day = (iso: string | null | undefined) => fmtDay(iso, locale);
  const qc = useQueryClient();
  const canManage = can("canManageCreditCustomers");
  const [tab, setTab] = useState("ageing");

  // ---- shared: customer list for the pickers ------------------------------
  const customersQ = useQuery<CreditCustomer[]>({
    queryKey: ["credit-customers"],
    queryFn: async () => (await api.get("/api/credit/customers")).data,
  });
  const customers = customersQ.data || [];
  const customerLabel = (c: CreditCustomer) => (c.code ? `${c.name} (${c.code})` : c.name);

  // ---- ageing -------------------------------------------------------------
  const [asOf, setAsOf] = useState(todayStr());
  const ageingQ = useQuery<AgeingResponse>({
    queryKey: ["cl-ageing", asOf],
    queryFn: async () =>
      (await api.get(`/api/credit-lifecycle/ageing?asOf=${asOf}`)).data,
  });

  // ---- statements ---------------------------------------------------------
  const [stFilters, setStFilters] = useState({ customerId: ALL, status: ALL, overdueOnly: false });
  const stQs = useMemo(() => {
    const p = new URLSearchParams();
    if (stFilters.customerId !== ALL) p.set("customerId", stFilters.customerId);
    if (stFilters.status !== ALL) p.set("status", stFilters.status);
    if (stFilters.overdueOnly) p.set("overdueOnly", "true");
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [stFilters]);
  const statementsQ = useQuery<StatementsResponse>({
    queryKey: ["cl-statements", stQs],
    queryFn: async () => (await api.get(`/api/credit-lifecycle/statements${stQs}`)).data,
  });

  const [genOpen, setGenOpen] = useState(false);
  const [gen, setGen] = useState({ customerId: "", periodFrom: "", periodTo: "" });
  const generate = useMutation({
    mutationFn: async () =>
      (
        await api.post("/api/credit-lifecycle/statements/generate", {
          customerId: gen.customerId,
          periodFrom: gen.periodFrom,
          periodTo: gen.periodTo,
        })
      ).data as StatementRow,
    onSuccess: (s) => {
      toast.success(t("receivables.statementGenerated", "Statement {no} generated", { no: s.statementNo }));
      setGenOpen(false);
      setGen({ customerId: "", periodFrom: "", periodTo: "" });
      qc.invalidateQueries({ queryKey: ["cl-statements"] });
      qc.invalidateQueries({ queryKey: ["cl-ageing"] });
    },
    onError: (e) => toast.error(apiError(e, t("receivables.generateFailed", "Could not generate the statement"))),
  });

  const [sendFor, setSendFor] = useState<StatementRow | null>(null);
  const [sentVia, setSentVia] = useState("WhatsApp");
  const markSent = useMutation({
    mutationFn: async (vars: { id: string; sentVia: string }) =>
      (
        await api.patch(`/api/credit-lifecycle/statements/${vars.id}`, {
          status: "SENT",
          sentVia: vars.sentVia,
        })
      ).data,
    onSuccess: () => {
      toast.success(t("receivables.markedSent", "Marked as sent"));
      setSendFor(null);
      qc.invalidateQueries({ queryKey: ["cl-statements"] });
    },
    onError: (e) => toast.error(apiError(e, t("receivables.updateStatementFailed", "Could not update the statement"))),
  });

  // ---- instruments --------------------------------------------------------
  const [instStatus, setInstStatus] = useState("PENDING");
  const [dueBefore, setDueBefore] = useState("");
  const [instCustomer, setInstCustomer] = useState(ALL);
  const instQs = useMemo(() => {
    const p = new URLSearchParams();
    if (instStatus !== ALL) p.set("status", instStatus);
    if (instCustomer !== ALL) p.set("customerId", instCustomer);
    if (dueBefore) p.set("dueBefore", dueBefore);
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [instStatus, instCustomer, dueBefore]);
  const instrumentsQ = useQuery<InstrumentsResponse>({
    queryKey: ["cl-instruments", instQs],
    queryFn: async () => (await api.get(`/api/credit-lifecycle/instruments${instQs}`)).data,
  });
  const bouncedQ = useQuery<InstrumentsResponse>({
    queryKey: ["cl-instruments", "bounced"],
    queryFn: async () =>
      (await api.get("/api/credit-lifecycle/instruments?status=BOUNCED")).data,
  });

  const emptyInst = {
    customerId: "",
    kind: "CHEQUE",
    amount: "",
    receivedOn: todayStr(),
    chequeNo: "",
    chequeDate: "",
    bankName: "",
    utrNo: "",
    notes: "",
  };
  const [instOpen, setInstOpen] = useState(false);
  const [newInst, setNewInst] = useState(emptyInst);
  const cashWarning =
    newInst.kind === "CASH" &&
    newInst.amount !== "" &&
    !Number.isNaN(Number(newInst.amount)) &&
    Number(newInst.amount) >= 200000;

  const createInstrument = useMutation({
    mutationFn: async () =>
      (
        await api.post("/api/credit-lifecycle/instruments", {
          customerId: newInst.customerId,
          kind: newInst.kind,
          amountPaise: rupeesToPaise(newInst.amount || "0"),
          receivedOn: newInst.receivedOn,
          chequeNo: newInst.chequeNo || undefined,
          chequeDate: newInst.chequeDate || undefined,
          bankName: newInst.bankName || undefined,
          utrNo: newInst.utrNo || undefined,
          notes: newInst.notes || undefined,
        })
      ).data as Instrument & { warnings: string[] },
    onSuccess: (data) => {
      toast.success(t("receivables.recordedInRegister", "Recorded in the register"));
      for (const w of data.warnings || []) toast.warning(w, { duration: 15000 });
      setInstOpen(false);
      setNewInst(emptyInst);
      qc.invalidateQueries({ queryKey: ["cl-instruments"] });
    },
    onError: (e) => toast.error(apiError(e, t("receivables.recordPaymentFailed", "Could not record the payment"))),
  });

  const patchInstrument = useMutation({
    mutationFn: async (vars: { id: string; body: Record<string, unknown> }) =>
      (await api.patch(`/api/credit-lifecycle/instruments/${vars.id}`, vars.body)).data,
    onSuccess: (data: { changed?: boolean; message?: string; status?: string }) => {
      if (data.changed === false) toast.info(data.message || t("receivables.nothingChanged", "Nothing changed"));
      else if (data.status === "BOUNCED")
        toast.success(t("receivables.bounceRecorded", "Bounce recorded — the amount is back on the customer's balance"));
      else toast.success(t("receivables.updated", "Updated"));
      setBounceFor(null);
      qc.invalidateQueries({ queryKey: ["cl-instruments"] });
      qc.invalidateQueries({ queryKey: ["cl-ageing"] });
      qc.invalidateQueries({ queryKey: ["credit-customers"] });
    },
    onError: (e) => toast.error(apiError(e, t("receivables.updateInstrumentFailed", "Could not update the instrument"))),
  });

  const [bounceFor, setBounceFor] = useState<Instrument | null>(null);
  const [bounce, setBounce] = useState({ reason: "", charge: "", bouncedOn: todayStr() });

  // ---- reminders ----------------------------------------------------------
  const [remOverdueOnly, setRemOverdueOnly] = useState(true);
  const remindersQ = useQuery<RemindersResponse>({
    queryKey: ["cl-reminders", remOverdueOnly, asOf],
    queryFn: async () =>
      (
        await api.get(
          `/api/credit-lifecycle/reminders?overdueOnly=${remOverdueOnly}&asOf=${asOf}`,
        )
      ).data,
  });

  const ageing = ageingQ.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">{t("receivables.title", "Receivables")}</h1>
        <p className="text-muted-foreground text-sm sm:text-base">
          {t("receivables.subtitle", "Monthly statements, cheque tracking, ageing by due date and payment reminders")}
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex w-full sm:w-auto">
          <TabsTrigger value="ageing">{t("receivables.tab.ageing", "Ageing")}</TabsTrigger>
          <TabsTrigger value="statements">{t("receivables.tab.statements", "Statements")}</TabsTrigger>
          <TabsTrigger value="cheques">{t("receivables.tab.cheques", "Cheques")}</TabsTrigger>
          <TabsTrigger value="reminders">{t("receivables.tab.reminders", "Reminders")}</TabsTrigger>
        </TabsList>

        {/* ===================== AGEING ===================== */}
        <TabsContent value="ageing" className="space-y-4 mt-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label>{t("receivables.asOn", "As on")}</Label>
              <Input
                type="date"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value || todayStr())}
                className="w-[170px]"
              />
            </div>
            <p className="text-xs text-muted-foreground max-w-md">
              {t("receivables.ageingNote", "Ageing is counted from each bill's due date. The ageing table in Reports counts from the sale date, so the two will not match — both are correct.")}
            </p>
          </div>

          {ageingQ.isLoading ? (
            <p className="text-sm text-muted-foreground">{t("receivables.loadingAgeing", "Loading ageing…")}</p>
          ) : ageingQ.error ? (
            <p className="text-sm text-destructive">{apiError(ageingQ.error, t("receivables.loadAgeingFailed", "Could not load ageing"))}</p>
          ) : !ageing || ageing.customers.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                {t("receivables.noOutstanding", "No credit outstanding. Nothing to chase.")}
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Stat
                  label={t("receivables.totalOutstanding", "Total outstanding")}
                  value={formatINR(ageing.summary.totalOutstandingPaise)}
                  hint={t("receivables.customersCount", "{n} customers", { n: ageing.summary.customerCount })}
                />
                <Stat
                  label={t("receivables.pastDueDate", "Past due date")}
                  value={formatINR(ageing.summary.totalOverduePaise)}
                  tone="danger"
                  hint={t("receivables.customersLate", "{n} customers late", { n: ageing.summary.overdueCustomers })}
                />
                <Stat
                  label={t("receivables.overLimit", "Over credit limit")}
                  value={String(ageing.summary.overLimitCustomers)}
                  tone={ageing.summary.overLimitCustomers > 0 ? "warn" : undefined}
                  hint={t("receivables.overLimitHint", "Customers above their sanctioned limit")}
                />
                <Stat
                  label={t("receivables.notYetDue", "Not yet due")}
                  value={formatINR(ageing.summary.buckets.notYetDue)}
                  hint={t("receivables.withinTermsHint", "Within agreed credit terms")}
                />
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {BUCKETS.map((b) => (
                  <Card key={b}>
                    <CardContent className="pt-5">
                      <p className="text-xs text-muted-foreground">{t(`receivables.bucket.${b}`, BUCKET_LABELS[b])}</p>
                      <p className="text-lg font-semibold tabular-nums">
                        {formatINR(ageing.summary.buckets[b])}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>{t("receivables.customerAgeing", "Customer ageing")}</CardTitle>
                  <CardDescription>{t("receivables.mostOverdueFirst", "Most overdue first")}</CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("receivables.customer", "Customer")}</TableHead>
                        <TableHead className="text-right">{t("receivables.balance", "Balance")}</TableHead>
                        <TableHead className="text-right">{t("receivables.overdue", "Overdue")}</TableHead>
                        <TableHead>{t("receivables.oldestUnpaid", "Oldest unpaid")}</TableHead>
                        <TableHead className="text-right">{t("receivables.daysLateCol", "Days late")}</TableHead>
                        <TableHead className="text-right">{t("receivables.limit", "Limit")}</TableHead>
                        <TableHead className="text-right">{t("receivables.headroom", "Headroom")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ageing.customers.map((r) => (
                        <TableRow key={r.customerId}>
                          <TableCell>
                            <Link
                              href={`/credit/${r.customerId}`}
                              className="font-medium hover:underline"
                            >
                              {r.name}
                            </Link>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {r.code ? (
                                <span className="text-xs text-muted-foreground">{r.code}</span>
                              ) : null}
                              {r.overLimit ? (
                                <Badge variant="warning">{t("receivables.overLimitBadge", "Over limit")}</Badge>
                              ) : null}
                              {Number(r.unbilledPaise) > 0 ? (
                                <span className="text-xs text-muted-foreground">
                                  {t("receivables.unbilledAmount", "{amount} unbilled", { amount: formatINR(r.unbilledPaise) })}
                                </span>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatINR(r.currentBalancePaise)}
                          </TableCell>
                          <TableCell
                            className={`text-right tabular-nums ${
                              Number(r.overduePaise) > 0 ? "text-destructive font-semibold" : ""
                            }`}
                          >
                            {formatINR(r.overduePaise)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {r.oldestUnpaid ? (
                              <>
                                {r.oldestUnpaid.label}
                                <div className="text-xs text-muted-foreground">
                                  {t("receivables.dueOn", "due {date}", { date: day(r.oldestUnpaid.dueDate) })}
                                </div>
                              </>
                            ) : (
                              <span className="text-muted-foreground">{t("receivables.withinTerms", "Within terms")}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.daysPastDue > 0 ? r.daysPastDue : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatINR(r.creditLimitPaise)}
                          </TableCell>
                          <TableCell
                            className={`text-right tabular-nums ${
                              Number(r.headroomPaise) < 0 ? "text-destructive" : ""
                            }`}
                          >
                            {formatINR(r.headroomPaise)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ===================== STATEMENTS ===================== */}
        <TabsContent value="statements" className="space-y-4 mt-4">
          <div className="flex flex-wrap items-end gap-3 justify-between">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label>{t("receivables.customer", "Customer")}</Label>
                <Select
                  value={stFilters.customerId}
                  onValueChange={(v) => setStFilters((f) => ({ ...f, customerId: v }))}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{t("credit.allCustomers", "All customers")}</SelectItem>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {customerLabel(c)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("common.status", "Status")}</Label>
                <Select
                  value={stFilters.status}
                  onValueChange={(v) => setStFilters((f) => ({ ...f, status: v }))}
                >
                  <SelectTrigger className="w-[170px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{t("receivables.anyStatus", "Any status")}</SelectItem>
                    {STATEMENT_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {t(`receivables.status.${s}`, s.replace("_", " "))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant={stFilters.overdueOnly ? "default" : "outline"}
                onClick={() => setStFilters((f) => ({ ...f, overdueOnly: !f.overdueOnly }))}
              >
                {t("receivables.overdueOnly", "Overdue only")}
              </Button>
            </div>
            {canManage ? (
              <Button onClick={() => setGenOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> {t("receivables.generateStatement", "Generate statement")}
              </Button>
            ) : null}
          </div>

          {statementsQ.isLoading ? (
            <p className="text-sm text-muted-foreground">{t("receivables.loadingStatements", "Loading statements…")}</p>
          ) : statementsQ.error ? (
            <p className="text-sm text-destructive">
              {apiError(statementsQ.error, t("receivables.loadStatementsFailed", "Could not load statements"))}
            </p>
          ) : (statementsQ.data?.statements.length || 0) === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                {t("receivables.noStatements", "No statements yet. Generate one for a customer to bill a month of credit.")}
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Stat label={t("receivables.statementsCount", "Statements")} value={String(statementsQ.data!.totals.count)} />
                <Stat
                  label={t("receivables.billedClosing", "Billed (closing)")}
                  value={formatINR(statementsQ.data!.totals.closingBalancePaise)}
                />
                <Stat
                  label={t("receivables.stillUnpaid", "Still unpaid")}
                  value={formatINR(statementsQ.data!.totals.unpaidPaise)}
                  tone="warn"
                />
                <Stat
                  label={t("receivables.overdueStatements", "Overdue statements")}
                  value={String(statementsQ.data!.totals.overdueCount)}
                  tone={statementsQ.data!.totals.overdueCount > 0 ? "danger" : undefined}
                />
              </div>

              <Card>
                <CardContent className="pt-6 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("receivables.statement", "Statement")}</TableHead>
                        <TableHead>{t("receivables.customer", "Customer")}</TableHead>
                        <TableHead>{t("receivables.period", "Period")}</TableHead>
                        <TableHead>{t("receivables.due", "Due")}</TableHead>
                        <TableHead className="text-right">{t("receivables.closing", "Closing")}</TableHead>
                        <TableHead className="text-right">{t("receivables.unpaid", "Unpaid")}</TableHead>
                        <TableHead>{t("common.status", "Status")}</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {statementsQ.data!.statements.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">
                            <Link
                              href={`/receivables/statements/${s.id}`}
                              className="hover:underline"
                            >
                              {s.statementNo}
                            </Link>
                          </TableCell>
                          <TableCell>{s.customer.name}</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {day(s.periodFrom)} – {day(s.periodTo)}
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {day(s.dueDate)}
                            {s.derived.daysPastDue > 0 ? (
                              <div className="text-xs text-destructive">
                                {t("receivables.daysLate", "{n} days late", { n: s.derived.daysPastDue })}
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatINR(s.closingBalancePaise)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatINR(s.derived.unpaidPaise)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusVariant(s.derived.status)}>
                              {t(`receivables.status.${s.derived.status}`, s.derived.status.replace("_", " "))}
                            </Badge>
                            {s.sentVia ? (
                              <div className="text-xs text-muted-foreground mt-1">
                                {t("receivables.sentViaShort", "via {via}", { via: t(`receivables.via.${s.sentVia}`, s.sentVia) })}
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-2 justify-end">
                              <Button asChild variant="outline" size="sm">
                                <Link href={`/receivables/statements/${s.id}`}>
                                  <FileText className="h-4 w-4 mr-1" /> {t("receivables.open", "Open")}
                                </Link>
                              </Button>
                              {canManage && s.status === "DRAFT" ? (
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setSendFor(s);
                                    setSentVia("WhatsApp");
                                  }}
                                >
                                  <Send className="h-4 w-4 mr-1" /> {t("receivables.markSent", "Mark sent")}
                                </Button>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ===================== CHEQUE REGISTER ===================== */}
        <TabsContent value="cheques" className="space-y-4 mt-4">
          <div className="flex flex-wrap items-end gap-3 justify-between">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label>{t("common.status", "Status")}</Label>
                <Select value={instStatus} onValueChange={setInstStatus}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{t("receivables.all", "All")}</SelectItem>
                    {["PENDING", "CLEARED", "BOUNCED", "CANCELLED"].map((s) => (
                      <SelectItem key={s} value={s}>
                        {t(`receivables.instStatus.${s}`, s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("receivables.customer", "Customer")}</Label>
                <Select value={instCustomer} onValueChange={setInstCustomer}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{t("credit.allCustomers", "All customers")}</SelectItem>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {customerLabel(c)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("receivables.chequeDateOnBefore", "Cheque date on/before")}</Label>
                <Input
                  type="date"
                  value={dueBefore}
                  onChange={(e) => setDueBefore(e.target.value)}
                  className="w-[170px]"
                />
              </div>
            </div>
            {canManage ? (
              <Button onClick={() => setInstOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> {t("receivables.recordPayment", "Record payment")}
              </Button>
            ) : null}
          </div>

          {instrumentsQ.data ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat
                label={t("receivables.pendingToClear", "Pending to clear")}
                value={formatINR(instrumentsQ.data.totals.pendingPaise)}
                hint={t("receivables.instrumentsCount", "{n} instruments", { n: instrumentsQ.data.totals.pendingCount })}
                tone="warn"
              />
              <Stat label={t("receivables.cleared", "Cleared")} value={formatINR(instrumentsQ.data.totals.clearedPaise)} />
              <Stat
                label={t("receivables.bounced", "Bounced")}
                value={formatINR(instrumentsQ.data.totals.bouncedPaise)}
                tone="danger"
                hint={t("receivables.instrumentsCount", "{n} instruments", { n: instrumentsQ.data.totals.bouncedCount })}
              />
              <Stat label={t("receivables.shown", "Shown")} value={String(instrumentsQ.data.totals.count)} />
            </div>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>{t("receivables.register", "Register")}</CardTitle>
              <CardDescription>
                {t("receivables.registerHint", "Pending cheques are listed by cheque date — bank the earliest first")}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {instrumentsQ.isLoading ? (
                <p className="text-sm text-muted-foreground">{t("receivables.loadingRegister", "Loading register…")}</p>
              ) : instrumentsQ.error ? (
                <p className="text-sm text-destructive">
                  {apiError(instrumentsQ.error, t("receivables.loadRegisterFailed", "Could not load the register"))}
                </p>
              ) : (instrumentsQ.data?.instruments.length || 0) === 0 ? (
                <p className="py-8 text-center text-muted-foreground">
                  {t("receivables.registerEmpty", "Nothing here. Record a cheque or bank transfer to track whether it clears.")}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("receivables.chequeDate", "Cheque date")}</TableHead>
                      <TableHead>{t("receivables.customer", "Customer")}</TableHead>
                      <TableHead>{t("receivables.kind", "Kind")}</TableHead>
                      <TableHead>{t("receivables.details", "Details")}</TableHead>
                      <TableHead className="text-right">{t("common.amount", "Amount")}</TableHead>
                      <TableHead>{t("common.status", "Status")}</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {instrumentsQ.data!.instruments.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {i.chequeDate ? day(i.chequeDate) : day(i.receivedOn)}
                          <div className="text-xs text-muted-foreground">
                            {t("receivables.receivedOnShort", "received {date}", { date: day(i.receivedOn) })}
                          </div>
                        </TableCell>
                        <TableCell>{i.customer.name}</TableCell>
                        <TableCell>{t(`receivables.instKind.${i.kind}`, i.kind)}</TableCell>
                        <TableCell className="text-sm">
                          {i.chequeNo ? <div>{t("receivables.chequeNoValue", "Cheque {no}", { no: i.chequeNo })}</div> : null}
                          {i.utrNo ? <div>{t("receivables.utrValue", "UTR {no}", { no: i.utrNo })}</div> : null}
                          {i.bankName ? (
                            <div className="text-muted-foreground">{i.bankName}</div>
                          ) : null}
                          {i.bounceReason ? (
                            <div className="text-destructive">{i.bounceReason}</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatINR(i.amountPaise)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(i.status)}>{t(`receivables.instStatus.${i.status}`, i.status)}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {canManage && i.status === "PENDING" ? (
                            <div className="flex gap-2 justify-end">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={patchInstrument.isPending}
                                onClick={() =>
                                  patchInstrument.mutate({
                                    id: i.id,
                                    body: { action: "CLEAR", clearedOn: todayStr() },
                                  })
                                }
                              >
                                <CheckCircle2 className="h-4 w-4 mr-1" /> {t("receivables.clear", "Clear")}
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => {
                                  setBounceFor(i);
                                  setBounce({ reason: "", charge: "", bouncedOn: todayStr() });
                                }}
                              >
                                <Ban className="h-4 w-4 mr-1" /> {t("receivables.bounce", "Bounce")}
                              </Button>
                            </div>
                          ) : null}
                          {canManage && i.status === "CLEARED" ? (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                setBounceFor(i);
                                setBounce({ reason: "", charge: "", bouncedOn: todayStr() });
                              }}
                            >
                              <Ban className="h-4 w-4 mr-1" /> {t("receivables.bounce", "Bounce")}
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" /> {t("receivables.bounceHistory", "Bounce history")}
              </CardTitle>
              <CardDescription>
                {t("receivables.bounceHistoryHint", "Every bounce puts the amount (and any bank charge) back on the customer's balance")}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {(bouncedQ.data?.instruments.length || 0) === 0 ? (
                <p className="py-6 text-center text-muted-foreground">
                  {t("receivables.noBounces", "No cheque has bounced. Good.")}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("receivables.bouncedOn", "Bounced on")}</TableHead>
                      <TableHead>{t("receivables.customer", "Customer")}</TableHead>
                      <TableHead>{t("receivables.instrument", "Instrument")}</TableHead>
                      <TableHead className="text-right">{t("common.amount", "Amount")}</TableHead>
                      <TableHead className="text-right">{t("receivables.charge", "Charge")}</TableHead>
                      <TableHead>{t("receivables.reason", "Reason")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bouncedQ.data!.instruments.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell className="whitespace-nowrap">{day(i.bouncedOn)}</TableCell>
                        <TableCell>{i.customer.name}</TableCell>
                        <TableCell className="text-sm">
                          {t(`receivables.instKind.${i.kind}`, i.kind)}
                          {i.chequeNo ? ` ${i.chequeNo}` : ""}
                          {i.bankName ? (
                            <div className="text-xs text-muted-foreground">{i.bankName}</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatINR(i.amountPaise)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {i.bounceChargePaise ? formatINR(i.bounceChargePaise) : "—"}
                        </TableCell>
                        <TableCell className="text-sm">{i.bounceReason || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===================== REMINDERS ===================== */}
        <TabsContent value="reminders" className="space-y-4 mt-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant={remOverdueOnly ? "default" : "outline"}
              onClick={() => setRemOverdueOnly(true)}
            >
              {t("receivables.overdueOnly", "Overdue only")}
            </Button>
            <Button
              variant={!remOverdueOnly ? "default" : "outline"}
              onClick={() => setRemOverdueOnly(false)}
            >
              {t("receivables.everyoneWithBalance", "Everyone with a balance")}
            </Button>
            <p className="text-xs text-muted-foreground">
              {t("receivables.remindersNote", "Nothing is sent from here. Copy the message and send it yourself on WhatsApp or SMS.")}
            </p>
          </div>

          {remindersQ.isLoading ? (
            <p className="text-sm text-muted-foreground">{t("receivables.preparingReminders", "Preparing reminders…")}</p>
          ) : remindersQ.error ? (
            <p className="text-sm text-destructive">
              {apiError(remindersQ.error, t("receivables.remindersFailed", "Could not prepare reminders"))}
            </p>
          ) : (remindersQ.data?.reminders.length || 0) === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                {remOverdueOnly
                  ? t("receivables.nobodyOverdue", "Nobody is past their due date. Nothing to chase.")
                  : t("receivables.nobodyOwes", "No customer has an outstanding balance.")}
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                <Stat label={t("receivables.customersToChase", "Customers to chase")} value={String(remindersQ.data!.count)} />
                <Stat
                  label={t("receivables.totalOverdue", "Total overdue")}
                  value={formatINR(remindersQ.data!.totalOverduePaise)}
                  tone="danger"
                />
                <Stat
                  label={t("receivables.withoutPhone", "Without a phone number")}
                  value={String(remindersQ.data!.withoutPhone)}
                  hint={t("receivables.withoutPhoneHint", "Add a number on the customer profile")}
                  tone={remindersQ.data!.withoutPhone > 0 ? "warn" : undefined}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {remindersQ.data!.reminders.map((r) => (
                  <Card key={r.customerId}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <CardTitle className="text-base">{r.name}</CardTitle>
                          <CardDescription>
                            {r.phone ? r.phone : t("receivables.noPhoneOnFile", "No phone on file")} ·{" "}
                            {t("receivables.outstandingSuffix", "{amount} outstanding", { amount: formatINR(r.balancePaise) })}
                            {r.daysPastDue > 0 ? ` · ${t("receivables.daysLate", "{n} days late", { n: r.daysPastDue })}` : ""}
                          </CardDescription>
                        </div>
                        <div className="flex gap-1">
                          {r.overLimit ? <Badge variant="warning">{t("receivables.overLimitBadge", "Over limit")}</Badge> : null}
                          {Number(r.overduePaise) > 0 ? (
                            <Badge variant="destructive">{t("receivables.overdueBadge", "{amount} overdue", { amount: formatINR(r.overduePaise) })}</Badge>
                          ) : null}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <pre className="whitespace-pre-wrap text-sm bg-muted rounded-md p-3 font-sans">
                        {r.message}
                      </pre>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => copy(r.message, t("receivables.message", "Message"), t)}>
                          <ClipboardCopy className="h-4 w-4 mr-1" /> {t("receivables.copyMessage", "Copy message")}
                        </Button>
                        {r.phone ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => copy(r.phone!, t("receivables.phoneNumber", "Phone number"), t)}
                          >
                            {t("receivables.copyNumber", "Copy number")}
                          </Button>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* ---------- generate statement ---------- */}
      <Dialog open={genOpen} onOpenChange={setGenOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("receivables.generateStatement", "Generate statement")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("receivables.customer", "Customer")}</Label>
              <Select
                value={gen.customerId}
                onValueChange={(v) => setGen((g) => ({ ...g, customerId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("receivables.pickCustomer", "Pick a customer")} />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {customerLabel(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>{t("receivables.periodFrom", "Period from")}</Label>
                <Input
                  type="date"
                  value={gen.periodFrom}
                  onChange={(e) => setGen((g) => ({ ...g, periodFrom: e.target.value }))}
                />
              </div>
              <div>
                <Label>{t("receivables.periodTo", "Period to")}</Label>
                <Input
                  type="date"
                  value={gen.periodTo}
                  onChange={(e) => setGen((g) => ({ ...g, periodTo: e.target.value }))}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("receivables.generateNote", "Only credit sales and receipts from locked shifts are billed. The due date is the period end plus the customer's credit terms.")}
            </p>
            <Button
              className="w-full"
              disabled={
                !gen.customerId || !gen.periodFrom || !gen.periodTo || generate.isPending
              }
              onClick={() => generate.mutate()}
            >
              {generate.isPending ? t("receivables.generating", "Generating…") : t("receivables.generate", "Generate")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---------- mark sent ---------- */}
      <Dialog open={!!sendFor} onOpenChange={(o) => !o && setSendFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("receivables.markAsSentTitle", "Mark {no} as sent", { no: sendFor?.statementNo ?? "" })}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("receivables.sentVia", "Sent via")}</Label>
              <Select value={sentVia} onValueChange={setSentVia}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SENT_VIA.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`receivables.via.${s}`, s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              disabled={markSent.isPending}
              onClick={() => sendFor && markSent.mutate({ id: sendFor.id, sentVia })}
            >
              {markSent.isPending ? t("common.saving", "Saving…") : t("receivables.markSent", "Mark sent")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---------- record instrument ---------- */}
      <Dialog open={instOpen} onOpenChange={setInstOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("receivables.recordPaymentTitle", "Record a payment")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("receivables.customer", "Customer")}</Label>
              <Select
                value={newInst.customerId}
                onValueChange={(v) => setNewInst((s) => ({ ...s, customerId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("receivables.pickCustomer", "Pick a customer")} />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {customerLabel(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>{t("receivables.kind", "Kind")}</Label>
                <Select
                  value={newInst.kind}
                  onValueChange={(v) => setNewInst((s) => ({ ...s, kind: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INSTRUMENT_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {t(`receivables.instKind.${k}`, k)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("receivables.amountRupees", "Amount (₹)")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={newInst.amount}
                  onChange={(e) => setNewInst((s) => ({ ...s, amount: e.target.value }))}
                />
              </div>
              <div>
                <Label>{t("receivables.receivedOn", "Received on")}</Label>
                <Input
                  type="date"
                  value={newInst.receivedOn}
                  onChange={(e) => setNewInst((s) => ({ ...s, receivedOn: e.target.value }))}
                />
              </div>
              <div>
                <Label>{t("receivables.bank", "Bank")}</Label>
                <Input
                  value={newInst.bankName}
                  onChange={(e) => setNewInst((s) => ({ ...s, bankName: e.target.value }))}
                  placeholder={t("receivables.bankPlaceholder", "SBI, HDFC…")}
                />
              </div>
              {newInst.kind === "CHEQUE" ? (
                <>
                  <div>
                    <Label>{t("receivables.chequeNo", "Cheque no")}</Label>
                    <Input
                      value={newInst.chequeNo}
                      onChange={(e) => setNewInst((s) => ({ ...s, chequeNo: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>{t("receivables.chequeDate", "Cheque date")}</Label>
                    <Input
                      type="date"
                      value={newInst.chequeDate}
                      onChange={(e) => setNewInst((s) => ({ ...s, chequeDate: e.target.value }))}
                    />
                  </div>
                </>
              ) : null}
              {["RTGS", "NEFT", "IMPS"].includes(newInst.kind) ? (
                <div className="sm:col-span-2">
                  <Label>{t("receivables.utrNo", "UTR number")}</Label>
                  <Input
                    value={newInst.utrNo}
                    onChange={(e) => setNewInst((s) => ({ ...s, utrNo: e.target.value }))}
                  />
                </div>
              ) : null}
              <div className="sm:col-span-2">
                <Label>{t("common.notes", "Notes")}</Label>
                <Input
                  value={newInst.notes}
                  onChange={(e) => setNewInst((s) => ({ ...s, notes: e.target.value }))}
                />
              </div>
            </div>

            {cashWarning ? (
              <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm">
                <p className="font-semibold flex items-center gap-1 text-destructive">
                  <AlertTriangle className="h-4 w-4" /> {t("receivables.cashWarningTitle", "Section 269ST warning")}
                </p>
                <p className="mt-1">
                  {t("receivables.cashWarningBody", "Receiving ₹2,00,000 or more in cash from one person in one transaction is prohibited under section 269ST of the Income Tax Act. The penalty under section 271DA equals the amount received. Take it by cheque or RTGS, or split it across separate transactions. This entry will still be saved.")}
                </p>
              </div>
            ) : null}

            <Separator />
            <p className="text-xs text-muted-foreground">
              {t("receivables.instrumentNote", "Recording an instrument does not change the customer's balance — balances move when a shift is locked. A bounce is the one exception and puts the money back.")}
            </p>
            <Button
              className="w-full"
              disabled={!newInst.customerId || !newInst.amount || createInstrument.isPending}
              onClick={() => createInstrument.mutate()}
            >
              {createInstrument.isPending ? t("common.saving", "Saving…") : t("receivables.recordPayment", "Record payment")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---------- bounce ---------- */}
      <Dialog open={!!bounceFor} onOpenChange={(o) => !o && setBounceFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("receivables.bounceTitle", "Bounce {kind} {no}", {
                kind: bounceFor ? t(`receivables.instKind.${bounceFor.kind}`, bounceFor.kind) : "",
                no: bounceFor?.chequeNo || "",
              })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {bounceFor
                ? t("receivables.bounceExplain", "{amount} from {name} will go back onto their outstanding balance, along with any bank charge you enter.", {
                    amount: formatINR(bounceFor.amountPaise),
                    name: bounceFor.customer.name,
                  })
                : ""}
            </p>
            <div>
              <Label>{t("receivables.reason", "Reason")}</Label>
              <Input
                value={bounce.reason}
                onChange={(e) => setBounce((b) => ({ ...b, reason: e.target.value }))}
                placeholder={t("receivables.bounceReasonPlaceholder", "Insufficient funds / signature mismatch")}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>{t("receivables.bouncedOnLabel", "Bounced on")}</Label>
                <Input
                  type="date"
                  value={bounce.bouncedOn}
                  onChange={(e) => setBounce((b) => ({ ...b, bouncedOn: e.target.value }))}
                />
              </div>
              <div>
                <Label>{t("receivables.bankCharge", "Bank charge (₹)")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={bounce.charge}
                  onChange={(e) => setBounce((b) => ({ ...b, charge: e.target.value }))}
                  placeholder={t("common.optional", "Optional")}
                />
              </div>
            </div>
            <Button
              variant="destructive"
              className="w-full"
              disabled={!bounce.reason.trim() || patchInstrument.isPending}
              onClick={() =>
                bounceFor &&
                patchInstrument.mutate({
                  id: bounceFor.id,
                  body: {
                    action: "BOUNCE",
                    bounceReason: bounce.reason.trim(),
                    bouncedOn: bounce.bouncedOn,
                    ...(bounce.charge && !Number.isNaN(Number(bounce.charge))
                      ? { bounceChargePaise: rupeesToPaise(bounce.charge) }
                      : {}),
                  },
                })
              }
            >
              {patchInstrument.isPending ? t("receivables.recording", "Recording…") : t("receivables.recordBounce", "Record bounce")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, can } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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
import { formatINR, formatLitres, FUEL_LABELS } from "@/lib/utils";
import { apiError } from "@/lib/types";
import { format, parseISO } from "date-fns";
import type { Locale } from "date-fns";
import { useT } from "@/lib/i18n";
import { useDateLocale } from "@/lib/i18n/core";
import { toast } from "sonner";
import { ArrowLeft, Printer, Send, Undo2 } from "lucide-react";

type SaleLine = {
  id: string;
  saleAt: string;
  vehicleNo: string | null;
  fuelType: string;
  quantityMl: string;
  ratePaise: string;
  totalAmountPaise: string;
  amountPaidPaise: string;
  amountCreditPaise: string;
};

type ReceiptLine = {
  id: string;
  receivedAt: string;
  reference: string | null;
  amountPaise: string;
};

type InstrumentLine = {
  id: string;
  kind: string;
  amountPaise: string;
  receivedOn: string;
  chequeNo: string | null;
  chequeDate: string | null;
  bankName: string | null;
  utrNo: string | null;
  status: string;
  bouncedOn: string | null;
  bounceReason: string | null;
  afterPeriod: boolean;
};

type StatementDetail = {
  id: string;
  statementNo: string;
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
  notes: string | null;
  customer: {
    id: string;
    name: string;
    code: string | null;
    contactPerson: string | null;
    phone: string | null;
    addressLine: string | null;
    city: string | null;
    state: string | null;
    pincode: string | null;
    gstin: string | null;
    paymentTermsDays: number;
    currentBalancePaise: string;
    creditLimitPaise: string;
  };
  pump: {
    name: string;
    code: string;
    address: string;
    city: string;
    state: string;
  } | null;
  nextStatement: { id: string; statementNo: string } | null;
  derived: {
    status: string;
    paidAgainstPaise: string;
    unpaidPaise: string;
    isOverdue: boolean;
    daysPastDue: number;
  };
  lines: { sales: SaleLine[]; receipts: ReceiptLine[]; instruments: InstrumentLine[] };
};

const SENT_VIA = ["WhatsApp", "Email", "Printed", "Hand delivered", "SMS"];

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

// A plain print stylesheet: hide the app chrome, drop shadows and colours, and let
// the bill flow as one clean page.
const PRINT_CSS = `
@media print {
  header, nav, aside, footer, .no-print { display: none !important; }
  body { background: #fff !important; }
  main { padding: 0 !important; margin: 0 !important; }
  .print-sheet { box-shadow: none !important; border: none !important; }
  .print-sheet table { font-size: 11pt; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  @page { margin: 14mm; }
}
`;

export default function StatementDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { t } = useT();
  const locale = useDateLocale();
  const day = (iso: string | null | undefined) => fmtDay(iso, locale);
  const qc = useQueryClient();
  const canManage = can("canManageCreditCustomers");
  const [sendOpen, setSendOpen] = useState(false);
  const [sentVia, setSentVia] = useState("WhatsApp");
  const [notes, setNotes] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<StatementDetail>({
    queryKey: ["cl-statement", id],
    queryFn: async () => (await api.get(`/api/credit-lifecycle/statements/${id}`)).data,
  });

  const patch = useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      (await api.patch(`/api/credit-lifecycle/statements/${id}`, body)).data,
    onSuccess: () => {
      toast.success(t("receivables.statementUpdated", "Statement updated"));
      setSendOpen(false);
      qc.invalidateQueries({ queryKey: ["cl-statement", id] });
      qc.invalidateQueries({ queryKey: ["cl-statements"] });
    },
    onError: (e) => toast.error(apiError(e, t("receivables.updateStatementFailed", "Could not update the statement"))),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">{t("receivables.loadingStatement", "Loading statement…")}</p>;
  if (error)
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">{apiError(error, t("receivables.loadStatementFailed", "Could not load the statement"))}</p>
        <Button asChild variant="outline">
          <Link href="/receivables">
            <ArrowLeft className="h-4 w-4 mr-1" /> {t("receivables.backToReceivables", "Back to receivables")}
          </Link>
        </Button>
      </div>
    );
  if (!data) return null;

  const s = data;
  const c = s.customer;
  const notesValue = notes === null ? (s.notes ?? "") : notes;

  return (
    <div className="space-y-4">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <Button asChild variant="outline" size="sm">
          <Link href="/receivables">
            <ArrowLeft className="h-4 w-4 mr-1" /> {t("receivables.title", "Receivables")}
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-1" /> {t("common.print", "Print")}
          </Button>
          {canManage && s.status === "DRAFT" ? (
            <Button onClick={() => setSendOpen(true)}>
              <Send className="h-4 w-4 mr-1" /> {t("receivables.markSent", "Mark sent")}
            </Button>
          ) : null}
          {canManage && s.status === "SENT" && Number(s.derived.paidAgainstPaise) === 0 ? (
            <Button variant="outline" onClick={() => patch.mutate({ status: "DRAFT" })}>
              <Undo2 className="h-4 w-4 mr-1" /> {t("receivables.backToDraft", "Back to draft")}
            </Button>
          ) : null}
        </div>
      </div>

      {/* ---------------- the bill ---------------- */}
      <Card className="print-sheet">
        <CardContent className="pt-6 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-lg font-bold leading-tight">{s.pump?.name || t("receivables.fuelStation", "Fuel station")}</p>
              {s.pump ? (
                <p className="text-sm text-muted-foreground leading-snug">
                  {s.pump.address}
                  <br />
                  {s.pump.city}, {s.pump.state}
                </p>
              ) : null}
            </div>
            <div className="text-right">
              <p className="text-sm uppercase tracking-wide text-muted-foreground">
                {t("receivables.statementOfAccount", "Statement of account")}
              </p>
              <p className="text-xl font-bold">{s.statementNo}</p>
              <Badge variant={statusVariant(s.derived.status)}>
                {t(`receivables.status.${s.derived.status}`, s.derived.status.replace("_", " "))}
              </Badge>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("receivables.billedTo", "Billed to")}</p>
              <p className="font-semibold">{c.name}</p>
              {c.code ? <p className="text-muted-foreground">{t("receivables.customerCodeValue", "Customer code {code}", { code: c.code })}</p> : null}
              {c.contactPerson ? <p>{c.contactPerson}</p> : null}
              {c.phone ? <p>{c.phone}</p> : null}
              {c.addressLine ? <p>{c.addressLine}</p> : null}
              {c.city || c.state || c.pincode ? (
                <p>
                  {[c.city, c.state, c.pincode].filter(Boolean).join(", ")}
                </p>
              ) : null}
              {c.gstin ? <p>{t("receivables.gstinValue", "GSTIN {gstin}", { gstin: c.gstin })}</p> : null}
            </div>
            <div className="sm:text-right space-y-1">
              <p>
                <span className="text-muted-foreground">{t("receivables.periodLabel", "Period: ")}</span>
                {day(s.periodFrom)} – {day(s.periodTo)}
              </p>
              <p>
                <span className="text-muted-foreground">{t("receivables.creditTermsLabel", "Credit terms: ")}</span>
                {t("receivables.daysValue", "{n} days", { n: c.paymentTermsDays })}
              </p>
              <p className="font-semibold">
                <span className="text-muted-foreground font-normal">{t("receivables.paymentDueLabel", "Payment due: ")}</span>
                {day(s.dueDate)}
              </p>
              {s.derived.isOverdue ? (
                <p className="text-destructive font-semibold">
                  {t("receivables.daysPastDue", "{n} days past due", { n: s.derived.daysPastDue })}
                </p>
              ) : null}
              {s.sentAt ? (
                <p className="text-muted-foreground">
                  {s.sentVia
                    ? t("receivables.sentOnVia", "Sent {date} via {via}", { date: day(s.sentAt), via: t(`receivables.via.${s.sentVia}`, s.sentVia) })
                    : t("receivables.sentOn", "Sent {date}", { date: day(s.sentAt) })}
                </p>
              ) : null}
            </div>
          </div>

          {/* summary box */}
          <div className="rounded-md border divide-y text-sm">
            <div className="flex justify-between px-4 py-2">
              <span>{t("receivables.openingBalanceOn", "Opening balance as on {date}", { date: day(s.periodFrom) })}</span>
              <span className="tabular-nums">{formatINR(s.openingBalancePaise)}</span>
            </div>
            <div className="flex justify-between px-4 py-2">
              <span>{t("receivables.fuelOnCreditInPeriod", "Fuel taken on credit during the period")}</span>
              <span className="tabular-nums">+ {formatINR(s.salesPaise)}</span>
            </div>
            <div className="flex justify-between px-4 py-2">
              <span>{t("receivables.paymentsInPeriod", "Payments received during the period")}</span>
              <span className="tabular-nums">− {formatINR(s.receiptsPaise)}</span>
            </div>
            <div className="flex justify-between px-4 py-3 bg-muted font-bold">
              <span>{t("receivables.closingPayable", "Closing balance payable")}</span>
              <span className="tabular-nums">{formatINR(s.closingBalancePaise)}</span>
            </div>
            {Number(s.derived.paidAgainstPaise) > 0 ? (
              <>
                <div className="flex justify-between px-4 py-2">
                  <span>{t("receivables.receivedSince", "Received since {date}", { date: day(s.periodTo) })}</span>
                  <span className="tabular-nums">− {formatINR(s.derived.paidAgainstPaise)}</span>
                </div>
                <div className="flex justify-between px-4 py-2 font-semibold">
                  <span>{t("receivables.stillUnpaid", "Still unpaid")}</span>
                  <span className="tabular-nums">{formatINR(s.derived.unpaidPaise)}</span>
                </div>
              </>
            ) : null}
          </div>

          {/* fuel taken */}
          <div>
            <p className="font-semibold mb-2">{t("receivables.fuelTakenOnCredit", "Fuel taken on credit")}</p>
            {s.lines.sales.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("receivables.noLockedCreditSales", "No credit sales from locked shifts in this period.")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("common.date", "Date")}</TableHead>
                      <TableHead>{t("credit.vehicle", "Vehicle")}</TableHead>
                      <TableHead>{t("credit.fuel", "Fuel")}</TableHead>
                      <TableHead className="text-right">{t("common.litres", "Litres")}</TableHead>
                      <TableHead className="text-right">{t("common.rate", "Rate")}</TableHead>
                      <TableHead className="text-right">{t("common.total", "Total")}</TableHead>
                      <TableHead className="text-right">{t("receivables.onCredit", "On credit")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {s.lines.sales.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="whitespace-nowrap">{day(l.saleAt)}</TableCell>
                        <TableCell>{l.vehicleNo || "—"}</TableCell>
                        <TableCell>{t(`receivables.fuelType.${l.fuelType}`, FUEL_LABELS[l.fuelType] || l.fuelType)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatLitres(l.quantityMl)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatINR(l.ratePaise)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatINR(l.totalAmountPaise)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {formatINR(l.amountCreditPaise)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* receipts */}
          <div>
            <p className="font-semibold mb-2">{t("receivables.paymentsReceivedInPeriod", "Payments received in the period")}</p>
            {s.lines.receipts.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("receivables.noPaymentsInPeriod", "No payments received in this period.")}</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("common.date", "Date")}</TableHead>
                      <TableHead>{t("credit.reference", "Reference")}</TableHead>
                      <TableHead className="text-right">{t("common.amount", "Amount")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {s.lines.receipts.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="whitespace-nowrap">{day(l.receivedAt)}</TableCell>
                        <TableCell>{l.reference || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatINR(l.amountPaise)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            {t("receivables.footerNote", "Amounts are in Indian rupees. Please quote {no} with your payment. Cheques are subject to realisation; a returned cheque is added back to the outstanding balance along with any bank charge.", { no: s.statementNo })}
          </p>
        </CardContent>
      </Card>

      {/* ---------------- working notes (not part of the printed bill) ---------------- */}
      <Card className="no-print">
        <CardHeader>
          <CardTitle>{t("receivables.instrumentsAgainst", "Instruments against this account")}</CardTitle>
          <CardDescription>
            {t("receivables.instrumentsAgainstHint", "Cheques and transfers recorded from {date} onwards", { date: day(s.periodFrom) })}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {s.lines.instruments.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground">
              {t("receivables.noInstruments", "Nothing recorded in the cheque register for this customer yet.")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("receivables.received", "Received")}</TableHead>
                  <TableHead>{t("receivables.kind", "Kind")}</TableHead>
                  <TableHead>{t("receivables.details", "Details")}</TableHead>
                  <TableHead className="text-right">{t("common.amount", "Amount")}</TableHead>
                  <TableHead>{t("common.status", "Status")}</TableHead>
                  <TableHead>{t("receivables.when", "When")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.lines.instruments.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="whitespace-nowrap">{day(i.receivedOn)}</TableCell>
                    <TableCell>{t(`receivables.instKind.${i.kind}`, i.kind)}</TableCell>
                    <TableCell className="text-sm">
                      {i.chequeNo ? <div>{t("receivables.chequeNoValue", "Cheque {no}", { no: i.chequeNo })}</div> : null}
                      {i.chequeDate ? (
                        <div className="text-xs text-muted-foreground">
                          {t("receivables.datedOn", "dated {date}", { date: day(i.chequeDate) })}
                        </div>
                      ) : null}
                      {i.utrNo ? <div>{t("receivables.utrValue", "UTR {no}", { no: i.utrNo })}</div> : null}
                      {i.bankName ? (
                        <div className="text-xs text-muted-foreground">{i.bankName}</div>
                      ) : null}
                      {i.bounceReason ? (
                        <div className="text-destructive text-xs">
                          {t("receivables.bouncedOnReason", "Bounced {date}: {reason}", { date: day(i.bouncedOn), reason: i.bounceReason })}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatINR(i.amountPaise)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(i.status)}>{t(`receivables.instStatus.${i.status}`, i.status)}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {i.afterPeriod ? t("receivables.afterPeriod", "After the period") : t("receivables.inPeriod", "In the period")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="no-print">
        <CardHeader>
          <CardTitle>{t("receivables.internalNotes", "Internal notes")}</CardTitle>
          <CardDescription>
            {t("receivables.internalNotesHint", "For your own records — not shown on the printed statement")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={notesValue}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("receivables.notesPlaceholder", "Promised payment by 10th, spoke to accounts…")}
            disabled={!canManage}
          />
          {canManage ? (
            <Button
              variant="outline"
              disabled={patch.isPending || notes === null}
              onClick={() => patch.mutate({ notes: notesValue })}
            >
              {patch.isPending ? t("common.saving", "Saving…") : t("receivables.saveNote", "Save note")}
            </Button>
          ) : null}
          {s.nextStatement ? (
            <p className="text-xs text-muted-foreground">
              {t("receivables.rolledForwardInto", "This balance was rolled forward into")}{" "}
              <Link
                href={`/receivables/statements/${s.nextStatement.id}`}
                className="underline"
              >
                {s.nextStatement.statementNo}
              </Link>
              .
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("receivables.markAsSentTitle", "Mark {no} as sent", { no: s.statementNo })}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("receivables.sentVia", "Sent via")}</Label>
              <Select value={sentVia} onValueChange={setSentVia}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SENT_VIA.map((v) => (
                    <SelectItem key={v} value={v}>
                      {t(`receivables.via.${v}`, v)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              disabled={patch.isPending}
              onClick={() => patch.mutate({ status: "SENT", sentVia })}
            >
              {patch.isPending ? t("common.saving", "Saving…") : t("receivables.markSent", "Mark sent")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

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

const day = (iso: string | null | undefined) =>
  iso ? format(parseISO(iso), "dd MMM yyyy") : "—";

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
      toast.success("Statement updated");
      setSendOpen(false);
      qc.invalidateQueries({ queryKey: ["cl-statement", id] });
      qc.invalidateQueries({ queryKey: ["cl-statements"] });
    },
    onError: (e) => toast.error(apiError(e, "Could not update the statement")),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading statement…</p>;
  if (error)
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">{apiError(error, "Could not load the statement")}</p>
        <Button asChild variant="outline">
          <Link href="/receivables">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to receivables
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
            <ArrowLeft className="h-4 w-4 mr-1" /> Receivables
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-1" /> Print
          </Button>
          {canManage && s.status === "DRAFT" ? (
            <Button onClick={() => setSendOpen(true)}>
              <Send className="h-4 w-4 mr-1" /> Mark sent
            </Button>
          ) : null}
          {canManage && s.status === "SENT" && Number(s.derived.paidAgainstPaise) === 0 ? (
            <Button variant="outline" onClick={() => patch.mutate({ status: "DRAFT" })}>
              <Undo2 className="h-4 w-4 mr-1" /> Back to draft
            </Button>
          ) : null}
        </div>
      </div>

      {/* ---------------- the bill ---------------- */}
      <Card className="print-sheet">
        <CardContent className="pt-6 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-lg font-bold leading-tight">{s.pump?.name || "Fuel station"}</p>
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
                Statement of account
              </p>
              <p className="text-xl font-bold">{s.statementNo}</p>
              <Badge variant={statusVariant(s.derived.status)}>
                {s.derived.status.replace("_", " ")}
              </Badge>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Billed to</p>
              <p className="font-semibold">{c.name}</p>
              {c.code ? <p className="text-muted-foreground">Customer code {c.code}</p> : null}
              {c.contactPerson ? <p>{c.contactPerson}</p> : null}
              {c.phone ? <p>{c.phone}</p> : null}
              {c.addressLine ? <p>{c.addressLine}</p> : null}
              {c.city || c.state || c.pincode ? (
                <p>
                  {[c.city, c.state, c.pincode].filter(Boolean).join(", ")}
                </p>
              ) : null}
              {c.gstin ? <p>GSTIN {c.gstin}</p> : null}
            </div>
            <div className="sm:text-right space-y-1">
              <p>
                <span className="text-muted-foreground">Period: </span>
                {day(s.periodFrom)} – {day(s.periodTo)}
              </p>
              <p>
                <span className="text-muted-foreground">Credit terms: </span>
                {c.paymentTermsDays} days
              </p>
              <p className="font-semibold">
                <span className="text-muted-foreground font-normal">Payment due: </span>
                {day(s.dueDate)}
              </p>
              {s.derived.isOverdue ? (
                <p className="text-destructive font-semibold">
                  {s.derived.daysPastDue} days past due
                </p>
              ) : null}
              {s.sentAt ? (
                <p className="text-muted-foreground">
                  Sent {day(s.sentAt)}
                  {s.sentVia ? ` via ${s.sentVia}` : ""}
                </p>
              ) : null}
            </div>
          </div>

          {/* summary box */}
          <div className="rounded-md border divide-y text-sm">
            <div className="flex justify-between px-4 py-2">
              <span>Opening balance as on {day(s.periodFrom)}</span>
              <span className="tabular-nums">{formatINR(s.openingBalancePaise)}</span>
            </div>
            <div className="flex justify-between px-4 py-2">
              <span>Fuel taken on credit during the period</span>
              <span className="tabular-nums">+ {formatINR(s.salesPaise)}</span>
            </div>
            <div className="flex justify-between px-4 py-2">
              <span>Payments received during the period</span>
              <span className="tabular-nums">− {formatINR(s.receiptsPaise)}</span>
            </div>
            <div className="flex justify-between px-4 py-3 bg-muted font-bold">
              <span>Closing balance payable</span>
              <span className="tabular-nums">{formatINR(s.closingBalancePaise)}</span>
            </div>
            {Number(s.derived.paidAgainstPaise) > 0 ? (
              <>
                <div className="flex justify-between px-4 py-2">
                  <span>Received since {day(s.periodTo)}</span>
                  <span className="tabular-nums">− {formatINR(s.derived.paidAgainstPaise)}</span>
                </div>
                <div className="flex justify-between px-4 py-2 font-semibold">
                  <span>Still unpaid</span>
                  <span className="tabular-nums">{formatINR(s.derived.unpaidPaise)}</span>
                </div>
              </>
            ) : null}
          </div>

          {/* fuel taken */}
          <div>
            <p className="font-semibold mb-2">Fuel taken on credit</p>
            {s.lines.sales.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No credit sales from locked shifts in this period.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Vehicle</TableHead>
                      <TableHead>Fuel</TableHead>
                      <TableHead className="text-right">Litres</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">On credit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {s.lines.sales.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="whitespace-nowrap">{day(l.saleAt)}</TableCell>
                        <TableCell>{l.vehicleNo || "—"}</TableCell>
                        <TableCell>{FUEL_LABELS[l.fuelType] || l.fuelType}</TableCell>
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
            <p className="font-semibold mb-2">Payments received in the period</p>
            {s.lines.receipts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments received in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
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
            Amounts are in Indian rupees. Please quote {s.statementNo} with your payment. Cheques
            are subject to realisation; a returned cheque is added back to the outstanding balance
            along with any bank charge.
          </p>
        </CardContent>
      </Card>

      {/* ---------------- working notes (not part of the printed bill) ---------------- */}
      <Card className="no-print">
        <CardHeader>
          <CardTitle>Instruments against this account</CardTitle>
          <CardDescription>
            Cheques and transfers recorded from {day(s.periodFrom)} onwards
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {s.lines.instruments.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground">
              Nothing recorded in the cheque register for this customer yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Received</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.lines.instruments.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="whitespace-nowrap">{day(i.receivedOn)}</TableCell>
                    <TableCell>{i.kind}</TableCell>
                    <TableCell className="text-sm">
                      {i.chequeNo ? <div>Cheque {i.chequeNo}</div> : null}
                      {i.chequeDate ? (
                        <div className="text-xs text-muted-foreground">
                          dated {day(i.chequeDate)}
                        </div>
                      ) : null}
                      {i.utrNo ? <div>UTR {i.utrNo}</div> : null}
                      {i.bankName ? (
                        <div className="text-xs text-muted-foreground">{i.bankName}</div>
                      ) : null}
                      {i.bounceReason ? (
                        <div className="text-destructive text-xs">
                          Bounced {day(i.bouncedOn)}: {i.bounceReason}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatINR(i.amountPaise)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(i.status)}>{i.status}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {i.afterPeriod ? "After the period" : "In the period"}
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
          <CardTitle>Internal notes</CardTitle>
          <CardDescription>
            For your own records — not shown on the printed statement
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={notesValue}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Promised payment by 10th, spoke to accounts…"
            disabled={!canManage}
          />
          {canManage ? (
            <Button
              variant="outline"
              disabled={patch.isPending || notes === null}
              onClick={() => patch.mutate({ notes: notesValue })}
            >
              {patch.isPending ? "Saving…" : "Save note"}
            </Button>
          ) : null}
          {s.nextStatement ? (
            <p className="text-xs text-muted-foreground">
              This balance was rolled forward into{" "}
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
            <DialogTitle>Mark {s.statementNo} as sent</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Sent via</Label>
              <Select value={sentVia} onValueChange={setSentVia}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SENT_VIA.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
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
              {patch.isPending ? "Saving…" : "Mark sent"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatINR } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { AlertTriangle } from "lucide-react";
import {
  ChannelSubsidiaryRow,
  CustomerSubsidiaryRow,
  EmployeeSubsidiaryRow,
  Range,
  defaultRange,
  paise,
} from "@/lib/books";
import { DateRangeBar, EmptyBooks, StatCard } from "../_components/controls";

export default function WhoOwesPage() {
  const { t } = useT();
  const [range, setRange] = useState<Range>(defaultRange);
  const qs = `from=${range.from}&to=${range.to}`;

  const customersQ = useQuery<CustomerSubsidiaryRow[]>({
    queryKey: ["ledger", "subsidiary-customers", range],
    queryFn: async () => (await api.get(`/api/ledger/subsidiary/customers?${qs}`)).data,
  });
  const staffQ = useQuery<EmployeeSubsidiaryRow[]>({
    queryKey: ["ledger", "subsidiary-employees", range],
    queryFn: async () => (await api.get(`/api/ledger/subsidiary/employees?${qs}`)).data,
  });
  const channelsQ = useQuery<ChannelSubsidiaryRow[]>({
    queryKey: ["ledger", "subsidiary-channels", range],
    queryFn: async () => (await api.get(`/api/ledger/subsidiary/channels?${qs}`)).data,
  });

  const customers = customersQ.data ?? [];
  const staff = staffQ.data ?? [];
  const channels = channelsQ.data ?? [];

  const mismatched = customers.filter((c) => !c.matchesStored);
  const totalReceivable = customers.reduce((s, c) => s + paise(c.ledgerBalancePaise), 0);
  const totalStaffDues = staff.reduce((s, e) => s + paise(e.outstandingPaise), 0);
  const totalHeld = channels.reduce((s, c) => s + paise(c.heldPaise), 0);

  return (
    <div className="space-y-4">
      <DateRangeBar range={range} onChange={setRange} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard
          label={t("books.wo.customersOwe", "Money customers owe you")}
          value={formatINR(totalReceivable)}
          hint={t("books.wo.customersOweHint", "Fuel sold on credit, not yet paid for")}
          accent="amber"
        />
        <StatCard
          label={t("books.wo.staffShort", "Cash short on staff")}
          value={formatINR(totalStaffDues)}
          hint={t("books.wo.staffShortHint", "Shortages recoverable from attendants")}
          accent={totalStaffDues > 0 ? "red" : "green"}
        />
        <StatCard
          label={t("books.wo.digital", "Digital money not yet in the bank")}
          value={formatINR(totalHeld)}
          hint={t("books.wo.digitalHint", "Card / UPI / wallet taken, awaiting settlement")}
          accent="primary"
        />
      </div>

      {mismatched.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border-2 border-red-300 bg-red-50 p-3 text-sm">
          <AlertTriangle className="h-5 w-5 text-red-700 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold text-red-900">
              {mismatched.length > 1
                ? t("books.wo.mismatchMany", "{n} customers disagree with the ledger", {
                    n: mismatched.length,
                  })
                : t("books.wo.mismatchOne", "{n} customer disagrees with the ledger", {
                    n: mismatched.length,
                  })}
            </div>
            <div className="text-red-800">
              {t(
                "books.wo.mismatchBody",
                "The balance stored on the customer record does not match what the books say: {names}. One of the two is wrong — check that customer's recent credit sales and payments, and whether any shift was unlocked after the balance was posted.",
                { names: mismatched.map((c) => c.name).join(", ") },
              )}
            </div>
          </div>
        </div>
      )}

      <Tabs defaultValue="customers" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="customers">{t("books.wo.tabCustomers", "Customer receivables")}</TabsTrigger>
          <TabsTrigger value="staff">{t("books.wo.tabStaff", "Staff cash dues")}</TabsTrigger>
          <TabsTrigger value="channels">{t("books.wo.tabChannels", "Digital float")}</TabsTrigger>
        </TabsList>

        <TabsContent value="customers">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t("books.wo.customersOwe", "Money customers owe you")}
              </CardTitle>
              <CardDescription>
                {t(
                  "books.wo.customersDesc",
                  "Account 1200 — Accounts Receivable, broken out per credit customer. “Billed” is fuel put on credit in this range; “received” is what they paid against their dues.",
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {customersQ.isLoading ? (
                <Loading />
              ) : customers.length === 0 ? (
                <EmptyBooks
                  title={t("books.wo.noCreditTitle", "No credit activity")}
                  body={t(
                    "books.wo.noCreditBody",
                    "No customer had a credit sale or a payment posted to the books in this range.",
                  )}
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("books.wo.colCustomer", "Customer")}</TableHead>
                        <TableHead className="text-right">{t("books.wo.colBilled", "Billed (Dr)")}</TableHead>
                        <TableHead className="text-right">{t("books.wo.colReceived", "Received (Cr)")}</TableHead>
                        <TableHead className="text-right">{t("books.wo.colOwesBooks", "Owes as per books")}</TableHead>
                        <TableHead className="text-right">{t("books.wo.colOnRecord", "On their record")}</TableHead>
                        <TableHead>{t("books.wo.colAgrees", "Agrees?")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customers.map((c) => (
                        <TableRow key={c.customerId}>
                          <TableCell>
                            <Link
                              href={`/credit/${c.customerId}`}
                              className="font-medium hover:underline"
                            >
                              {c.name}
                            </Link>
                            {c.code && (
                              <span className="text-xs text-muted-foreground ml-1.5 font-mono">
                                {c.code}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatINR(c.billedPaise)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatINR(c.receivedPaise)}
                          </TableCell>
                          <TableCell className="text-right font-mono font-medium">
                            {formatINR(c.ledgerBalancePaise)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">
                            {formatINR(c.storedBalancePaise)}
                          </TableCell>
                          <TableCell>
                            {c.matchesStored ? (
                              <Badge variant="success">{t("books.wo.matches", "Matches")}</Badge>
                            ) : (
                              <Badge variant="destructive">{t("books.wo.mismatch", "Mismatch")}</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-semibold">{t("common.total", "Total")}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {formatINR(customers.reduce((s, c) => s + paise(c.billedPaise), 0))}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {formatINR(customers.reduce((s, c) => s + paise(c.receivedPaise), 0))}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {formatINR(totalReceivable)}
                        </TableCell>
                        <TableCell colSpan={2} />
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="staff">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("books.wo.staffShort", "Cash short on staff")}</CardTitle>
              <CardDescription>
                {t(
                  "books.wo.staffDesc",
                  "Account 1300 — when an attendant hands over less cash than their shift accounts for, the shortfall is booked against them. “Recovered” is what they have since paid back.",
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {staffQ.isLoading ? (
                <Loading />
              ) : staff.length === 0 ? (
                <EmptyBooks
                  title={t("books.wo.noStaffTitle", "No staff shortages")}
                  body={t(
                    "books.wo.noStaffBody",
                    "Nobody has come up short in this range — or no shift with a cash handover has been locked yet.",
                  )}
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("books.wo.colEmployee", "Employee")}</TableHead>
                        <TableHead className="text-right">{t("books.wo.colShort", "Short (Dr)")}</TableHead>
                        <TableHead className="text-right">{t("books.wo.colRecovered", "Recovered (Cr)")}</TableHead>
                        <TableHead className="text-right">{t("books.wo.colStillOwes", "Still owes")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {staff.map((e) => (
                        <TableRow key={e.employeeId}>
                          <TableCell>
                            <Link
                              href={`/employees/${e.employeeId}`}
                              className="font-medium hover:underline"
                            >
                              {e.name}
                            </Link>
                            <div className="text-xs text-muted-foreground">
                              {e.designation || "—"}
                              {!e.isActive && ` · ${t("books.wo.inactive", "inactive")}`}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatINR(e.shortagePaise)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatINR(e.recoveredPaise)}
                          </TableCell>
                          <TableCell
                            className={`text-right font-mono font-medium ${
                              paise(e.outstandingPaise) > 0 ? "text-red-700" : ""
                            }`}
                          >
                            {formatINR(e.outstandingPaise)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-semibold">{t("common.total", "Total")}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {formatINR(staff.reduce((s, e) => s + paise(e.shortagePaise), 0))}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {formatINR(staff.reduce((s, e) => s + paise(e.recoveredPaise), 0))}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {formatINR(totalStaffDues)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                  <p className="text-xs text-muted-foreground mt-3">
                    {t(
                      "books.wo.staffNote",
                      "To write off or settle a shortage, post a manual entry: credit 1300 Staff Receivable and debit 1000 Cash (if they paid it back) or 6900 Cash Short (if you are absorbing it).",
                    )}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="channels">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t("books.wo.digital", "Digital money not yet in the bank")}
              </CardTitle>
              <CardDescription>
                {t(
                  "books.wo.digitalDesc",
                  "Account 1100 — card, UPI and wallet collections sit here until the money lands in your bank. A balance that keeps growing means settlements are not being recorded.",
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {channelsQ.isLoading ? (
                <Loading />
              ) : channels.length === 0 ? (
                <EmptyBooks
                  title={t("books.wo.noDigitalTitle", "No digital collections")}
                  body={t(
                    "books.wo.noDigitalBody",
                    "No card, UPI or wallet money has been booked to the clearing account in this range.",
                  )}
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("books.wo.colChannel", "Channel")}</TableHead>
                        <TableHead>{t("books.wo.colType", "Type")}</TableHead>
                        <TableHead className="text-right">{t("books.wo.colTakenIn", "Taken in (Dr)")}</TableHead>
                        <TableHead className="text-right">{t("books.wo.colSettled", "Settled to bank (Cr)")}</TableHead>
                        <TableHead className="text-right">{t("books.wo.colHeld", "Still held")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {channels.map((c) => (
                        <TableRow key={c.channelId}>
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{c.kind}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatINR(c.inPaise)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatINR(c.settledPaise)}
                          </TableCell>
                          <TableCell className="text-right font-mono font-medium">
                            {formatINR(c.heldPaise)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={2} className="font-semibold">
                          {t("common.total", "Total")}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {formatINR(channels.reduce((s, c) => s + paise(c.inPaise), 0))}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {formatINR(channels.reduce((s, c) => s + paise(c.settledPaise), 0))}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {formatINR(totalHeld)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                  <p className="text-xs text-muted-foreground mt-3">
                    {t(
                      "books.wo.digitalNote",
                      "When a settlement hits your bank, post a manual entry: debit 1050 Bank and credit 1100 Card / UPI / Wallet Clearing, tagged to that channel.",
                    )}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Loading() {
  const { t } = useT();
  return (
    <div className="text-sm text-muted-foreground py-6 text-center">
      {t("common.loading", "Loading…")}
    </div>
  );
}

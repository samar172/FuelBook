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
          label="Money customers owe you"
          value={formatINR(totalReceivable)}
          hint="Fuel sold on credit, not yet paid for"
          accent="amber"
        />
        <StatCard
          label="Cash short on staff"
          value={formatINR(totalStaffDues)}
          hint="Shortages recoverable from attendants"
          accent={totalStaffDues > 0 ? "red" : "green"}
        />
        <StatCard
          label="Digital money not yet in the bank"
          value={formatINR(totalHeld)}
          hint="Card / UPI / wallet taken, awaiting settlement"
          accent="primary"
        />
      </div>

      {mismatched.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border-2 border-red-300 bg-red-50 p-3 text-sm">
          <AlertTriangle className="h-5 w-5 text-red-700 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold text-red-900">
              {mismatched.length} customer{mismatched.length > 1 ? "s" : ""} disagree with the
              ledger
            </div>
            <div className="text-red-800">
              The balance stored on the customer record does not match what the books say:{" "}
              {mismatched.map((c) => c.name).join(", ")}. One of the two is wrong — check that
              customer&apos;s recent credit sales and payments, and whether any shift was
              unlocked after the balance was posted.
            </div>
          </div>
        </div>
      )}

      <Tabs defaultValue="customers" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="customers">Customer receivables</TabsTrigger>
          <TabsTrigger value="staff">Staff cash dues</TabsTrigger>
          <TabsTrigger value="channels">Digital float</TabsTrigger>
        </TabsList>

        <TabsContent value="customers">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Money customers owe you</CardTitle>
              <CardDescription>
                Account 1200 — Accounts Receivable, broken out per credit customer. &ldquo;Billed&rdquo;
                is fuel put on credit in this range; &ldquo;received&rdquo; is what they paid against
                their dues.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {customersQ.isLoading ? (
                <Loading />
              ) : customers.length === 0 ? (
                <EmptyBooks
                  title="No credit activity"
                  body="No customer had a credit sale or a payment posted to the books in this range."
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer</TableHead>
                        <TableHead className="text-right">Billed (Dr)</TableHead>
                        <TableHead className="text-right">Received (Cr)</TableHead>
                        <TableHead className="text-right">Owes as per books</TableHead>
                        <TableHead className="text-right">On their record</TableHead>
                        <TableHead>Agrees?</TableHead>
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
                              <Badge variant="success">Matches</Badge>
                            ) : (
                              <Badge variant="destructive">Mismatch</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-semibold">Total</TableCell>
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
              <CardTitle className="text-base">Cash short on staff</CardTitle>
              <CardDescription>
                Account 1300 — when an attendant hands over less cash than their shift accounts
                for, the shortfall is booked against them. &ldquo;Recovered&rdquo; is what they have
                since paid back.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {staffQ.isLoading ? (
                <Loading />
              ) : staff.length === 0 ? (
                <EmptyBooks
                  title="No staff shortages"
                  body="Nobody has come up short in this range — or no shift with a cash handover has been locked yet."
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead className="text-right">Short (Dr)</TableHead>
                        <TableHead className="text-right">Recovered (Cr)</TableHead>
                        <TableHead className="text-right">Still owes</TableHead>
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
                              {!e.isActive && " · inactive"}
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
                        <TableCell className="font-semibold">Total</TableCell>
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
                    To write off or settle a shortage, post a manual entry: credit 1300 Staff
                    Receivable and debit 1000 Cash (if they paid it back) or 6900 Cash Short (if
                    you are absorbing it).
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="channels">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Digital money not yet in the bank</CardTitle>
              <CardDescription>
                Account 1100 — card, UPI and wallet collections sit here until the money lands
                in your bank. A balance that keeps growing means settlements are not being
                recorded.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {channelsQ.isLoading ? (
                <Loading />
              ) : channels.length === 0 ? (
                <EmptyBooks
                  title="No digital collections"
                  body="No card, UPI or wallet money has been booked to the clearing account in this range."
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Channel</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Taken in (Dr)</TableHead>
                        <TableHead className="text-right">Settled to bank (Cr)</TableHead>
                        <TableHead className="text-right">Still held</TableHead>
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
                          Total
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
                    When a settlement hits your bank, post a manual entry: debit 1050 Bank and
                    credit 1100 Card / UPI / Wallet Clearing, tagged to that channel.
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
  return <div className="text-sm text-muted-foreground py-6 text-center">Loading…</div>;
}

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
import { ACCOUNT_PLAIN, AccountRow, BalanceSheet, paise, todayStr } from "@/lib/books";
import { AsOfBar, BalanceCheck, EmptyBooks, StatCard } from "../_components/controls";

export default function BalanceSheetPage() {
  const [asOf, setAsOf] = useState<string>(todayStr);

  const { data, isLoading } = useQuery<BalanceSheet>({
    queryKey: ["ledger", "balance-sheet", asOf],
    queryFn: async () => (await api.get(`/api/ledger/balance-sheet?asOf=${asOf}`)).data,
  });

  const nothing =
    data &&
    paise(data.totalAssetsPaise) === 0 &&
    paise(data.totalLiabilitiesPaise) === 0 &&
    paise(data.totalEquityPaise) === 0;

  const netWorth = paise(data?.totalEquityPaise);

  return (
    <div className="space-y-4">
      <AsOfBar asOf={asOf} onChange={setAsOf} />

      <BalanceCheck
        balanced={data?.balanced}
        differencePaise={data?.differencePaise}
        okTitle="The balance sheet balances"
        okBody="What the business owns equals what it owes plus what it is worth to you. That is the sign the books are internally consistent."
        badTitle="The balance sheet does NOT balance"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="What the business owns"
          value={formatINR(data?.totalAssetsPaise ?? 0)}
          hint="Assets — cash, bank, stock, money owed to you"
        />
        <StatCard
          label="What the business owes"
          value={formatINR(data?.totalLiabilitiesPaise ?? 0)}
          hint="Liabilities — mostly the fuel supplier"
          accent="amber"
        />
        <StatCard
          label="Your stake"
          value={formatINR(data?.totalEquityPaise ?? 0)}
          hint="Equity — capital you put in, plus profits kept in"
          accent={netWorth >= 0 ? "green" : "red"}
        />
        <StatCard
          label="Profits kept in the business"
          value={formatINR(data?.retainedEarningsPaise ?? 0)}
          hint="Retained earnings, all time up to this date"
          accent="primary"
        />
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground text-center">
            Loading…
          </CardContent>
        </Card>
      ) : nothing ? (
        <Card>
          <CardContent className="p-4">
            <EmptyBooks
              title="Nothing on the balance sheet yet"
              body="Balances build up as shifts are locked and manual entries are posted. Once there is activity, this page shows what the pump owns and owes on any given date."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Assets — what you own</CardTitle>
              <CardDescription>Balances as on {data?.asOf?.slice(0, 10) ?? asOf}.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <AccountTable
                rows={data?.assets ?? []}
                totalLabel="Total assets"
                totalPaise={data?.totalAssetsPaise ?? 0}
                asOf={asOf}
                emptyText="No assets recorded."
              />
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Liabilities — what you owe</CardTitle>
                <CardDescription>Money due to other people.</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <AccountTable
                  rows={data?.liabilities ?? []}
                  totalLabel="Total liabilities"
                  totalPaise={data?.totalLiabilitiesPaise ?? 0}
                  asOf={asOf}
                  emptyText="You owe nothing on the books."
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Equity — your stake</CardTitle>
                <CardDescription>
                  What you put in, less what you took out, plus profits left in the business.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.equityAccounts ?? []).map((r) => (
                      <AccountTableRow key={r.accountId} row={r} asOf={asOf} />
                    ))}
                    <TableRow>
                      <TableCell>
                        <div className="font-medium">Retained earnings</div>
                        <div className="text-xs text-muted-foreground">
                          Profits earned so far that have been left in the business
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatINR(data?.retainedEarningsPaise ?? 0)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell className="font-semibold">Total equity</TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {formatINR(data?.totalEquityPaise ?? 0)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    Liabilities + equity (must equal assets)
                  </span>
                  <span className="font-mono font-semibold">
                    {formatINR(
                      paise(data?.totalLiabilitiesPaise) + paise(data?.totalEquityPaise),
                    )}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function AccountTable({
  rows,
  totalLabel,
  totalPaise,
  asOf,
  emptyText,
}: {
  rows: AccountRow[];
  totalLabel: string;
  totalPaise: string | number;
  asOf: string;
  emptyText: string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Account</TableHead>
          <TableHead className="text-right">Balance</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={2} className="text-center text-muted-foreground">
              {emptyText}
            </TableCell>
          </TableRow>
        )}
        {rows.map((r) => (
          <AccountTableRow key={r.accountId} row={r} asOf={asOf} />
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell className="font-semibold">{totalLabel}</TableCell>
          <TableCell className="text-right font-mono font-semibold">
            {formatINR(totalPaise)}
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

function AccountTableRow({ row, asOf }: { row: AccountRow; asOf: string }) {
  return (
    <TableRow>
      <TableCell>
        <Link
          href={`/books/ledgers?code=${row.code}&to=${asOf}`}
          className="font-medium hover:underline"
        >
          <span className="font-mono text-xs text-muted-foreground mr-1.5">{row.code}</span>
          {row.name}
        </Link>
        <div className="text-xs text-muted-foreground">{ACCOUNT_PLAIN[row.code] ?? ""}</div>
      </TableCell>
      <TableCell className="text-right font-mono">{formatINR(row.balancePaise)}</TableCell>
    </TableRow>
  );
}

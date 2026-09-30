"use client";
import { Fragment, useState } from "react";
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
import { Button } from "@/components/ui/button";
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
import {
  AccountRow,
  AccountType,
  Range,
  TrialBalance,
  defaultRange,
  normalSide,
  paise,
} from "@/lib/books";
import {
  BalanceCheck,
  DateRangeBar,
  EmptyBooks,
  SideBadge,
  StatCard,
  acctName,
  acctPlain,
  typeLabel,
} from "./_components/controls";

const TYPE_ORDER: AccountType[] = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"];

export default function TrialBalancePage() {
  const { t } = useT();
  const [range, setRange] = useState<Range>(defaultRange);
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading } = useQuery<TrialBalance>({
    queryKey: ["ledger", "trial-balance", range],
    queryFn: async () =>
      (await api.get(`/api/ledger/trial-balance?from=${range.from}&to=${range.to}`)).data,
  });

  const rows: AccountRow[] = (showAll ? data?.allRows : data?.rows) ?? [];
  const hasMovement = (data?.rows ?? []).length > 0;

  return (
    <div className="space-y-4">
      <DateRangeBar range={range} onChange={setRange} />

      <BalanceCheck
        balanced={data?.balanced}
        differencePaise={data?.differencePaise}
        okTitle={t("books.tb.okTitle", "The books balance")}
        okBody={t(
          "books.tb.okBody",
          "Every rupee debited has a matching rupee credited across this range. This is the single best health check on your accounts.",
        )}
        badTitle={t("books.tb.badTitle", "The books do NOT balance")}
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard
          label={t("books.tb.totalDebits", "Total debits (Dr)")}
          value={formatINR(data?.totalDebitPaise ?? 0)}
          hint={t("books.tb.totalDebitsHint", "Money into an account")}
        />
        <StatCard
          label={t("books.tb.totalCredits", "Total credits (Cr)")}
          value={formatINR(data?.totalCreditPaise ?? 0)}
          hint={t("books.tb.totalCreditsHint", "Money out of an account")}
        />
        <StatCard
          label={t("books.tb.difference", "Difference")}
          value={formatINR(data?.differencePaise ?? 0)}
          hint={t("books.tb.differenceHint", "Must be zero")}
          accent={paise(data?.differencePaise) === 0 ? "green" : "red"}
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">{t("books.nav.trialBalance", "Trial Balance")}</CardTitle>
            <CardDescription>
              {t(
                "books.tb.desc",
                "Every account, with what moved through it between {from} and {to}. Click an account to see the entries behind it.",
                { from: range.from, to: range.to },
              )}
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowAll((v) => !v)}>
            {showAll
              ? t("books.tb.hideUnused", "Hide unused accounts")
              : t("books.tb.showAll", "Show all accounts")}
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              {t("common.loading", "Loading…")}
            </div>
          ) : !hasMovement && !showAll ? (
            <EmptyBooks />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("books.col.account", "Account")}</TableHead>
                    <TableHead className="text-right">{t("books.tb.colDebits", "Debits (Dr)")}</TableHead>
                    <TableHead className="text-right">{t("books.tb.colCredits", "Credits (Cr)")}</TableHead>
                    <TableHead className="text-right">{t("books.col.balance", "Balance")}</TableHead>
                    <TableHead>{t("books.tb.colNormally", "Normally")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {TYPE_ORDER.map((type) => {
                    const group = rows.filter((r) => r.type === type);
                    if (group.length === 0) return null;
                    return (
                      <Fragment key={type}>
                        <TableRow className="bg-slate-50">
                          <TableCell colSpan={5} className="font-semibold text-xs uppercase tracking-wide">
                            {typeLabel(t, type)}
                          </TableCell>
                        </TableRow>
                        {group.map((r) => (
                          <TableRow key={r.accountId}>
                            <TableCell>
                              <Link
                                href={`/books/ledgers?code=${r.code}&from=${range.from}&to=${range.to}`}
                                className="font-medium hover:underline"
                              >
                                <span className="font-mono text-xs text-muted-foreground mr-1.5">
                                  {r.code}
                                </span>
                                {acctName(t, r.code, r.name)}
                              </Link>
                              <div className="text-xs text-muted-foreground">
                                {acctPlain(t, r.code)}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {paise(r.debitPaise) ? formatINR(r.debitPaise) : "—"}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {paise(r.creditPaise) ? formatINR(r.creditPaise) : "—"}
                            </TableCell>
                            <TableCell className="text-right font-mono font-medium">
                              {formatINR(r.balancePaise)}
                            </TableCell>
                            <TableCell>
                              <SideBadge side={normalSide(r.type)} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </Fragment>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-semibold">{t("common.total", "Total")}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {formatINR(data?.totalDebitPaise ?? 0)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {formatINR(data?.totalCreditPaise ?? 0)}
                    </TableCell>
                    <TableCell colSpan={2} />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-3">
            {t(
              "books.tb.note",
              "Balances are shown the natural way round for each account — a positive number means what you would expect (cash you have, money owed to you, sales you made). Debits and credits are just the two sides of every entry; they always add up to the same total.",
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

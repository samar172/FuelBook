"use client";
import { Suspense, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
import { formatINR } from "@/lib/utils";
import { format } from "date-fns";
import { useT } from "@/lib/i18n";
import { useDateLocale } from "@/lib/i18n/core";
import {
  ACCOUNT_SUBJECT,
  AccountLedger,
  AccountRow,
  Range,
  SubjectKind,
  defaultRange,
  normalSide,
  paise,
} from "@/lib/books";
import {
  DateRangeBar,
  EmptyBooks,
  SideBadge,
  StatCard,
  acctName,
  acctPlain,
  sourceLabel,
  typeLabel,
} from "../_components/controls";
import { EntryDetailDialog } from "../_components/entry-detail";

const ALL = "ALL";

export default function LedgersPage() {
  const { t } = useT();
  return (
    <Suspense
      fallback={
        <div className="text-sm text-muted-foreground">{t("common.loading", "Loading…")}</div>
      }
    >
      <LedgersInner />
    </Suspense>
  );
}

function LedgersInner() {
  const { t } = useT();
  const locale = useDateLocale();
  const search = useSearchParams();
  const initialCode = search.get("code") ?? "";
  const initialRange: Range = {
    from: search.get("from") ?? defaultRange().from,
    to: search.get("to") ?? defaultRange().to,
  };

  const [code, setCode] = useState(initialCode);
  const [range, setRange] = useState<Range>(initialRange);
  const [subjectId, setSubjectId] = useState<string>(ALL);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: accounts = [] } = useQuery<AccountRow[]>({
    queryKey: ["ledger", "accounts", range.to],
    queryFn: async () => (await api.get(`/api/ledger/accounts?asOf=${range.to}`)).data,
  });

  // Default to Cash in Hand once the chart of accounts is known.
  useEffect(() => {
    if (!code && accounts.length > 0) setCode(accounts[0].code);
  }, [accounts, code]);

  const account = accounts.find((a) => a.code === code);
  const subjectKind: SubjectKind | undefined = code ? ACCOUNT_SUBJECT[code] : undefined;

  // Reset the subject whenever the account changes — a customer filter makes no
  // sense on the cash account.
  useEffect(() => {
    setSubjectId(ALL);
  }, [code]);

  const subjectParam =
    subjectId === ALL || !subjectKind
      ? ""
      : subjectKind === "customer"
        ? `&customerId=${subjectId}`
        : subjectKind === "employee"
          ? `&employeeId=${subjectId}`
          : subjectKind === "channel"
            ? `&channelId=${subjectId}`
            : subjectKind === "tank"
              ? `&tankId=${subjectId}`
              : "";

  const { data, isLoading } = useQuery<AccountLedger>({
    queryKey: ["ledger", "account-ledger", code, range, subjectId],
    queryFn: async () =>
      (
        await api.get(
          `/api/ledger/accounts/${code}/ledger?from=${range.from}&to=${range.to}${subjectParam}`,
        )
      ).data,
    enabled: Boolean(code),
  });

  const rows = data?.rows ?? [];

  return (
    <div className="space-y-4">
      <DateRangeBar range={range} onChange={setRange} />

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">{t("books.col.account", "Account")}</Label>
            <Select value={code || undefined} onValueChange={setCode}>
              <SelectTrigger className="w-[22rem] max-w-full">
                <SelectValue placeholder={t("books.lg.pickAccount", "Pick an account")} />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.code} value={a.code}>
                    {a.code} · {acctName(t, a.code, a.name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {subjectKind && <SubjectFilter kind={subjectKind} value={subjectId} onChange={setSubjectId} />}
        </CardContent>
      </Card>

      {account && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label={t("books.lg.opening", "Opening balance")}
            value={formatINR(data?.openingBalancePaise ?? 0)}
            hint={t("books.lg.before", "Before {date}", { date: range.from })}
          />
          <StatCard
            label={t("books.lg.totalIn", "Total in (Dr)")}
            value={formatINR(rows.reduce((s, r) => s + paise(r.debitPaise), 0))}
          />
          <StatCard
            label={t("books.lg.totalOut", "Total out (Cr)")}
            value={formatINR(rows.reduce((s, r) => s + paise(r.creditPaise), 0))}
          />
          <StatCard
            label={t("books.lg.closing", "Closing balance")}
            value={formatINR(data?.closingBalancePaise ?? 0)}
            hint={t("books.lg.asOn", "As on {date}", { date: range.to })}
            accent="primary"
          />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex flex-wrap items-center gap-2">
            {account ? (
              <>
                <span className="font-mono text-xs text-muted-foreground">{account.code}</span>
                {acctName(t, account.code, account.name)}
                <Badge variant="outline">{typeLabel(t, account.type)}</Badge>
                <SideBadge side={normalSide(account.type)} />
              </>
            ) : (
              t("books.lg.statement", "Account statement")
            )}
          </CardTitle>
          <CardDescription>
            {account
              ? t(
                  "books.lg.desc",
                  "{plain} — running balance after every entry. Click a row to open the full journal entry.",
                  { plain: acctPlain(t, account.code) },
                )
              : t("books.lg.descEmpty", "Pick an account above to see its statement.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!code ? (
            <EmptyBooks
              title={t("books.lg.pickAccount", "Pick an account")}
              body={t(
                "books.lg.pickBody",
                "Choose an account above to see every entry that touched it, with a running balance.",
              )}
            />
          ) : isLoading ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              {t("common.loading", "Loading…")}
            </div>
          ) : rows.length === 0 ? (
            <EmptyBooks
              title={t("books.lg.emptyTitle", "Nothing moved through this account")}
              body={t(
                "books.lg.emptyBody",
                "There were no entries on this account in the selected range. Try a wider date range, or a different account.",
              )}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">{t("common.date", "Date")}</TableHead>
                    <TableHead>{t("books.jr.colWhat", "What happened")}</TableHead>
                    <TableHead>{t("books.col.taggedTo", "Tagged to")}</TableHead>
                    <TableHead className="text-right">{t("books.lg.colDr", "Dr")}</TableHead>
                    <TableHead className="text-right">{t("books.lg.colCr", "Cr")}</TableHead>
                    <TableHead className="text-right">{t("books.col.balance", "Balance")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="bg-slate-50">
                    <TableCell colSpan={5} className="text-xs font-medium">
                      {t("books.lg.opening", "Opening balance")}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs font-medium">
                      {formatINR(data?.openingBalancePaise ?? 0)}
                    </TableCell>
                  </TableRow>
                  {rows.map((r) => {
                    const subject =
                      r.customer?.name ??
                      r.employee?.name ??
                      r.channel?.name ??
                      r.tank?.name ??
                      null;
                    return (
                      <TableRow
                        key={r.lineId}
                        className="cursor-pointer"
                        onClick={() => setOpenId(r.entryId)}
                      >
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(r.entryDate), "dd MMM yy", { locale })}
                        </TableCell>
                        <TableCell>
                          <div>{r.narration}</div>
                          <div className="text-xs text-muted-foreground">
                            {sourceLabel(t, r.source)}
                            {r.memo ? ` · ${r.memo}` : ""}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {subject ?? <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {paise(r.debitPaise) ? formatINR(r.debitPaise) : ""}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {paise(r.creditPaise) ? formatINR(r.creditPaise) : ""}
                        </TableCell>
                        <TableCell className="text-right font-mono font-medium">
                          {formatINR(r.runningBalancePaise)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="bg-slate-50">
                    <TableCell colSpan={5} className="text-xs font-semibold">
                      {t("books.lg.closing", "Closing balance")}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs font-semibold">
                      {formatINR(data?.closingBalancePaise ?? 0)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <EntryDetailDialog entryId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

type TFn = ReturnType<typeof useT>["t"];

const subjectMeta = (
  t: TFn,
): Record<SubjectKind, { label: string; url: string; allLabel: string }> => ({
  customer: {
    label: t("books.lg.subjCustomer", "Customer"),
    url: "/api/credit/customers",
    allLabel: t("books.lg.allCustomers", "All customers"),
  },
  employee: {
    label: t("books.lg.subjEmployee", "Employee"),
    url: "/api/employees",
    allLabel: t("books.lg.allEmployees", "All employees"),
  },
  channel: {
    label: t("books.lg.subjChannel", "Payment channel"),
    url: "/api/setup/payment-channels",
    allLabel: t("books.lg.allChannels", "All channels"),
  },
  tank: {
    label: t("books.lg.subjTank", "Tank"),
    url: "/api/setup/tanks",
    allLabel: t("books.lg.allTanks", "All tanks"),
  },
  expenseCategory: {
    label: t("books.lg.subjCategory", "Expense category"),
    url: "/api/setup/expense-categories",
    allLabel: t("books.lg.allCategories", "All categories"),
  },
});

/**
 * Some accounts are kept per subject — receivables per customer, staff shortages per
 * employee, digital float per channel. This narrows the statement to one of them.
 */
function SubjectFilter({
  kind,
  value,
  onChange,
}: {
  kind: SubjectKind;
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useT();
  const meta = subjectMeta(t)[kind];
  const { data: options = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["books-subjects", kind],
    queryFn: async () => (await api.get(meta.url)).data,
  });

  // The ledger API only filters by customer, employee, channel or tank.
  if (kind === "expenseCategory") return null;

  return (
    <div>
      <Label className="text-xs">{meta.label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-60">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{meta.allLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

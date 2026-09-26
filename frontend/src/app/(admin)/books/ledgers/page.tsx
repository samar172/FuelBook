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
import {
  ACCOUNT_PLAIN,
  ACCOUNT_SUBJECT,
  ACCOUNT_TYPE_LABELS,
  AccountLedger,
  AccountRow,
  Range,
  SOURCE_LABELS,
  SubjectKind,
  defaultRange,
  normalSide,
  paise,
} from "@/lib/books";
import { DateRangeBar, EmptyBooks, SideBadge, StatCard } from "../_components/controls";
import { EntryDetailDialog } from "../_components/entry-detail";

const ALL = "ALL";

export default function LedgersPage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
      <LedgersInner />
    </Suspense>
  );
}

function LedgersInner() {
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
            <Label className="text-xs">Account</Label>
            <Select value={code || undefined} onValueChange={setCode}>
              <SelectTrigger className="w-[22rem] max-w-full">
                <SelectValue placeholder="Pick an account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.code} value={a.code}>
                    {a.code} · {a.name}
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
            label="Opening balance"
            value={formatINR(data?.openingBalancePaise ?? 0)}
            hint={`Before ${range.from}`}
          />
          <StatCard
            label="Total in (Dr)"
            value={formatINR(rows.reduce((s, r) => s + paise(r.debitPaise), 0))}
          />
          <StatCard
            label="Total out (Cr)"
            value={formatINR(rows.reduce((s, r) => s + paise(r.creditPaise), 0))}
          />
          <StatCard
            label="Closing balance"
            value={formatINR(data?.closingBalancePaise ?? 0)}
            hint={`As on ${range.to}`}
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
                {account.name}
                <Badge variant="outline">{ACCOUNT_TYPE_LABELS[account.type]}</Badge>
                <SideBadge side={normalSide(account.type)} />
              </>
            ) : (
              "Account statement"
            )}
          </CardTitle>
          <CardDescription>
            {account
              ? `${ACCOUNT_PLAIN[account.code] ?? ""} — running balance after every entry. Click a row to open the full journal entry.`
              : "Pick an account above to see its statement."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!code ? (
            <EmptyBooks
              title="Pick an account"
              body="Choose an account above to see every entry that touched it, with a running balance."
            />
          ) : isLoading ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Loading…</div>
          ) : rows.length === 0 ? (
            <EmptyBooks
              title="Nothing moved through this account"
              body="There were no entries on this account in the selected range. Try a wider date range, or a different account."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Date</TableHead>
                    <TableHead>What happened</TableHead>
                    <TableHead>Tagged to</TableHead>
                    <TableHead className="text-right">Dr</TableHead>
                    <TableHead className="text-right">Cr</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="bg-slate-50">
                    <TableCell colSpan={5} className="text-xs font-medium">
                      Opening balance
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
                          {format(new Date(r.entryDate), "dd MMM yy")}
                        </TableCell>
                        <TableCell>
                          <div>{r.narration}</div>
                          <div className="text-xs text-muted-foreground">
                            {SOURCE_LABELS[r.source] ?? r.source}
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
                      Closing balance
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

const SUBJECT_META: Record<SubjectKind, { label: string; url: string; allLabel: string }> = {
  customer: {
    label: "Customer",
    url: "/api/credit/customers",
    allLabel: "All customers",
  },
  employee: { label: "Employee", url: "/api/employees", allLabel: "All employees" },
  channel: {
    label: "Payment channel",
    url: "/api/setup/payment-channels",
    allLabel: "All channels",
  },
  tank: { label: "Tank", url: "/api/setup/tanks", allLabel: "All tanks" },
  expenseCategory: {
    label: "Expense category",
    url: "/api/setup/expense-categories",
    allLabel: "All categories",
  },
};

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
  const meta = SUBJECT_META[kind];
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

"use client";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link2, Plus, Unlink } from "lucide-react";
import { api } from "@/lib/api";
import { apiError } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useT } from "@/lib/i18n";
import {
  type TFn,
  EmptyState,
  Loading,
  Money,
  StatTile,
  daysAgoStr,
  isOwner,
  parseCsv,
  toIsoDate,
  toPaise,
  todayStr,
} from "./shared";
import { accountLabel, useBankAccounts, type BankAccountRow } from "./deposits";
import type { SettlementRow } from "./settlements";

const NONE = "__none__";
const ALL = "__all__";

// ===================== BANK ACCOUNTS =====================

export function BankAccountsSection() {
  const { t } = useT();
  const qc = useQueryClient();
  const owner = isOwner();
  const accountsQ = useBankAccounts();
  const accounts = accountsQ.data ?? [];
  const [open, setOpen] = useState(false);

  const [bankName, setBankName] = useState("");
  const [last4, setLast4] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [nickname, setNickname] = useState("");
  const [opening, setOpening] = useState("");

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post("/api/cash-bank/bank-accounts", {
          bankName: bankName.trim(),
          accountNoLast4: last4.trim(),
          ifsc: ifsc.trim() || null,
          nickname: nickname.trim() || null,
          openingBalancePaise: rupeesToPaise(opening || "0"),
        })
      ).data,
    onSuccess: () => {
      toast.success(t("cash.bank.added", "Bank account added"));
      setOpen(false);
      setBankName("");
      setLast4("");
      setIfsc("");
      setNickname("");
      setOpening("");
      qc.invalidateQueries({ queryKey: ["cash-bank-accounts"] });
    },
    onError: (e) => toast.error(apiError(e, t("cash.bank.addFailed", "Could not add the account"))),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle>{t("cash.bank.accountsTitle", "Bank accounts")}</CardTitle>
            <CardDescription>
              {t(
                "cash.bank.accountsDesc",
                "Only the last four digits are ever stored. The balance is the opening balance plus every imported credit, less every debit.",
              )}
            </CardDescription>
          </div>
          {owner ? (
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> {t("cash.bank.addAccount", "Add account")}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {accountsQ.isLoading ? (
          <Loading />
        ) : accountsQ.error ? (
          <EmptyState title={t("cash.bank.loadFailed", "Could not load bank accounts")} hint={apiError(accountsQ.error)} />
        ) : accounts.length === 0 ? (
          <EmptyState
            title={t("cash.bank.noAccounts", "No bank accounts yet")}
            hint={
              owner
                ? t(
                    "cash.bank.noAccountsOwner",
                    "Add the account the pump banks into — deposits and settlements hang off it.",
                  )
                : t("cash.bank.noAccountsStaff", "Ask the owner to add the pump's bank account.")
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {accounts.map((a) => (
              <div key={a.id} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{a.nickname || a.bankName}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("cash.bank.accountEnding", "{bank} · account ending {last4}", {
                        bank: a.bankName,
                        last4: a.accountNoLast4,
                      })}
                      {a.ifsc ? ` · ${a.ifsc}` : ""}
                    </p>
                  </div>
                  {!a.isActive ? <Badge variant="secondary">{t("cash.bank.inactive", "inactive")}</Badge> : null}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">{t("cash.bank.balance", "Balance")}</p>
                    <p className="font-semibold">
                      <Money paise={a.currentBalancePaise} emphasise />
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {t("cash.bank.depositsRecorded", "Deposits recorded")}
                    </p>
                    <p className="font-semibold tabular-nums">
                      {formatINR(a.depositsPaise)}{" "}
                      <span className="text-xs text-muted-foreground">({a.depositCount})</span>
                    </p>
                  </div>
                  <div className="col-span-2 text-xs text-muted-foreground">
                    {t(
                      "cash.bank.accountFoot",
                      "Opening {opening} · credits {credits} · debits {debits} · {lines} statement lines · {pending} of deposits still pending",
                      {
                        opening: formatINR(a.openingBalancePaise),
                        credits: formatINR(a.creditsPaise),
                        debits: formatINR(a.debitsPaise),
                        lines: a.transactionCount,
                        pending: formatINR(a.depositsPendingPaise),
                      },
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("cash.bank.addTitle", "Add a bank account")}</DialogTitle>
            <DialogDescription>
              {t(
                "cash.bank.addDesc",
                "Enter only the last four digits of the account number — the full number is never stored.",
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">{t("cash.bank.bankName", "Bank name")}</Label>
              <Input value={bankName} onChange={(e) => setBankName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">{t("cash.bank.last4", "Last 4 digits")}</Label>
                <Input
                  value={last4}
                  inputMode="numeric"
                  maxLength={4}
                  onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                />
              </div>
              <div>
                <Label className="text-xs">{t("cash.bank.ifsc", "IFSC (optional)")}</Label>
                <Input value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase())} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">{t("cash.bank.nickname", "Nickname (optional)")}</Label>
                <Input value={nickname} onChange={(e) => setNickname(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">{t("cash.bank.opening", "Opening balance (₹)")}</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={opening}
                  onChange={(e) => setOpening(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                {t("common.cancel", "Cancel")}
              </Button>
              <Button
                onClick={() => create.mutate()}
                disabled={!bankName.trim() || last4.length !== 4 || create.isPending}
              >
                {create.isPending
                  ? t("common.saving", "Saving…")
                  : t("cash.bank.addAccount", "Add account")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ===================== CSV IMPORT =====================

type ParsedRow = {
  txnDate: string;
  description: string;
  amountPaise: string;
  direction: "CREDIT" | "DEBIT";
  balancePaise?: string;
  reference?: string | null;
};

const findHeader = (headers: string[], names: string[]) =>
  headers.findIndex((h) => names.some((n) => h.includes(n)));

// The pasted statement is parsed here in the browser. Nothing is fetched from a
// bank, and the parsed rows are posted to the API as plain numbers.
function mapStatement(
  text: string,
  t: TFn,
): { rows: ParsedRow[]; errors: string[]; headers: string[] } {
  const table = parseCsv(text);
  const errors: string[] = [];
  if (table.length === 0) return { rows: [], errors: [t("cash.import.errNothing", "Nothing to parse")], headers: [] };

  const headers = table[0].map((h) => h.trim().toLowerCase());
  const iDate = findHeader(headers, ["date"]);
  const iDesc = findHeader(headers, ["description", "narration", "particular", "detail", "remark"]);
  const iDebit = findHeader(headers, ["debit", "withdraw"]);
  const iCredit = findHeader(headers, ["credit", "deposit"]);
  const iAmount = findHeader(headers, ["amount"]);
  const iType = findHeader(headers, ["dr/cr", "cr/dr", "type"]);
  const iBalance = findHeader(headers, ["balance"]);
  const iRef = findHeader(headers, ["ref", "chq", "cheque", "utr"]);

  if (iDate < 0) errors.push(
      t("cash.import.errNoDate", "No date column found — the first row must be a header row"),
    );
  if (iDesc < 0) errors.push(t("cash.import.errNoDesc", "No description/narration column found"));
  if (iDebit < 0 && iCredit < 0 && iAmount < 0) {
    errors.push(t("cash.import.errNoAmountCol", "No debit/credit or amount column found"));
  }
  if (errors.length > 0) return { rows: [], errors, headers };

  const rows: ParsedRow[] = [];
  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    const at = (i: number) => (i >= 0 ? (cells[i] ?? "").trim() : "");
    const date = toIsoDate(at(iDate));
    if (!date) {
      // A totals or footer line, not a transaction.
      if (at(iDate)) {
        errors.push(
          t("cash.import.errBadDate", 'Row {row}: could not read the date "{value}" — skipped', {
            row: r + 1,
            value: at(iDate),
          }),
        );
      }
      continue;
    }
    const debit = iDebit >= 0 ? toPaise(at(iDebit)) : null;
    const credit = iCredit >= 0 ? toPaise(at(iCredit)) : null;
    let direction: "CREDIT" | "DEBIT" | null = null;
    let amountPaise: string | null = null;

    if (credit && BigInt(credit) > 0n) {
      direction = "CREDIT";
      amountPaise = credit;
    } else if (debit && BigInt(debit) > 0n) {
      direction = "DEBIT";
      amountPaise = debit;
    } else if (iAmount >= 0) {
      const amt = toPaise(at(iAmount));
      if (amt) {
        const signed = BigInt(amt);
        const typeCell = at(iType).toLowerCase();
        if (typeCell.startsWith("cr") || typeCell.includes("credit")) direction = "CREDIT";
        else if (typeCell.startsWith("dr") || typeCell.includes("debit")) direction = "DEBIT";
        else direction = signed < 0n ? "DEBIT" : "CREDIT";
        amountPaise = (signed < 0n ? -signed : signed).toString();
      }
    }

    if (!direction || !amountPaise || BigInt(amountPaise) === 0n) {
      errors.push(t("cash.import.errNoAmount", "Row {row}: no amount — skipped", { row: r + 1 }));
      continue;
    }
    const balance = iBalance >= 0 ? toPaise(at(iBalance)) : null;
    rows.push({
      txnDate: date,
      description: at(iDesc) || "(no description)",
      amountPaise,
      direction,
      ...(balance ? { balancePaise: balance } : {}),
      reference: at(iRef) || null,
    });
  }
  if (rows.length === 0) errors.push(t("cash.import.errNoRows", "No usable transaction rows were found"));
  return { rows, errors, headers };
}

function ImportSection({ accounts }: { accounts: BankAccountRow[] }) {
  const { t } = useT();
  const qc = useQueryClient();
  const [bankAccountId, setBankAccountId] = useState("");
  const [text, setText] = useState("");
  const [batchLabel, setBatchLabel] = useState("");

  const parsed = useMemo(() => (text.trim() ? mapStatement(text, t) : null), [text, t]);

  const doImport = useMutation({
    mutationFn: async () =>
      (
        await api.post(`/api/cash-bank/bank-accounts/${bankAccountId}/transactions/import`, {
          importBatch: batchLabel.trim() || `pasted ${todayStr()}`,
          rows: parsed?.rows ?? [],
        })
      ).data,
    onSuccess: (d: { imported: number; skipped: number; received: number }) => {
      toast.success(
        t("cash.import.done", "Imported {imported} of {received} lines{skipped}", {
          imported: d.imported,
          received: d.received,
          skipped: d.skipped
            ? t("cash.import.doneSkipped", " · {n} already present", { n: d.skipped })
            : "",
        }),
      );
      setText("");
      qc.invalidateQueries({ queryKey: ["cash-bank-transactions"] });
      qc.invalidateQueries({ queryKey: ["cash-bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["cash-reconciliation"] });
    },
    onError: (e) => toast.error(apiError(e, t("cash.import.failed", "Import failed"))),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>{t("cash.import.title", "Import a bank statement")}</CardTitle>
        <CardDescription>
          {t(
            "cash.import.desc",
            "Paste the CSV your bank gives you. It is parsed here on your phone or computer — nothing is sent anywhere except to FuelBook. Lines already imported are skipped.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {accounts.length === 0 ? (
          <EmptyState title={t("cash.import.addAccountFirst", "Add a bank account first")} />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">{t("cash.import.intoAccount", "Into account")}</Label>
                <Select value={bankAccountId} onValueChange={setBankAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("cash.import.pickAccount", "Pick an account")} />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {accountLabel(a)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">{t("cash.import.label", "Label for this import")}</Label>
                <Input
                  value={batchLabel}
                  onChange={(e) => setBatchLabel(e.target.value)}
                  placeholder={t("cash.import.labelPh", "e.g. April statement")}
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">
                {t("cash.import.paste", "Paste CSV (first row must be the header)")}
              </Label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                spellCheck={false}
                placeholder="Date,Narration,Debit,Credit,Balance&#10;01/04/2026,CASH DEP 4412,,50000.00,182340.55"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              />
            </div>

            {parsed ? (
              <div className="space-y-2">
                {parsed.errors.length > 0 ? (
                  <ul className="text-xs text-amber-600 list-disc pl-5 space-y-0.5">
                    {parsed.errors.slice(0, 8).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                    {parsed.errors.length > 8 ? (
                      <li>{t("cash.import.andMore", "…and {n} more", { n: parsed.errors.length - 8 })}</li>
                    ) : null}
                  </ul>
                ) : null}

                {parsed.rows.length > 0 ? (
                  <>
                    <p className="text-sm font-medium">
                      {parsed.rows.length === 1
                        ? t("cash.import.readyOne", "{n} line ready", { n: parsed.rows.length })
                        : t("cash.import.readyMany", "{n} lines ready", { n: parsed.rows.length })}
                    </p>
                    <div className="overflow-x-auto max-h-64 overflow-y-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t("common.date", "Date")}</TableHead>
                            <TableHead>{t("cash.import.colDesc", "Description")}</TableHead>
                            <TableHead className="text-right">{t("common.amount", "Amount")}</TableHead>
                            <TableHead>{t("cash.import.colDrCr", "Dr/Cr")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {parsed.rows.slice(0, 50).map((r, i) => (
                            <TableRow key={i}>
                              <TableCell className="whitespace-nowrap">{r.txnDate}</TableCell>
                              <TableCell className="max-w-[18rem] truncate">
                                {r.description}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatINR(r.amountPaise)}
                              </TableCell>
                              <TableCell>
                                <Badge variant={r.direction === "CREDIT" ? "default" : "secondary"}>
                                  {t(`cash.dir.${r.direction}`, r.direction)}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {parsed.rows.length > 50 ? (
                      <p className="text-xs text-muted-foreground">
                        {t("cash.import.showingFirst", "Showing the first 50 of {n}.", {
                          n: parsed.rows.length,
                        })}
                      </p>
                    ) : null}
                  </>
                ) : null}

                <div className="flex justify-end">
                  <Button
                    onClick={() => doImport.mutate()}
                    disabled={!bankAccountId || parsed.rows.length === 0 || doImport.isPending}
                  >
                    {doImport.isPending
                      ? t("cash.import.importing", "Importing…")
                      : t("cash.import.importBtn", "Import {n} lines", { n: parsed.rows.length })}
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ===================== MATCHING =====================

type TxnRow = {
  id: string;
  txnDate: string;
  description: string;
  amountPaise: string;
  direction: "CREDIT" | "DEBIT";
  balancePaise: string | null;
  reference: string | null;
  importBatch: string | null;
  isMatched: boolean;
  matchedKind: string | null;
  matchedId: string | null;
  bankAccount: { id: string; bankName: string; accountNoLast4: string; nickname: string | null };
};

function MatchingSection({ accounts }: { accounts: BankAccountRow[] }) {
  const { t } = useT();
  const qc = useQueryClient();
  const owner = isOwner();
  const [bankAccountId, setBankAccountId] = useState(ALL);
  const [from, setFrom] = useState(daysAgoStr(60));
  const [to, setTo] = useState(todayStr());
  const [matched, setMatched] = useState("unmatched");
  const [matching, setMatching] = useState<TxnRow | null>(null);

  const qs = useMemo(() => {
    const p = new URLSearchParams({ from, to, matched });
    if (bankAccountId !== ALL) p.set("bankAccountId", bankAccountId);
    return p.toString();
  }, [from, to, matched, bankAccountId]);

  const txnsQ = useQuery<{ transactions: TxnRow[]; count: number; unmatchedCount: number }>({
    queryKey: ["cash-bank-transactions", qs],
    queryFn: async () => (await api.get(`/api/cash-bank/transactions?${qs}`)).data,
  });

  const summaryQs = useMemo(() => {
    const p = new URLSearchParams({ from, to });
    if (bankAccountId !== ALL) p.set("bankAccountId", bankAccountId);
    return p.toString();
  }, [from, to, bankAccountId]);

  const summaryQ = useQuery<{
    credits: { matched: { count: number; amountPaise: string }; unmatched: { count: number; amountPaise: string } };
    debits: { matched: { count: number; amountPaise: string }; unmatched: { count: number; amountPaise: string } };
    matchedCount: number;
    unmatchedCount: number;
    unmatchedCreditPaise: string;
    unmatchedDebitPaise: string;
    openDepositsPaise: string;
    openSettlementsExpectedPaise: string;
  }>({
    queryKey: ["cash-reconciliation", summaryQs],
    queryFn: async () => (await api.get(`/api/cash-bank/reconciliation-summary?${summaryQs}`)).data,
  });

  const unmatch = useMutation({
    mutationFn: async (id: string) =>
      (await api.post(`/api/cash-bank/transactions/${id}/unmatch`)).data,
    onSuccess: () => {
      toast.success(t("cash.match.removed", "Match removed"));
      qc.invalidateQueries({ queryKey: ["cash-bank-transactions"] });
      qc.invalidateQueries({ queryKey: ["cash-reconciliation"] });
    },
    onError: (e) => toast.error(apiError(e, t("cash.match.removeFailed", "Could not unmatch"))),
  });

  const rows = txnsQ.data?.transactions ?? [];
  const s = summaryQ.data;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>{t("cash.match.title", "Match the statement")}</CardTitle>
        <CardDescription>
          {t(
            "cash.match.desc",
            "Tie each bank line to the deposit slip or settlement it belongs to. What stays unmatched is what nobody can explain.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {matching ? (
          <MatchDialog
            txn={matching}
            from={from}
            to={to}
            onClose={() => setMatching(null)}
          />
        ) : null}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div>
            <Label className="text-xs">{t("cash.match.account", "Account")}</Label>
            <Select value={bankAccountId} onValueChange={setBankAccountId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("cash.match.allAccounts", "All accounts")}</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {accountLabel(a)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{t("common.from", "From")}</Label>
            <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">{t("common.to", "To")}</Label>
            <Input
              type="date"
              value={to}
              min={from}
              max={todayStr()}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">{t("cash.match.show", "Show")}</Label>
            <Select value={matched} onValueChange={setMatched}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unmatched">{t("cash.match.unmatchedOnly", "Unmatched only")}</SelectItem>
                <SelectItem value="matched">{t("cash.match.matchedOnly", "Matched only")}</SelectItem>
                <SelectItem value="all">{t("cash.match.everything", "Everything")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {s ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile
              label={t("cash.match.matchedLines", "Matched lines")}
              value={s.matchedCount}
              tone="good"
            />
            <StatTile
              label={t("cash.match.unmatchedLines", "Unmatched lines")}
              value={s.unmatchedCount}
              hint={t("cash.match.inOut", "in {in} · out {out}", {
                in: formatINR(s.unmatchedCreditPaise),
                out: formatINR(s.unmatchedDebitPaise),
              })}
              tone={s.unmatchedCount > 0 ? "warn" : "good"}
            />
            <StatTile
              label={t("cash.match.openDeposits", "Deposits not cleared")}
              value={formatINR(s.openDepositsPaise)}
              hint={t("cash.match.openDepositsHint", "Slips the bank has not confirmed")}
            />
            <StatTile
              label={t("cash.match.openSettlements", "Settlements awaiting")}
              value={formatINR(s.openSettlementsExpectedPaise)}
              hint={t("cash.match.openSettlementsHint", "Card/UPI money not yet credited")}
            />
          </div>
        ) : null}

        {txnsQ.isLoading ? (
          <Loading />
        ) : txnsQ.error ? (
          <EmptyState title={t("cash.match.loadFailed", "Could not load statement lines")} hint={apiError(txnsQ.error)} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={
              matched === "unmatched"
                ? t("cash.match.emptyUnmatched", "Nothing unmatched")
                : t("cash.match.emptyAll", "No statement lines here")
            }
            hint={
              matched === "unmatched"
                ? t(
                    "cash.match.emptyUnmatchedHint",
                    "Every imported line in this range is accounted for.",
                  )
                : t("cash.match.emptyAllHint", "Import a statement above to start matching.")
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.date", "Date")}</TableHead>
                  <TableHead>{t("cash.import.colDesc", "Description")}</TableHead>
                  <TableHead className="text-right">{t("common.amount", "Amount")}</TableHead>
                  <TableHead>{t("cash.import.colDrCr", "Dr/Cr")}</TableHead>
                  <TableHead>{t("cash.match.colMatchedTo", "Matched to")}</TableHead>
                  {owner ? <TableHead /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="whitespace-nowrap">{tx.txnDate.slice(0, 10)}</TableCell>
                    <TableCell className="max-w-[16rem] truncate" title={tx.description}>
                      {tx.description}
                      {tx.reference ? (
                        <span className="block text-xs text-muted-foreground">{tx.reference}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatINR(tx.amountPaise)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={tx.direction === "CREDIT" ? "default" : "secondary"}>
                        {t(`cash.dir.${tx.direction}`, tx.direction)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {tx.isMatched
                        ? tx.matchedKind
                          ? t(`cash.match.short.${tx.matchedKind}`, tx.matchedKind)
                          : t("cash.match.matched", "matched")
                        : "—"}
                    </TableCell>
                    {owner ? (
                      <TableCell className="whitespace-nowrap">
                        {tx.isMatched ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => unmatch.mutate(tx.id)}
                            disabled={unmatch.isPending}
                          >
                            <Unlink className="h-4 w-4 mr-1" /> {t("cash.match.unmatchBtn", "Unmatch")}
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => setMatching(tx)}>
                            <Link2 className="h-4 w-4 mr-1" /> {t("cash.match.matchBtn", "Match")}
                          </Button>
                        )}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type DepositOption = {
  id: string;
  amountPaise: string;
  depositedOn: string;
  slipNo: string | null;
  status: string;
};

function MatchDialog({
  txn,
  from,
  to,
  onClose,
}: {
  txn: TxnRow;
  from: string;
  to: string;
  onClose: () => void;
}) {
  const { t } = useT();
  const qc = useQueryClient();
  const [kind, setKind] = useState<"CASH_DEPOSIT" | "SETTLEMENT" | "OTHER">("CASH_DEPOSIT");
  const [targetId, setTargetId] = useState(NONE);

  const depositsQ = useQuery<{ deposits: DepositOption[] }>({
    queryKey: ["cash-deposits", `from=${from}&to=${to}`],
    queryFn: async () => (await api.get(`/api/cash-bank/deposits?from=${from}&to=${to}`)).data,
  });
  const settlementsQ = useQuery<{ batches: SettlementRow[] }>({
    queryKey: ["cash-settlements", `from=${from}&to=${to}`],
    queryFn: async () => (await api.get(`/api/cash-bank/settlements?from=${from}&to=${to}`)).data,
  });

  const match = useMutation({
    mutationFn: async () =>
      (
        await api.post(`/api/cash-bank/transactions/${txn.id}/match`, {
          kind,
          ...(kind === "OTHER" ? {} : { id: targetId === NONE ? undefined : targetId }),
        })
      ).data as { warnings: string[] },
    onSuccess: (d) => {
      if (d.warnings?.length) d.warnings.forEach((w) => toast.warning(w));
      else toast.success(t("cash.match.done", "Matched"));
      qc.invalidateQueries({ queryKey: ["cash-bank-transactions"] });
      qc.invalidateQueries({ queryKey: ["cash-reconciliation"] });
      onClose();
    },
    onError: (e) => toast.error(apiError(e, t("cash.match.failed", "Could not match this line"))),
  });

  const deposits = depositsQ.data?.deposits ?? [];
  const settlements = settlementsQ.data?.batches ?? [];
  const blocked = kind !== "OTHER" && targetId === NONE;

  return (
    <Dialog open onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("cash.match.dialogTitle", "Match this bank line")}</DialogTitle>
          <DialogDescription>
            {txn.txnDate.slice(0, 10)} · {t(`cash.dir.${txn.direction}`, txn.direction)} · {formatINR(txn.amountPaise)} ·{" "}
            {txn.description}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">{t("cash.match.thisLineIs", "This line is")}</Label>
            <Select value={kind} onValueChange={(v) => { setKind(v as typeof kind); setTargetId(NONE); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CASH_DEPOSIT">
                  {t("cash.match.kindDeposit", "A cash deposit we made")}
                </SelectItem>
                <SelectItem value="SETTLEMENT">
                  {t("cash.match.kindSettlement", "A card/UPI settlement")}
                </SelectItem>
                <SelectItem value="OTHER">
                  {t("cash.match.kindOther", "Something else (just mark it seen)")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {kind === "CASH_DEPOSIT" ? (
            deposits.length === 0 ? (
              <EmptyState
                title={t("cash.match.noDeposits", "No deposits in this range to match against")}
              />
            ) : (
              <div>
                <Label className="text-xs">{t("cash.match.depositSlip", "Deposit slip")}</Label>
                <Select value={targetId} onValueChange={setTargetId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("cash.match.pickDeposit", "Pick a deposit")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t("cash.match.pickDepositItem", "Pick a deposit…")}</SelectItem>
                    {deposits.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.depositedOn.slice(0, 10)} · {formatINR(d.amountPaise)}
                        {d.slipNo ? ` · ${d.slipNo}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )
          ) : null}

          {kind === "SETTLEMENT" ? (
            settlements.length === 0 ? (
              <EmptyState
                title={t(
                  "cash.match.noBatches",
                  "No settlement batches in this range to match against",
                )}
              />
            ) : (
              <div>
                <Label className="text-xs">{t("cash.match.batch", "Settlement batch")}</Label>
                <Select value={targetId} onValueChange={setTargetId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("cash.match.pickBatch", "Pick a batch")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t("cash.match.pickBatchItem", "Pick a batch…")}</SelectItem>
                    {settlements.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.businessDate.slice(0, 10)} · {b.channel.name} ·{" "}
                        {formatINR(b.settledPaise !== "0" ? b.settledPaise : b.expectedPaise)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )
          ) : null}

          <p className="text-xs text-muted-foreground">
            {t(
              "cash.match.note",
              "If the amounts differ the match is still recorded, with a warning — a part-payment or a netted-off fee is usually the reason, and it needs a human to look.",
            )}
          </p>

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={onClose}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button onClick={() => match.mutate()} disabled={blocked || match.isPending}>
              {match.isPending
                ? t("cash.match.matching", "Matching…")
                : t("cash.match.matchBtn", "Match")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function BankSection() {
  const accountsQ = useBankAccounts();
  const accounts = accountsQ.data ?? [];
  return (
    <div className="space-y-4">
      <BankAccountsSection />
      {isOwner() ? <ImportSection accounts={accounts} /> : null}
      <MatchingSection accounts={accounts} />
    </div>
  );
}

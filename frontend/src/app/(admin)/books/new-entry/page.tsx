"use client";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api, getAuthUser } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatINR } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { acctName, acctPlain } from "../_components/controls";
import { apiError } from "@/lib/types";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Lock, Plus, Trash2 } from "lucide-react";
import {
  ACCOUNT_CODE,
  ACCOUNT_SUBJECT,
  AccountRow,
  SubjectKind,
  inputToPaise,
  todayStr,
} from "@/lib/books";

type Side = "DR" | "CR";

type LineDraft = {
  key: string;
  code: string;
  side: Side;
  amount: string; // rupees, as typed
  subjectId: string; // "" when none / not applicable
  memo: string;
};

const NONE = "NONE";

let seq = 0;
const newLine = (over?: Partial<LineDraft>): LineDraft => ({
  key: `l${++seq}`,
  code: "",
  side: "DR",
  amount: "",
  subjectId: "",
  memo: "",
  ...over,
});

// Common corrections, pre-wired so the owner does not have to remember which side
// each account sits on.
const TEMPLATES: { key: string; label: string; narration: string; lines: Partial<LineDraft>[] }[] = [
  {
    key: "books.tpl.ownerIn",
    label: "I put money into the business",
    narration: "Owner capital introduced",
    lines: [
      { code: ACCOUNT_CODE.CASH, side: "DR" },
      { code: ACCOUNT_CODE.OWNER_CAPITAL, side: "CR" },
    ],
  },
  {
    key: "books.tpl.ownerOut",
    label: "I took money out of the business",
    narration: "Owner drawings",
    lines: [
      { code: ACCOUNT_CODE.OWNER_DRAWINGS, side: "DR" },
      { code: ACCOUNT_CODE.CASH, side: "CR" },
    ],
  },
  {
    key: "books.tpl.digitalIn",
    label: "Card / UPI money landed in the bank",
    narration: "Digital settlement received in bank",
    lines: [
      { code: ACCOUNT_CODE.BANK, side: "DR" },
      { code: ACCOUNT_CODE.CARD_UPI_CLEARING, side: "CR" },
    ],
  },
  {
    key: "books.tpl.staffPaid",
    label: "Staff paid back a cash shortage",
    narration: "Cash shortage recovered from staff",
    lines: [
      { code: ACCOUNT_CODE.CASH, side: "DR" },
      { code: ACCOUNT_CODE.RECEIVABLE_STAFF, side: "CR" },
    ],
  },
  {
    key: "books.tpl.staffWriteOff",
    label: "Writing off a staff shortage",
    narration: "Staff cash shortage written off",
    lines: [
      { code: ACCOUNT_CODE.CASH_SHORT, side: "DR" },
      { code: ACCOUNT_CODE.RECEIVABLE_STAFF, side: "CR" },
    ],
  },
  {
    key: "books.tpl.paySupplier",
    label: "Paid the fuel supplier",
    narration: "Payment to fuel supplier",
    lines: [
      { code: ACCOUNT_CODE.PAYABLE_FUEL, side: "DR" },
      { code: ACCOUNT_CODE.BANK, side: "CR" },
    ],
  },
  {
    key: "books.tpl.cashDeposit",
    label: "Cash deposited into the bank",
    narration: "Cash deposited to bank",
    lines: [
      { code: ACCOUNT_CODE.BANK, side: "DR" },
      { code: ACCOUNT_CODE.CASH, side: "CR" },
    ],
  },
  {
    key: "books.tpl.customerPaid",
    label: "A customer paid off their dues",
    narration: "Payment received from credit customer",
    lines: [
      { code: ACCOUNT_CODE.CASH, side: "DR" },
      { code: ACCOUNT_CODE.RECEIVABLE_CUSTOMER, side: "CR" },
    ],
  },
];

export default function NewEntryPage() {
  const { t } = useT();
  const router = useRouter();
  const qc = useQueryClient();
  const isOwner = getAuthUser()?.role === "OWNER";

  const [entryDate, setEntryDate] = useState(todayStr);
  const [narration, setNarration] = useState("");
  const [lines, setLines] = useState<LineDraft[]>(() => [newLine(), newLine({ side: "CR" })]);

  const { data: accounts = [] } = useQuery<AccountRow[]>({
    queryKey: ["ledger", "accounts", "new-entry"],
    queryFn: async () => (await api.get(`/api/ledger/accounts`)).data,
  });

  const totals = useMemo(() => {
    let dr = 0;
    let cr = 0;
    for (const l of lines) {
      const p = Number(inputToPaise(l.amount));
      if (!p) continue;
      if (l.side === "DR") dr += p;
      else cr += p;
    }
    return { dr, cr, diff: dr - cr };
  }, [lines]);

  const filled = lines.filter((l) => l.code && Number(inputToPaise(l.amount)) > 0);
  const balanced = totals.diff === 0 && totals.dr > 0;
  const canSubmit = balanced && filled.length >= 2 && narration.trim().length >= 3;

  const post = useMutation({
    mutationFn: async () => {
      const payload = {
        entryDate,
        narration: narration.trim(),
        lines: filled.map((l) => {
          const kind = ACCOUNT_SUBJECT[l.code];
          const amount = inputToPaise(l.amount);
          return {
            code: l.code,
            debitPaise: l.side === "DR" ? amount : "0",
            creditPaise: l.side === "CR" ? amount : "0",
            memo: l.memo.trim() || null,
            customerId: kind === "customer" && l.subjectId ? l.subjectId : null,
            employeeId: kind === "employee" && l.subjectId ? l.subjectId : null,
            channelId: kind === "channel" && l.subjectId ? l.subjectId : null,
            tankId: kind === "tank" && l.subjectId ? l.subjectId : null,
            expenseCategoryId:
              kind === "expenseCategory" && l.subjectId ? l.subjectId : null,
          };
        }),
      };
      return (await api.post("/api/ledger/entries", payload)).data;
    },
    onSuccess: () => {
      toast.success(t("books.new.posted", "Entry posted to the books"));
      qc.invalidateQueries({ queryKey: ["ledger"] });
      router.push("/books/journal");
    },
    onError: (e) => toast.error(apiError(e, t("books.new.postFailed", "Could not post this entry"))),
  });

  if (!isOwner) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Lock className="h-6 w-6 mx-auto text-muted-foreground" />
          <div className="font-medium mt-2">
            {t("books.new.ownerOnly", "Only the owner can post a manual entry")}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {t(
              "books.new.ownerOnlyBody",
              "Manual entries are accounting corrections, not day-to-day data entry.",
            )}
          </p>
        </CardContent>
      </Card>
    );
  }

  const applyTemplate = (tpl: (typeof TEMPLATES)[number]) => {
    setNarration(tpl.narration);
    setLines(tpl.lines.map((l) => newLine(l)));
  };

  const update = (key: string, patch: Partial<LineDraft>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("books.new.templatesTitle", "Start from a common situation")}
          </CardTitle>
          <CardDescription>
            {t(
              "books.new.templatesDesc",
              "Picks the right two accounts and sides for you — then just fill in the amount.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {TEMPLATES.map((tpl) => (
            <Button
              key={tpl.key}
              size="sm"
              variant="outline"
              onClick={() => applyTemplate(tpl)}
            >
              {t(tpl.key, tpl.label)}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("books.new.title", "Manual journal entry")}</CardTitle>
          <CardDescription>
            {t(
              "books.new.desc",
              "Every entry has two sides that must add up to the same total. Debit (Dr) the account money goes into, credit (Cr) the account it comes out of. Nothing posted here can be edited or deleted later — only reversed.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">{t("common.date", "Date")}</Label>
              <Input
                type="date"
                value={entryDate}
                max={todayStr()}
                onChange={(e) => setEntryDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">{t("books.new.narration", "What is this for?")}</Label>
              <Input
                value={narration}
                placeholder={t("books.new.narrationPh", "e.g. Owner capital introduced for new dispenser")}
                maxLength={300}
                onChange={(e) => setNarration(e.target.value)}
                className="mt-1"
              />
              {narration.trim().length > 0 && narration.trim().length < 3 && (
                <p className="text-xs text-red-700 mt-1">
                  {t("books.new.narrationShort", "Give this at least a few words of description.")}
                </p>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[16rem]">{t("books.col.account", "Account")}</TableHead>
                  <TableHead className="w-28">{t("books.new.colSide", "Side")}</TableHead>
                  <TableHead className="w-36 text-right">{t("books.new.colAmount", "Amount (₹)")}</TableHead>
                  <TableHead className="min-w-[12rem]">{t("books.col.taggedTo", "Tagged to")}</TableHead>
                  <TableHead className="min-w-[10rem]">{t("books.new.colNote", "Note")}</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => {
                  const kind = l.code ? ACCOUNT_SUBJECT[l.code] : undefined;
                  const account = accounts.find((a) => a.code === l.code);
                  return (
                    <TableRow key={l.key}>
                      <TableCell>
                        <Select
                          value={l.code || undefined}
                          onValueChange={(v) => update(l.key, { code: v, subjectId: "" })}
                        >
                          <SelectTrigger>
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
                        {account && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {acctPlain(t, account.code)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={l.side}
                          onValueChange={(v) => update(l.key, { side: v as Side })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="DR">{t("books.entry.colDebit", "Debit (Dr)")}</SelectItem>
                            <SelectItem value="CR">{t("books.entry.colCredit", "Credit (Cr)")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          inputMode="decimal"
                          value={l.amount}
                          onChange={(e) => update(l.key, { amount: e.target.value })}
                          className="text-right"
                          placeholder="0.00"
                        />
                      </TableCell>
                      <TableCell>
                        {kind ? (
                          <SubjectSelect
                            kind={kind}
                            value={l.subjectId}
                            onChange={(v) => update(l.key, { subjectId: v })}
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {t("books.new.notTracked", "Not tracked per person")}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          value={l.memo}
                          maxLength={200}
                          placeholder={t("common.optional", "Optional")}
                          onChange={(e) => update(l.key, { memo: e.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={lines.length <= 2}
                          onClick={() =>
                            setLines((ls) => ls.filter((x) => x.key !== l.key))
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2} className="font-medium">
                    {t("books.new.totals", "Totals")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="font-mono text-xs">
                      Dr {formatINR(totals.dr)}
                    </div>
                    <div className="font-mono text-xs">Cr {formatINR(totals.cr)}</div>
                  </TableCell>
                  <TableCell colSpan={3}>
                    {totals.dr === 0 && totals.cr === 0 ? (
                      <span className="text-xs text-muted-foreground">
                        {t("books.new.enterAmounts", "Enter the amounts on both sides.")}
                      </span>
                    ) : balanced ? (
                      <Badge variant="success" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" /> {t("books.new.balances", "Balances")}
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="h-3 w-3" />{" "}
                        {t("books.new.notBalanced", "Does not balance — out by {amount}", {
                          amount: formatINR(Math.abs(totals.diff)),
                        })}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLines((ls) => [...ls, newLine()])}
            >
              <Plus className="h-4 w-4 mr-1" /> {t("books.new.addLine", "Add a line")}
            </Button>
            <div className="flex items-center gap-3">
              {!balanced && (totals.dr > 0 || totals.cr > 0) && (
                <span className="text-xs text-red-700">
                  {t(
                    "books.new.mustMatch",
                    "Debits and credits must match before this can be posted.",
                  )}
                </span>
              )}
              <Button disabled={!canSubmit || post.isPending} onClick={() => post.mutate()}>
                {post.isPending ? t("books.entry.posting", "Posting…") : t("books.new.post", "Post entry")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

type TFn = ReturnType<typeof useT>["t"];

const subjectMeta = (t: TFn): Record<SubjectKind, { label: string; none: string; url: string }> => ({
  customer: {
    label: t("books.new.subjCustomer", "Customer"),
    none: t("books.new.noCustomer", "No customer"),
    url: "/api/credit/customers",
  },
  employee: {
    label: t("books.new.subjEmployee", "Employee"),
    none: t("books.new.noEmployee", "No employee"),
    url: "/api/employees",
  },
  channel: {
    label: t("books.new.subjChannel", "Channel"),
    none: t("books.new.noChannel", "No channel"),
    url: "/api/setup/payment-channels",
  },
  tank: {
    label: t("books.new.subjTank", "Tank"),
    none: t("books.new.noTank", "No tank"),
    url: "/api/setup/tanks",
  },
  expenseCategory: {
    label: t("books.new.subjCategory", "Expense category"),
    none: t("books.new.noCategory", "No expense category"),
    url: "/api/setup/expense-categories",
  },
});

function SubjectSelect({
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

  return (
    <Select
      value={value || NONE}
      onValueChange={(v) => onChange(v === NONE ? "" : v)}
    >
      <SelectTrigger>
        <SelectValue placeholder={meta.label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{meta.none}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

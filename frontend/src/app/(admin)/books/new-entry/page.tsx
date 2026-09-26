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
import { apiError } from "@/lib/types";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Lock, Plus, Trash2 } from "lucide-react";
import {
  ACCOUNT_CODE,
  ACCOUNT_PLAIN,
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
const TEMPLATES: { label: string; narration: string; lines: Partial<LineDraft>[] }[] = [
  {
    label: "I put money into the business",
    narration: "Owner capital introduced",
    lines: [
      { code: ACCOUNT_CODE.CASH, side: "DR" },
      { code: ACCOUNT_CODE.OWNER_CAPITAL, side: "CR" },
    ],
  },
  {
    label: "I took money out of the business",
    narration: "Owner drawings",
    lines: [
      { code: ACCOUNT_CODE.OWNER_DRAWINGS, side: "DR" },
      { code: ACCOUNT_CODE.CASH, side: "CR" },
    ],
  },
  {
    label: "Card / UPI money landed in the bank",
    narration: "Digital settlement received in bank",
    lines: [
      { code: ACCOUNT_CODE.BANK, side: "DR" },
      { code: ACCOUNT_CODE.CARD_UPI_CLEARING, side: "CR" },
    ],
  },
  {
    label: "Staff paid back a cash shortage",
    narration: "Cash shortage recovered from staff",
    lines: [
      { code: ACCOUNT_CODE.CASH, side: "DR" },
      { code: ACCOUNT_CODE.RECEIVABLE_STAFF, side: "CR" },
    ],
  },
  {
    label: "Writing off a staff shortage",
    narration: "Staff cash shortage written off",
    lines: [
      { code: ACCOUNT_CODE.CASH_SHORT, side: "DR" },
      { code: ACCOUNT_CODE.RECEIVABLE_STAFF, side: "CR" },
    ],
  },
  {
    label: "Paid the fuel supplier",
    narration: "Payment to fuel supplier",
    lines: [
      { code: ACCOUNT_CODE.PAYABLE_FUEL, side: "DR" },
      { code: ACCOUNT_CODE.BANK, side: "CR" },
    ],
  },
  {
    label: "Cash deposited into the bank",
    narration: "Cash deposited to bank",
    lines: [
      { code: ACCOUNT_CODE.BANK, side: "DR" },
      { code: ACCOUNT_CODE.CASH, side: "CR" },
    ],
  },
  {
    label: "A customer paid off their dues",
    narration: "Payment received from credit customer",
    lines: [
      { code: ACCOUNT_CODE.CASH, side: "DR" },
      { code: ACCOUNT_CODE.RECEIVABLE_CUSTOMER, side: "CR" },
    ],
  },
];

export default function NewEntryPage() {
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
      toast.success("Entry posted to the books");
      qc.invalidateQueries({ queryKey: ["ledger"] });
      router.push("/books/journal");
    },
    onError: (e) => toast.error(apiError(e, "Could not post this entry")),
  });

  if (!isOwner) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Lock className="h-6 w-6 mx-auto text-muted-foreground" />
          <div className="font-medium mt-2">Only the owner can post a manual entry</div>
          <p className="text-sm text-muted-foreground mt-1">
            Manual entries are accounting corrections, not day-to-day data entry.
          </p>
        </CardContent>
      </Card>
    );
  }

  const applyTemplate = (t: (typeof TEMPLATES)[number]) => {
    setNarration(t.narration);
    setLines(t.lines.map((l) => newLine(l)));
  };

  const update = (key: string, patch: Partial<LineDraft>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Start from a common situation</CardTitle>
          <CardDescription>
            Picks the right two accounts and sides for you — then just fill in the amount.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {TEMPLATES.map((t) => (
            <Button
              key={t.label}
              size="sm"
              variant="outline"
              onClick={() => applyTemplate(t)}
            >
              {t.label}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Manual journal entry</CardTitle>
          <CardDescription>
            Every entry has two sides that must add up to the same total. Debit (Dr) the account
            money goes <em>into</em>, credit (Cr) the account it comes <em>out of</em>. Nothing
            posted here can be edited or deleted later — only reversed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Date</Label>
              <Input
                type="date"
                value={entryDate}
                max={todayStr()}
                onChange={(e) => setEntryDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">What is this for?</Label>
              <Input
                value={narration}
                placeholder="e.g. Owner capital introduced for new dispenser"
                maxLength={300}
                onChange={(e) => setNarration(e.target.value)}
                className="mt-1"
              />
              {narration.trim().length > 0 && narration.trim().length < 3 && (
                <p className="text-xs text-red-700 mt-1">
                  Give this at least a few words of description.
                </p>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[16rem]">Account</TableHead>
                  <TableHead className="w-28">Side</TableHead>
                  <TableHead className="w-36 text-right">Amount (₹)</TableHead>
                  <TableHead className="min-w-[12rem]">Tagged to</TableHead>
                  <TableHead className="min-w-[10rem]">Note</TableHead>
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
                        {account && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {ACCOUNT_PLAIN[account.code] ?? ""}
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
                            <SelectItem value="DR">Debit (Dr)</SelectItem>
                            <SelectItem value="CR">Credit (Cr)</SelectItem>
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
                            Not tracked per person
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          value={l.memo}
                          maxLength={200}
                          placeholder="Optional"
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
                    Totals
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
                        Enter the amounts on both sides.
                      </span>
                    ) : balanced ? (
                      <Badge variant="success" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Balances
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="h-3 w-3" /> Does not balance — out by{" "}
                        {formatINR(Math.abs(totals.diff))}
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
              <Plus className="h-4 w-4 mr-1" /> Add a line
            </Button>
            <div className="flex items-center gap-3">
              {!balanced && (totals.dr > 0 || totals.cr > 0) && (
                <span className="text-xs text-red-700">
                  Debits and credits must match before this can be posted.
                </span>
              )}
              <Button disabled={!canSubmit || post.isPending} onClick={() => post.mutate()}>
                {post.isPending ? "Posting…" : "Post entry"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const SUBJECT_META: Record<SubjectKind, { label: string; url: string }> = {
  customer: { label: "Customer", url: "/api/credit/customers" },
  employee: { label: "Employee", url: "/api/employees" },
  channel: { label: "Channel", url: "/api/setup/payment-channels" },
  tank: { label: "Tank", url: "/api/setup/tanks" },
  expenseCategory: { label: "Expense category", url: "/api/setup/expense-categories" },
};

function SubjectSelect({
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

  return (
    <Select
      value={value || NONE}
      onValueChange={(v) => onChange(v === NONE ? "" : v)}
    >
      <SelectTrigger>
        <SelectValue placeholder={meta.label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>No {meta.label.toLowerCase()}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

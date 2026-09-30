"use client";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { api, can } from "@/lib/api";
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
  CASH_LOCATIONS,
  EmptyState,
  locShort,
  Loading,
  PERSONAL_LOCATIONS,
  StatTile,
  daysAgoStr,
  todayStr,
} from "./shared";
import { useEmployees } from "./movements";

const NONE = "__none__";
const ALL = "__all__";

export type BankAccountRow = {
  id: string;
  bankName: string;
  accountNoLast4: string;
  nickname: string | null;
  ifsc: string | null;
  isActive: boolean;
  openingBalancePaise: string;
  currentBalancePaise: string;
  creditsPaise: string;
  debitsPaise: string;
  transactionCount: number;
  depositsPaise: string;
  depositCount: number;
  depositsPendingPaise: string;
  depositsClearedPaise: string;
  depositsDisputedPaise: string;
};

export const accountLabel = (a: {
  bankName: string;
  accountNoLast4: string;
  nickname: string | null;
}) => `${a.nickname || a.bankName} ••${a.accountNoLast4}`;

export const useBankAccounts = () =>
  useQuery<BankAccountRow[]>({
    queryKey: ["cash-bank-accounts"],
    queryFn: async () => (await api.get("/api/cash-bank/bank-accounts")).data,
  });

type DepositRow = {
  id: string;
  amountPaise: string;
  depositedOn: string;
  slipNo: string | null;
  status: "PENDING" | "CLEARED" | "DISPUTED";
  notes: string | null;
  bankAccount: { id: string; bankName: string; accountNoLast4: string; nickname: string | null };
  depositedByEmployee: { id: string; name: string } | null;
  shiftReport: { id: string; reportDate: string; shiftType: string } | null;
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  PENDING: "secondary",
  CLEARED: "default",
  DISPUTED: "destructive",
};

export function DepositsSection() {
  const { t } = useT();
  const qc = useQueryClient();
  const accountsQ = useBankAccounts();
  const accounts = accountsQ.data ?? [];

  const [from, setFrom] = useState(daysAgoStr(29));
  const [to, setTo] = useState(todayStr());
  const [status, setStatus] = useState(ALL);
  const [open, setOpen] = useState(false);

  const qs = useMemo(() => {
    const p = new URLSearchParams({ from, to });
    if (status !== ALL) p.set("status", status);
    return p.toString();
  }, [from, to, status]);

  const depositsQ = useQuery<{
    deposits: DepositRow[];
    summary: {
      count: number;
      totalPaise: string;
      pendingPaise: string;
      clearedPaise: string;
      disputedPaise: string;
    };
  }>({
    queryKey: ["cash-deposits", qs],
    queryFn: async () => (await api.get(`/api/cash-bank/deposits?${qs}`)).data,
  });

  const setStatusOf = useMutation({
    mutationFn: async (v: { id: string; status: string }) =>
      (await api.patch(`/api/cash-bank/deposits/${v.id}`, { status: v.status })).data,
    onSuccess: () => {
      toast.success(t("cash.deposit.updated", "Deposit updated"));
      qc.invalidateQueries({ queryKey: ["cash-deposits"] });
      qc.invalidateQueries({ queryKey: ["cash-bank-accounts"] });
    },
    onError: (e) => toast.error(apiError(e, t("cash.deposit.updateFailed", "Could not update the deposit"))),
  });

  const editable = can("canEditCollections");
  const rows = depositsQ.data?.deposits ?? [];
  const summary = depositsQ.data?.summary;

  return (
    <div className="space-y-4">
      <NewDepositDialog open={open} onOpenChange={setOpen} accounts={accounts} />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle>{t("cash.deposit.title", "Bank deposits")}</CardTitle>
              <CardDescription>
                {t(
                  "cash.deposit.desc",
                  "Cash taken to the bank, with the slip number. Each deposit also records the cash leaving the pump.",
                )}
              </CardDescription>
            </div>
            {editable ? (
              <Button onClick={() => setOpen(true)} disabled={accounts.length === 0}>
                <Plus className="h-4 w-4 mr-1" /> {t("cash.deposit.record", "Record deposit")}
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {accounts.length === 0 && !accountsQ.isLoading ? (
            <EmptyState
              title={t("cash.deposit.noAccount", "No bank account set up")}
              hint={t(
                "cash.deposit.noAccountHint",
                "Add a bank account on the Bank tab before recording a deposit.",
              )}
            />
          ) : null}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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
              <Label className="text-xs">{t("common.status", "Status")}</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t("cash.deposit.all", "All")}</SelectItem>
                  <SelectItem value="PENDING">{t("cash.deposit.status.PENDING", "Pending")}</SelectItem>
                  <SelectItem value="CLEARED">{t("cash.deposit.status.CLEARED", "Cleared")}</SelectItem>
                  <SelectItem value="DISPUTED">{t("cash.deposit.status.DISPUTED", "Disputed")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {summary ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatTile
                label={t("cash.deposit.deposited", "Deposited")}
                value={formatINR(summary.totalPaise)}
                hint={t("cash.deposit.slips", "{n} slips", { n: summary.count })}
              />
              <StatTile
                label={t("cash.deposit.status.PENDING", "Pending")}
                value={formatINR(summary.pendingPaise)}
                tone="warn"
              />
              <StatTile
                label={t("cash.deposit.status.CLEARED", "Cleared")}
                value={formatINR(summary.clearedPaise)}
                tone="good"
              />
              <StatTile
                label={t("cash.deposit.status.DISPUTED", "Disputed")}
                value={formatINR(summary.disputedPaise)}
                tone={Number(summary.disputedPaise) > 0 ? "danger" : "default"}
              />
            </div>
          ) : null}

          {depositsQ.isLoading ? (
            <Loading />
          ) : depositsQ.error ? (
            <EmptyState title={t("cash.deposit.loadFailed", "Could not load deposits")} hint={apiError(depositsQ.error)} />
          ) : rows.length === 0 ? (
            <EmptyState
              title={t("cash.deposit.empty", "No deposits in this range")}
              hint={t(
                "cash.deposit.emptyHint",
                "Every trip to the bank recorded here is cash you can prove left the premises.",
              )}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.date", "Date")}</TableHead>
                    <TableHead>{t("cash.deposit.colBank", "Bank")}</TableHead>
                    <TableHead>{t("cash.deposit.colSlip", "Slip")}</TableHead>
                    <TableHead>{t("cash.deposit.colBy", "By")}</TableHead>
                    <TableHead className="text-right">{t("common.amount", "Amount")}</TableHead>
                    <TableHead>{t("common.status", "Status")}</TableHead>
                    {editable ? <TableHead /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="whitespace-nowrap">
                        {d.depositedOn.slice(0, 10)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{accountLabel(d.bankAccount)}</TableCell>
                      <TableCell>{d.slipNo || "—"}</TableCell>
                      <TableCell>{d.depositedByEmployee?.name || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatINR(d.amountPaise)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[d.status]}>
                          {t(`cash.deposit.status.${d.status}`, d.status)}
                        </Badge>
                      </TableCell>
                      {editable ? (
                        <TableCell className="whitespace-nowrap">
                          {d.status !== "CLEARED" ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setStatusOf.mutate({ id: d.id, status: "CLEARED" })}
                            >
                              {t("cash.deposit.markCleared", "Cleared")}
                            </Button>
                          ) : null}
                          {d.status !== "DISPUTED" ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setStatusOf.mutate({ id: d.id, status: "DISPUTED" })}
                            >
                              {t("cash.deposit.markDisputed", "Dispute")}
                            </Button>
                          ) : null}
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
    </div>
  );
}

function NewDepositDialog({
  open,
  onOpenChange,
  accounts,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accounts: BankAccountRow[];
}) {
  const { t } = useT();
  const qc = useQueryClient();
  const employeesQ = useEmployees();
  const employees = employeesQ.data ?? [];

  const [bankAccountId, setBankAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [depositedOn, setDepositedOn] = useState(todayStr());
  const [slipNo, setSlipNo] = useState("");
  const [byEmployeeId, setByEmployeeId] = useState(NONE);
  const [fromLocation, setFromLocation] = useState("OFFICE_SAFE");
  const [fromEmployeeId, setFromEmployeeId] = useState(NONE);

  const fromNeedsPerson = PERSONAL_LOCATIONS.includes(fromLocation);

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post("/api/cash-bank/deposits", {
          bankAccountId,
          amountPaise: rupeesToPaise(amount || "0"),
          depositedOn,
          slipNo: slipNo.trim() || null,
          depositedByEmployeeId: byEmployeeId === NONE ? null : byEmployeeId,
          fromLocation,
          fromEmployeeId: fromNeedsPerson && fromEmployeeId !== NONE ? fromEmployeeId : null,
        })
      ).data,
    onSuccess: () => {
      toast.success(t("cash.deposit.created", "Deposit recorded"));
      onOpenChange(false);
      setAmount("");
      setSlipNo("");
      qc.invalidateQueries({ queryKey: ["cash-deposits"] });
      qc.invalidateQueries({ queryKey: ["cash-position"] });
      qc.invalidateQueries({ queryKey: ["cash-movements"] });
      qc.invalidateQueries({ queryKey: ["cash-bank-accounts"] });
    },
    onError: (e) => toast.error(apiError(e, t("cash.deposit.createFailed", "Could not record the deposit"))),
  });

  const blocked =
    !bankAccountId ||
    !(Number(amount) > 0) ||
    !depositedOn ||
    (fromNeedsPerson && fromEmployeeId === NONE);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("cash.deposit.newTitle", "Record a bank deposit")}</DialogTitle>
          <DialogDescription>
            {t(
              "cash.deposit.newDesc",
              "This also records the cash leaving custody, so the cash position stays true.",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">{t("cash.deposit.account", "Bank account")}</Label>
            <Select value={bankAccountId} onValueChange={setBankAccountId}>
              <SelectTrigger>
                <SelectValue placeholder={t("cash.deposit.pickAccount", "Pick an account")} />
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{t("cash.deposit.amount", "Amount (₹)")}</Label>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="text-lg"
              />
            </div>
            <div>
              <Label className="text-xs">{t("cash.deposit.on", "Deposited on")}</Label>
              <Input
                type="date"
                value={depositedOn}
                max={todayStr()}
                onChange={(e) => setDepositedOn(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{t("cash.deposit.slipNo", "Slip no.")}</Label>
              <Input value={slipNo} onChange={(e) => setSlipNo(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">{t("cash.deposit.by", "Deposited by")}</Label>
              <Select value={byEmployeeId} onValueChange={setByEmployeeId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t("cash.count.notRecorded", "Not recorded")}</SelectItem>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{t("cash.deposit.cameFrom", "Cash came from")}</Label>
              <Select value={fromLocation} onValueChange={setFromLocation}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CASH_LOCATIONS.filter((l) => l !== "BANK" && l !== "VENDOR").map((l) => (
                    <SelectItem key={l} value={l}>
                      {locShort(t, l)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {fromNeedsPerson ? (
              <div>
                <Label className="text-xs">{t("cash.deposit.heldBy", "Held by")}</Label>
                <Select value={fromEmployeeId} onValueChange={setFromEmployeeId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("cash.movement.who", "Who?")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t("cash.movement.pickPerson", "Pick a person…")}</SelectItem>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button onClick={() => create.mutate()} disabled={blocked || create.isPending}>
              {create.isPending
                ? t("common.saving", "Saving…")
                : t("cash.deposit.record", "Record deposit")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

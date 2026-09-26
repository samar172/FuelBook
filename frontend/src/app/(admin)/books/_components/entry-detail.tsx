"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { api, getAuthUser } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatINR, formatLitres, FUEL_LABELS } from "@/lib/utils";
import { apiError } from "@/lib/types";
import { toast } from "sonner";
import { format } from "date-fns";
import { Undo2, ExternalLink } from "lucide-react";
import {
  ACCOUNT_PLAIN,
  JournalEntry,
  JournalLine,
  SOURCE_LABELS,
  paise,
  sumPaise,
} from "@/lib/books";

/** The subject a line is tagged against, e.g. which customer owes the money. */
export function lineSubject(l: JournalLine): string | null {
  const bits: string[] = [];
  if (l.customer) bits.push(l.customer.name);
  if (l.employee) bits.push(l.employee.name);
  if (l.channel) bits.push(l.channel.name);
  if (l.tank) bits.push(l.tank.name);
  if (l.expenseCategory) bits.push(l.expenseCategory.name);
  return bits.length ? bits.join(" · ") : null;
}

/**
 * One journal entry, line by line. Also the only place an entry can be reversed:
 * a reversal posts a real mirror entry, so it asks first.
 */
export function EntryDetailDialog({
  entryId,
  onClose,
}: {
  entryId: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isOwner = getAuthUser()?.role === "OWNER";

  const { data: entry, isLoading } = useQuery<JournalEntry>({
    queryKey: ["ledger-entry", entryId],
    queryFn: async () => (await api.get(`/api/ledger/entries/${entryId}`)).data,
    enabled: Boolean(entryId),
  });

  const reverse = useMutation({
    mutationFn: async () =>
      (await api.post(`/api/ledger/entries/${entryId}/reverse`)).data,
    onSuccess: () => {
      toast.success("Reversal posted. The original entry stays on record.");
      qc.invalidateQueries({ queryKey: ["ledger"] });
      qc.invalidateQueries({ queryKey: ["ledger-entry", entryId] });
      onClose();
    },
    onError: (e) => toast.error(apiError(e, "Could not reverse this entry")),
  });

  const lines = entry?.lines ?? [];
  const totalDr = sumPaise(lines.map((l) => l.debitPaise));
  const totalCr = sumPaise(lines.map((l) => l.creditPaise));
  const alreadyReversed = Boolean(entry?.isReversed || entry?.reversedBy);
  const isReversal = entry?.source === "REVERSAL";

  return (
    <Dialog open={Boolean(entryId)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Journal entry</DialogTitle>
          <DialogDescription>
            {entry
              ? `${format(new Date(entry.entryDate), "dd MMM yyyy")} — ${entry.narration}`
              : "Loading…"}
          </DialogDescription>
        </DialogHeader>

        {isLoading && <div className="text-muted-foreground text-sm">Loading…</div>}

        {entry && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline">{SOURCE_LABELS[entry.source] ?? entry.source}</Badge>
              {alreadyReversed && <Badge variant="warning">Reversed</Badge>}
              {isReversal && <Badge variant="secondary">This is itself a reversal</Badge>}
              {entry.shiftReportId && (
                <Link
                  href={`/shifts/${entry.shiftReportId}`}
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  Open the shift <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead>Tagged to</TableHead>
                    <TableHead className="text-right">Debit (Dr)</TableHead>
                    <TableHead className="text-right">Credit (Cr)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l, i) => (
                    <TableRow key={l.id ?? i}>
                      <TableCell>
                        <div className="font-medium">
                          <span className="font-mono text-xs text-muted-foreground mr-1.5">
                            {l.account.code}
                          </span>
                          {l.account.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {ACCOUNT_PLAIN[l.account.code] ?? ""}
                        </div>
                        {l.memo && (
                          <div className="text-xs text-muted-foreground italic mt-0.5">
                            {l.memo}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {lineSubject(l) ?? <span className="text-muted-foreground">—</span>}
                        {l.fuelType && (
                          <div className="text-xs text-muted-foreground">
                            {FUEL_LABELS[l.fuelType] ?? l.fuelType}
                            {paise(l.quantityMl) > 0 &&
                              ` · ${formatLitres(l.quantityMl ?? 0)} L`}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {paise(l.debitPaise) > 0 ? formatINR(l.debitPaise) : ""}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {paise(l.creditPaise) > 0 ? formatINR(l.creditPaise) : ""}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={2} className="font-medium">
                      Total
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {formatINR(totalDr)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {formatINR(totalCr)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>

            {isOwner && (
              <div className="flex items-center justify-between gap-3 border-t pt-3">
                <p className="text-xs text-muted-foreground max-w-md">
                  Nothing is ever edited or deleted in the books. To undo an entry, post a
                  mirror entry that cancels it — the original stays on record.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={alreadyReversed || reverse.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Post a reversing entry?\n\nThis writes a real mirror entry, dated the same day as the original, that cancels it out. It cannot be undone — you would have to reverse the reversal.",
                      )
                    ) {
                      reverse.mutate();
                    }
                  }}
                >
                  <Undo2 className="h-4 w-4 mr-2" />
                  {alreadyReversed
                    ? "Already reversed"
                    : reverse.isPending
                      ? "Posting…"
                      : "Reverse this entry"}
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

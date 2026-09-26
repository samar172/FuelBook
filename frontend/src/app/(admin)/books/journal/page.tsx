"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  JOURNAL_SOURCES,
  JournalPage,
  Range,
  SOURCE_LABELS,
  defaultRange,
} from "@/lib/books";
import { DateRangeBar, EmptyBooks } from "../_components/controls";
import { EntryDetailDialog } from "../_components/entry-detail";

const PAGE_SIZE = 50;

export default function JournalPageView() {
  const [range, setRange] = useState<Range>(defaultRange);
  const [source, setSource] = useState<string>("ALL");
  const [offset, setOffset] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

  const qs = [
    `from=${range.from}`,
    `to=${range.to}`,
    `limit=${PAGE_SIZE}`,
    `offset=${offset}`,
    source === "ALL" ? "" : `source=${source}`,
  ]
    .filter(Boolean)
    .join("&");

  const { data, isLoading } = useQuery<JournalPage>({
    queryKey: ["ledger", "entries", range, source, offset],
    queryFn: async () => (await api.get(`/api/ledger/entries?${qs}`)).data,
  });

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <DateRangeBar
        range={range}
        onChange={(r) => {
          setRange(r);
          setOffset(0);
        }}
      >
        <div>
          <Label className="text-xs">Where it came from</Label>
          <Select
            value={source}
            onValueChange={(v) => {
              setSource(v);
              setOffset(0);
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Everything</SelectItem>
              {JOURNAL_SOURCES.map((s) => (
                <SelectItem key={s} value={s}>
                  {SOURCE_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </DateRangeBar>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Journal</CardTitle>
          <CardDescription>
            Every entry ever written to the books, newest first. Click one to see both sides of
            it. Entries appear automatically when a shift is locked; unlocking a shift adds a
            mirror entry rather than removing the original.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Loading…</div>
          ) : entries.length === 0 ? (
            <EmptyBooks
              title="No entries in this range"
              body="Widen the dates, or lock a shift report — that is what writes entries into the journal."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Date</TableHead>
                    <TableHead>What happened</TableHead>
                    <TableHead>Accounts touched</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((e) => (
                    <TableRow
                      key={e.id}
                      className="cursor-pointer"
                      onClick={() => setOpenId(e.id)}
                    >
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(e.entryDate), "dd MMM yy")}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{e.narration}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Badge variant="outline" className="text-[10px]">
                            {SOURCE_LABELS[e.source] ?? e.source}
                          </Badge>
                          {e.isReversed && (
                            <Badge variant="warning" className="text-[10px]">
                              Reversed
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-xs">
                        {[...new Set(e.lines.map((l) => l.account.name))].join(", ")}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatINR(e.totalPaise)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between mt-3 text-sm">
              <span className="text-muted-foreground">
                {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={offset === 0}
                  onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={offset + PAGE_SIZE >= total}
                  onClick={() => setOffset((o) => o + PAGE_SIZE)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <EntryDetailDialog entryId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

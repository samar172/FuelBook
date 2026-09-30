"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Info, Plus, RefreshCw } from "lucide-react";
import { api, can } from "@/lib/api";
import { apiError } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { MovementDialog, type MovementDefaults } from "./movements";
import {
  EmptyState,
  locLabel,
  locShort,
  Loading,
  Money,
  StatTile,
  bigOf,
  todayStr,
} from "./shared";

type Holder = {
  location: string;
  employeeId: string | null;
  employeeName: string | null;
  employeeActive: boolean | null;
  inPaise: string;
  outPaise: string;
  balancePaise: string;
};

type Position = {
  asOf: string;
  cashOnHandPaise: string;
  inBankPaise: string;
  paidToVendorsPaise: string;
  totalAccountedPaise: string;
  withAttendantsPaise: string;
  byLocation: {
    location: string;
    isTerminal: boolean;
    balancePaise: string;
    inPaise: string;
    outPaise: string;
    holders: Holder[];
  }[];
  custodians: {
    employeeId: string;
    employeeName: string | null;
    balancePaise: string;
    byLocation: { location: string; balancePaise: string }[];
  }[];
  negatives: {
    location: string;
    employeeId: string | null;
    employeeName: string | null;
    balancePaise: string;
    reason: string;
  }[];
  hasNegative: boolean;
  rules: string[];
};

export function PositionSection() {
  const { t } = useT();
  const qc = useQueryClient();
  const [asOf, setAsOf] = useState(todayStr());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [defaults, setDefaults] = useState<MovementDefaults | undefined>();
  const [showRules, setShowRules] = useState(false);

  const positionQ = useQuery<Position>({
    queryKey: ["cash-position", asOf],
    queryFn: async () => (await api.get(`/api/cash-bank/position?asOf=${asOf}`)).data,
  });

  const editable = can("canEditCollections");
  const openMovement = (d?: MovementDefaults) => {
    setDefaults(d);
    setDialogOpen(true);
  };

  const p = positionQ.data;

  return (
    <div className="space-y-4">
      <MovementDialog open={dialogOpen} onOpenChange={setDialogOpen} defaults={defaults} />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle>{t("cash.position.title", "Where is the cash right now?")}</CardTitle>
              <CardDescription>
                {t(
                  "cash.position.desc",
                  "Every rupee the pump has taken in, traced to the person or place holding it.",
                )}
              </CardDescription>
            </div>
            <div className="flex items-end gap-2">
              <div>
                <Label className="text-xs">{t("cash.position.asOf", "As of")}</Label>
                <Input
                  type="date"
                  value={asOf}
                  max={todayStr()}
                  onChange={(e) => setAsOf(e.target.value)}
                  className="w-40"
                />
              </div>
              <Button
                variant="outline"
                size="icon"
                aria-label={t("common.refresh", "Refresh")}
                onClick={() => qc.invalidateQueries({ queryKey: ["cash-position"] })}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              {editable ? (
                <Button onClick={() => openMovement()}>
                  <Plus className="h-4 w-4 mr-1" /> {t("cash.movement.record", "Record movement")}
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {positionQ.isLoading ? (
            <Loading label={t("cash.position.loading", "Working out the cash position…")} />
          ) : positionQ.error ? (
            <EmptyState
              title={t("cash.position.loadFailed", "Could not work out the cash position")}
              hint={apiError(positionQ.error)}
            />
          ) : !p ? (
            <EmptyState title={t("cash.position.nothing", "Nothing to show yet")} />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatTile
                  label={t("cash.position.inHands", "Cash in hands")}
                  value={formatINR(p.cashOnHandPaise)}
                  hint={t("cash.position.inHandsHint", "Attendants, cashier, safe and owner")}
                  tone={bigOf(p.cashOnHandPaise) < 0n ? "danger" : "default"}
                />
                <StatTile
                  label={t("cash.position.withAttendants", "Still with attendants")}
                  value={formatINR(p.withAttendantsPaise)}
                  hint={t("cash.position.withAttendantsHint", "Not yet handed to the cashier")}
                  tone={bigOf(p.withAttendantsPaise) > 0n ? "warn" : "default"}
                />
                <StatTile
                  label={t("cash.position.banked", "Banked")}
                  value={formatINR(p.inBankPaise)}
                  hint={t("cash.position.bankedHint", "Deposited, as recorded here")}
                />
                <StatTile
                  label={t("cash.position.toVendors", "Paid out to vendors")}
                  value={formatINR(p.paidToVendorsPaise)}
                  hint={t("cash.position.toVendorsHint", "Cash that left for expenses")}
                />
              </div>

              {p.hasNegative ? (
                <div className="rounded-md border border-destructive bg-destructive/5 p-3">
                  <p className="text-sm font-semibold text-destructive flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" /> {t("cash.position.negTitle", "The records do not add up")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t(
                      "cash.position.negBody",
                      "A negative holding is impossible in real life: more cash was recorded leaving than ever arrived. Something was recorded twice, or something that happened was never recorded.",
                    )}
                  </p>
                  <ul className="mt-2 space-y-1">
                    {p.negatives.map((n, i) => (
                      <li key={i} className="text-sm flex justify-between gap-3">
                        <span>
                          {locShort(t, n.location)}
                          {n.employeeName ? ` · ${n.employeeName}` : ""}
                        </span>
                        <Money paise={n.balancePaise} emphasise />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {/* Per location, with the people holding cash inside it. */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {p.byLocation.map((loc) => (
                  <div key={loc.location} className="rounded-md border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold">
                          {locLabel(t, loc.location)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t("cash.position.inOut", "in {in} · out {out}", {
                            in: formatINR(loc.inPaise),
                            out: formatINR(loc.outPaise),
                          })}
                          {loc.isTerminal ? t("cash.position.notInHand", " · not cash in hand") : ""}
                        </p>
                      </div>
                      <span className="text-lg font-bold">
                        <Money paise={loc.balancePaise} emphasise />
                      </span>
                    </div>

                    {loc.holders.length === 0 ? (
                      <p className="text-xs text-muted-foreground mt-2">{t("cash.position.nothingHere", "Nothing here.")}</p>
                    ) : (
                      <ul className="mt-2 divide-y">
                        {loc.holders.map((h) => (
                          <li
                            key={`${h.location}-${h.employeeId ?? "place"}`}
                            className="py-1.5 flex items-center justify-between gap-2 text-sm"
                          >
                            <span className="min-w-0 truncate">
                              {h.employeeName ?? t("cash.unattributed", "Unattributed")}
                              {h.employeeActive === false ? (
                                <Badge variant="secondary" className="ml-1">
                                  {t("cash.position.leftBadge", "left")}
                                </Badge>
                              ) : null}
                            </span>
                            <span className="flex items-center gap-2 shrink-0">
                              <Money paise={h.balancePaise} emphasise />
                              {editable && !loc.isTerminal && bigOf(h.balancePaise) > 0n ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    openMovement({
                                      fromLocation: h.location,
                                      fromEmployeeId: h.employeeId,
                                    })
                                  }
                                >
                                  {t("cash.position.move", "Move")}
                                </Button>
                              ) : null}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>

              {/* Per person, across locations. */}
              <div className="rounded-md border p-3">
                <p className="font-semibold">{t("cash.position.whoHolding", "Who is holding cash")}</p>
                {p.custodians.length === 0 ? (
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("cash.position.nobodyHolding", "Nobody is holding cash against their name yet.")}
                  </p>
                ) : (
                  <ul className="mt-2 divide-y">
                    {p.custodians.map((c) => (
                      <li key={c.employeeId} className="py-2 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {c.employeeName ?? c.employeeId}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {c.byLocation
                              .map(
                                (l) =>
                                  `${locShort(t, l.location)} ${formatINR(l.balancePaise)}`,
                              )
                              .join(" · ")}
                          </p>
                        </div>
                        <span className="font-semibold shrink-0">
                          <Money paise={c.balancePaise} emphasise />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <button
                  type="button"
                  className="text-xs text-muted-foreground inline-flex items-center gap-1 underline"
                  onClick={() => setShowRules((v) => !v)}
                >
                  <Info className="h-3.5 w-3.5" />
                  {showRules
                    ? t("cash.position.hideHow", "Hide")
                    : t("cash.position.showHow", "How is this worked out?")}
                </button>
                {showRules ? (
                  <ul className="mt-2 list-disc pl-5 space-y-1 text-xs text-muted-foreground">
                    {p.rules.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

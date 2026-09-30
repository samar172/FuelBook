"use client";
import { useQuery } from "@tanstack/react-query";
import { format, isSameDay } from "date-fns";
import { Clock } from "lucide-react";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useDateLocale } from "@/lib/i18n/core";

export type LastEdit = { at: string; by: string | null; count: number };
export type PanelKey =
  | "readings"
  | "stock"
  | "roster"
  | "collections"
  | "outstanding"
  | "expenses"
  | "cashDrops";

/**
 * "Last saved 2:32 pm by Ramesh · 5 rows" — or "Not saved yet". Reads the same
 * ["shift", id] query the detail page owns, so it costs no extra request and
 * refreshes whenever a tab invalidates the shift after a save.
 */
export function LastSaved({ shiftId, panel }: { shiftId: string; panel: PanelKey }) {
  const { t } = useT();
  const locale = useDateLocale();
  const { data } = useQuery<{ lastEdits?: Partial<Record<PanelKey, LastEdit>> }>({
    queryKey: ["shift", shiftId],
    queryFn: async () => (await api.get(`/api/shifts/${shiftId}`)).data,
  });
  if (!data) return null;
  const edit = data.lastEdits?.[panel];

  if (!edit) {
    return (
      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-700">
        <Clock className="h-3 w-3 shrink-0" />
        {t("shift.saved.never", "Not saved yet")}
      </p>
    );
  }

  const at = new Date(edit.at);
  const when = isSameDay(at, new Date())
    ? format(at, "h:mm a", { locale })
    : format(at, "d MMM, h:mm a", { locale });
  const text = edit.by
    ? t("shift.saved.line", "Last saved {when} by {by}", { when, by: edit.by })
    : t("shift.saved.lineAnon", "Last saved {when}", { when });

  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
      <Clock className="h-3 w-3 shrink-0" />
      <span>{text}</span>
      <span aria-hidden>·</span>
      <span>{t("shift.saved.rows", "{n} rows", { n: edit.count })}</span>
    </p>
  );
}

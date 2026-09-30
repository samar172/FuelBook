"use client";
import { Languages } from "lucide-react";
import { cn } from "@/lib/utils";
import { LANGS, useT } from "@/lib/i18n";

/**
 * English / हिन्दी toggle. Small segmented control rather than a dropdown: there are
 * only two options and staff should be able to hit it one-handed.
 */
export function LanguageSwitch({ className, showIcon = true }: { className?: string; showIcon?: boolean }) {
  const { lang, setLang, t } = useT();
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {showIcon && <Languages className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />}
      <div
        role="group"
        aria-label={t("common.language", "Language")}
        className="inline-flex rounded-md border bg-white p-0.5"
      >
        {LANGS.map((l) => {
          const active = lang === l.value;
          return (
            <button
              key={l.value}
              type="button"
              onClick={() => setLang(l.value)}
              aria-pressed={active}
              className={cn(
                "rounded px-2 py-1 text-xs font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {l.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

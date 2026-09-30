"use client";
/**
 * Bilingual UI (English / Hindi in Devanagari).
 *
 * Register matters more than grammar here. Pump owners and their staff speak
 * Hinglish: "शिफ्ट", "नोज़ल", "रेट", "बैंक". Translating those into literary Hindi
 * ("पाली", "तुंड") would make the app HARDER to use, not easier. Keep the everyday
 * word, written in Devanagari.
 *
 * Only UI text is translated. Data the user typed in — customer names, expense
 * heads, pump names — is shown exactly as they entered it.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { hi as hiDate, enIN } from "date-fns/locale";
import { DICT } from "./dict";

export type Lang = "en" | "hi";
export const LANGS: { value: Lang; label: string; short: string }[] = [
  { value: "en", label: "English", short: "EN" },
  { value: "hi", label: "हिन्दी", short: "हि" },
];

const STORAGE_KEY = "fuelbook.lang";

type Vars = Record<string, string | number>;

function lookup(lang: Lang, key: string): string | undefined {
  const table = DICT[lang] as Record<string, string | undefined>;
  return table?.[key];
}

/** Fills {name} style placeholders. */
function interpolate(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole
  );
}

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  /**
   * Translate. Falls back to English, then to the supplied default, then to the
   * key itself — a missing translation must never render an empty screen.
   */
  t: (key: string, fallback?: string, vars?: Vars) => string;
  /** For Intl / date-fns: "hi-IN" or "en-IN". Digits stay Latin in both. */
  locale: string;
}

const LanguageContext = createContext<Ctx>({
  lang: "en",
  setLang: () => {},
  t: (_k, fallback) => fallback ?? _k,
  locale: "en-IN",
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Always start at "en" so the server render and the first client render agree;
  // the stored choice is applied in an effect straight after.
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "hi" || saved === "en") setLangState(saved);
    } catch {
      // Storage blocked (private mode, cleared site data) — English it is.
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // Not being able to remember the choice is not a reason to refuse it.
    }
  }, []);

  const t = useCallback(
    (key: string, fallback?: string, vars?: Vars) => {
      const hit = lookup(lang, key) ?? (lang === "hi" ? lookup("en", key) : undefined);
      return interpolate(hit ?? fallback ?? key, vars);
    },
    [lang]
  );

  const value = useMemo<Ctx>(
    () => ({ lang, setLang, t, locale: lang === "hi" ? "hi-IN" : "en-IN" }),
    [lang, setLang, t]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useT() {
  return useContext(LanguageContext);
}

/**
 * date-fns locale for the chosen language, so months and weekdays read in Hindi.
 * Digits stay Latin in both — a date typed on a numeric keypad should read back
 * the same way.
 */
export function useDateLocale() {
  const { lang } = useT();
  return lang === "hi" ? hiDate : enIN;
}

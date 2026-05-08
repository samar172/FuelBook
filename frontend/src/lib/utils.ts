import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Money: paise (string from API) -> rupees number
export const paiseToRupees = (paise: string | number | bigint): number => {
  const n = typeof paise === "string" ? Number(paise) : Number(paise);
  return n / 100;
};

export const formatINR = (paise: string | number | bigint, opts?: { showSymbol?: boolean }): string => {
  const r = paiseToRupees(paise);
  const s = opts?.showSymbol === false ? "" : "₹";
  return s + r.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const rupeesToPaise = (rupees: number | string): string => {
  const n = typeof rupees === "string" ? parseFloat(rupees) : rupees;
  return Math.round(n * 100).toString();
};

// Volume: ml (string from API) -> litres number
export const mlToLitres = (ml: string | number | bigint): number => {
  const n = typeof ml === "string" ? Number(ml) : Number(ml);
  return n / 1000;
};

export const formatLitres = (ml: string | number | bigint, decimals = 2): string => {
  return mlToLitres(ml).toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

export const litresToMl = (litres: number | string): string => {
  const n = typeof litres === "string" ? parseFloat(litres) : litres;
  return Math.round(n * 1000).toString();
};

export const FUEL_LABELS: Record<string, string> = {
  HSD: "Diesel (HSD)",
  MS: "Petrol (MS)",
  MS_POWER: "MS Power",
  CNG: "CNG",
};

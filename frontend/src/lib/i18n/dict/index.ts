// Dictionaries are split by area so screens can be translated independently.
// Every entry is a flat "area.key" string; nesting made merges painful.
import { common } from "./common";
import { nav } from "./nav";
import { shift } from "./shift";
import { cash } from "./cash";
import { books } from "./books";
import { credit } from "./credit";
import { receivables } from "./receivables";
import { products } from "./products";
import { wetstock } from "./wetstock";
import { pricing } from "./pricing";
import { compliance } from "./compliance";
import { dashboard } from "./dashboard";
import { reports } from "./reports";
import { guide } from "./guide";
import { setup } from "./setup";
import { auth } from "./auth";
import { opening } from "./opening";

type Table = Record<string, string>;
export type Dict = { en: Table; hi: Table };

const AREAS: Dict[] = [
  common, nav, shift, cash, books, credit, receivables,
  products, wetstock, pricing, compliance, dashboard, reports, guide, setup, auth, opening,
];

function merge(lang: "en" | "hi"): Table {
  const out: Table = {};
  for (const area of AREAS) Object.assign(out, area[lang]);
  return out;
}

export const DICT: { en: Table; hi: Table } = { en: merge("en"), hi: merge("hi") };

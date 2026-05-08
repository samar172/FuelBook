// Money is stored as BigInt in PAISE everywhere.
// 1 INR = 100 paise. Conversion only at IO boundaries.

import Decimal from 'decimal.js';

export const rupeesToPaise = (rupees: number | string): bigint => {
  const d = new Decimal(rupees).mul(100);
  return BigInt(d.toFixed(0));
};

export const paiseToRupees = (paise: bigint | number): number => {
  const n = typeof paise === 'bigint' ? Number(paise) : paise;
  return n / 100;
};

export const paiseToRupeesString = (paise: bigint | number, decimals = 2): string => {
  const d = new Decimal(typeof paise === 'bigint' ? paise.toString() : paise).div(100);
  return d.toFixed(decimals);
};

// Volume: stored as BigInt in MILLILITRES. 1 L = 1000 ml.
export const litresToMl = (litres: number | string): bigint => {
  const d = new Decimal(litres).mul(1000);
  return BigInt(d.toFixed(0));
};

export const mlToLitres = (ml: bigint | number): number => {
  const n = typeof ml === 'bigint' ? Number(ml) : ml;
  return n / 1000;
};

export const mlToLitresString = (ml: bigint | number, decimals = 3): string => {
  const d = new Decimal(typeof ml === 'bigint' ? ml.toString() : ml).div(1000);
  return d.toFixed(decimals);
};

// BigInt JSON serialization helper
export const bigIntToJson = (val: bigint): string => val.toString();

export const serializeBigInts = <T>(obj: T): T => {
  return JSON.parse(
    JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
  );
};

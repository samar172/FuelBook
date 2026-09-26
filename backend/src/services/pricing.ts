// Daily price revision + stock revaluation helpers.
//
// Money is BigInt PAISE, volume is BigInt MILLILITRES, and a fuel rate is paise
// per LITRE. So the value of `qtyMl` at `ratePaise` is qtyMl * ratePaise / 1000n.
// BigInt division TRUNCATES toward zero (there is no rounding and no remainder),
// which is why every helper below multiplies first and divides by 1000n LAST —
// dividing earlier would throw away up to three digits of precision per term.
//
// This module deliberately does not touch the ledger services: the accounting
// side of a revaluation is wired centrally later (PriceRevision.journalEntryId
// stays null).
import { prisma } from '../lib/db';

export type FuelType = 'HSD' | 'MS' | 'MS_POWER' | 'CNG';

export const FUEL_TYPES: FuelType[] = ['HSD', 'MS', 'MS_POWER', 'CNG'];

const ML_PER_LITRE = 1000n;

/**
 * Value of a volume at a per-litre rate, in paise.
 * Truncating division, applied once, at the end.
 */
export const valueOfMlAtRate = (qtyMl: bigint, ratePaise: bigint): bigint =>
  (qtyMl * ratePaise) / ML_PER_LITRE;

/**
 * Revaluation of `stockMl` when the pump rate moves from `oldRate` to `newRate`.
 * Sign follows the rate move: a cut produces a negative (a loss).
 * Truncation on a negative BigInt rounds toward zero, i.e. a loss is never
 * overstated by the rounding.
 */
export const stockGainLoss = (stockMl: bigint, oldRatePaise: bigint, newRatePaise: bigint): bigint =>
  (stockMl * (newRatePaise - oldRatePaise)) / ML_PER_LITRE;

/** Weighted-average cost per LITRE in paise, or null when there is no stock. */
export const avgCostPaisePerLitre = (totalValuePaise: bigint, totalQtyMl: bigint): bigint | null => {
  if (totalQtyMl <= 0n) return null;
  // Multiply by 1000 first so the result is paise/litre, then truncate once.
  return (totalValuePaise * ML_PER_LITRE) / totalQtyMl;
};

export type RateRow = {
  id: string;
  fuelType: string;
  ratePaise: bigint;
  effectiveFrom: Date;
  createdAt: Date;
  createdBy: string;
};

/**
 * Every rate row for the pump, newest first. Callers derive "current" and
 * "as of a date" from this one read.
 */
export async function loadRateHistory(pumpId: string, fuelType?: FuelType): Promise<RateRow[]> {
  return prisma.fuelRate.findMany({
    where: { pumpId, ...(fuelType ? { fuelType } : {}) },
    orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
  });
}

/**
 * Latest rate per fuel type. Matches `GET /api/setup/fuel-rates`: the row with
 * the greatest effectiveFrom wins, even if that moment is in the future (a pump
 * may enter tomorrow's 6 am rate the night before).
 */
export function latestRateByFuel(rates: RateRow[]): Record<string, RateRow> {
  const out: Record<string, RateRow> = {};
  for (const r of rates) {
    if (!out[r.fuelType]) out[r.fuelType] = r; // rates arrive newest-first
  }
  return out;
}

/** The rate in force at `at` (greatest effectiveFrom <= at), or null. */
export function rateAsOf(rates: RateRow[], fuelType: string, at: Date): RateRow | null {
  for (const r of rates) {
    if (r.fuelType === fuelType && r.effectiveFrom.getTime() <= at.getTime()) return r;
  }
  return null;
}

export type FuelStock = {
  fuelType: FuelType;
  quantityMl: bigint;
  valuePaise: bigint;
  /** Tanks whose quantity came from the last shift's closing stock, not from
   *  TankInventoryState (no cost basis exists for those litres). */
  estimatedTankIds: string[];
  tankCount: number;
};

/**
 * Stock on hand per fuel type for a pump, with its weighted-average cost basis.
 *
 * Primary source is TankInventoryState (the running quantity + value per tank).
 * When a tank has no inventory-state row we fall back to the most recent
 * StockEntry.closingStockMl for that tank so the litres are still counted, and
 * we name the tank in `estimatedTankIds` so the caller can say so. A fallback
 * tank contributes litres but no value, because the app has no cost basis for
 * them — it would be wrong to price them at the selling rate.
 */
export async function loadStockByFuel(pumpId: string): Promise<Record<string, FuelStock>> {
  const tanks = await prisma.tank.findMany({
    where: { pumpId, isActive: true },
    select: { id: true, fuelType: true },
  });

  const byFuel: Record<string, FuelStock> = {};
  for (const f of FUEL_TYPES) {
    byFuel[f] = {
      fuelType: f,
      quantityMl: 0n,
      valuePaise: 0n,
      estimatedTankIds: [],
      tankCount: 0,
    };
  }
  if (tanks.length === 0) return byFuel;

  const tankIds = tanks.map((t) => t.id);
  const states = await prisma.tankInventoryState.findMany({ where: { tankId: { in: tankIds } } });
  const stateByTank = new Map(states.map((s) => [s.tankId, s]));

  // Tanks with no inventory state: fall back to their latest per-shift book stock.
  const missing = tankIds.filter((id) => !stateByTank.has(id));
  const fallbackByTank = new Map<string, bigint>();
  if (missing.length > 0) {
    const entries = await prisma.stockEntry.findMany({
      where: { tankId: { in: missing }, shiftReport: { pumpId } },
      orderBy: [{ shiftReport: { reportDate: 'desc' } }, { shiftReport: { createdAt: 'desc' } }],
      select: { tankId: true, closingStockMl: true },
    });
    for (const e of entries) {
      if (!fallbackByTank.has(e.tankId)) fallbackByTank.set(e.tankId, e.closingStockMl);
    }
  }

  for (const tank of tanks) {
    const bucket = byFuel[tank.fuelType];
    if (!bucket) continue; // unknown enum member — defensive, should not happen
    bucket.tankCount += 1;
    const state = stateByTank.get(tank.id);
    if (state) {
      bucket.quantityMl += state.quantityMl;
      bucket.valuePaise += state.valuePaise;
      continue;
    }
    const fallback = fallbackByTank.get(tank.id);
    if (fallback !== undefined) {
      bucket.quantityMl += fallback;
      bucket.estimatedTankIds.push(tank.id);
    }
  }

  return byFuel;
}

/** Litres (in ml) dispensed by a nozzle reading, net of testing/calibration draws. */
export const soldMlOf = (r: {
  openingReadingMl: bigint;
  closingReadingMl: bigint;
  testingMl: bigint;
}): bigint => {
  const sold = r.closingReadingMl - r.openingReadingMl - r.testingMl;
  return sold > 0n ? sold : 0n;
};

/** Inclusive UTC day range from ?from=&to= (YYYY-MM-DD), default: last 30 days. */
export function parsePricingRange(fromStr: string, toStr: string): { from: Date; to: Date } {
  const to = toStr ? new Date(toStr + 'T00:00:00Z') : new Date();
  to.setUTCHours(0, 0, 0, 0);
  let from: Date;
  if (fromStr) {
    from = new Date(fromStr + 'T00:00:00Z');
  } else {
    from = new Date(to);
    from.setUTCDate(from.getUTCDate() - 29);
  }
  from.setUTCHours(0, 0, 0, 0);
  return { from, to };
}

/** End of the `to` day, so timestamp columns include everything on that date. */
export const endOfDay = (d: Date): Date => {
  const x = new Date(d);
  x.setUTCHours(23, 59, 59, 999);
  return x;
};

export const utcDateKey = (d: Date): string => d.toISOString().slice(0, 10);

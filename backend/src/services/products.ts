// Pure money/stock math for NON-FUEL RETAIL (lubricants, AdBlue, accessories,
// services). No Prisma, no ledger: this file only does arithmetic so the rules
// below are testable and stated in exactly one place.
//
// ---------------------------------------------------------------------------
// ROUNDING
// ---------------------------------------------------------------------------
// Every amount is BigInt paise. BigInt division TRUNCATES TOWARDS ZERO (there is
// no rounding-half-up anywhere in this file). Consequences, all deliberate:
//   * GST-inclusive split: the taxable base is truncated DOWN, and GST takes the
//     remainder (gst = gross - taxable). Taxable + GST therefore always equals
//     the gross amount to the paisa — no drift, and the pump never under-collects
//     the tax it has to remit.
//   * GST-exclusive: gst = taxable * rateBp / 10000 truncated DOWN (at most one
//     paisa less than the exact figure).
//   * Average cost: multiply BEFORE dividing (qty * value / qty) so precision is
//     lost only once, at the last step, and only downwards.
// ---------------------------------------------------------------------------

/** Basis-point denominator: 10000 bp = 100%. */
const BP = 10_000n;

export type GstSplit = {
  /** Amount the tax is charged on (ex-GST). */
  taxablePaise: bigint;
  /** The tax itself. */
  gstPaise: bigint;
  /** What actually changes hands: taxable + gst. */
  grossPaise: bigint;
};

/**
 * Splits a line amount into taxable base + GST.
 *
 * `amountPaise` is interpreted by `priceIsGstInclusive`:
 *   inclusive  -> amountPaise IS the gross; taxable = gross * 10000 / (10000 + bp),
 *                 gst = gross - taxable.
 *   exclusive  -> amountPaise IS the taxable base; gst = taxable * bp / 10000,
 *                 gross = taxable + gst.
 *
 * Unlike fuel (outside GST in India), every line in this module is taxable, so a
 * rate of 0 bp is allowed but is an explicit choice, not a default.
 */
export function splitGst(
  amountPaise: bigint,
  gstRateBp: number,
  priceIsGstInclusive: boolean,
): GstSplit {
  const bp = BigInt(Math.max(0, Math.trunc(gstRateBp)));
  if (amountPaise <= 0n || bp === 0n) {
    return { taxablePaise: amountPaise, gstPaise: 0n, grossPaise: amountPaise };
  }
  if (priceIsGstInclusive) {
    const taxablePaise = (amountPaise * BP) / (BP + bp); // truncated down
    return {
      taxablePaise,
      gstPaise: amountPaise - taxablePaise, // remainder, so the sum is exact
      grossPaise: amountPaise,
    };
  }
  const gstPaise = (amountPaise * bp) / BP; // truncated down
  return { taxablePaise: amountPaise, gstPaise, grossPaise: amountPaise + gstPaise };
}

/**
 * Weighted-average cost of `quantity` units, given the running stock state.
 *
 * cost = quantity * stateValuePaise / stateQuantity, in BigInt, multiplying
 * first so the single truncation happens at the end. Guards:
 *   * stateQuantity <= 0 or stateValuePaise <= 0 -> cost 0 (nothing to relieve;
 *     never a divide-by-zero).
 *   * the result is clamped to stateValuePaise, so an OUT movement can never
 *     drive the stock value negative.
 */
export function averageCostOf(
  quantity: number,
  stateQuantity: number,
  stateValuePaise: bigint,
): bigint {
  if (quantity <= 0 || stateQuantity <= 0 || stateValuePaise <= 0n) return 0n;
  const cost = (BigInt(quantity) * stateValuePaise) / BigInt(stateQuantity);
  return cost > stateValuePaise ? stateValuePaise : cost;
}

/** Average cost per single unit, for display / margin previews. */
export function unitAverageCost(stateQuantity: number, stateValuePaise: bigint): bigint {
  if (stateQuantity <= 0 || stateValuePaise <= 0n) return 0n;
  return stateValuePaise / BigInt(stateQuantity);
}

export type StockDelta = { quantity: number; valuePaise: bigint };

/**
 * Applies one movement to a stock state.
 *
 * `direction` IN adds `quantity` units worth `valuePaise`; OUT removes
 * `quantity` units worth `valuePaise` (which the caller has already computed at
 * average cost). Quantity and value are both floored at zero, and a state that
 * reaches zero quantity is forced to zero value so no orphan cost basis is left
 * behind to distort the next average.
 */
export function applyStockDelta(
  state: StockDelta,
  direction: 'IN' | 'OUT',
  quantity: number,
  valuePaise: bigint,
): StockDelta {
  if (direction === 'IN') {
    return {
      quantity: state.quantity + quantity,
      valuePaise: state.valuePaise + (valuePaise > 0n ? valuePaise : 0n),
    };
  }
  const nextQuantity = Math.max(0, state.quantity - quantity);
  let nextValue = state.valuePaise - valuePaise;
  if (nextValue < 0n) nextValue = 0n;
  if (nextQuantity === 0) nextValue = 0n;
  return { quantity: nextQuantity, valuePaise: nextValue };
}

// ---------------------------------------------------------------------------
// DIRECTION CONVENTION
// ---------------------------------------------------------------------------
// ProductMovement.quantity is a MAGNITUDE — always positive, never signed. The
// direction lives in its own `direction` column: PURCHASE is always IN and SALE
// always OUT, while ADJUSTMENT and RETURN may go either way. Any [IN]/[OUT] text a
// caller puts in `reference` is stripped, so old markers never leak back in.
const TAG_RE = /^\s*\[(IN|OUT)\]\s*/i;

export type MovementKind = 'PURCHASE' | 'SALE' | 'ADJUSTMENT' | 'RETURN';
export type StockDir = 'IN' | 'OUT';

/** Cleans any legacy or caller-supplied direction marker out of reference text. */
export function stripDirectionTag(reference: string | null | undefined): string | null {
  if (!reference) return null;
  const cleaned = reference.replace(TAG_RE, '').trim();
  return cleaned === '' ? null : cleaned;
}

/** The direction a kind forces, if it forces one. */
export function directionForKind(kind: MovementKind): StockDir | null {
  if (kind === 'PURCHASE') return 'IN';
  if (kind === 'SALE') return 'OUT';
  return null; // ADJUSTMENT and RETURN are caller-directed
}

/**
 * Reads the direction off a stored movement row. The column is authoritative;
 * `kind` only fills in for a row written before the column existed.
 */
export function directionOf(kind: MovementKind, direction?: StockDir | null): StockDir {
  return direction ?? directionForKind(kind) ?? 'IN';
}

// ---------------------------------------------------------------------------
// COST REPLAY
// ---------------------------------------------------------------------------

export type ReplayMovement = {
  id: string;
  kind: MovementKind;
  quantity: number;
  totalPaise: bigint;
  gstPaise: bigint;
  direction?: StockDir | null;
  occurredAt: Date;
};

export type ReplayRow = {
  movement: ReplayMovement;
  direction: 'IN' | 'OUT';
  /** Stock value released (OUT) or added (IN) by this movement, in paise. */
  costPaise: bigint;
};

/**
 * Replays a product's whole movement history in order and returns, for each
 * movement, the stock value it moved. COGS is NOT stored on the row (the frozen
 * schema has nowhere to put it) and cannot be taken from today's average cost,
 * because that average changes with every later purchase — so the margin report
 * rebuilds it from the beginning of time. The rules here mirror exactly what the
 * write path applies to ProductStockState, which keeps the report and the live
 * stock state in agreement.
 *
 * Value moved:
 *   PURCHASE IN, ADJUSTMENT IN  -> the taxable amount (total - gst): GST on a
 *     purchase is input tax credit, not part of the cost of the goods.
 *   RETURN IN (from a customer) -> the current average cost of those units, so a
 *     return does not re-enter stock at the price it was sold for. With no stock
 *     on hand there is no average to use, and it falls back to the row's own
 *     taxable amount.
 *   any OUT                     -> the current weighted-average cost.
 */
export function replayCosts(
  movements: ReplayMovement[],
): { rows: ReplayRow[]; finalState: StockDelta } {
  const ordered = [...movements].sort((a, b) => {
    const t = a.occurredAt.getTime() - b.occurredAt.getTime();
    return t !== 0 ? t : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  let state: StockDelta = { quantity: 0, valuePaise: 0n };
  const rows: ReplayRow[] = [];

  for (const m of ordered) {
    const direction = directionOf(m.kind, m.direction);
    let costPaise: bigint;
    if (direction === 'IN') {
      const net = m.totalPaise - m.gstPaise;
      costPaise =
        m.kind === 'RETURN' && state.quantity > 0
          ? averageCostOf(m.quantity, state.quantity, state.valuePaise)
          : net > 0n
            ? net
            : 0n;
    } else {
      costPaise = averageCostOf(m.quantity, state.quantity, state.valuePaise);
    }
    state = applyStockDelta(state, direction, m.quantity, costPaise);
    rows.push({ movement: m, direction, costPaise });
  }

  return { rows, finalState: state };
}

/** Margin in basis points of revenue, so callers can render a percentage. */
export function marginPct(revenueNetPaise: bigint, cogsPaise: bigint): number {
  if (revenueNetPaise <= 0n) return 0;
  const margin = revenueNetPaise - cogsPaise;
  // Only crosses to floating point for a display percentage, never for money.
  return Number((margin * 10_000n) / revenueNetPaise) / 100;
}

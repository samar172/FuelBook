// Wet-stock maths: dip-chart interpolation, density correction and W&M tolerance.
// Kept free of Prisma so each piece can be reasoned about (and reused) on its own.
// All volumes are millilitres as BigInt — never floats, because a litre of fuel
// is money and rounding drift shows up in the variance report.

export type ChartPoint = { dipMm: number; volumeMl: bigint };

export const TOLERANCE_ML_PER_5L = 25n; // W&M limit: +/- 25 ml on a 5-litre measure
export const MEASURE_BASE_ML = 5000n;
export const DEFAULT_VARIANCE_TOLERANCE_PCT = 0.5;

// Note on the variance sign convention used throughout: variance = measured (dip)
// minus book stock. A small NEGATIVE variance is normal for petrol/MS because it
// evaporates; a positive variance or a large negative one wants explaining.
export const EVAPORATION_NOTE =
  'Variance = dip-measured stock minus book stock. A small negative variance is normal for petrol/MS because it evaporates, especially in summer; a positive variance, or a loss beyond tolerance, needs investigating (meter drift, leak, or an unrecorded receipt/sale).';

export const DENSITY_NOTE =
  'Density at 15 °C is approximate: a linear 0.65 kg/m³ per °C correction, not the ASTM 54B table.';

/**
 * Volume at a dip, by linear interpolation between the two nearest chart points.
 * Returns null when the chart cannot answer (empty chart, or dip out of range) —
 * callers decide whether that is an error or just "not auto-filled".
 * The chart must already be sorted ascending by dip.
 */
export function interpolateVolume(
  chart: ChartPoint[],
  dipMm: number
): { volumeMl: bigint; exact: boolean } | null {
  if (chart.length === 0) return null;
  if (dipMm < chart[0].dipMm || dipMm > chart[chart.length - 1].dipMm) return null;

  for (let i = 0; i < chart.length; i++) {
    const p = chart[i];
    if (p.dipMm === dipMm) return { volumeMl: p.volumeMl, exact: true };
    if (p.dipMm > dipMm) {
      const lo = chart[i - 1];
      // Straight-line interpolation in BigInt: lo + (hi-lo) * (dip-loDip) / (hiDip-loDip).
      const span = BigInt(p.dipMm - lo.dipMm);
      const step = BigInt(dipMm - lo.dipMm);
      const volumeMl = lo.volumeMl + ((p.volumeMl - lo.volumeMl) * step) / span;
      return { volumeMl, exact: false };
    }
  }
  return null;
}

/**
 * Density corrected to 15 °C.
 *
 * SIMPLIFIED LINEAR APPROXIMATION of the ASTM 54B / IP 200 volume-correction
 * table: 0.65 kg/m³ per °C away from 15 °C. Adequate for a dealer's daily dip
 * register and for cross-checking an OMC invoice; it is NOT a lab figure and
 * should not be quoted as one. The UI labels it "approx." for the same reason.
 *
 *   density15 ≈ observed + 0.65 × (temp − 15)
 */
export function densityAt15C(
  observedKgM3: number | null | undefined,
  temperatureC: number | null | undefined
): number | null {
  if (observedKgM3 === null || observedKgM3 === undefined) return null;
  if (temperatureC === null || temperatureC === undefined) return null;
  return Math.round(observedKgM3 + 0.65 * (temperatureC - 15));
}

/**
 * W&M tolerance for a measure of any size: +/- 25 ml per 5 litres, scaled
 * proportionally (so 50 ml on a 10 L can, 3 ml on a 500 ml can). Rounded up so
 * an odd measure size never tightens the limit below the statutory one.
 */
export function toleranceForMeasure(measureMl: bigint): bigint {
  if (measureMl <= 0n) return TOLERANCE_ML_PER_5L;
  const numerator = TOLERANCE_ML_PER_5L * measureMl;
  const exact = numerator / MEASURE_BASE_ML;
  return numerator % MEASURE_BASE_ML === 0n ? exact : exact + 1n;
}

export function absBig(v: bigint): bigint {
  return v < 0n ? -v : v;
}

/** Percentage of a BigInt volume, as a JS number with 4 decimals. 0 throughput -> null. */
export function pctOf(part: bigint, whole: bigint): number | null {
  if (whole === 0n) return null;
  // Scale by 1e6 in BigInt first so the division keeps its precision: the result
  // is the percentage times 1e4, i.e. 4 decimal places.
  const scaled = (part * 1000000n) / whole;
  return Number(scaled) / 10000;
}

/**
 * Value of a volume at a per-litre rate, in paise. Rates on a tanker receipt are
 * paise per litre, so 1000 ml of loss costs exactly one rate.
 */
export function valueOfMl(ml: bigint, ratePaisePerLitre: bigint | null | undefined): bigint | null {
  if (ratePaisePerLitre === null || ratePaisePerLitre === undefined) return null;
  return (ml * ratePaisePerLitre) / 1000n;
}

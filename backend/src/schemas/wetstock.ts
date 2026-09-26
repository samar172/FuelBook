import { z } from 'zod';
import { bigIntStr, bigIntStrOptional } from './index';

// ===================== WET STOCK CONTROL & STATUTORY LOGS =====================
// Volumes are millilitres (BigInt, serialized as strings); dips are whole
// millimetres; densities are whole kg/m3 and temperatures whole degrees Celsius,
// which is what a dealer's dip register and the OMC invoice actually carry.

// Nullable whole number: "" / null clears the column, so a blank form field
// stores NULL instead of 0 (0 kg/m3 would be a lie, not a missing reading).
const intNullable = (min: number, max: number) =>
  z
    .union([z.number(), z.string(), z.null()])
    .transform((v) => {
      if (v === null) return null;
      if (typeof v === 'string') {
        const t = v.trim();
        if (t === '') return null;
        const n = Number(t);
        if (!Number.isFinite(n)) throw new Error('invalid number');
        return Math.round(n);
      }
      return Math.round(v);
    })
    .refine((v) => v === null || (v >= min && v <= max), `must be between ${min} and ${max}`)
    .optional();

const noteNullable = z
  .union([z.string().max(500), z.null()])
  .transform((v) => {
    if (v === null) return null;
    const t = v.trim();
    return t === '' ? null : t;
  })
  .optional();

const idNullable = z
  .union([z.string(), z.null()])
  .transform((v) => (v === null || v.trim() === '' ? null : v.trim()))
  .optional();

const dipMm = z
  .union([z.number(), z.string()])
  .transform((v) => Math.round(Number(v)))
  .refine((v) => Number.isFinite(v) && v >= 0 && v <= 100000, 'dip must be 0–100000 mm');

// Density of road fuels sits around 720–900 kg/m3; the wide band still catches
// a decimal-point slip (72 or 8200) without arguing about additives.
const densityNullable = intNullable(500, 1200);
const temperatureNullable = intNullable(-20, 80);

// ----- Dip chart (the tank's calibration table) -----
// A pasted chart gives litres per dip; either `volumeMl` or `litres` is accepted
// so the UI can send whichever it parsed.
export const dipChartPointSchema = z
  .object({
    dipMm,
    volumeMl: bigIntStrOptional,
    litres: z.union([z.number(), z.string()]).optional(),
  })
  .transform((p, ctx) => {
    let volumeMl = p.volumeMl;
    if (volumeMl === undefined && p.litres !== undefined && String(p.litres).trim() !== '') {
      const l = Number(p.litres);
      if (!Number.isFinite(l) || l < 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'litres must be a non-negative number' });
        return z.NEVER;
      }
      volumeMl = BigInt(Math.round(l * 1000));
    }
    if (volumeMl === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'each point needs volumeMl or litres' });
      return z.NEVER;
    }
    return { dipMm: p.dipMm, volumeMl };
  });

export const dipChartBulkSchema = z.object({
  points: z.array(dipChartPointSchema).max(5000),
});

// ----- Per-shift dip readings -----
export const dipReadingsBulkSchema = z.object({
  readings: z.array(
    z.object({
      tankId: z.string().min(1),
      dipMm,
      densityKgM3: densityNullable,
      temperatureC: temperatureNullable,
      // Sent only when the caller wants to override the chart interpolation
      // (e.g. the tank has no chart loaded yet but the operator has a printout).
      volumeFromChartMl: bigIntStrOptional,
      observedAt: z.string().datetime().optional(),
      recordedById: idNullable,
      notes: noteNullable,
    })
  ),
});

// ----- Weights & Measures nozzle tests -----
export const measureTestsBulkSchema = z.object({
  tests: z.array(
    z.object({
      nozzleId: z.string().min(1),
      // 5-litre measure is the standard W&M can; 500 ml and 10 L cans exist too.
      measureMl: bigIntStr.default(5000n),
      deliveredMl: bigIntStr,
      testedAt: z.string().datetime().optional(),
      testedById: idNullable,
      notes: noteNullable,
    })
  ),
});

// ----- Decantation record on a tanker receipt -----
export const decantationSchema = z.object({
  invoiceQtyMl: bigIntStrOptional,
  dipBeforeMm: intNullable(0, 100000),
  dipAfterMm: intNullable(0, 100000),
  densityAtLoading: densityNullable,
  densityAtReceipt: densityNullable,
  temperatureC: temperatureNullable,
  sealIntact: z.union([z.boolean(), z.null()]).optional(),
  decantedAt: z.union([z.string().datetime(), z.null()]).optional(),
  decantedById: idNullable,
  claimRaised: z.boolean().optional(),
  // Normally derived from the loss and the receipt's rate; an explicit value
  // wins so a dealer can record what the OMC actually credited.
  claimAmountPaise: bigIntStrOptional,
  notes: noteNullable,
});

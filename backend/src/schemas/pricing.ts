// Zod schemas for the daily price revision / stock revaluation feature.
// Kept in its own module so `schemas/index.ts` stays untouched.
import { z } from 'zod';

export const pricingFuelTypeEnum = z.enum(['HSD', 'MS', 'MS_POWER', 'CNG']);

// Money arrives as a string or number of PAISE. We never parse money through a
// float: a numeric input is rounded to a whole paise then handed to BigInt.
const paiseStr = z
  .union([z.string(), z.number()])
  .transform((v, ctx) => {
    const raw = typeof v === 'number' ? Math.round(v).toString() : v.trim();
    if (!/^-?\d+$/.test(raw)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'must be a whole number of paise' });
      return z.NEVER;
    }
    return BigInt(raw);
  });

export const createPriceRevisionSchema = z.object({
  fuelType: pricingFuelTypeEnum,
  // Validated here for shape only; the "not negative / not zero / not a no-op"
  // business rules are enforced in the route so the messages are dealer-friendly.
  newRatePaise: paiseStr,
  effectiveAt: z.string().datetime().optional(),
});

export type CreatePriceRevisionInput = z.infer<typeof createPriceRevisionSchema>;

// ?fuelType= on the history endpoints: absent or "" means "all fuels".
export const revisionFilterSchema = z.object({
  fuelType: pricingFuelTypeEnum.optional(),
});

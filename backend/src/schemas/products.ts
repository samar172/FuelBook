// Zod schemas for NON-FUEL RETAIL (lubricants, AdBlue, accessories, services).
//
// Money is BigInt paise everywhere. `bigIntStr` (from ./index) accepts a string
// or a number and refuses negatives, which is what we want for every price and
// amount on this feature: a negative price is always a client bug, and the
// direction of a movement is expressed by `kind` + `direction`, never by a sign.

import { z } from 'zod';
import { bigIntStr } from './index';

export const productCategoryEnum = z.enum([
  'LUBRICANT',
  'ADBLUE',
  'ACCESSORY',
  'SERVICE',
  'OTHER',
]);
export const productUnitEnum = z.enum(['LITRE', 'PIECE', 'KG', 'SERVICE']);
export const productMovementKindEnum = z.enum(['PURCHASE', 'SALE', 'ADJUSTMENT', 'RETURN']);

// IN adds stock, OUT removes it. See routes/products.ts for how this is stored
// (the frozen ProductMovement.quantity is a magnitude, never signed).
export const movementDirectionEnum = z.enum(['IN', 'OUT']);

// GST rate as basis points: 1800 = 18%. Capped at 100% to catch a caller that
// sent a percentage (18) or a fraction (0.18) instead of basis points.
const gstRateBp = z.number().int().min(0).max(10000);

const skuSchema = z
  .string()
  .min(1)
  .max(40)
  .transform((v) => v.trim().toUpperCase());

const nullableText = (max: number) =>
  z
    .union([z.string().max(max), z.null()])
    .transform((v) => {
      if (v === null) return null;
      const t = v.trim();
      return t === '' ? null : t;
    })
    .optional();

export const createProductSchema = z.object({
  sku: skuSchema,
  name: z.string().min(1).max(160).transform((v) => v.trim()),
  category: productCategoryEnum.default('LUBRICANT'),
  unit: productUnitEnum.default('PIECE'),
  packSizeMl: z.union([bigIntStr, z.null()]).optional(),
  purchasePricePaise: bigIntStr.optional(),
  sellingPricePaise: bigIntStr.optional(),
  gstRateBp: gstRateBp.default(1800),
  hsnCode: nullableText(20),
  reorderLevelQty: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const updateProductSchema = z
  .object({
    sku: skuSchema,
    name: z.string().min(1).max(160).transform((v) => v.trim()),
    category: productCategoryEnum,
    unit: productUnitEnum,
    packSizeMl: z.union([bigIntStr, z.null()]),
    purchasePricePaise: bigIntStr,
    sellingPricePaise: bigIntStr,
    gstRateBp,
    hsnCode: nullableText(20),
    reorderLevelQty: z.number().int().min(0),
    isActive: z.boolean(),
  })
  .partial();

// A movement always carries a positive `quantity`. `direction` is only read for
// ADJUSTMENT and RETURN: PURCHASE is always IN and SALE always OUT.
export const createMovementSchema = z.object({
  kind: productMovementKindEnum,
  direction: movementDirectionEnum.optional(),
  quantity: z.number().int().positive(),
  // Price per unit in paise, on the basis given by `priceIsGstInclusive`.
  // Optional: falls back to the product's selling price (SALE) or purchase
  // price (PURCHASE / RETURN / ADJUSTMENT valued at average cost).
  unitPricePaise: bigIntStr.optional(),
  // Whether the unit price already contains GST. Counter staff usually quote an
  // MRP (inclusive); a purchase invoice is usually exclusive.
  priceIsGstInclusive: z.boolean().default(false),
  // Informational link to a credit customer on a lube sale. NOTE: this never
  // touches CreditCustomer.currentBalancePaise — see routes/products.ts.
  customerId: z.string().min(1).optional(),
  shiftReportId: z.string().min(1).optional(),
  reference: nullableText(120),
  notes: nullableText(500),
  // "YYYY-MM-DD" or a full ISO timestamp; omitted means "now".
  occurredAt: z
    .string()
    .optional()
    .transform((v) => {
      if (!v || v.trim() === '') return undefined;
      const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? v + 'T00:00:00Z' : v);
      return Number.isNaN(d.getTime()) ? null : d;
    })
    .refine((v) => v !== null, 'occurredAt is not a valid date')
    .transform((v) => v ?? undefined),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type CreateMovementInput = z.infer<typeof createMovementSchema>;

import { z } from 'zod';
import { bigIntStr, optionalText } from './index';

// Money that must actually be money: paise, integral, strictly positive.
export const positivePaise = bigIntStr.refine((v) => v > 0n, 'must be greater than zero');

export const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
export const dateOnlyOptional = dateOnly.optional();

// "YYYY-MM-DD" or a full ISO timestamp -> Date. Used for occurredAt, where the
// UI may only know the day.
export const timestampStr = z
  .string()
  .min(1)
  .transform((v) => {
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? v + 'T00:00:00.000Z' : v);
    if (Number.isNaN(d.getTime())) throw new Error('invalid date');
    return d;
  });

export const cashLocationEnum = z.enum([
  'ATTENDANT',
  'CASHIER',
  'OFFICE_SAFE',
  'OWNER',
  'BANK',
  'VENDOR',
  'OTHER',
]);
export type CashLocationName = z.infer<typeof cashLocationEnum>;

export const depositStatusEnum = z.enum(['PENDING', 'CLEARED', 'DISPUTED']);
export const settlementStatusEnum = z.enum(['EXPECTED', 'SETTLED', 'SHORT', 'DISPUTED']);
export const txnDirectionEnum = z.enum(['CREDIT', 'DEBIT']);

// ===== CASH MOVEMENTS =====

export const createCashMovementSchema = z
  .object({
    fromLocation: cashLocationEnum,
    fromEmployeeId: z.string().min(1).nullable().optional(),
    toLocation: cashLocationEnum,
    toEmployeeId: z.string().min(1).nullable().optional(),
    amountPaise: positivePaise,
    occurredAt: timestampStr.optional(),
    shiftReportId: z.string().min(1).nullable().optional(),
    purpose: optionalText(200),
    reference: optionalText(100),
    notes: optionalText(500),
  })
  .refine(
    (v) => !(v.fromLocation === v.toLocation && (v.fromEmployeeId || null) === (v.toEmployeeId || null)),
    { message: 'Source and destination are the same — nothing moved', path: ['toLocation'] },
  );

export const updateCashMovementSchema = z.object({
  fromLocation: cashLocationEnum.optional(),
  fromEmployeeId: z.string().min(1).nullable().optional(),
  toLocation: cashLocationEnum.optional(),
  toEmployeeId: z.string().min(1).nullable().optional(),
  amountPaise: positivePaise.optional(),
  occurredAt: timestampStr.optional(),
  shiftReportId: z.string().min(1).nullable().optional(),
  purpose: optionalText(200),
  reference: optionalText(100),
  notes: optionalText(500),
});

// ===== DENOMINATION COUNT =====

const denomCount = z.coerce.number().int().min(0).max(1_000_000).default(0);

export const denominationCountSchema = z.object({
  note500: denomCount,
  note200: denomCount,
  note100: denomCount,
  note50: denomCount,
  note20: denomCount,
  note10: denomCount,
  coin20: denomCount,
  coin10: denomCount,
  coin5: denomCount,
  coin2: denomCount,
  coin1: denomCount,
  countedById: z.string().min(1).nullable().optional(),
  countedAt: timestampStr.optional(),
  notes: optionalText(500),
  // Deliberately NOT accepted: countedTotalPaise. The server computes it.
});

// ===== BANK ACCOUNTS =====

// Only the last four digits ever reach the database. Anything longer is a
// full account number the caller should not be sending.
const last4 = z
  .string()
  .trim()
  .regex(/^\d{4}$/, 'enter only the last 4 digits of the account number');

export const createBankAccountSchema = z.object({
  bankName: z.string().trim().min(1).max(120),
  accountNoLast4: last4,
  ifsc: z
    .union([z.string().trim().regex(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/, 'invalid IFSC'), z.literal(''), z.null()])
    .transform((v) => (v ? v.toUpperCase() : null))
    .optional(),
  nickname: optionalText(60),
  openingBalancePaise: bigIntStr.default(0n),
});

export const updateBankAccountSchema = z.object({
  bankName: z.string().trim().min(1).max(120).optional(),
  accountNoLast4: last4.optional(),
  ifsc: z
    .union([z.string().trim().regex(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/, 'invalid IFSC'), z.literal(''), z.null()])
    .transform((v) => (v ? v.toUpperCase() : null))
    .optional(),
  nickname: optionalText(60),
  openingBalancePaise: bigIntStr.optional(),
  isActive: z.boolean().optional(),
});

// ===== CASH DEPOSITS =====

export const createCashDepositSchema = z.object({
  bankAccountId: z.string().min(1),
  amountPaise: positivePaise,
  depositedOn: dateOnly,
  slipNo: optionalText(60),
  depositedByEmployeeId: z.string().min(1).nullable().optional(),
  shiftReportId: z.string().min(1).nullable().optional(),
  // Where the cash physically left from; the office safe is the usual case.
  fromLocation: cashLocationEnum.default('OFFICE_SAFE'),
  fromEmployeeId: z.string().min(1).nullable().optional(),
  notes: optionalText(500),
});

export const updateCashDepositSchema = z.object({
  status: depositStatusEnum.optional(),
  slipNo: optionalText(60),
  notes: optionalText(500),
  bankAccountId: z.string().min(1).optional(),
  depositedOn: dateOnlyOptional,
});

// ===== SETTLEMENTS =====

export const updateSettlementSchema = z.object({
  settledPaise: bigIntStr.optional(),
  mdrPaise: bigIntStr.optional(),
  settledOn: z.union([dateOnly, z.null()]).optional(),
  bankAccountId: z.string().min(1).nullable().optional(),
  reference: optionalText(100),
  notes: optionalText(500),
  // Only DISPUTED may be forced by hand; the rest is derived from the numbers.
  status: z.literal('DISPUTED').optional(),
});

// ===== BANK STATEMENT IMPORT / MATCHING =====

export const importBankTransactionsSchema = z.object({
  importBatch: optionalText(80),
  rows: z
    .array(
      z.object({
        txnDate: dateOnly,
        description: z.string().trim().min(1).max(400),
        amountPaise: positivePaise,
        direction: txnDirectionEnum,
        balancePaise: bigIntStr.optional(),
        reference: optionalText(100),
      }),
    )
    .min(1, 'nothing to import')
    .max(2000, 'import at most 2000 rows at a time'),
});

export const matchTransactionSchema = z.object({
  kind: z.enum(['CASH_DEPOSIT', 'SETTLEMENT', 'OTHER']),
  id: z.string().min(1).optional(),
  notes: optionalText(500),
});

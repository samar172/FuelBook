// Validation for the credit customer lifecycle: monthly statements, the cheque /
// instrument register, ageing and reminders.
import { z } from 'zod';
import { bigIntStr, bigIntStrOptional, optionalText } from './index';

// A calendar day. Statement periods, due dates, cheque dates and clearing dates
// are all @db.Date columns, so everything is normalised to UTC midnight.
export const dayStr = z
  .string()
  .min(1)
  .transform((v, ctx) => {
    const raw = v.trim();
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw + 'T00:00:00Z' : raw);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid date' });
      return z.NEVER;
    }
    d.setUTCHours(0, 0, 0, 0);
    return d;
  });

export const dayStrOptional = dayStr.optional();

export const generateStatementSchema = z
  .object({
    customerId: z.string().min(1),
    periodFrom: dayStr,
    periodTo: dayStr,
    notes: optionalText(500),
  })
  .refine((v) => v.periodFrom <= v.periodTo, {
    message: 'periodFrom must be on or before periodTo',
    path: ['periodFrom'],
  });

// The client may only move a statement between DRAFT and SENT. PAID /
// PARTIALLY_PAID / OVERDUE are derived from the money, never asserted.
export const updateStatementSchema = z
  .object({
    status: z.enum(['DRAFT', 'SENT']).optional(),
    sentVia: optionalText(60),
    notes: optionalText(500),
  })
  .refine((v) => v.status !== undefined || v.sentVia !== undefined || v.notes !== undefined, {
    message: 'Nothing to update',
  });

export const instrumentKindEnum = z.enum([
  'CASH',
  'CHEQUE',
  'RTGS',
  'NEFT',
  'IMPS',
  'UPI',
  'CARD',
  'OTHER',
]);

export const createInstrumentSchema = z
  .object({
    customerId: z.string().min(1),
    kind: instrumentKindEnum,
    amountPaise: bigIntStr.refine((v) => v > 0n, 'amount must be greater than zero'),
    receivedOn: dayStr,
    chequeNo: optionalText(40),
    chequeDate: dayStrOptional,
    bankName: optionalText(120),
    utrNo: optionalText(60),
    notes: optionalText(500),
  })
  .refine((v) => v.kind !== 'CHEQUE' || !!v.chequeNo, {
    message: 'Cheque number is required for a cheque',
    path: ['chequeNo'],
  })
  .refine((v) => v.kind !== 'CHEQUE' || !!v.chequeDate, {
    message: 'Cheque date is required for a cheque',
    path: ['chequeDate'],
  });

// One explicit action per PATCH — clearing, bouncing and cancelling each need
// different fields, and mixing them invites half-applied updates.
export const updateInstrumentSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('CLEAR'),
    clearedOn: dayStrOptional,
    notes: optionalText(500),
  }),
  z.object({
    action: z.literal('BOUNCE'),
    bouncedOn: dayStrOptional,
    bounceReason: z.string().min(1).max(200),
    bounceChargePaise: bigIntStrOptional,
    notes: optionalText(500),
  }),
  z.object({
    action: z.literal('CANCEL'),
    notes: optionalText(500),
  }),
]);

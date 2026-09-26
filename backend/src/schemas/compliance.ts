import { z } from 'zod';
import { optionalText } from './index';

// Date-only columns (`@db.Date`) everywhere in this feature. Same convention as
// ShiftReport.reportDate: the wire format is "YYYY-MM-DD" and it becomes the
// midnight-UTC instant of that day.
export const dayStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');
export const dayStrNullable = z
  .union([dayStr, z.literal(''), z.null()])
  .transform((v) => (v === null || v === '' ? null : v))
  .optional();

export const licenceKindEnum = z.enum([
  'PESO_EXPLOSIVE',
  'WEIGHTS_MEASURES_STAMPING',
  'FIRE_NOC',
  'POLLUTION_NOC',
  'TRADE_LICENCE',
  'SHOP_ESTABLISHMENT',
  'GST_REGISTRATION',
  'VAT_REGISTRATION',
  'INSURANCE',
  'DEALERSHIP_AGREEMENT',
  'OTHER',
]);

export const licenceStatusEnum = z.enum(['VALID', 'EXPIRING_SOON', 'EXPIRED']);

export const attendanceStatusEnum = z.enum([
  'PRESENT',
  'ABSENT',
  'HALF_DAY',
  'LEAVE',
  'WEEKLY_OFF',
]);

export const advanceKindEnum = z.enum(['ADVANCE', 'REPAYMENT']);

// A whole-day mark carries no shift; "" from a <select> means the same thing.
export const shiftTypeNullable = z
  .union([z.enum(['DAY', 'NIGHT']), z.literal(''), z.null()])
  .transform((v) => (v === '' || v === null ? null : v))
  .optional();

// ===== LICENCES =====

export const createLicenceSchema = z.object({
  kind: licenceKindEnum,
  label: optionalText(200),
  number: optionalText(100),
  issuedBy: optionalText(200),
  issuedOn: dayStrNullable,
  expiresOn: dayStr,
  reminderDaysBefore: z.number().int().min(0).max(365).optional(),
  documentRef: optionalText(300),
  notes: optionalText(2000),
});

export const updateLicenceSchema = z.object({
  kind: licenceKindEnum.optional(),
  label: optionalText(200),
  number: optionalText(100),
  issuedBy: optionalText(200),
  issuedOn: dayStrNullable,
  expiresOn: dayStr.optional(),
  reminderDaysBefore: z.number().int().min(0).max(365).optional(),
  documentRef: optionalText(300),
  notes: optionalText(2000),
  isActive: z.boolean().optional(),
});

export const renewLicenceSchema = z.object({
  expiresOn: dayStr,
  number: optionalText(100),
  issuedOn: dayStrNullable,
});

// ===== ATTENDANCE =====

export const bulkAttendanceSchema = z.object({
  attendanceDate: dayStr,
  shiftType: shiftTypeNullable,
  shiftReportId: optionalText(60),
  entries: z
    .array(
      z.object({
        employeeId: z.string().min(1),
        status: attendanceStatusEnum,
        overtimeMinutes: z.number().int().min(0).max(1440).optional(),
        notes: optionalText(500),
      })
    )
    .min(1, 'at least one entry is required'),
});

export const updateAttendanceSchema = z
  .object({
    status: attendanceStatusEnum.optional(),
    overtimeMinutes: z.number().int().min(0).max(1440).optional(),
    notes: optionalText(500),
  })
  .refine((v) => Object.keys(v).length > 0, 'nothing to update');

export const monthStr = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'must be YYYY-MM');

// ===== STAFF ADVANCES =====

// Money is paise. Accepts a string (preferred) or a number, must be > 0.
const positivePaise = z
  .union([z.string().regex(/^\d+$/, 'must be a whole number of paise'), z.number()])
  .transform((v) => BigInt(typeof v === 'number' ? Math.round(v) : v))
  .refine((v) => v > 0n, 'amount must be greater than zero');

export const createAdvanceSchema = z.object({
  employeeId: z.string().min(1),
  kind: advanceKindEnum,
  amountPaise: positivePaise,
  occurredOn: dayStr,
  reference: optionalText(100),
  notes: optionalText(500),
});

import { z } from 'zod';

// BigInt-friendly: accept string or number, validate as non-negative integer
export const bigIntStr = z
  .union([z.string(), z.number()])
  .transform((v) => BigInt(typeof v === 'number' ? Math.round(v) : v))
  .refine((v) => v >= 0n, 'must be non-negative');

export const bigIntStrOptional = bigIntStr.optional();

// Accepts "YYYY-MM-DD" or a full ISO timestamp; null clears the value.
export const dateStrNullable = z
  .union([z.string(), z.null()])
  .transform((v) => {
    if (v === null || v.trim() === '') return null;
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? v + 'T00:00:00Z' : v);
    if (Number.isNaN(d.getTime())) throw new Error('invalid date');
    return d;
  })
  .optional();

// Free-text profile field: trims, and treats "" as "not set" so clearing a form
// field in the UI nulls the column instead of storing an empty string.
const textNullable = (max = 200) =>
  z
    .union([z.string().max(max), z.null()])
    .transform((v) => {
      if (v === null) return null;
      const t = v.trim();
      return t === '' ? null : t;
    })
    .optional();

export const optionalText = textNullable;

export const fuelTypeEnum = z.enum(['HSD', 'MS', 'MS_POWER', 'CNG']);
export const shiftTypeEnum = z.enum(['DAY', 'NIGHT']);
export const roleEnum = z.enum([
  'OWNER',
  'MANAGER',
  'ACCOUNTANT',
  'CASHIER',
  'ATTENDANT',
  'AUDITOR',
  'STAFF',
]);

// ===== AUTH =====
export const loginSchema = z.object({
  phone: z.string().min(8).max(15),
  pin: z.string().min(4).max(8),
});

export const registerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(8).max(15),
  pin: z.string().min(4).max(8),
  businessName: z.string().min(1),
});

export const switchPumpSchema = z.object({
  pumpId: z.string().min(1),
});

// ===== PUMP / TANK / NOZZLE =====
export const createPumpSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1).max(10),
  address: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
});

export const updatePumpSchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
  city: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  discrepancyMlThreshold: bigIntStrOptional,
  discrepancyPaiseThreshold: bigIntStrOptional,
  cashHandoverMode: z.enum(['PER_ATTENDANT', 'POOLED_CASHIER']).optional(),
});

export const createTankSchema = z.object({
  name: z.string().min(1),
  fuelType: fuelTypeEnum,
  capacityLitres: z.number().positive(),
});

export const createNozzleSchema = z.object({
  tankId: z.string().min(1),
  code: z.string().min(1),
});

// ===== FUEL RATE =====
export const setFuelRateSchema = z.object({
  fuelType: fuelTypeEnum,
  ratePaise: bigIntStr,
  effectiveFrom: z.string().datetime().optional(),
});

export const updateFuelRateSchema = z.object({
  ratePaise: bigIntStrOptional,
  effectiveFrom: z.string().datetime().optional(),
});

// ===== USER + PERMISSIONS =====
export const createUserSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(8).max(15),
  pin: z.string().min(4).max(8),
  role: roleEnum.default('MANAGER'),
  // Optionally tie the login to a staff record, which is what lets an attendant
  // see the shifts they worked.
  employeeId: z.string().min(1).optional().nullable(),
});

// Explicit allow-list: a PATCH must never be able to move a user to another pump
// or flip their own role.
export const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().min(8).max(15).optional(),
  pin: z.string().min(4).max(8).optional(),
  isActive: z.boolean().optional(),
  employeeId: z.string().min(1).nullable().optional(),
});

export const changeRoleSchema = z.object({
  role: roleEnum,
  // Re-apply that role's default permissions, discarding any fine-tuning.
  resetPermissions: z.boolean().default(true),
});

// Moving a staff member to another pump of the same business. Owner only.
export const transferEmployeeSchema = z.object({
  toPumpId: z.string().min(1),
  reason: z.string().max(200).optional().nullable(),
});

export const updatePermissionsSchema = z.object({
  canCreateShift: z.boolean().optional(),
  canEditNozzleReadings: z.boolean().optional(),
  canEditStock: z.boolean().optional(),
  canEditTankerReceipts: z.boolean().optional(),
  canEditCollections: z.boolean().optional(),
  canEditOutstanding: z.boolean().optional(),
  canEditExpenses: z.boolean().optional(),
  canEditCreditSales: z.boolean().optional(),
  canSubmitShift: z.boolean().optional(),
  canLockShift: z.boolean().optional(),
  canEditFuelRates: z.boolean().optional(),
  canManageCreditCustomers: z.boolean().optional(),
  canManageExpenseCategories: z.boolean().optional(),
  canManageUsers: z.boolean().optional(),
  canManagePump: z.boolean().optional(),
  canViewReports: z.boolean().optional(),
  canExportReports: z.boolean().optional(),
  canManageEmployees: z.boolean().optional(),
  canViewBooks: z.boolean().optional(),
  canPostJournalEntries: z.boolean().optional(),
  canManageBankAndSettlement: z.boolean().optional(),
  canManageProducts: z.boolean().optional(),
  canManageLicences: z.boolean().optional(),
});

// ===== SHIFT =====
export const createShiftSchema = z.object({
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
  shiftType: shiftTypeEnum,
  openingCashOverridePaise: bigIntStrOptional,
});

export const updateShiftSchema = z.object({
  notes: z.string().nullable().optional(),
  openingCashPaise: bigIntStrOptional,
});

export const nozzleReadingsBulkSchema = z.object({
  readings: z.array(
    z.object({
      nozzleId: z.string(),
      openingReadingMl: bigIntStr,
      closingReadingMl: bigIntStr,
      testingMl: bigIntStr.default(0n),
    })
  ),
});

export const stockEntriesBulkSchema = z.object({
  entries: z.array(
    z.object({
      tankId: z.string(),
      openingStockMl: bigIntStr,
      closingStockMl: bigIntStr,
    })
  ),
});

export const tankerReceiptSchema = z.object({
  tankId: z.string(),
  receivedMl: bigIntStr,
  ratePaise: bigIntStrOptional,
  totalCostPaise: bigIntStrOptional,
  billNo: z.string().optional(),
  vendorName: z.string().optional(),
  receivedAt: z.string().datetime().optional(),
  notes: z.string().optional(),
});

export const paymentCollectionsBulkSchema = z.object({
  collections: z.array(
    z.object({
      channelId: z.string(),
      timeSlotId: z.string().optional().nullable(),
      amountPaise: bigIntStr,
      reference: z.string().optional(),
      // Which attendant took this money — drives per-person cash accountability.
      employeeId: z.string().optional().nullable(),
    })
  ),
});

export const outstandingReceiptsBulkSchema = z.object({
  receipts: z.array(
    z.object({
      customerId: z.string().optional().nullable(),
      customerNameRaw: z.string().min(1),
      amountPaise: bigIntStr,
      channelId: z.string().optional().nullable(),
      reference: z.string().optional(),
    })
  ),
});

export const expenseEntriesBulkSchema = z.object({
  entries: z.array(
    z.object({
      categoryId: z.string(),
      ref: z.string().optional(),
      lastBillDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
      openingBalancePaise: bigIntStr.default(0n),
      dayExpensePaise: bigIntStr,
      notes: z.string().optional(),
      // Paid out of an attendant's cash, so it reduces what they hand over.
      paidByEmployeeId: z.string().optional().nullable(),
    })
  ),
});

export const creditSaleSchema = z.object({
  customerId: z.string(),
  fuelType: fuelTypeEnum,
  quantityMl: bigIntStr,
  ratePaise: bigIntStr,
  totalAmountPaise: bigIntStr,
  amountPaidPaise: bigIntStr.default(0n),
  amountCreditPaise: bigIntStr,
  paidViaChannelId: z.string().optional().nullable(),
  // Prefer a registered vehicle; vehicleNo remains for one-off vehicles.
  vehicleId: z.string().optional().nullable(),
  // Which attendant booked it — reduces the cash they owe for the shift.
  employeeId: z.string().optional().nullable(),
  vehicleNo: z.string().optional(),
  reference: z.string().optional(),
});

// ===== CREDIT CUSTOMER =====
const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

const customerProfileFields = {
  code: textNullable(30),
  contactPerson: textNullable(100),
  phone: textNullable(15),
  altPhone: textNullable(15),
  // Trim first, then validate — a pasted address often carries stray whitespace.
  email: z
    .union([z.string().max(122), z.null()])
    .transform((v) => (v === null ? null : v.trim().toLowerCase()))
    .refine((v) => v === null || v === '' || z.string().email().safeParse(v).success, 'invalid email')
    .transform((v) => (v === '' ? null : v))
    .optional(),
  addressLine: textNullable(300),
  city: textNullable(80),
  state: textNullable(80),
  pincode: z
    .union([z.string().regex(/^\d{6}$/, 'pincode must be 6 digits'), z.literal(''), z.null()])
    .transform((v) => (v === null || v === '' ? null : v))
    .optional(),
  gstin: z
    .union([z.string(), z.null()])
    .transform((v) => (v === null || v.trim() === '' ? null : v.trim().toUpperCase()))
    .refine((v) => v === null || v === undefined || gstinRegex.test(v), 'invalid GSTIN')
    .optional(),
  paymentTermsDays: z.number().int().min(0).max(365).optional(),
  notes: textNullable(1000),
};

export const createCreditCustomerSchema = z.object({
  name: z.string().min(1).max(150),
  creditLimitPaise: bigIntStr.default(0n),
  // Convenience: a first vehicle can be registered along with the customer.
  vehicleNo: textNullable(20),
  ...customerProfileFields,
});

// Explicit allow-list — a PATCH must never be able to set pumpId or move money
// (currentBalancePaise is derived from locked shifts, not client input).
export const updateCreditCustomerSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  creditLimitPaise: bigIntStrOptional,
  isActive: z.boolean().optional(),
  ...customerProfileFields,
});

// ===== VEHICLE =====
export const vehicleTypeEnum = z.enum([
  'TRUCK',
  'BUS',
  'CAR',
  'TRACTOR',
  'TWO_WHEELER',
  'GENSET',
  'OTHER',
]);

// Registration numbers are stored uppercase with inner spaces/dashes kept as typed.
const vehicleNoField = z
  .string()
  .min(4, 'vehicle number too short')
  .max(20)
  .transform((v) => v.trim().toUpperCase());

export const createVehicleSchema = z.object({
  vehicleNo: vehicleNoField,
  type: vehicleTypeEnum.default('OTHER'),
  makeModel: textNullable(100),
  fuelType: fuelTypeEnum.nullable().optional(),
  capacityMl: bigIntStrOptional,
  isPrimary: z.boolean().default(false),
  notes: textNullable(500),
});

export const updateVehicleSchema = z.object({
  vehicleNo: vehicleNoField.optional(),
  type: vehicleTypeEnum.optional(),
  makeModel: textNullable(100),
  fuelType: fuelTypeEnum.nullable().optional(),
  capacityMl: bigIntStrOptional,
  isPrimary: z.boolean().optional(),
  isActive: z.boolean().optional(),
  notes: textNullable(500),
});

// ===== EXPENSE CATEGORY =====
export const expenseCategorySchema = z.object({
  name: z.string().min(1),
  isRecurring: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

// ===== PAYMENT CHANNEL / TIME SLOT =====
export const paymentChannelSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(['CASH', 'CARD', 'UPI', 'BANK_DEPOSIT', 'WALLET', 'OTHER']),
  sortOrder: z.number().int().default(0),
});

export const paymentTimeSlotSchema = z.object({
  name: z.string().min(1),
  sortOrder: z.number().int().default(0),
  // null / omitted = the slot applies to both day and night shifts.
  shiftType: shiftTypeEnum.nullable().optional(),
});

// Explicit allow-list: a PATCH must not be able to move a slot to another pump.
export const updatePaymentTimeSlotSchema = z.object({
  name: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
  shiftType: shiftTypeEnum.nullable().optional(),
  isActive: z.boolean().optional(),
});

// ===== EMPLOYEES =====
const employeeProfileFields = {
  code: textNullable(30),
  designation: textNullable(80),
  phone: textNullable(15),
  altPhone: textNullable(15),
  dateOfBirth: dateStrNullable,
  addressLine: textNullable(300),
  city: textNullable(80),
  state: textNullable(80),
  pincode: z
    .union([z.string().regex(/^\d{6}$/, 'pincode must be 6 digits'), z.literal(''), z.null()])
    .transform((v) => (v === null || v === '' ? null : v))
    .optional(),
  joiningDate: dateStrNullable,
  exitDate: dateStrNullable,
  emergencyContactName: textNullable(100),
  emergencyContactPhone: textNullable(15),
  notes: textNullable(1000),
};

export const createEmployeeSchema = z.object({
  name: z.string().min(1).max(150),
  ...employeeProfileFields,
});

export const updateEmployeeSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  isActive: z.boolean().optional(),
  ...employeeProfileFields,
});

export const employeeAssignmentsBulkSchema = z.object({
  assignments: z.array(
    z.object({
      nozzleId: z.string().min(1),
      employeeId: z.string().min(1),
    })
  ),
});

// ===== CASH HANDOVER (employee cash accountability) =====
export const cashHandoversBulkSchema = z.object({
  handovers: z.array(
    z.object({
      employeeId: z.string().min(1),
      receivedCashPaise: bigIntStr,
      notes: z.string().max(500).optional().nullable(),
    })
  ),
});

export const shiftCashierSchema = z.object({
  cashierEmployeeId: z.string().min(1).nullable(),
});

// ===== LEDGER =====
// A manual entry must carry at least two lines and balance; each line is either a
// debit or a credit, never both.
export const manualJournalSchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
  narration: z.string().min(3).max(300),
  lines: z
    .array(
      z.object({
        code: z.string().min(1),
        debitPaise: bigIntStr.default(0n),
        creditPaise: bigIntStr.default(0n),
        customerId: z.string().optional().nullable(),
        employeeId: z.string().optional().nullable(),
        channelId: z.string().optional().nullable(),
        expenseCategoryId: z.string().optional().nullable(),
        tankId: z.string().optional().nullable(),
        memo: z.string().max(200).optional().nullable(),
      })
    )
    .min(2, 'a journal entry needs at least two lines'),
});

// ===== MID-SHIFT CASH DROP =====
// An attendant handing cash to the cashier or the office safe partway through a
// shift. The exact time matters — the owner wants to see when each drop happened.
export const cashDropSchema = z.object({
  employeeId: z.string().min(1),
  amountPaise: bigIntStr,
  toLocation: z.enum(['CASHIER', 'OFFICE_SAFE']).default('CASHIER'),
  toEmployeeId: z.string().min(1).optional().nullable(),
  occurredAt: z.string().datetime().optional(),
  purpose: z.string().max(200).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

// ===== OPENING BALANCES =====
// What the business already had on the day it started using FuelBook. A pump
// rarely starts on 1 April — it starts mid-year, already holding cash, fuel,
// customer dues and an oil-company bill.
export const openingBalancesSchema = z.object({
  asOnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
  cashInHandPaise: bigIntStr.default(0n),
  supplierPayablePaise: bigIntStr.default(0n),
  bankBalances: z
    .array(z.object({ bankAccountId: z.string().min(1), amountPaise: bigIntStr }))
    .default([]),
  customerDues: z
    .array(z.object({ customerId: z.string().min(1), amountPaise: bigIntStr }))
    .default([]),
  fuelStock: z
    .array(
      z.object({
        tankId: z.string().min(1),
        quantityMl: bigIntStr.default(0n),
        valuePaise: bigIntStr.default(0n),
      })
    )
    .default([]),
  productStock: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().min(0).default(0),
        valuePaise: bigIntStr.default(0n),
      })
    )
    .default([]),
  staffAdvances: z
    .array(z.object({ employeeId: z.string().min(1), amountPaise: bigIntStr }))
    .default([]),
  staffShortages: z
    .array(z.object({ employeeId: z.string().min(1), amountPaise: bigIntStr }))
    .default([]),
  notes: z.string().max(300).optional().nullable(),
});

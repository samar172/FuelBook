import { z } from 'zod';

// BigInt-friendly: accept string or number, validate as non-negative integer
export const bigIntStr = z
  .union([z.string(), z.number()])
  .transform((v) => BigInt(typeof v === 'number' ? Math.round(v) : v))
  .refine((v) => v >= 0n, 'must be non-negative');

export const bigIntStrOptional = bigIntStr.optional();

export const fuelTypeEnum = z.enum(['HSD', 'MS', 'MS_POWER', 'CNG']);
export const shiftTypeEnum = z.enum(['DAY', 'NIGHT']);
export const roleEnum = z.enum(['OWNER', 'MANAGER', 'STAFF']);

// ===== AUTH =====
export const loginSchema = z.object({
  phone: z.string().min(8).max(15),
  pin: z.string().min(4).max(8),
});

// ===== PUMP / TANK / NOZZLE =====
export const createPumpSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1).max(10),
  address: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
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

// ===== USER + PERMISSIONS =====
export const createUserSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(8).max(15),
  pin: z.string().min(4).max(8),
  role: roleEnum.default('MANAGER'),
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
  vehicleNo: z.string().optional(),
  reference: z.string().optional(),
});

// ===== CREDIT CUSTOMER =====
export const createCreditCustomerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  vehicleNo: z.string().optional(),
  creditLimitPaise: bigIntStr.default(0n),
  notes: z.string().optional(),
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
});

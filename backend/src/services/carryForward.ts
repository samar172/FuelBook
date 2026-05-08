import { ShiftType, Prisma } from '@prisma/client';
import { prisma } from '../lib/db';

// Find the previous shift for the given (pumpId, date, shiftType)
// Order: ... DAY(d-1) -> NIGHT(d-1) -> DAY(d) -> NIGHT(d) ...
export async function findPreviousShift(
  pumpId: string,
  reportDate: Date,
  shiftType: ShiftType
) {
  const date = new Date(reportDate);
  if (shiftType === ShiftType.NIGHT) {
    // Previous = DAY of same date
    return prisma.shiftReport.findUnique({
      where: {
        pumpId_reportDate_shiftType: { pumpId, reportDate: date, shiftType: ShiftType.DAY },
      },
      include: {
        nozzleReadings: true,
        stockEntries: true,
        expenseEntries: true,
      },
    });
  }
  // shiftType === DAY -> previous is NIGHT of previous day
  const prev = new Date(date);
  prev.setUTCDate(prev.getUTCDate() - 1);
  return prisma.shiftReport.findUnique({
    where: {
      pumpId_reportDate_shiftType: { pumpId, reportDate: prev, shiftType: ShiftType.NIGHT },
    },
    include: {
      nozzleReadings: true,
      stockEntries: true,
      expenseEntries: true,
    },
  });
}

export interface CarryForwardData {
  openingCashPaise: bigint;
  nozzleOpenings: Map<string, bigint>; // nozzleId -> opening reading
  tankOpenings: Map<string, bigint>; // tankId -> opening stock
  expenseOpenings: Map<string, bigint>; // categoryId -> opening balance
  customerBalances: Map<string, bigint>; // customerId -> balance
}

export async function buildCarryForward(
  pumpId: string,
  reportDate: Date,
  shiftType: ShiftType
): Promise<CarryForwardData> {
  const prev = await findPreviousShift(pumpId, reportDate, shiftType);

  const data: CarryForwardData = {
    openingCashPaise: 0n,
    nozzleOpenings: new Map(),
    tankOpenings: new Map(),
    expenseOpenings: new Map(),
    customerBalances: new Map(),
  };

  if (prev) {
    data.openingCashPaise = prev.closingCashPaise;
    for (const r of prev.nozzleReadings) {
      data.nozzleOpenings.set(r.nozzleId, r.closingReadingMl);
    }
    for (const s of prev.stockEntries) {
      data.tankOpenings.set(s.tankId, s.closingStockMl);
    }
    for (const e of prev.expenseEntries) {
      // closing = opening + dayExpense
      data.expenseOpenings.set(e.categoryId, e.openingBalancePaise + e.dayExpensePaise);
    }
  }

  // Always pull current customer balances (they live on CreditCustomer model)
  const customers = await prisma.creditCustomer.findMany({
    where: { pumpId, isActive: true },
    select: { id: true, currentBalancePaise: true },
  });
  for (const c of customers) {
    data.customerBalances.set(c.id, c.currentBalancePaise);
  }

  return data;
}

// Initialize a new shift's child rows with carry-forward values
export async function initializeShiftChildren(
  tx: Prisma.TransactionClient,
  shiftReportId: string,
  pumpId: string,
  carry: CarryForwardData
) {
  const [nozzles, tanks, categories] = await Promise.all([
    tx.nozzle.findMany({ where: { pumpId, isActive: true } }),
    tx.tank.findMany({ where: { pumpId, isActive: true } }),
    tx.expenseCategory.findMany({ where: { pumpId, isActive: true } }),
  ]);

  // Nozzle readings: opening from carry, closing = opening (no sale yet), testing 0
  if (nozzles.length) {
    await tx.nozzleReading.createMany({
      data: nozzles.map((n) => {
        const opening = carry.nozzleOpenings.get(n.id) ?? 0n;
        return {
          shiftReportId,
          nozzleId: n.id,
          fuelType: n.fuelType,
          openingReadingMl: opening,
          closingReadingMl: opening,
          testingMl: 0n,
        };
      }),
    });
  }

  // Stock entries
  if (tanks.length) {
    await tx.stockEntry.createMany({
      data: tanks.map((t) => {
        const opening = carry.tankOpenings.get(t.id) ?? 0n;
        return {
          shiftReportId,
          tankId: t.id,
          fuelType: t.fuelType,
          openingStockMl: opening,
          closingStockMl: opening,
        };
      }),
    });
  }

  // Recurring expense entries (one row per recurring category, day expense 0)
  const recurring = categories.filter((c) => c.isRecurring);
  if (recurring.length) {
    await tx.expenseEntry.createMany({
      data: recurring.map((c) => ({
        shiftReportId,
        categoryId: c.id,
        openingBalancePaise: carry.expenseOpenings.get(c.id) ?? 0n,
        dayExpensePaise: 0n,
      })),
    });
  }
}

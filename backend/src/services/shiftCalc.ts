// Heart of the system: compute every total + reconciliation for a shift.
// All math here is BigInt. Called inside a Prisma transaction on every save.

import { Prisma, FuelType } from '@prisma/client';

export interface ShiftTotals {
  // Sales side
  fuelSalesByType: Record<FuelType, { quantityMl: bigint; amountPaise: bigint }>;
  totalSalesPaise: bigint; // Σ fuel sale qty × rate (incl. credit sales)
  totalCreditIssuedPaise: bigint;
  totalCashFromCreditSalesPaise: bigint;
  totalOutstandingReceivedPaise: bigint;
  // Money in
  totalCollectionsPaise: bigint; // sum of payment-mode collections (cash + UPI + card + bank)
  // Money out
  totalExpensesPaise: bigint;
  // Cash
  closingCashPaise: bigint;
  // Reconciliation
  totalSaleMlByMeter: bigint;
  totalSaleMlByStock: bigint;
  discrepancyMl: bigint;
  discrepancyFlag: boolean;
  // Where did the money go check:
  // expectedCollections = totalSales - creditIssued + outstandingReceived
  // (because creditIssued is NOT money received today; it's a receivable)
  expectedCollectionsPaise: bigint;
  cashFlowDifferencePaise: bigint;
}

export async function computeShiftTotals(
  tx: Prisma.TransactionClient,
  shiftReportId: string,
  thresholdMl: bigint
): Promise<ShiftTotals> {
  const shift = await tx.shiftReport.findUniqueOrThrow({
    where: { id: shiftReportId },
    include: {
      nozzleReadings: true,
      stockEntries: true,
      tankerReceipts: true,
      paymentCollections: true,
      outstandingReceipts: true,
      expenseEntries: true,
      creditSales: true,
    },
  });

  const fuelTypes: FuelType[] = ['HSD', 'MS', 'MS_POWER', 'CNG'];

  // --- Sales by meter (fuel volume) ---
  const meterByFuel: Record<FuelType, bigint> = {
    HSD: 0n,
    MS: 0n,
    MS_POWER: 0n,
    CNG: 0n,
  };
  for (const r of shift.nozzleReadings) {
    const sale = r.closingReadingMl - r.openingReadingMl - r.testingMl;
    const safe = sale < 0n ? 0n : sale;
    meterByFuel[r.fuelType] += safe;
  }

  // --- Sales by stock (fuel volume) ---
  // Pre-aggregate tanker receipts per tank for purchase qty
  const purchaseByTank: Record<string, bigint> = {};
  for (const t of shift.tankerReceipts) {
    purchaseByTank[t.tankId] = (purchaseByTank[t.tankId] || 0n) + t.receivedMl;
  }
  const stockByFuel: Record<FuelType, bigint> = {
    HSD: 0n,
    MS: 0n,
    MS_POWER: 0n,
    CNG: 0n,
  };
  for (const s of shift.stockEntries) {
    const purchase = purchaseByTank[s.tankId] || 0n;
    const sale = s.openingStockMl + purchase - s.closingStockMl;
    const safe = sale < 0n ? 0n : sale;
    stockByFuel[s.fuelType] += safe;
  }

  // --- Sales amount (qty × rate) using current FuelRate per fuel type ---
  // Fetch most recent fuel rate per fuel type for this pump
  const rates = await tx.fuelRate.findMany({
    where: { pumpId: shift.pumpId },
    orderBy: { effectiveFrom: 'desc' },
  });
  const ratePerFuel: Partial<Record<FuelType, bigint>> = {};
  for (const r of rates) {
    if (!ratePerFuel[r.fuelType]) ratePerFuel[r.fuelType] = r.ratePaise;
  }

  const fuelSalesByType: ShiftTotals['fuelSalesByType'] = {} as ShiftTotals['fuelSalesByType'];
  let totalSalesPaise = 0n;
  let totalSaleMlByMeter = 0n;
  let totalSaleMlByStock = 0n;

  for (const f of fuelTypes) {
    const qtyMl = meterByFuel[f]; // sales reported via meter is the source of truth for revenue
    const ratePaise = ratePerFuel[f] ?? 0n;
    // amount = (qtyMl / 1000ml) × ratePaise = qtyMl × ratePaise / 1000
    const amountPaise = (qtyMl * ratePaise) / 1000n;
    fuelSalesByType[f] = { quantityMl: qtyMl, amountPaise };
    totalSalesPaise += amountPaise;
    totalSaleMlByMeter += meterByFuel[f];
    totalSaleMlByStock += stockByFuel[f];
  }

  // --- Credit sales totals ---
  let totalCreditIssuedPaise = 0n;
  let totalCashFromCreditSalesPaise = 0n;
  for (const cs of shift.creditSales) {
    totalCreditIssuedPaise += cs.amountCreditPaise;
    totalCashFromCreditSalesPaise += cs.amountPaidPaise;
  }

  // --- Outstanding (past credit) received ---
  const totalOutstandingReceivedPaise = shift.outstandingReceipts.reduce(
    (acc, o) => acc + o.amountPaise,
    0n
  );

  // --- Collections (money in via payment channels) ---
  const totalCollectionsPaise = shift.paymentCollections.reduce(
    (acc, p) => acc + p.amountPaise,
    0n
  );

  // --- Expenses ---
  const totalExpensesPaise = shift.expenseEntries.reduce(
    (acc, e) => acc + e.dayExpensePaise,
    0n
  );

  // --- Closing cash ---
  // Cash flow:
  //   Money in  = openingCash + (totalSales - creditIssued) + outstandingReceived
  //   Money out = expenses
  // closingCash = Money in - Money out
  const closingCashPaise =
    shift.openingCashPaise +
    (totalSalesPaise - totalCreditIssuedPaise) +
    totalOutstandingReceivedPaise -
    totalExpensesPaise;

  // --- Reconciliation: meter vs stock ---
  const discrepancyMl = totalSaleMlByMeter - totalSaleMlByStock;
  const absDisc = discrepancyMl < 0n ? -discrepancyMl : discrepancyMl;
  const discrepancyFlag = absDisc > thresholdMl;

  // --- Cash flow check: collections should equal real money received
  // expected = (sales - credit issued) + outstanding received
  // i.e. cash + UPI + card + bank deposits SHOULD sum to that.
  const expectedCollectionsPaise =
    totalSalesPaise - totalCreditIssuedPaise + totalOutstandingReceivedPaise;
  const cashFlowDifferencePaise = totalCollectionsPaise - expectedCollectionsPaise;

  return {
    fuelSalesByType,
    totalSalesPaise,
    totalCreditIssuedPaise,
    totalCashFromCreditSalesPaise,
    totalOutstandingReceivedPaise,
    totalCollectionsPaise,
    totalExpensesPaise,
    closingCashPaise,
    totalSaleMlByMeter,
    totalSaleMlByStock,
    discrepancyMl,
    discrepancyFlag,
    expectedCollectionsPaise,
    cashFlowDifferencePaise,
  };
}

// Persist totals onto the ShiftReport row
export async function persistShiftTotals(
  tx: Prisma.TransactionClient,
  shiftReportId: string,
  totals: ShiftTotals
) {
  await tx.shiftReport.update({
    where: { id: shiftReportId },
    data: {
      totalSalesPaise: totals.totalSalesPaise,
      totalCreditIssuedPaise: totals.totalCreditIssuedPaise,
      totalCashFromCreditSalesPaise: totals.totalCashFromCreditSalesPaise,
      totalOutstandingReceivedPaise: totals.totalOutstandingReceivedPaise,
      totalCollectionsPaise: totals.totalCollectionsPaise,
      totalExpensesPaise: totals.totalExpensesPaise,
      closingCashPaise: totals.closingCashPaise,
      totalSaleMlByMeter: totals.totalSaleMlByMeter,
      totalSaleMlByStock: totals.totalSaleMlByStock,
      discrepancyMl: totals.discrepancyMl,
      discrepancyFlag: totals.discrepancyFlag,
      cashFlowDifferencePaise: totals.cashFlowDifferencePaise,
    },
  });
}

// Convenience: recompute + persist in one call
export async function recomputeShift(
  tx: Prisma.TransactionClient,
  shiftReportId: string,
  thresholdMl: bigint
) {
  const totals = await computeShiftTotals(tx, shiftReportId, thresholdMl);
  await persistShiftTotals(tx, shiftReportId, totals);
  return totals;
}

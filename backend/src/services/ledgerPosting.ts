// Builds and posts the double-entry journal for a shift, and reverses it.
//
// The whole shift becomes up to four balanced entries:
//   1. Sales & money in   — revenue, receivables, cash/digital money, short/over
//   2. Expenses           — operating expenses paid out of cash
//   3. Fuel purchases     — tanker loads into inventory, owed to the supplier
//   4. Cost of goods sold — fuel sold, at weighted-average cost
//
// Why cash short/over is split: an attendant's shortage is recoverable from them
// (Staff Receivable), so only the part nobody is accountable for lands in the
// Cash Short expense.

import { Prisma, FuelType, JournalSource } from '@prisma/client';
import {
  ACCOUNT,
  AccountMap,
  DraftLine,
  computeEmployeeExpectations,
  ensureChartOfAccounts,
  latestRates,
  postEntry,
} from './ledger';

const abs = (v: bigint) => (v < 0n ? -v : v);

export interface PostingResult {
  entryIds: string[];
  salesPaise: bigint;
  cashShortPaise: bigint; // unexplained, expensed
  staffRecoverablePaise: bigint; // pinned on attendants
  cashOverPaise: bigint;
  cogsPaise: bigint;
  purchasesPaise: bigint;
  skippedPurchases: number; // tanker loads with no cost recorded
}

/**
 * Posts every journal entry for a locked shift. Must run inside the same
 * transaction as the lock so the books and the shift status move together.
 */
export async function postShiftJournal(
  tx: Prisma.TransactionClient,
  shiftReportId: string,
  userId: string,
): Promise<PostingResult> {
  const shift = await tx.shiftReport.findUniqueOrThrow({
    where: { id: shiftReportId },
    include: {
      nozzleReadings: { include: { nozzle: { select: { tankId: true } } } },
      creditSales: true,
      outstandingReceipts: true,
      paymentCollections: { include: { channel: { select: { kind: true, name: true } } } },
      expenseEntries: { include: { category: { select: { name: true } } } },
      tankerReceipts: true,
      cashHandovers: true,
    },
  });

  if (shift.ledgerPostedAt) {
    throw new Error('This shift has already been posted to the ledger');
  }

  const accounts = await ensureChartOfAccounts(tx, shift.pumpId);
  const rates = await latestRates(tx, shift.pumpId);
  const entryDate = shift.reportDate;
  const dateLabel = entryDate.toISOString().slice(0, 10);
  const label = `${dateLabel} ${shift.shiftType} shift`;
  const entryIds: string[] = [];

  // ---------------------------------------------------------------- 1. sales & money in
  const lines: DraftLine[] = [];

  // Revenue, split by fuel type, valued at the current rate (same basis as the
  // shift totals the rest of the app shows).
  let salesPaise = 0n;
  const fuelTypes: FuelType[] = ['HSD', 'MS', 'MS_POWER', 'CNG'];
  const soldByFuel = new Map<FuelType, { qty: bigint; value: bigint }>();
  const soldByTank = new Map<string, bigint>();
  for (const r of shift.nozzleReadings) {
    const sold = r.closingReadingMl - r.openingReadingMl - r.testingMl;
    const qty = sold > 0n ? sold : 0n;
    if (qty === 0n) continue;
    const value = (qty * (rates[r.fuelType] ?? 0n)) / 1000n;
    const cur = soldByFuel.get(r.fuelType) ?? { qty: 0n, value: 0n };
    soldByFuel.set(r.fuelType, { qty: cur.qty + qty, value: cur.value + value });
    soldByTank.set(r.nozzle.tankId, (soldByTank.get(r.nozzle.tankId) ?? 0n) + qty);
  }
  for (const f of fuelTypes) {
    const s = soldByFuel.get(f);
    if (!s || s.value === 0n) continue;
    salesPaise += s.value;
    lines.push({
      code: ACCOUNT.FUEL_SALES,
      creditPaise: s.value,
      fuelType: f,
      quantityMl: s.qty,
      memo: `${f} sales`,
    });
  }

  // Credit given today increases what customers owe.
  for (const cs of shift.creditSales) {
    if (cs.amountCreditPaise === 0n) continue;
    lines.push({
      code: ACCOUNT.RECEIVABLE_CUSTOMER,
      debitPaise: cs.amountCreditPaise,
      customerId: cs.customerId,
      employeeId: cs.employeeId,
      fuelType: cs.fuelType,
      memo: 'Fuel on credit',
    });
  }

  // Old dues collected today reduce what customers owe.
  for (const r of shift.outstandingReceipts) {
    if (r.amountPaise === 0n || !r.customerId) continue;
    lines.push({
      code: ACCOUNT.RECEIVABLE_CUSTOMER,
      creditPaise: r.amountPaise,
      customerId: r.customerId,
      channelId: r.channelId,
      memo: 'Outstanding received',
    });
  }
  // Receipts recorded against a walk-in name we can't match to a customer still
  // brought money in; treat them as revenue-neutral collections only.
  const unmatchedReceipts = shift.outstandingReceipts
    .filter((r) => !r.customerId)
    .reduce((s, r) => s + r.amountPaise, 0n);

  // Money actually taken, by channel.
  for (const pc of shift.paymentCollections) {
    if (pc.amountPaise === 0n) continue;
    const isCash = pc.channel.kind === 'CASH';
    const isBank = pc.channel.kind === 'BANK_DEPOSIT';
    lines.push({
      code: isCash ? ACCOUNT.CASH : isBank ? ACCOUNT.BANK : ACCOUNT.CARD_UPI_CLEARING,
      debitPaise: pc.amountPaise,
      channelId: pc.channelId,
      employeeId: pc.employeeId,
      memo: pc.channel.name,
    });
  }

  // What the entry balances to so far tells us whether money is missing or extra.
  const debitSoFar = lines.reduce((s, l) => s + (l.debitPaise ?? 0n), 0n);
  const creditSoFar = lines.reduce((s, l) => s + (l.creditPaise ?? 0n), 0n);
  // unmatchedReceipts came in as cash/channel debits but have no receivable to
  // credit, so they are part of this gap by construction.
  const gap = debitSoFar - creditSoFar; // >0 extra money in, <0 money missing

  let cashShortPaise = 0n;
  let staffRecoverablePaise = 0n;
  let cashOverPaise = 0n;

  if (gap < 0n) {
    // Money missing. Pin it on attendants who came up short, up to their shortage.
    let remaining = -gap;
    const shortages = shift.cashHandovers
      .filter((h) => h.variancePaise < 0n)
      .sort((a, b) => (a.variancePaise < b.variancePaise ? -1 : 1));
    for (const h of shortages) {
      if (remaining === 0n) break;
      const take = abs(h.variancePaise) < remaining ? abs(h.variancePaise) : remaining;
      lines.push({
        code: ACCOUNT.RECEIVABLE_STAFF,
        debitPaise: take,
        employeeId: h.employeeId,
        memo: 'Cash short — recoverable',
      });
      staffRecoverablePaise += take;
      remaining -= take;
    }
    if (remaining > 0n) {
      lines.push({ code: ACCOUNT.CASH_SHORT, debitPaise: remaining, memo: 'Unexplained shortage' });
      cashShortPaise = remaining;
    }
  } else if (gap > 0n) {
    let remaining = gap;
    const excesses = shift.cashHandovers
      .filter((h) => h.variancePaise > 0n)
      .sort((a, b) => (a.variancePaise > b.variancePaise ? -1 : 1));
    for (const h of excesses) {
      if (remaining === 0n) break;
      const take = h.variancePaise < remaining ? h.variancePaise : remaining;
      lines.push({
        code: ACCOUNT.CASH_OVER,
        creditPaise: take,
        employeeId: h.employeeId,
        memo: 'Cash excess',
      });
      cashOverPaise += take;
      remaining -= take;
    }
    if (remaining > 0n) {
      lines.push({
        code: ACCOUNT.CASH_OVER,
        creditPaise: remaining,
        memo: unmatchedReceipts > 0n ? 'Unmatched receipts / excess' : 'Unexplained excess',
      });
      cashOverPaise += remaining;
    }
  }

  const salesEntry = await postEntry(tx, accounts, {
    pumpId: shift.pumpId,
    entryDate,
    narration: `Sales & collections — ${label}`,
    source: JournalSource.SHIFT_LOCK,
    shiftReportId: shift.id,
    createdById: userId,
    lines,
  });
  if (salesEntry) entryIds.push(salesEntry.id);

  // ---------------------------------------------------------------- 2. expenses
  const expenseLines: DraftLine[] = [];
  let expenseTotal = 0n;
  for (const e of shift.expenseEntries) {
    if (e.dayExpensePaise === 0n) continue;
    expenseLines.push({
      code: ACCOUNT.OPERATING_EXPENSES,
      debitPaise: e.dayExpensePaise,
      expenseCategoryId: e.categoryId,
      employeeId: e.paidByEmployeeId,
      memo: e.category.name,
    });
    expenseTotal += e.dayExpensePaise;
  }
  if (expenseTotal > 0n) {
    expenseLines.push({ code: ACCOUNT.CASH, creditPaise: expenseTotal, memo: 'Paid in cash' });
    const expEntry = await postEntry(tx, accounts, {
      pumpId: shift.pumpId,
      entryDate,
      narration: `Expenses — ${label}`,
      source: JournalSource.SHIFT_LOCK,
      shiftReportId: shift.id,
      createdById: userId,
      lines: expenseLines,
    });
    if (expEntry) entryIds.push(expEntry.id);
  }

  // ---------------------------------------------------------------- 3. fuel purchases
  const purchaseLines: DraftLine[] = [];
  let purchasesPaise = 0n;
  let skippedPurchases = 0;
  for (const t of shift.tankerReceipts) {
    const cost =
      t.totalCostPaise ?? (t.ratePaise != null ? (t.receivedMl * t.ratePaise) / 1000n : null);
    if (cost == null || cost === 0n) {
      // No price recorded — there is no honest value to capitalise, so leave it
      // out of the books rather than invent one.
      skippedPurchases += 1;
      continue;
    }
    purchaseLines.push({
      code: ACCOUNT.FUEL_INVENTORY,
      debitPaise: cost,
      tankId: t.tankId,
      quantityMl: t.receivedMl,
      memo: t.billNo ? `Tanker ${t.billNo}` : 'Tanker load',
    });
    purchasesPaise += cost;
    await bumpInventory(tx, t.tankId, t.receivedMl, cost);
  }
  if (purchasesPaise > 0n) {
    purchaseLines.push({
      code: ACCOUNT.PAYABLE_FUEL,
      creditPaise: purchasesPaise,
      memo: 'Owed for fuel purchased',
    });
    const purEntry = await postEntry(tx, accounts, {
      pumpId: shift.pumpId,
      entryDate,
      narration: `Fuel purchases — ${label}`,
      source: JournalSource.SHIFT_LOCK,
      shiftReportId: shift.id,
      createdById: userId,
      lines: purchaseLines,
    });
    if (purEntry) entryIds.push(purEntry.id);
  }

  // ---------------------------------------------------------------- 4. cost of goods sold
  const cogsLines: DraftLine[] = [];
  let cogsPaise = 0n;
  for (const [tankId, qty] of soldByTank) {
    if (qty === 0n) continue;
    const state = await tx.tankInventoryState.findUnique({ where: { tankId } });
    if (!state || state.quantityMl <= 0n || state.valuePaise <= 0n) continue; // no cost basis yet
    const usableQty = qty < state.quantityMl ? qty : state.quantityMl;
    // Weighted average: value * (qty / qtyOnHand), integer-safe.
    const cost = (state.valuePaise * usableQty) / state.quantityMl;
    if (cost === 0n) continue;
    cogsLines.push({
      code: ACCOUNT.COGS_FUEL,
      debitPaise: cost,
      tankId,
      quantityMl: usableQty,
      memo: 'Cost of fuel sold',
    });
    cogsLines.push({ code: ACCOUNT.FUEL_INVENTORY, creditPaise: cost, tankId, quantityMl: usableQty });
    cogsPaise += cost;
    await bumpInventory(tx, tankId, -usableQty, -cost);
  }
  if (cogsPaise > 0n) {
    const cogsEntry = await postEntry(tx, accounts, {
      pumpId: shift.pumpId,
      entryDate,
      narration: `Cost of fuel sold — ${label}`,
      source: JournalSource.SHIFT_LOCK,
      shiftReportId: shift.id,
      createdById: userId,
      lines: cogsLines,
    });
    if (cogsEntry) entryIds.push(cogsEntry.id);
  }

  await tx.shiftReport.update({
    where: { id: shift.id },
    data: { ledgerPostedAt: new Date() },
  });

  return {
    entryIds,
    salesPaise,
    cashShortPaise,
    staffRecoverablePaise,
    cashOverPaise,
    cogsPaise,
    purchasesPaise,
    skippedPurchases,
  };
}

/**
 * Reverses every entry posted for a shift by writing mirror entries, and undoes
 * the inventory movements those entries caused.
 */
export async function reverseShiftJournal(
  tx: Prisma.TransactionClient,
  shiftReportId: string,
  userId: string,
  reason = 'shift unlocked',
): Promise<string[]> {
  const shift = await tx.shiftReport.findUniqueOrThrow({
    where: { id: shiftReportId },
    select: { pumpId: true },
  });
  const entries = await tx.journalEntry.findMany({
    where: { shiftReportId, source: JournalSource.SHIFT_LOCK, reversedBy: null },
    include: { lines: true },
  });
  // Account codes are unique per pump, so this cache must be scoped to one pump
  // or a mirror line could resolve to another pump's account of the same code.
  const pumpAccounts = await tx.ledgerAccount.findMany({ where: { pumpId: shift.pumpId } });
  const accountsById = new Map(pumpAccounts.map((a) => [a.id, a]));
  const accounts: AccountMap = {};
  for (const a of pumpAccounts) {
    accounts[a.code] = { id: a.id, code: a.code, name: a.name, type: a.type };
  }
  const reversedIds: string[] = [];

  for (const entry of entries) {
    const mirrored = await postEntry(tx, accounts, {
      pumpId: entry.pumpId,
      entryDate: entry.entryDate,
      narration: `Reversal (${reason}) — ${entry.narration}`,
      source: JournalSource.REVERSAL,
      shiftReportId: entry.shiftReportId,
      reversalOfId: entry.id,
      createdById: userId,
      lines: entry.lines.map((l) => {
        const acc = accountsById.get(l.accountId);
        if (!acc) {
          throw new Error(`Journal line ${l.id} points at an account outside its pump`);
        }
        return {
        code: acc.code,
        debitPaise: l.creditPaise,
        creditPaise: l.debitPaise,
        customerId: l.customerId,
        employeeId: l.employeeId,
        channelId: l.channelId,
        expenseCategoryId: l.expenseCategoryId,
        tankId: l.tankId,
        fuelType: l.fuelType,
        quantityMl: l.quantityMl,
        memo: l.memo,
        };
      }),
    });
    if (mirrored) reversedIds.push(mirrored.id);

    // Undo inventory movement: an original debit to inventory added stock, a
    // credit removed it.
    for (const l of entry.lines) {
      const acc = accountsById.get(l.accountId);
      if (!acc || acc.code !== ACCOUNT.FUEL_INVENTORY || !l.tankId) continue;
      const qty = l.quantityMl ?? 0n;
      if (l.debitPaise > 0n) await bumpInventory(tx, l.tankId, -qty, -l.debitPaise);
      else if (l.creditPaise > 0n) await bumpInventory(tx, l.tankId, qty, l.creditPaise);
    }
  }

  await tx.shiftReport.update({ where: { id: shiftReportId }, data: { ledgerPostedAt: null } });
  return reversedIds;
}

/** Applies a signed quantity/value delta to a tank's running cost basis. */
async function bumpInventory(
  tx: Prisma.TransactionClient,
  tankId: string,
  deltaMl: bigint,
  deltaPaise: bigint,
) {
  const state = await tx.tankInventoryState.findUnique({ where: { tankId } });
  if (!state) {
    await tx.tankInventoryState.create({
      data: {
        tankId,
        quantityMl: deltaMl > 0n ? deltaMl : 0n,
        valuePaise: deltaPaise > 0n ? deltaPaise : 0n,
      },
    });
    return;
  }
  const qty = state.quantityMl + deltaMl;
  const value = state.valuePaise + deltaPaise;
  await tx.tankInventoryState.update({
    where: { tankId },
    data: {
      // Never let rounding push the basis negative.
      quantityMl: qty > 0n ? qty : 0n,
      valuePaise: value > 0n ? value : 0n,
    },
  });
}

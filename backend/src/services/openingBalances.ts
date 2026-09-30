// Opening balances — what the business already had on the day it started using
// FuelBook. A pump rarely starts on 1 April: it starts mid-year, already holding
// cash, fuel, customer dues and an oil-company bill.
//
// Everything is posted as ONE balanced journal entry dated the day before trading
// starts here, with Owner's Capital as the balancing figure — that is simply what
// the owner already had in the business.
//
// Re-entering is safe: the previous opening entry is reversed with a mirror entry
// and the denormalised figures are moved by the DIFFERENCE, never overwritten, so
// a pump that has already traded does not lose its activity.

import { Prisma, JournalSource } from '@prisma/client';
import { prisma } from '../lib/db';
import { ACCOUNT, ensureChartOfAccounts, postEntry, DraftLine } from './ledger';

export interface OpeningInput {
  asOnDate: Date;
  cashInHandPaise: bigint;
  bankBalances: { bankAccountId: string; amountPaise: bigint }[];
  customerDues: { customerId: string; amountPaise: bigint }[];
  supplierPayablePaise: bigint;
  fuelStock: { tankId: string; quantityMl: bigint; valuePaise: bigint }[];
  productStock: { productId: string; quantity: number; valuePaise: bigint }[];
  staffAdvances: { employeeId: string; amountPaise: bigint }[];
  staffShortages: { employeeId: string; amountPaise: bigint }[];
  notes?: string | null;
}

const sum = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);

/** Totals and the capital figure that makes the entry balance. */
export function summarise(input: OpeningInput) {
  const bank = sum(input.bankBalances.map((b) => b.amountPaise));
  const receivable = sum(input.customerDues.map((c) => c.amountPaise));
  const advances = sum(input.staffAdvances.map((a) => a.amountPaise));
  const shortages = sum(input.staffShortages.map((a) => a.amountPaise));
  const fuel = sum(input.fuelStock.map((f) => f.valuePaise));
  const nonFuel = sum(input.productStock.map((p) => p.valuePaise));
  const assets = input.cashInHandPaise + bank + receivable + advances + shortages + fuel + nonFuel;
  const liabilities = input.supplierPayablePaise;
  return {
    cashInHandPaise: input.cashInHandPaise,
    bankPaise: bank,
    receivablePaise: receivable,
    staffAdvancesPaise: advances,
    staffShortagesPaise: shortages,
    fuelStockPaise: fuel,
    nonFuelStockPaise: nonFuel,
    totalAssetsPaise: assets,
    totalLiabilitiesPaise: liabilities,
    // What the owner already had in the business. Negative means the pump started
    // owing more than it held, which is unusual but not impossible.
    ownersCapitalPaise: assets - liabilities,
  };
}

/** The opening entry currently in force, if any. */
export async function findCurrentOpening(pumpId: string) {
  return prisma.journalEntry.findFirst({
    where: { pumpId, source: JournalSource.OPENING_BALANCE, reversedBy: null, reversalOfId: null },
    include: {
      lines: {
        include: {
          account: { select: { code: true, name: true } },
          customer: { select: { id: true, name: true } },
          employee: { select: { id: true, name: true } },
          tank: { select: { id: true, name: true } },
          channel: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Posts (or re-posts) the opening balances. Returns the entry and the summary.
 * Runs in one transaction so the journal and the running figures cannot diverge.
 */
export async function postOpeningBalances(
  pumpId: string,
  userId: string,
  input: OpeningInput,
) {
  const totals = summarise(input);

  return prisma.$transaction(async (tx) => {
    const accounts = await ensureChartOfAccounts(tx, pumpId);

    // ---- undo whatever opening was in force, so this is a replacement
    const previous = await findCurrentOpening(pumpId);
    if (previous) {
      await postEntry(tx, accounts, {
        pumpId,
        entryDate: previous.entryDate,
        narration: `Reversal — ${previous.narration}`,
        source: JournalSource.REVERSAL,
        reversalOfId: previous.id,
        createdById: userId,
        lines: previous.lines.map((l) => ({
          code: l.account.code,
          debitPaise: l.creditPaise,
          creditPaise: l.debitPaise,
          customerId: l.customerId,
          employeeId: l.employeeId,
          channelId: l.channelId,
          tankId: l.tankId,
          fuelType: l.fuelType,
          quantityMl: l.quantityMl,
          memo: l.memo,
        })),
      });

      // Move the denormalised figures back by exactly what the old entry added.
      for (const l of previous.lines) {
        if (l.account.code === ACCOUNT.RECEIVABLE_CUSTOMER && l.customerId) {
          await tx.creditCustomer.update({
            where: { id: l.customerId },
            data: { currentBalancePaise: { decrement: l.debitPaise - l.creditPaise } },
          });
        }
        if (l.account.code === ACCOUNT.FUEL_INVENTORY && l.tankId) {
          const state = await tx.tankInventoryState.findUnique({ where: { tankId: l.tankId } });
          if (state) {
            const q = state.quantityMl - (l.quantityMl ?? 0n);
            const v = state.valuePaise - (l.debitPaise - l.creditPaise);
            await tx.tankInventoryState.update({
              where: { tankId: l.tankId },
              data: { quantityMl: q > 0n ? q : 0n, valuePaise: v > 0n ? v : 0n },
            });
          }
        }
      }
    }

    // ---- the new opening entry
    const lines: DraftLine[] = [];
    const memo = 'Opening balance';

    if (input.cashInHandPaise !== 0n) {
      lines.push({ code: ACCOUNT.CASH, debitPaise: input.cashInHandPaise, memo });
    }
    for (const b of input.bankBalances) {
      if (b.amountPaise === 0n) continue;
      const account = await tx.bankAccount.findFirst({
        where: { id: b.bankAccountId, pumpId },
        select: { id: true, bankName: true, accountNoLast4: true, openingBalancePaise: true },
      });
      if (!account) throw new Error('Bank account does not belong to this pump');
      lines.push({
        code: ACCOUNT.BANK,
        debitPaise: b.amountPaise,
        memo: `${memo} — ${account.bankName} ••${account.accountNoLast4}`,
      });
      await tx.bankAccount.update({
        where: { id: account.id },
        data: { openingBalancePaise: b.amountPaise },
      });
    }
    for (const c of input.customerDues) {
      if (c.amountPaise === 0n) continue;
      const customer = await tx.creditCustomer.findFirst({
        where: { id: c.customerId, pumpId },
        select: { id: true },
      });
      if (!customer) throw new Error('Customer does not belong to this pump');
      lines.push({
        code: ACCOUNT.RECEIVABLE_CUSTOMER,
        debitPaise: c.amountPaise,
        customerId: c.customerId,
        memo,
      });
      await tx.creditCustomer.update({
        where: { id: c.customerId },
        data: { currentBalancePaise: { increment: c.amountPaise } },
      });
    }
    for (const a of input.staffAdvances) {
      if (a.amountPaise === 0n) continue;
      lines.push({
        code: ACCOUNT.STAFF_ADVANCES,
        debitPaise: a.amountPaise,
        employeeId: a.employeeId,
        memo,
      });
    }
    for (const a of input.staffShortages) {
      if (a.amountPaise === 0n) continue;
      lines.push({
        code: ACCOUNT.RECEIVABLE_STAFF,
        debitPaise: a.amountPaise,
        employeeId: a.employeeId,
        memo,
      });
    }
    for (const f of input.fuelStock) {
      if (f.valuePaise === 0n && f.quantityMl === 0n) continue;
      const tank = await tx.tank.findFirst({ where: { id: f.tankId, pumpId }, select: { id: true } });
      if (!tank) throw new Error('Tank does not belong to this pump');
      lines.push({
        code: ACCOUNT.FUEL_INVENTORY,
        debitPaise: f.valuePaise,
        tankId: f.tankId,
        quantityMl: f.quantityMl,
        memo,
      });
      // Seed the running cost basis, so the first sale relieves a real cost.
      const state = await tx.tankInventoryState.findUnique({ where: { tankId: f.tankId } });
      if (state) {
        await tx.tankInventoryState.update({
          where: { tankId: f.tankId },
          data: {
            quantityMl: state.quantityMl + f.quantityMl,
            valuePaise: state.valuePaise + f.valuePaise,
          },
        });
      } else {
        await tx.tankInventoryState.create({
          data: { tankId: f.tankId, quantityMl: f.quantityMl, valuePaise: f.valuePaise },
        });
      }
    }
    for (const p of input.productStock) {
      if (p.valuePaise === 0n && p.quantity === 0) continue;
      const product = await tx.product.findFirst({
        where: { id: p.productId, pumpId },
        select: { id: true, name: true },
      });
      if (!product) throw new Error('Product does not belong to this pump');
      lines.push({
        code: ACCOUNT.NON_FUEL_INVENTORY,
        debitPaise: p.valuePaise,
        memo: `${memo} — ${product.name}`,
      });
      const st = await tx.productStockState.findUnique({ where: { productId: p.productId } });
      if (st) {
        await tx.productStockState.update({
          where: { productId: p.productId },
          data: { quantity: st.quantity + p.quantity, valuePaise: st.valuePaise + p.valuePaise },
        });
      } else {
        await tx.productStockState.create({
          data: { productId: p.productId, quantity: p.quantity, valuePaise: p.valuePaise },
        });
      }
    }
    if (input.supplierPayablePaise !== 0n) {
      lines.push({
        code: ACCOUNT.PAYABLE_FUEL,
        creditPaise: input.supplierPayablePaise,
        memo: `${memo} — owed to the oil company`,
      });
    }

    // Owner's capital balances the entry: it is what was already in the business.
    if (totals.ownersCapitalPaise > 0n) {
      lines.push({
        code: ACCOUNT.OWNER_CAPITAL,
        creditPaise: totals.ownersCapitalPaise,
        memo: 'Opening capital',
      });
    } else if (totals.ownersCapitalPaise < 0n) {
      lines.push({
        code: ACCOUNT.OWNER_CAPITAL,
        debitPaise: -totals.ownersCapitalPaise,
        memo: 'Opening capital (negative — the pump started owing more than it held)',
      });
    }

    const entry = await postEntry(tx, accounts, {
      pumpId,
      entryDate: input.asOnDate,
      narration: input.notes?.trim()
        ? `Opening balances — ${input.notes.trim()}`
        : 'Opening balances',
      source: JournalSource.OPENING_BALANCE,
      createdById: userId,
      lines,
    });

    return { entry, totals, replacedEntryId: previous?.id ?? null };
  });
}

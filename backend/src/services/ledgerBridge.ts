// Bridges the operational records (bank deposits, staff advances, cash moved to
// the bank) into the double-entry ledger.
//
// Why a bridge instead of posting inline: the feature modules that record these
// events deliberately do not touch the books. Accounting stays in one place, and
// each record carries a journalEntryId that is null until it has been posted —
// which makes posting idempotent and easy to audit.
//
// Deliberately NOT posted here:
//  * Internal cash custody moves (attendant -> cashier -> safe -> owner). Cash is
//    still cash in hand; only who holds it changed, which the custody trail
//    already records. Posting them would inflate the journal with no net effect.
//  * Price revisions. A change in the SELLING price does not change what the fuel
//    in the tank cost, so there is no realised gain to post. The revaluation
//    figure is a management metric, and the real profit appears as margin when
//    the fuel is actually sold.

import { Prisma } from '@prisma/client';
import { prisma } from '../lib/db';
import { ACCOUNT, ensureChartOfAccounts, postEntry } from './ledger';

export interface PendingSummary {
  cashDeposits: number;
  staffAdvances: number;
  cashToBank: number;
  total: number;
}

/** Counts operational records that still have no journal entry. */
export async function countPending(pumpId: string): Promise<PendingSummary> {
  const [cashDeposits, staffAdvances, cashToBank] = await Promise.all([
    prisma.cashDeposit.count({
      where: { pumpId, journalEntryId: null, status: { not: 'DISPUTED' } },
    }),
    prisma.employeeAdvance.count({
      where: { employee: { pumpId }, journalEntryId: null },
    }),
    prisma.cashMovement.count({
      where: { pumpId, journalEntryId: null, toLocation: 'BANK', cashDepositId: null },
    }),
  ]);
  return {
    cashDeposits,
    staffAdvances,
    cashToBank,
    total: cashDeposits + staffAdvances + cashToBank,
  };
}

export interface PostPendingResult {
  posted: PendingSummary;
  entryIds: string[];
  skipped: Array<{ kind: string; id: string; reason: string }>;
}

/**
 * Posts everything still unposted for a pump. Safe to run repeatedly: a record is
 * only picked up while its journalEntryId is null, and the id is set in the same
 * transaction as the entry.
 */
export async function postPendingEntries(
  pumpId: string,
  userId: string,
): Promise<PostPendingResult> {
  const entryIds: string[] = [];
  const skipped: PostPendingResult['skipped'] = [];
  const posted: PendingSummary = { cashDeposits: 0, staffAdvances: 0, cashToBank: 0, total: 0 };

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const accounts = await ensureChartOfAccounts(tx, pumpId);

    // ---- Cash taken to the bank: cash in hand becomes a bank balance.
    const deposits = await tx.cashDeposit.findMany({
      where: { pumpId, journalEntryId: null, status: { not: 'DISPUTED' } },
      include: { bankAccount: { select: { bankName: true, accountNoLast4: true } } },
      orderBy: { depositedOn: 'asc' },
    });
    for (const d of deposits) {
      if (d.amountPaise <= 0n) {
        skipped.push({ kind: 'CashDeposit', id: d.id, reason: 'amount is not positive' });
        continue;
      }
      const where = `${d.bankAccount.bankName} ••${d.bankAccount.accountNoLast4}`;
      const entry = await postEntry(tx, accounts, {
        pumpId,
        entryDate: d.depositedOn,
        narration: `Cash deposited to ${where}${d.slipNo ? ` (slip ${d.slipNo})` : ''}`,
        source: 'MANUAL',
        shiftReportId: d.shiftReportId,
        createdById: userId,
        lines: [
          { code: ACCOUNT.BANK, debitPaise: d.amountPaise, memo: where },
          { code: ACCOUNT.CASH, creditPaise: d.amountPaise, employeeId: d.depositedByEmployeeId },
        ],
      });
      if (entry) {
        await tx.cashDeposit.update({ where: { id: d.id }, data: { journalEntryId: entry.id } });
        entryIds.push(entry.id);
        posted.cashDeposits += 1;
      }
    }

    // ---- Staff advances and their repayments.
    const advances = await tx.employeeAdvance.findMany({
      where: { employee: { pumpId }, journalEntryId: null },
      include: { employee: { select: { name: true } } },
      orderBy: { occurredOn: 'asc' },
    });
    for (const a of advances) {
      if (a.amountPaise <= 0n) {
        skipped.push({ kind: 'EmployeeAdvance', id: a.id, reason: 'amount is not positive' });
        continue;
      }
      const isAdvance = a.kind === 'ADVANCE';
      const entry = await postEntry(tx, accounts, {
        pumpId,
        entryDate: a.occurredOn,
        narration: isAdvance
          ? `Advance paid to ${a.employee.name}`
          : `Advance repaid by ${a.employee.name}`,
        source: 'MANUAL',
        createdById: userId,
        lines: isAdvance
          ? [
              { code: ACCOUNT.STAFF_ADVANCES, debitPaise: a.amountPaise, employeeId: a.employeeId },
              { code: ACCOUNT.CASH, creditPaise: a.amountPaise },
            ]
          : [
              { code: ACCOUNT.CASH, debitPaise: a.amountPaise },
              { code: ACCOUNT.STAFF_ADVANCES, creditPaise: a.amountPaise, employeeId: a.employeeId },
            ],
      });
      if (entry) {
        await tx.employeeAdvance.update({ where: { id: a.id }, data: { journalEntryId: entry.id } });
        entryIds.push(entry.id);
        posted.staffAdvances += 1;
      }
    }

    // ---- Cash moved to the bank without a deposit slip recorded.
    const toBank = await tx.cashMovement.findMany({
      where: { pumpId, journalEntryId: null, toLocation: 'BANK', cashDepositId: null },
      orderBy: { occurredAt: 'asc' },
    });
    for (const m of toBank) {
      if (m.amountPaise <= 0n) {
        skipped.push({ kind: 'CashMovement', id: m.id, reason: 'amount is not positive' });
        continue;
      }
      const entry = await postEntry(tx, accounts, {
        pumpId,
        entryDate: new Date(m.occurredAt.toISOString().slice(0, 10) + 'T00:00:00Z'),
        narration: `Cash moved to bank${m.purpose ? ` — ${m.purpose}` : ''}`,
        source: 'MANUAL',
        shiftReportId: m.shiftReportId,
        createdById: userId,
        lines: [
          { code: ACCOUNT.BANK, debitPaise: m.amountPaise, memo: m.reference },
          { code: ACCOUNT.CASH, creditPaise: m.amountPaise, employeeId: m.fromEmployeeId },
        ],
      });
      if (entry) {
        await tx.cashMovement.update({ where: { id: m.id }, data: { journalEntryId: entry.id } });
        entryIds.push(entry.id);
        posted.cashToBank += 1;
      }
    }
  });

  posted.total = posted.cashDeposits + posted.staffAdvances + posted.cashToBank;
  return { posted, entryIds, skipped };
}

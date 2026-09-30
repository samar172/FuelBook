// Everything that happened on a shift, in the order it happened.
//
// The story is spread across a dozen tables: some rows carry their own timestamp
// (a credit sale, a cash drop, a dip reading), while the bulk-saved ones — meter
// readings, collections, expenses — only know when they were last written, which
// the audit trail records along with who did it. This pulls both together so an
// owner can see the shift at a glance instead of opening eight tabs.

import { prisma } from '../lib/db';

export type TimelineKind =
  | 'SHIFT'
  | 'STAFF'
  | 'SALE'
  | 'MONEY'
  | 'STOCK'
  | 'EXPENSE'
  | 'CHECK'
  | 'BOOKS';

export interface TimelineEvent {
  at: string;
  kind: TimelineKind;
  /** Stable code so the UI can translate and icon it. */
  code: string;
  actor: string | null;
  amountPaise?: string | null;
  quantityMl?: string | null;
  /** Values for the UI's sentence; never a pre-built English string. */
  vars: Record<string, string | number>;
}

const iso = (d: Date) => d.toISOString();

export async function buildShiftTimeline(pumpId: string, shiftReportId: string) {
  const shift = await prisma.shiftReport.findFirst({
    where: { id: shiftReportId, pumpId },
    include: {
      creditSales: { include: { customer: { select: { name: true } }, employee: { select: { name: true } } } },
      outstandingReceipts: { include: { customer: { select: { name: true } } } },
      cashMovements: {
        include: {
          fromEmployee: { select: { name: true } },
          toEmployee: { select: { name: true } },
        },
      },
      cashHandovers: { include: { employee: { select: { name: true } } } },
      tankerReceipts: { include: { tank: { select: { name: true } } } },
      dipReadings: { include: { tank: { select: { name: true } }, recordedBy: { select: { name: true } } } },
      measureTests: { include: { nozzle: { select: { code: true } }, testedBy: { select: { name: true } } } },
      employeeAssignments: { include: { employee: { select: { name: true } }, nozzle: { select: { code: true } } } },
      attendances: { include: { employee: { select: { name: true } } } },
      journalEntries: { select: { id: true, narration: true, createdAt: true, source: true } },
      cashCount: true,
    },
  });
  if (!shift) return null;

  // Who did what, from the audit trail.
  const audits = await prisma.auditLog.findMany({
    where: { entityType: 'ShiftReport', entityId: shift.id },
    orderBy: { createdAt: 'asc' },
  });
  const userIds = [...new Set(audits.map((a) => a.userId))];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      })
    : [];
  const userName = new Map(users.map((u) => [u.id, u.name]));

  const events: TimelineEvent[] = [];
  const push = (e: TimelineEvent) => events.push(e);

  // ---- the shift's own milestones
  push({ at: iso(shift.createdAt), kind: 'SHIFT', code: 'shift.opened', actor: null, vars: { shiftType: shift.shiftType } });
  if (shift.submittedAt) {
    push({ at: iso(shift.submittedAt), kind: 'SHIFT', code: 'shift.submitted', actor: null, vars: {} });
  }
  if (shift.lockedAt) {
    push({ at: iso(shift.lockedAt), kind: 'SHIFT', code: 'shift.locked', actor: null, vars: {} });
  }

  // ---- data entry, from the audit trail
  for (const a of audits) {
    const after = (a.afterJson ?? {}) as Record<string, unknown>;
    const known: Record<string, TimelineKind> = {
      'shift.readings.save': 'STOCK',
      'shift.stock.save': 'STOCK',
      'shift.roster.save': 'STAFF',
      'shift.collections.save': 'MONEY',
      'shift.outstanding.save': 'MONEY',
      'shift.expenses.save': 'EXPENSE',
      'shift.create': 'SHIFT',
      'shift.autoStart': 'SHIFT',
      'shift.submit': 'SHIFT',
      'shift.lock': 'BOOKS',
      'shift.unlock': 'BOOKS',
    };
    const kind = known[a.action];
    if (!kind) continue;
    // The shift milestones are already covered above by their own timestamps.
    if (['shift.create', 'shift.autoStart', 'shift.submit'].includes(a.action)) continue;
    push({
      at: iso(a.createdAt),
      kind,
      code: a.action,
      actor: userName.get(a.userId) ?? null,
      amountPaise: (after.totalPaise as string) ?? null,
      vars: { count: Number(after.count ?? 0) },
    });
  }

  // ---- who was rostered
  for (const a of shift.employeeAssignments) {
    push({
      at: iso(a.createdAt),
      kind: 'STAFF',
      code: 'roster.assigned',
      actor: null,
      vars: { name: a.employee.name, nozzle: a.nozzle.code },
    });
  }

  // ---- attendance
  for (const at of shift.attendances) {
    if (at.checkInAt) {
      push({
        at: iso(at.checkInAt),
        kind: 'STAFF',
        code: at.source === 'LOGIN' ? 'attendance.signedIn' : 'attendance.markedIn',
        actor: null,
        vars: { name: at.employee.name },
      });
    }
    if (at.checkOutAt) {
      push({
        at: iso(at.checkOutAt),
        kind: 'STAFF',
        code: 'attendance.markedOut',
        actor: null,
        vars: { name: at.employee.name },
      });
    }
  }

  // ---- fuel in
  for (const t of shift.tankerReceipts) {
    push({
      at: iso(t.receivedAt),
      kind: 'STOCK',
      code: 'tanker.received',
      actor: null,
      quantityMl: t.receivedMl.toString(),
      amountPaise: t.totalCostPaise?.toString() ?? null,
      vars: { tank: t.tank.name, bill: t.billNo ?? '' },
    });
  }

  // ---- credit given
  for (const c of shift.creditSales) {
    push({
      at: iso(c.saleAt),
      kind: 'SALE',
      code: 'credit.sold',
      actor: c.employee?.name ?? null,
      amountPaise: c.amountCreditPaise.toString(),
      quantityMl: c.quantityMl.toString(),
      vars: { customer: c.customer.name, vehicle: c.vehicleNo ?? '', fuel: c.fuelType },
    });
  }

  // ---- old dues collected
  for (const r of shift.outstandingReceipts) {
    push({
      at: iso(r.receivedAt),
      kind: 'MONEY',
      code: 'outstanding.received',
      actor: null,
      amountPaise: r.amountPaise.toString(),
      vars: { customer: r.customer?.name ?? r.customerNameRaw },
    });
  }

  // ---- cash moving around
  for (const m of shift.cashMovements) {
    push({
      at: iso(m.occurredAt),
      kind: 'MONEY',
      code: 'cash.moved',
      actor: m.fromEmployee?.name ?? null,
      amountPaise: m.amountPaise.toString(),
      vars: {
        from: m.fromLocation,
        to: m.toLocation,
        toName: m.toEmployee?.name ?? '',
        purpose: m.purpose ?? '',
      },
    });
  }

  // ---- end-of-shift hand-overs
  for (const h of shift.cashHandovers) {
    push({
      at: iso(h.updatedAt),
      kind: 'MONEY',
      code: 'handover.recorded',
      actor: h.employee.name,
      amountPaise: h.receivedCashPaise.toString(),
      vars: { name: h.employee.name, variancePaise: h.variancePaise.toString() },
    });
  }

  // ---- checks: dips and the W&M measure
  for (const d of shift.dipReadings) {
    push({
      at: iso(d.observedAt),
      kind: 'CHECK',
      code: 'dip.recorded',
      actor: d.recordedBy?.name ?? null,
      quantityMl: d.volumeFromChartMl?.toString() ?? null,
      vars: { tank: d.tank.name, dipMm: d.dipMm },
    });
  }
  for (const m of shift.measureTests) {
    push({
      at: iso(m.testedAt),
      kind: 'CHECK',
      code: m.withinTolerance ? 'measure.passed' : 'measure.failed',
      actor: m.testedBy?.name ?? null,
      vars: { nozzle: m.nozzle.code, varianceMl: m.varianceMl.toString() },
    });
  }

  // ---- the note count
  if (shift.cashCount) {
    push({
      at: iso(shift.cashCount.countedAt),
      kind: 'MONEY',
      code: 'cash.counted',
      actor: null,
      amountPaise: shift.cashCount.countedTotalPaise.toString(),
      vars: {},
    });
  }

  // ---- posted to the books
  for (const j of shift.journalEntries) {
    push({
      at: iso(j.createdAt),
      kind: 'BOOKS',
      code: 'books.posted',
      actor: null,
      vars: { narration: j.narration },
    });
  }

  events.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

  const first = events[0]?.at ?? null;
  const last = events[events.length - 1]?.at ?? null;
  return {
    shift: {
      id: shift.id,
      reportDate: shift.reportDate.toISOString().slice(0, 10),
      shiftType: shift.shiftType,
      status: shift.status,
      openedAt: iso(shift.createdAt),
      submittedAt: shift.submittedAt ? iso(shift.submittedAt) : null,
      lockedAt: shift.lockedAt ? iso(shift.lockedAt) : null,
      ledgerPostedAt: shift.ledgerPostedAt ? iso(shift.ledgerPostedAt) : null,
    },
    totals: {
      salesPaise: shift.totalSalesPaise.toString(),
      collectionsPaise: shift.totalCollectionsPaise.toString(),
      creditIssuedPaise: shift.totalCreditIssuedPaise.toString(),
      expensesPaise: shift.totalExpensesPaise.toString(),
      discrepancyMl: shift.discrepancyMl.toString(),
      discrepancyFlag: shift.discrepancyFlag,
    },
    firstEventAt: first,
    lastEventAt: last,
    eventCount: events.length,
    events,
  };
}


/**
 * When each part of a shift was last written, and by whom — so every panel can
 * show "last saved 2:32 pm by Ramesh" instead of leaving the user guessing
 * whether their entry went in.
 */
export async function lastEditsForShift(shiftReportId: string) {
  const audits = await prisma.auditLog.findMany({
    where: { entityType: 'ShiftReport', entityId: shiftReportId },
    orderBy: { createdAt: 'desc' },
  });
  if (audits.length === 0) return {};

  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(audits.map((a) => a.userId))] } },
    select: { id: true, name: true },
  });
  const name = new Map(users.map((u) => [u.id, u.name]));

  const panelFor: Record<string, string> = {
    'shift.readings.save': 'readings',
    'shift.stock.save': 'stock',
    'shift.roster.save': 'roster',
    'shift.collections.save': 'collections',
    'shift.outstanding.save': 'outstanding',
    'shift.expenses.save': 'expenses',
    'shift.cashDrop': 'cashDrops',
  };

  const out: Record<string, { at: string; by: string | null; count?: number }> = {};
  for (const a of audits) {
    const panel = panelFor[a.action];
    if (!panel || out[panel]) continue; // newest wins, and the list is newest-first
    const after = (a.afterJson ?? {}) as Record<string, unknown>;
    out[panel] = {
      at: a.createdAt.toISOString(),
      by: name.get(a.userId) ?? null,
      ...(after.count !== undefined ? { count: Number(after.count) } : {}),
    };
  }
  return out;
}

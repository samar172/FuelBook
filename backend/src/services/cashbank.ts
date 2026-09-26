import { CashLocation, ShiftStatus } from '@prisma/client';
import { prisma } from '../lib/db';

// ===================== DENOMINATIONS =====================

// Face value of every note and coin the pump actually sees, in paise. All maths
// below is BigInt — a rupee never becomes a float.
export const DENOMINATIONS = [
  { key: 'note500', label: '₹500 note', valuePaise: 50_000n },
  { key: 'note200', label: '₹200 note', valuePaise: 20_000n },
  { key: 'note100', label: '₹100 note', valuePaise: 10_000n },
  { key: 'note50', label: '₹50 note', valuePaise: 5_000n },
  { key: 'note20', label: '₹20 note', valuePaise: 2_000n },
  { key: 'note10', label: '₹10 note', valuePaise: 1_000n },
  { key: 'coin20', label: '₹20 coin', valuePaise: 2_000n },
  { key: 'coin10', label: '₹10 coin', valuePaise: 1_000n },
  { key: 'coin5', label: '₹5 coin', valuePaise: 500n },
  { key: 'coin2', label: '₹2 coin', valuePaise: 200n },
  { key: 'coin1', label: '₹1 coin', valuePaise: 100n },
] as const;

export type DenominationKey = (typeof DENOMINATIONS)[number]['key'];
export type DenominationCounts = Record<DenominationKey, number>;

// The only place a counted total is ever produced. A client-supplied total is
// always ignored: the notes on the table are the truth.
export const computeDenominationTotal = (counts: DenominationCounts): bigint =>
  DENOMINATIONS.reduce((sum, d) => sum + BigInt(counts[d.key] ?? 0) * d.valuePaise, 0n);

// ===================== CASH POSITION =====================
//
// "The cashier collected the cash — where is it now?"
//
// Cash has no single table, so the position is assembled from four sources. The
// rules, in order of authority:
//
//  1. EXPLICIT MOVEMENTS (CashMovement) are always authoritative. Each row moves
//     its amount out of (fromLocation, fromEmployeeId) and into
//     (toLocation, toEmployeeId).
//
//  2. ORIGIN OF CASH. Cash enters the business in an attendant's hand. For every
//     EmployeeCashHandover on a LOCKED shift we credit the attendant with
//     `expectedCashPaise` — the cash they were accountable for (already net of
//     any expense they paid out of hand and of their non-cash collections).
//     Without this credit every attendant would show a negative holding simply
//     because taking money from a customer is not itself a movement.
//
//  3. IMPLIED HANDOVER (attendant -> cashier). A recorded handover on a LOCKED
//     shift is treated as a movement of `receivedCashPaise` from the attendant to
//     the CASHIER — but ONLY when no explicit CashMovement already exists for the
//     same shift with fromLocation = ATTENDANT and the same fromEmployeeId. When
//     such a movement exists the explicit trail wins and the implied leg is
//     skipped, so the hand-over is never counted twice. (The origin credit in
//     rule 2 is applied once per handover row either way — it is not a transfer.)
//     What is left in the attendant's hands is therefore
//     expected - received = -variance: a short attendant keeps showing a positive
//     holding until it is recovered or written off.
//
//  4. IMPLIED VENDOR PAYOUT. Expenses on a LOCKED shift with no
//     `paidByEmployeeId` were paid from the cashier's cash, so they leave CASHIER
//     for VENDOR — unless the shift already has an explicit movement to VENDOR,
//     in which case the explicit trail wins for that shift. Expenses that WERE
//     paid by an employee are already netted off inside `expectedCashPaise`
//     (rule 2) and are never subtracted again.
//
//  5. IMPLIED DEPOSIT. A CashDeposit normally carries its own CashMovement to
//     BANK (created in the same transaction). A deposit with no linked movement
//     is treated as cash leaving OFFICE_SAFE for BANK, so a deposit recorded
//     elsewhere still shows up as cash gone.
//
// BANK and VENDOR are terminal: money there is no longer cash in anyone's hands,
// which is why `cashOnHandPaise` excludes them.

const HOLDING_LOCATIONS: CashLocation[] = [
  CashLocation.ATTENDANT,
  CashLocation.CASHIER,
  CashLocation.OFFICE_SAFE,
  CashLocation.OWNER,
  CashLocation.OTHER,
];

const ALL_LOCATIONS: CashLocation[] = [
  ...HOLDING_LOCATIONS,
  CashLocation.BANK,
  CashLocation.VENDOR,
];

type Bucket = {
  location: CashLocation;
  employeeId: string | null;
  inPaise: bigint;
  outPaise: bigint;
};

type SourceTotals = {
  explicitMovements: { count: number; amountPaise: bigint };
  originFromHandovers: { count: number; amountPaise: bigint };
  impliedHandovers: { count: number; amountPaise: bigint };
  impliedVendorPayouts: { count: number; amountPaise: bigint };
  impliedDeposits: { count: number; amountPaise: bigint };
};

export type CashPosition = Awaited<ReturnType<typeof computeCashPosition>>;

export async function computeCashPosition(pumpId: string, asOf: Date) {
  // asOf is a day; include everything that happened up to its last instant.
  const asOfEnd = new Date(asOf);
  asOfEnd.setUTCHours(23, 59, 59, 999);

  const [movements, shifts, deposits, employees] = await Promise.all([
    prisma.cashMovement.findMany({
      where: { pumpId, occurredAt: { lte: asOfEnd } },
      select: {
        id: true,
        shiftReportId: true,
        fromLocation: true,
        fromEmployeeId: true,
        toLocation: true,
        toEmployeeId: true,
        amountPaise: true,
      },
    }),
    prisma.shiftReport.findMany({
      where: { pumpId, status: ShiftStatus.LOCKED, reportDate: { lte: asOf } },
      select: {
        id: true,
        cashierEmployeeId: true,
        cashHandovers: {
          select: { employeeId: true, expectedCashPaise: true, receivedCashPaise: true },
        },
        expenseEntries: { select: { dayExpensePaise: true, paidByEmployeeId: true } },
      },
    }),
    prisma.cashDeposit.findMany({
      where: { pumpId, depositedOn: { lte: asOf } },
      select: { id: true, amountPaise: true, movement: { select: { id: true } } },
    }),
    prisma.employee.findMany({
      where: { pumpId },
      select: { id: true, name: true, code: true, isActive: true },
    }),
  ]);

  const buckets = new Map<string, Bucket>();
  const keyOf = (location: CashLocation, employeeId: string | null) =>
    `${location}|${employeeId ?? ''}`;
  const bucket = (location: CashLocation, employeeId: string | null): Bucket => {
    const key = keyOf(location, employeeId);
    let b = buckets.get(key);
    if (!b) {
      b = { location, employeeId, inPaise: 0n, outPaise: 0n };
      buckets.set(key, b);
    }
    return b;
  };
  const move = (
    from: { location: CashLocation; employeeId: string | null } | null,
    to: { location: CashLocation; employeeId: string | null } | null,
    amount: bigint,
  ) => {
    if (from) bucket(from.location, from.employeeId).outPaise += amount;
    if (to) bucket(to.location, to.employeeId).inPaise += amount;
  };

  const sources: SourceTotals = {
    explicitMovements: { count: 0, amountPaise: 0n },
    originFromHandovers: { count: 0, amountPaise: 0n },
    impliedHandovers: { count: 0, amountPaise: 0n },
    impliedVendorPayouts: { count: 0, amountPaise: 0n },
    impliedDeposits: { count: 0, amountPaise: 0n },
  };

  // --- rule 1: explicit movements ------------------------------------------
  // Also builds the dedupe keys the implied rules consult.
  const explicitAttendantHandover = new Set<string>();
  const explicitVendorPayoutShifts = new Set<string>();

  for (const m of movements) {
    move(
      { location: m.fromLocation, employeeId: m.fromEmployeeId },
      { location: m.toLocation, employeeId: m.toEmployeeId },
      m.amountPaise,
    );
    sources.explicitMovements.count += 1;
    sources.explicitMovements.amountPaise += m.amountPaise;

    if (m.shiftReportId && m.fromLocation === CashLocation.ATTENDANT) {
      explicitAttendantHandover.add(`${m.shiftReportId}|${m.fromEmployeeId ?? ''}`);
    }
    if (m.shiftReportId && m.toLocation === CashLocation.VENDOR) {
      explicitVendorPayoutShifts.add(m.shiftReportId);
    }
  }

  // --- rules 2, 3 and 4: what locked shifts imply --------------------------
  for (const s of shifts) {
    for (const h of s.cashHandovers) {
      // rule 2 — cash entering the business in the attendant's hand.
      if (h.expectedCashPaise !== 0n) {
        bucket(CashLocation.ATTENDANT, h.employeeId).inPaise += h.expectedCashPaise;
        sources.originFromHandovers.count += 1;
        sources.originFromHandovers.amountPaise += h.expectedCashPaise;
      }
      // rule 3 — the implied hand-over, skipped when explicitly recorded.
      if (explicitAttendantHandover.has(`${s.id}|${h.employeeId}`)) continue;
      if (h.receivedCashPaise === 0n) continue;
      move(
        { location: CashLocation.ATTENDANT, employeeId: h.employeeId },
        { location: CashLocation.CASHIER, employeeId: s.cashierEmployeeId ?? null },
        h.receivedCashPaise,
      );
      sources.impliedHandovers.count += 1;
      sources.impliedHandovers.amountPaise += h.receivedCashPaise;
    }

    // rule 4 — expenses nobody paid out of their own hand came from the till.
    if (explicitVendorPayoutShifts.has(s.id)) continue;
    const unattributed = s.expenseEntries
      .filter((e) => !e.paidByEmployeeId)
      .reduce((sum, e) => sum + e.dayExpensePaise, 0n);
    if (unattributed > 0n) {
      move(
        { location: CashLocation.CASHIER, employeeId: s.cashierEmployeeId ?? null },
        { location: CashLocation.VENDOR, employeeId: null },
        unattributed,
      );
      sources.impliedVendorPayouts.count += 1;
      sources.impliedVendorPayouts.amountPaise += unattributed;
    }
  }

  // --- rule 5: deposits with no movement of their own ----------------------
  for (const d of deposits) {
    if (d.movement) continue;
    move(
      { location: CashLocation.OFFICE_SAFE, employeeId: null },
      { location: CashLocation.BANK, employeeId: null },
      d.amountPaise,
    );
    sources.impliedDeposits.count += 1;
    sources.impliedDeposits.amountPaise += d.amountPaise;
  }

  // --- shape the answer ----------------------------------------------------
  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const nameFor = (employeeId: string | null) => {
    if (!employeeId) return null;
    const e = employeeById.get(employeeId);
    if (!e) return 'Unknown (other pump?)';
    return e.code ? `${e.name} (${e.code})` : e.name;
  };

  const rows = [...buckets.values()].map((b) => ({
    location: b.location,
    employeeId: b.employeeId,
    employeeName: nameFor(b.employeeId),
    employeeActive: b.employeeId ? (employeeById.get(b.employeeId)?.isActive ?? null) : null,
    inPaise: b.inPaise,
    outPaise: b.outPaise,
    balancePaise: b.inPaise - b.outPaise,
  }));

  const byLocation = ALL_LOCATIONS.map((location) => {
    const holders = rows
      .filter((r) => r.location === location)
      .sort((a, b) => (a.balancePaise > b.balancePaise ? -1 : a.balancePaise < b.balancePaise ? 1 : 0));
    return {
      location,
      isTerminal: !HOLDING_LOCATIONS.includes(location),
      balancePaise: holders.reduce((s, h) => s + h.balancePaise, 0n),
      inPaise: holders.reduce((s, h) => s + h.inPaise, 0n),
      outPaise: holders.reduce((s, h) => s + h.outPaise, 0n),
      holders,
    };
  }).filter((l) => l.holders.length > 0 || HOLDING_LOCATIONS.includes(l.location));

  // Per-person view: one line per custodian across every location they hold in.
  const perCustodian = new Map<
    string,
    { employeeId: string; employeeName: string | null; balancePaise: bigint; byLocation: { location: CashLocation; balancePaise: bigint }[] }
  >();
  for (const r of rows) {
    if (!r.employeeId) continue;
    let c = perCustodian.get(r.employeeId);
    if (!c) {
      c = {
        employeeId: r.employeeId,
        employeeName: r.employeeName,
        balancePaise: 0n,
        byLocation: [],
      };
      perCustodian.set(r.employeeId, c);
    }
    c.balancePaise += r.balancePaise;
    c.byLocation.push({ location: r.location, balancePaise: r.balancePaise });
  }
  const custodians = [...perCustodian.values()].sort((a, b) =>
    a.balancePaise > b.balancePaise ? -1 : a.balancePaise < b.balancePaise ? 1 : 0,
  );

  // A negative holding is impossible in the real world: it means a movement was
  // recorded that never happened, or one that did happen was never recorded.
  const negatives = rows
    .filter((r) => r.balancePaise < 0n)
    .map((r) => ({
      location: r.location,
      employeeId: r.employeeId,
      employeeName: r.employeeName,
      balancePaise: r.balancePaise,
      reason:
        'Negative holding — more cash was recorded leaving here than ever arrived. A movement is missing or duplicated.',
    }));

  const sumOf = (locations: CashLocation[]) =>
    rows.filter((r) => locations.includes(r.location)).reduce((s, r) => s + r.balancePaise, 0n);

  return {
    asOf: asOf.toISOString().slice(0, 10),
    cashOnHandPaise: sumOf(HOLDING_LOCATIONS),
    inBankPaise: sumOf([CashLocation.BANK]),
    paidToVendorsPaise: sumOf([CashLocation.VENDOR]),
    totalAccountedPaise: sumOf(ALL_LOCATIONS),
    withAttendantsPaise: sumOf([CashLocation.ATTENDANT]),
    byLocation,
    custodians,
    negatives,
    hasNegative: negatives.length > 0,
    sources,
    rules: [
      'Explicit cash movements are authoritative.',
      'An attendant is credited with the cash they were accountable for (expectedCashPaise) on every locked shift — that is where cash enters the business.',
      'A recorded hand-over is treated as ATTENDANT -> CASHIER unless an explicit movement already exists for that shift and attendant, so it is never counted twice.',
      'What remains with an attendant equals expected minus received: a shortfall keeps showing until it is recovered.',
      'Shift expenses with no paying employee leave CASHIER for VENDOR, unless the shift already has an explicit movement to VENDOR.',
      'A deposit without its own movement is treated as cash leaving the office safe for the bank.',
      'BANK and VENDOR are terminal: they are excluded from cash on hand.',
    ],
  };
}

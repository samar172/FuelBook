// Opening the day's shift by itself, and marking who turned up.
//
// Two things make this fiddly, so they are handled in one place:
//
//  1. The server runs in UTC; the pump runs on Indian time. Every "which day is
//     it" decision below is made in IST, then stored as the UTC midnight of that
//     local date — the same convention ShiftReport.reportDate already uses.
//  2. A night shift crosses midnight. It is dated by the day it BEGAN, so at 2am
//     the open shift is still last night's.

import { Prisma, ShiftType } from '@prisma/client';
import { prisma } from '../lib/db';
import { buildCarryForward, initializeShiftChildren } from './carryForward';
import { recomputeShift } from './shiftCalc';

/** India has no daylight saving, so a fixed offset is correct and keeps this readable. */
const IST_OFFSET_MIN = 330;

export interface ShiftWindow {
  reportDate: Date; // UTC midnight of the local business date
  shiftType: ShiftType;
  /** Local time the window opened, for display. */
  startsAtMin: number;
}

/** The shift that should be running at `now` for this pump. */
export function windowFor(
  pump: { dayShiftStartsAtMin: number; nightShiftStartsAtMin: number },
  now: Date = new Date(),
): ShiftWindow {
  const local = new Date(now.getTime() + IST_OFFSET_MIN * 60_000);
  const localMinutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  const localDate = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()),
  );

  const { dayShiftStartsAtMin: dayStart, nightShiftStartsAtMin: nightStart } = pump;

  // Before the day shift opens, the night shift that began yesterday is still on.
  if (localMinutes < dayStart) {
    const yesterday = new Date(localDate);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    return { reportDate: yesterday, shiftType: ShiftType.NIGHT, startsAtMin: nightStart };
  }
  if (localMinutes < nightStart) {
    return { reportDate: localDate, shiftType: ShiftType.DAY, startsAtMin: dayStart };
  }
  return { reportDate: localDate, shiftType: ShiftType.NIGHT, startsAtMin: nightStart };
}

/** Creates a shift the same way the manual route does: carry-forward and all. */
export async function createShift(
  pumpId: string,
  reportDate: Date,
  shiftType: ShiftType,
  createdById: string,
  openingCashOverridePaise?: bigint,
) {
  const carry = await buildCarryForward(pumpId, reportDate, shiftType);
  const pump = await prisma.pump.findUniqueOrThrow({
    where: { id: pumpId },
    select: { discrepancyMlThreshold: true },
  });
  return prisma.$transaction(async (tx) => {
    const shift = await tx.shiftReport.create({
      data: {
        pumpId,
        reportDate,
        shiftType,
        openingCashPaise: openingCashOverridePaise ?? carry.openingCashPaise,
        createdById,
      },
    });
    await initializeShiftChildren(tx, shift.id, pumpId, carry);
    await recomputeShift(tx, shift.id, pump.discrepancyMlThreshold);
    return tx.shiftReport.findUniqueOrThrow({
      where: { id: shift.id },
      include: { employeeAssignments: { include: { employee: true, nozzle: true } } },
    });
  });
}

export interface EnsureResult {
  shift: Awaited<ReturnType<typeof createShift>> | null;
  created: boolean;
  window: ShiftWindow;
  reason?: string;
}

/**
 * Makes sure the shift for right now exists. Used by the manual "start today's
 * shift" button and, when the pump has asked for it, at sign-in.
 */
export async function ensureShiftForNow(
  pumpId: string,
  userId: string,
  opts: { force?: boolean; now?: Date } = {},
): Promise<EnsureResult> {
  const pump = await prisma.pump.findUniqueOrThrow({
    where: { id: pumpId },
    select: {
      autoStartShift: true,
      dayShiftStartsAtMin: true,
      nightShiftStartsAtMin: true,
    },
  });
  const window = windowFor(pump, opts.now);

  if (!opts.force && !pump.autoStartShift) {
    return { shift: null, created: false, window, reason: 'Auto-start is off for this pump' };
  }

  const existing = await prisma.shiftReport.findUnique({
    where: {
      pumpId_reportDate_shiftType: {
        pumpId,
        reportDate: window.reportDate,
        shiftType: window.shiftType,
      },
    },
    include: { employeeAssignments: { include: { employee: true, nozzle: true } } },
  });
  if (existing) return { shift: existing, created: false, window };

  // A pump with no nozzles has nothing to record; opening a shift would only
  // create an empty husk that someone has to delete.
  const nozzles = await prisma.nozzle.count({ where: { pumpId, isActive: true } });
  if (nozzles === 0) {
    return { shift: null, created: false, window, reason: 'No nozzles set up yet' };
  }

  const shift = await createShift(pumpId, window.reportDate, window.shiftType, userId);
  return { shift, created: true, window };
}

/**
 * Marks an attendant present for the shift that is running now.
 *
 * Never overwrites an existing row: if the cashier has already marked someone
 * absent or on leave, a sign-in must not quietly flip that to present.
 */
export async function markAttendanceForShift(
  tx: Prisma.TransactionClient | typeof prisma,
  params: {
    employeeId: string;
    reportDate: Date;
    shiftType: ShiftType;
    shiftReportId?: string | null;
    source: 'MANUAL' | 'LOGIN' | 'ROSTER';
    markedById?: string | null;
    checkInAt?: Date;
  },
) {
  const existing = await tx.attendance.findFirst({
    where: {
      employeeId: params.employeeId,
      attendanceDate: params.reportDate,
      shiftType: params.shiftType,
    },
  });
  if (existing) {
    // Only fill in a missing check-in time; the human's status stands.
    if (!existing.checkInAt && params.checkInAt) {
      return tx.attendance.update({
        where: { id: existing.id },
        data: { checkInAt: params.checkInAt },
      });
    }
    return existing;
  }
  return tx.attendance.create({
    data: {
      employeeId: params.employeeId,
      attendanceDate: params.reportDate,
      shiftType: params.shiftType,
      shiftReportId: params.shiftReportId ?? null,
      status: 'PRESENT',
      source: params.source,
      markedById: params.markedById ?? null,
      checkInAt: params.checkInAt ?? new Date(),
    },
  });
}

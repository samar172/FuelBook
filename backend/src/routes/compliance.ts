// Compliance calendar & staff operations: licence/certificate expiry tracking,
// attendance, and staff advances.
//
// Note on scoping: `Licence` carries `pumpId` directly. `Attendance` and
// `EmployeeAdvance` hang off `Employee`, so they are always scoped through
// `employee: { pumpId }` and any employee id coming from the client is checked
// against the caller's pump first — another pump's staff must 404, never leak.
import { Router } from 'express';
import { prisma } from '../lib/db';
import { requireAuth, requirePermission } from '../middleware/auth';
import { AppError } from '../middleware/error';
import {
  AttendanceStatus,
  LicenceKind,
  Prisma,
  ShiftType,
} from '@prisma/client';
import {
  bulkAttendanceSchema,
  createAdvanceSchema,
  createLicenceSchema,
  licenceKindEnum,
  licenceStatusEnum,
  monthStr,
  renewLicenceSchema,
  updateAttendanceSchema,
  updateLicenceSchema,
  attendanceStatusEnum,
  dayStr,
} from '../schemas/compliance';
import {
  ATTENDANCE_STATUSES,
  LICENCE_KIND_LABELS,
  addDays,
  addToTotals,
  appendNote,
  daysInMonth,
  emptyTotals,
  formatPaise,
  licenceStatusOf,
  licenceTitle,
  monthBounds,
  renewalNote,
  todayUtcDay,
  toUtcDay,
  toYmd,
  urgencyRank,
  type AttendanceTotals,
  type LicenceStatus,
} from '../services/compliance';

const router = Router();
router.use(requireAuth);

const requirePump = (req: any) => {
  if (!req.user.pumpId) throw new AppError(400, 'No pump assigned to user');
  return req.user.pumpId as string;
};

const requireUserId = (req: any) => {
  if (!req.user?.userId) throw new AppError(401, 'Not authenticated');
  return req.user.userId as string;
};

const canRead = requirePermission('canViewReports');
const canManageLicences = requirePermission('canManagePump');
const canManageStaff = requirePermission('canManageEmployees');

async function findOwnLicence(req: any, licenceId: string) {
  const pumpId = requirePump(req);
  const licence = await prisma.licence.findFirst({ where: { id: licenceId, pumpId } });
  if (!licence) throw new AppError(404, 'Licence not found');
  return licence;
}

/** Guards against IDOR: an employee id from the client must belong to this pump. */
async function findOwnEmployee(req: any, employeeId: string) {
  const pumpId = requirePump(req);
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, pumpId } });
  if (!employee) throw new AppError(404, 'Employee not found');
  return employee;
}

// ===================== LICENCE REGISTER =====================

type LicenceRow = Awaited<ReturnType<typeof prisma.licence.findFirstOrThrow>>;

const decorateLicence = (licence: LicenceRow, today = todayUtcDay()) => {
  const { status, daysRemaining } = licenceStatusOf(
    licence.expiresOn,
    licence.reminderDaysBefore,
    today
  );
  return {
    ...licence,
    kindLabel: LICENCE_KIND_LABELS[licence.kind],
    title: licenceTitle(licence.kind, licence.label),
    status,
    daysRemaining,
  };
};

const sortByUrgency = <T extends { status: LicenceStatus; daysRemaining: number }>(rows: T[]) =>
  rows.sort(
    (a, b) => urgencyRank(a.status) - urgencyRank(b.status) || a.daysRemaining - b.daysRemaining
  );

const assertExpiryAfterIssue = (issuedOn: Date | null, expiresOn: Date) => {
  if (issuedOn && expiresOn.getTime() < issuedOn.getTime()) {
    throw new AppError(
      400,
      `Expiry date ${toYmd(expiresOn)} cannot be before the issue date ${toYmd(issuedOn)}`
    );
  }
};

router.get('/licences', canRead, async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const { kind, status, expiringWithinDays, includeInactive } = req.query as Record<
      string,
      string | undefined
    >;

    const where: Prisma.LicenceWhereInput = { pumpId };
    if (kind) where.kind = licenceKindEnum.parse(kind) as LicenceKind;
    if (String(includeInactive || '') !== 'true') where.isActive = true;

    const today = todayUtcDay();
    if (expiringWithinDays) {
      const days = Number(expiringWithinDays);
      if (!Number.isInteger(days) || days < 0 || days > 3650) {
        throw new AppError(400, 'expiringWithinDays must be a whole number between 0 and 3650');
      }
      // Anything already expired also needs attention, so the window is open-ended
      // at the bottom and capped at today + days.
      where.expiresOn = { lte: addDays(today, days) };
    }

    const licences = await prisma.licence.findMany({ where, orderBy: { expiresOn: 'asc' } });
    let rows = licences.map((l) => decorateLicence(l, today));

    if (status) {
      const wanted = licenceStatusEnum.parse(status);
      rows = rows.filter((r) => r.status === wanted);
    }

    res.json(sortByUrgency(rows));
  } catch (e) {
    next(e);
  }
});

// Readable labels for every licence kind, so the form does not have to hard-code
// the enum on the client.
router.get('/licence-kinds', canRead, async (_req, res) => {
  res.json(
    Object.entries(LICENCE_KIND_LABELS).map(([value, label]) => ({ value, label }))
  );
});

router.get('/licences/:id', canRead, async (req, res, next) => {
  try {
    const licence = await findOwnLicence(req, req.params.id);
    res.json(decorateLicence(licence));
  } catch (e) {
    next(e);
  }
});

router.post('/licences', canManageLicences, async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const data = createLicenceSchema.parse(req.body);
    const issuedOn = data.issuedOn ? toUtcDay(data.issuedOn) : null;
    const expiresOn = toUtcDay(data.expiresOn);
    assertExpiryAfterIssue(issuedOn, expiresOn);

    const licence = await prisma.licence.create({
      data: {
        pumpId,
        kind: data.kind as LicenceKind,
        label: data.label ?? null,
        number: data.number ?? null,
        issuedBy: data.issuedBy ?? null,
        issuedOn,
        expiresOn,
        ...(data.reminderDaysBefore === undefined
          ? {}
          : { reminderDaysBefore: data.reminderDaysBefore }),
        documentRef: data.documentRef ?? null,
        notes: data.notes ?? null,
      },
    });
    res.status(201).json(decorateLicence(licence));
  } catch (e) {
    next(e);
  }
});

router.patch('/licences/:id', canManageLicences, async (req, res, next) => {
  try {
    const existing = await findOwnLicence(req, req.params.id);
    const data = updateLicenceSchema.parse(req.body);

    const issuedOn = data.issuedOn === undefined ? existing.issuedOn : data.issuedOn ? toUtcDay(data.issuedOn) : null;
    const expiresOn = data.expiresOn ? toUtcDay(data.expiresOn) : existing.expiresOn;
    assertExpiryAfterIssue(issuedOn, expiresOn);

    const licence = await prisma.licence.update({
      where: { id: existing.id },
      data: {
        ...(data.kind === undefined ? {} : { kind: data.kind as LicenceKind }),
        ...(data.label === undefined ? {} : { label: data.label }),
        ...(data.number === undefined ? {} : { number: data.number }),
        ...(data.issuedBy === undefined ? {} : { issuedBy: data.issuedBy }),
        ...(data.issuedOn === undefined ? {} : { issuedOn }),
        ...(data.expiresOn === undefined ? {} : { expiresOn }),
        ...(data.reminderDaysBefore === undefined
          ? {}
          : { reminderDaysBefore: data.reminderDaysBefore }),
        ...(data.documentRef === undefined ? {} : { documentRef: data.documentRef }),
        ...(data.notes === undefined ? {} : { notes: data.notes }),
        ...(data.isActive === undefined ? {} : { isActive: data.isActive }),
      },
    });
    res.json(decorateLicence(licence));
  } catch (e) {
    next(e);
  }
});

/**
 * Renew in place. The licence keeps one row for its whole life and each renewal
 * appends a dated line to `notes` recording the expiry (and number) it replaced,
 * so the register shows one live row per document with its history readable
 * underneath. See services/compliance.ts for why this beats successor rows.
 */
router.post('/licences/:id/renew', canManageLicences, async (req, res, next) => {
  try {
    const existing = await findOwnLicence(req, req.params.id);
    const data = renewLicenceSchema.parse(req.body);

    const newExpiry = toUtcDay(data.expiresOn);
    const newIssuedOn =
      data.issuedOn === undefined ? existing.issuedOn : data.issuedOn ? toUtcDay(data.issuedOn) : null;
    assertExpiryAfterIssue(newIssuedOn, newExpiry);

    if (newExpiry.getTime() <= existing.expiresOn.getTime()) {
      throw new AppError(
        400,
        `A renewal must extend the expiry: ${toYmd(newExpiry)} is not after the current expiry ${toYmd(existing.expiresOn)}`
      );
    }

    const licence = await prisma.licence.update({
      where: { id: existing.id },
      data: {
        expiresOn: newExpiry,
        issuedOn: newIssuedOn,
        ...(data.number === undefined ? {} : { number: data.number }),
        isActive: true,
        notes: appendNote(
          existing.notes,
          renewalNote(existing.expiresOn, existing.number, data.expiresOn)
        ),
      },
    });
    res.json(decorateLicence(licence));
  } catch (e) {
    next(e);
  }
});

// ===================== COMPLIANCE CALENDAR =====================

router.get('/calendar', canRead, async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const withinDays = req.query.withinDays === undefined ? 90 : Number(req.query.withinDays);
    if (!Number.isInteger(withinDays) || withinDays < 0 || withinDays > 3650) {
      throw new AppError(400, 'withinDays must be a whole number between 0 and 3650');
    }

    const today = todayUtcDay();
    const licences = await prisma.licence.findMany({
      where: { pumpId, isActive: true },
      orderBy: { expiresOn: 'asc' },
    });
    const all = licences.map((l) => decorateLicence(l, today));

    const summary = {
      expired: all.filter((l) => l.status === 'EXPIRED').length,
      expiringSoon: all.filter((l) => l.status === 'EXPIRING_SOON').length,
      valid: all.filter((l) => l.status === 'VALID').length,
      total: all.length,
    };

    // The window: everything already expired, plus anything expiring inside it.
    const items = sortByUrgency(
      all.filter((l) => l.status === 'EXPIRED' || l.daysRemaining <= withinDays)
    );

    res.json({
      today: toYmd(today),
      withinDays,
      windowEnd: toYmd(addDays(today, withinDays)),
      summary,
      expiredCount: summary.expired,
      needsAttention: items.length,
      items,
    });
  } catch (e) {
    next(e);
  }
});

// ===================== ATTENDANCE =====================

const employeeSelect = {
  id: true,
  code: true,
  name: true,
  designation: true,
  isActive: true,
} as const;

router.get('/attendance', canRead, async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const { from, to, employeeId, status } = req.query as Record<string, string | undefined>;

    const where: Prisma.AttendanceWhereInput = { employee: { pumpId } };
    if (employeeId) {
      const employee = await findOwnEmployee(req, employeeId);
      where.employeeId = employee.id;
    }
    if (from || to) {
      const range: Prisma.DateTimeFilter = {};
      if (from) range.gte = toUtcDay(dayStr.parse(from));
      if (to) range.lte = toUtcDay(dayStr.parse(to));
      where.attendanceDate = range;
    }
    if (status) where.status = attendanceStatusEnum.parse(status) as AttendanceStatus;

    const rows = await prisma.attendance.findMany({
      where,
      include: { employee: { select: employeeSelect } },
      orderBy: [{ attendanceDate: 'desc' }, { shiftType: 'asc' }],
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

/**
 * Mark many people in one call — a whole day (`shiftType` omitted/null) or one
 * shift. Upserts against the `(employeeId, attendanceDate, shiftType)` unique
 * key. Prisma cannot target a compound unique whose column is null, so a
 * whole-day row is matched with findFirst + update inside the transaction.
 */
router.put('/attendance/bulk', canManageStaff, async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const data = bulkAttendanceSchema.parse(req.body);
    const attendanceDate = toUtcDay(data.attendanceDate);
    const shiftType = (data.shiftType ?? null) as ShiftType | null;

    const ids = data.entries.map((e) => e.employeeId);
    if (new Set(ids).size !== ids.length) {
      throw new AppError(400, 'The same employee appears twice in this request');
    }

    // One query proves every id belongs to this pump before anything is written.
    const owned = await prisma.employee.findMany({
      where: { id: { in: ids }, pumpId },
      select: { id: true },
    });
    if (owned.length !== ids.length) throw new AppError(404, 'Employee not found');

    // An optional shift report must also belong to this pump.
    let shiftReportId: string | null = data.shiftReportId ?? null;
    if (shiftReportId) {
      const report = await prisma.shiftReport.findFirst({ where: { id: shiftReportId, pumpId } });
      if (!report) throw new AppError(404, 'Shift report not found');
    }

    const result = await prisma.$transaction(async (tx) => {
      let created = 0;
      let updated = 0;
      const rows = [];
      for (const entry of data.entries) {
        const existing = await tx.attendance.findFirst({
          where: { employeeId: entry.employeeId, attendanceDate, shiftType },
        });
        const payload = {
          status: entry.status as AttendanceStatus,
          overtimeMinutes: entry.overtimeMinutes ?? 0,
          notes: entry.notes ?? null,
          shiftReportId,
        };
        if (existing) {
          rows.push(await tx.attendance.update({ where: { id: existing.id }, data: payload }));
          updated += 1;
        } else {
          rows.push(
            await tx.attendance.create({
              data: { employeeId: entry.employeeId, attendanceDate, shiftType, ...payload },
            })
          );
          created += 1;
        }
      }
      return { created, updated, rows };
    });

    res.json({
      attendanceDate: data.attendanceDate,
      shiftType,
      created: result.created,
      updated: result.updated,
      rows: result.rows,
    });
  } catch (e) {
    next(e);
  }
});

router.patch('/attendance/:id', canManageStaff, async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const existing = await prisma.attendance.findFirst({
      where: { id: req.params.id, employee: { pumpId } },
    });
    if (!existing) throw new AppError(404, 'Attendance record not found');
    const data = updateAttendanceSchema.parse(req.body);

    const row = await prisma.attendance.update({
      where: { id: existing.id },
      data: {
        ...(data.status === undefined ? {} : { status: data.status as AttendanceStatus }),
        ...(data.overtimeMinutes === undefined ? {} : { overtimeMinutes: data.overtimeMinutes }),
        ...(data.notes === undefined ? {} : { notes: data.notes }),
      },
      include: { employee: { select: employeeSelect } },
    });
    res.json(row);
  } catch (e) {
    next(e);
  }
});

/** Per-employee × per-day grid for one month, plus per-employee and grand totals. */
router.get('/attendance/register', canRead, async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const month = monthStr.parse(req.query.month ?? toYmd(todayUtcDay()).slice(0, 7));
    const { start, endExclusive } = monthBounds(month);

    const [employees, rows] = await Promise.all([
      prisma.employee.findMany({
        where: { pumpId },
        select: employeeSelect,
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      }),
      prisma.attendance.findMany({
        where: {
          employee: { pumpId },
          attendanceDate: { gte: start, lt: endExclusive },
        },
        orderBy: [{ attendanceDate: 'asc' }, { shiftType: 'asc' }],
      }),
    ]);

    const days = daysInMonth(month);
    const byEmployee = new Map<string, Map<string, typeof rows>>();
    for (const row of rows) {
      const day = toYmd(row.attendanceDate);
      let perDay = byEmployee.get(row.employeeId);
      if (!perDay) {
        perDay = new Map();
        byEmployee.set(row.employeeId, perDay);
      }
      const cell = perDay.get(day);
      if (cell) cell.push(row);
      else perDay.set(day, [row]);
    }

    const grandTotals: AttendanceTotals = emptyTotals();
    // An inactive employee with no rows this month is not worth a line in the grid.
    const visible = employees.filter((e) => e.isActive || byEmployee.has(e.id));

    const register = visible.map((employee) => {
      const perDay = byEmployee.get(employee.id);
      const totals = emptyTotals();
      const cells = days.map((day) => {
        const dayRows = perDay?.get(day) ?? [];
        for (const r of dayRows) {
          addToTotals(totals, r.status, r.overtimeMinutes);
          addToTotals(grandTotals, r.status, r.overtimeMinutes);
        }
        return {
          date: day,
          marks: dayRows.map((r) => ({
            id: r.id,
            shiftType: r.shiftType,
            status: r.status,
            overtimeMinutes: r.overtimeMinutes,
            notes: r.notes,
          })),
        };
      });
      return { employee, cells, totals };
    });

    res.json({ month, days, statuses: ATTENDANCE_STATUSES, register, grandTotals });
  } catch (e) {
    next(e);
  }
});

/**
 * Convenience: everyone assigned to a nozzle on this shift is marked PRESENT for
 * the shift's date and type. Rows that already exist are left exactly as they
 * are — someone marked that person deliberately (ABSENT, HALF_DAY, …) and an
 * automatic sweep must not overwrite that judgement.
 */
router.post('/attendance/from-shift/:shiftReportId', canManageStaff, async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const report = await prisma.shiftReport.findFirst({
      where: { id: req.params.shiftReportId, pumpId },
      select: { id: true, reportDate: true, shiftType: true },
    });
    if (!report) throw new AppError(404, 'Shift report not found');

    const assignments = await prisma.shiftEmployeeAssignment.findMany({
      where: { shiftReportId: report.id },
      select: { employeeId: true },
    });
    const employeeIds = [...new Set(assignments.map((a) => a.employeeId))];
    if (employeeIds.length === 0) {
      throw new AppError(400, 'No employees are assigned to this shift yet');
    }

    const attendanceDate = new Date(
      Date.UTC(
        report.reportDate.getUTCFullYear(),
        report.reportDate.getUTCMonth(),
        report.reportDate.getUTCDate()
      )
    );

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.attendance.findMany({
        where: {
          employeeId: { in: employeeIds },
          attendanceDate,
          shiftType: report.shiftType,
        },
        select: { employeeId: true },
      });
      const already = new Set(existing.map((e) => e.employeeId));
      const toCreate = employeeIds.filter((id) => !already.has(id));

      for (const employeeId of toCreate) {
        await tx.attendance.create({
          data: {
            employeeId,
            attendanceDate,
            shiftType: report.shiftType,
            status: 'PRESENT',
            shiftReportId: report.id,
          },
        });
      }
      return { created: toCreate.length, skipped: already.size };
    });

    res.status(201).json({
      shiftReportId: report.id,
      attendanceDate: toYmd(attendanceDate),
      shiftType: report.shiftType,
      assigned: employeeIds.length,
      created: result.created,
      skipped: result.skipped,
    });
  } catch (e) {
    next(e);
  }
});

// ===================== STAFF ADVANCES =====================
//
// Money LENT to staff and paid back. This is NOT a cash shortage: a till short
// at shift close lives on the ledger's "Staff Receivable — Cash Shortage"
// account and is untouched by anything in this file.

const advanceBalanceFor = async (employeeId: string) => {
  const sums = await prisma.employeeAdvance.groupBy({
    by: ['kind'],
    where: { employeeId },
    _sum: { amountPaise: true },
  });
  let advancedPaise = 0n;
  let repaidPaise = 0n;
  for (const s of sums) {
    const total = s._sum.amountPaise ?? 0n;
    if (s.kind === 'ADVANCE') advancedPaise = total;
    else repaidPaise = total;
  }
  return { advancedPaise, repaidPaise, outstandingPaise: advancedPaise - repaidPaise };
};

router.post('/advances', canManageStaff, async (req, res, next) => {
  try {
    const createdById = requireUserId(req);
    const data = createAdvanceSchema.parse(req.body);
    const employee = await findOwnEmployee(req, data.employeeId);

    if (data.kind === 'REPAYMENT') {
      const { outstandingPaise } = await advanceBalanceFor(employee.id);
      if (data.amountPaise > outstandingPaise) {
        throw new AppError(
          400,
          `${employee.name} has an outstanding advance of ${formatPaise(outstandingPaise)} — a repayment of ${formatPaise(data.amountPaise)} is more than that. Cash shortages are tracked separately on the ledger and are not repaid here.`
        );
      }
    }

    const advance = await prisma.employeeAdvance.create({
      data: {
        employeeId: employee.id,
        kind: data.kind,
        amountPaise: data.amountPaise,
        occurredOn: toUtcDay(data.occurredOn),
        reference: data.reference ?? null,
        notes: data.notes ?? null,
        // Left null on purpose: accounting for advances is wired centrally later.
        journalEntryId: null,
        createdById,
      },
      include: { employee: { select: employeeSelect } },
    });
    res.status(201).json(advance);
  } catch (e) {
    next(e);
  }
});

router.get('/advances', canRead, async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const { employeeId, from, to } = req.query as Record<string, string | undefined>;

    const where: Prisma.EmployeeAdvanceWhereInput = { employee: { pumpId } };
    if (employeeId) {
      const employee = await findOwnEmployee(req, employeeId);
      where.employeeId = employee.id;
    }
    if (from || to) {
      const range: Prisma.DateTimeFilter = {};
      if (from) range.gte = toUtcDay(dayStr.parse(from));
      if (to) range.lte = toUtcDay(dayStr.parse(to));
      where.occurredOn = range;
    }

    const rows = await prisma.employeeAdvance.findMany({
      where,
      include: { employee: { select: employeeSelect } },
      orderBy: [{ occurredOn: 'desc' }, { createdAt: 'desc' }],
    });

    let advancedPaise = 0n;
    let repaidPaise = 0n;
    for (const r of rows) {
      if (r.kind === 'ADVANCE') advancedPaise += r.amountPaise;
      else repaidPaise += r.amountPaise;
    }

    res.json({
      rows,
      totals: { advancedPaise, repaidPaise, netPaise: advancedPaise - repaidPaise },
    });
  } catch (e) {
    next(e);
  }
});

router.get('/advances/balances', canRead, async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const [employees, sums] = await Promise.all([
      prisma.employee.findMany({
        where: { pumpId },
        select: employeeSelect,
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      }),
      prisma.employeeAdvance.groupBy({
        by: ['employeeId', 'kind'],
        where: { employee: { pumpId } },
        _sum: { amountPaise: true },
      }),
    ]);

    const advanced = new Map<string, bigint>();
    const repaid = new Map<string, bigint>();
    for (const s of sums) {
      const total = s._sum.amountPaise ?? 0n;
      (s.kind === 'ADVANCE' ? advanced : repaid).set(s.employeeId, total);
    }

    const balances = employees
      .map((employee) => {
        const advancedPaise = advanced.get(employee.id) ?? 0n;
        const repaidPaise = repaid.get(employee.id) ?? 0n;
        return {
          employee,
          advancedPaise,
          repaidPaise,
          outstandingPaise: advancedPaise - repaidPaise,
        };
      })
      // An inactive employee who never took an advance is just noise.
      .filter((b) => b.employee.isActive || b.advancedPaise > 0n || b.repaidPaise > 0n);

    const totals = balances.reduce(
      (acc, b) => ({
        advancedPaise: acc.advancedPaise + b.advancedPaise,
        repaidPaise: acc.repaidPaise + b.repaidPaise,
        outstandingPaise: acc.outstandingPaise + b.outstandingPaise,
      }),
      { advancedPaise: 0n, repaidPaise: 0n, outstandingPaise: 0n }
    );

    res.json({ balances, totals });
  } catch (e) {
    next(e);
  }
});

router.delete('/advances/:id', canManageStaff, async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const existing = await prisma.employeeAdvance.findFirst({
      where: { id: req.params.id, employee: { pumpId } },
      include: { employee: { select: employeeSelect } },
    });
    if (!existing) throw new AppError(404, 'Advance entry not found');

    // Deleting an advance that has already been partly repaid would leave the
    // employee with a negative balance, which is never what the owner meant.
    if (existing.kind === 'ADVANCE') {
      const { outstandingPaise } = await advanceBalanceFor(existing.employeeId);
      if (outstandingPaise - existing.amountPaise < 0n) {
        throw new AppError(
          400,
          `Cannot delete this ${formatPaise(existing.amountPaise)} advance: ${existing.employee.name} has only ${formatPaise(outstandingPaise)} outstanding, so removing it would make the balance negative. Delete the repayments first.`
        );
      }
    }

    await prisma.employeeAdvance.delete({ where: { id: existing.id } });
    const balance = await advanceBalanceFor(existing.employeeId);
    res.json({ deleted: true, advanceId: existing.id, balance });
  } catch (e) {
    next(e);
  }
});

export default router;

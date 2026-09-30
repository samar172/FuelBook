import { Router } from 'express';
import { prisma } from '../lib/db';
import { requireAuth, requirePermission, requireRole } from '../middleware/auth';
import { createEmployeeSchema, updateEmployeeSchema, transferEmployeeSchema } from '../schemas';
import { AppError } from '../middleware/error';
import { logAudit } from '../services/audit';
import { FuelType, Role } from '@prisma/client';

const router = Router();
router.use(requireAuth);

const requirePump = (req: any) => {
  if (!req.user.pumpId) throw new AppError(400, 'No pump assigned to user');
  return req.user.pumpId as string;
};

router.get('/', async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    // Default stays active-only so existing shift dropdowns are unaffected.
    const includeInactive = String(req.query.includeInactive || '') === 'true';
    const employees = await prisma.employee.findMany({
      where: { pumpId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
    res.json(employees);
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const employee = await prisma.employee.findFirst({
      where: { id: req.params.id, pumpId },
    });
    if (!employee) throw new AppError(404, 'Employee not found');
    res.json(employee);
  } catch (e) {
    next(e);
  }
});

router.post('/', requirePermission('canManageEmployees'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const data = createEmployeeSchema.parse(req.body);
    const employee = await prisma.employee.create({ data: { pumpId, ...data } });
    res.status(201).json(employee);
  } catch (e) {
    next(e);
  }
});

router.patch('/:id', requirePermission('canManageEmployees'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const existing = await prisma.employee.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.pumpId !== pumpId) {
      throw new AppError(404, 'Employee not found');
    }
    const data = updateEmployeeSchema.parse(req.body);
    const employee = await prisma.employee.update({ where: { id: existing.id }, data });
    res.json(employee);
  } catch (e) {
    next(e);
  }
});

router.post('/:id/deactivate', requirePermission('canManageEmployees'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const existing = await prisma.employee.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.pumpId !== pumpId) {
      throw new AppError(404, 'Employee not found');
    }
    const employee = await prisma.employee.update({
      where: { id: existing.id },
      data: { isActive: false },
    });
    res.json(employee);
  } catch (e) {
    next(e);
  }
});

router.post('/:id/reactivate', requirePermission('canManageEmployees'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const existing = await prisma.employee.findFirst({ where: { id: req.params.id, pumpId } });
    if (!existing) throw new AppError(404, 'Employee not found');
    const employee = await prisma.employee.update({
      where: { id: existing.id },
      data: { isActive: true, exitDate: null },
    });
    res.json(employee);
  } catch (e) {
    next(e);
  }
});

// Move a staff member to another pump of the same business.
//
// Staff belong to one pump: that is what makes "whose cash is this" answerable.
// Moving someone is therefore an owner's decision, and their history stays where
// it happened — past shifts, cash and dues remain on the old pump's books, and
// nothing already recorded is rewritten.
router.post('/:id/transfer', requireRole(Role.OWNER), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const { toPumpId, reason } = transferEmployeeSchema.parse(req.body);

    const employee = await prisma.employee.findFirst({
      where: { id: req.params.id, pumpId },
      include: { pump: { select: { id: true, name: true, businessId: true } } },
    });
    if (!employee) throw new AppError(404, 'Employee not found');
    if (toPumpId === pumpId) throw new AppError(400, 'That is the pump they are already at');

    const target = await prisma.pump.findFirst({
      where: { id: toPumpId, businessId: employee.pump.businessId },
      select: { id: true, name: true },
    });
    if (!target) {
      throw new AppError(400, 'That pump is not part of this business');
    }

    const moved = await prisma.$transaction(async (tx) => {
      // A login follows the person to the new pump, or it would point at a pump
      // they no longer work at.
      await tx.user.updateMany({ where: { employeeId: employee.id }, data: { pumpId: target.id } });
      return tx.employee.update({
        where: { id: employee.id },
        data: {
          pumpId: target.id,
          notes: [
            employee.notes,
            `Transferred from ${employee.pump.name} to ${target.name} on ${new Date()
              .toISOString()
              .slice(0, 10)}${reason ? ` — ${reason}` : ''}`,
          ]
            .filter(Boolean)
            .join('\n'),
        },
      });
    });

    await logAudit(
      req.user!.userId,
      'employee.transfer',
      'Employee',
      employee.id,
      { pumpId: employee.pumpId },
      { pumpId: target.id, reason },
    );
    res.json({
      employee: moved,
      from: { id: employee.pump.id, name: employee.pump.name },
      to: target,
      note: 'Past shifts, cash and dues stay with the old pump.',
    });
  } catch (e) {
    next(e);
  }
});

// Pumps this employee could be moved to (same business, not their current one).
router.get('/:id/transfer-targets', requireRole(Role.OWNER), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const employee = await prisma.employee.findFirst({
      where: { id: req.params.id, pumpId },
      include: { pump: { select: { businessId: true } } },
    });
    if (!employee) throw new AppError(404, 'Employee not found');
    const pumps = await prisma.pump.findMany({
      where: { businessId: employee.pump.businessId, isActive: true, id: { not: pumpId } },
      select: { id: true, name: true, code: true, city: true },
      orderBy: { name: 'asc' },
    });
    res.json(pumps);
  } catch (e) {
    next(e);
  }
});

router.get('/:id/ledger', async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const employee = await prisma.employee.findUnique({ where: { id: req.params.id } });
    if (!employee || employee.pumpId !== pumpId) {
      throw new AppError(404, 'Employee not found');
    }

    const { from, to } = req.query as { from?: string; to?: string };
    const shiftReportWhere: any = { pumpId };
    if (from || to) {
      shiftReportWhere.reportDate = {};
      if (from) shiftReportWhere.reportDate.gte = new Date(from);
      if (to) shiftReportWhere.reportDate.lte = new Date(to);
    }

    const assignments = await prisma.shiftEmployeeAssignment.findMany({
      where: { employeeId: employee.id, shiftReport: shiftReportWhere },
      include: {
        shiftReport: { select: { id: true, reportDate: true, shiftType: true } },
        nozzle: { select: { id: true, code: true, fuelType: true } },
      },
      orderBy: { shiftReport: { reportDate: 'desc' } },
    });

    // Latest FuelRate per fuel type — same "current rate" convention computeShiftTotals
    // uses (backend/src/services/shiftCalc.ts), since per-fuel-type amounts aren't
    // persisted anywhere for a point-in-time lookup.
    const rates = await prisma.fuelRate.findMany({
      where: { pumpId },
      orderBy: { effectiveFrom: 'desc' },
    });
    const ratePerFuel: Partial<Record<FuelType, bigint>> = {};
    for (const r of rates) {
      if (!ratePerFuel[r.fuelType]) ratePerFuel[r.fuelType] = r.ratePaise;
    }

    const readings = await prisma.nozzleReading.findMany({
      where: {
        shiftReportId: { in: assignments.map((a) => a.shiftReportId) },
        nozzleId: { in: assignments.map((a) => a.nozzleId) },
      },
    });
    const readingByKey = new Map(readings.map((r) => [`${r.shiftReportId}:${r.nozzleId}`, r]));

    const result = assignments.map((a) => {
      const reading = readingByKey.get(`${a.shiftReportId}:${a.nozzleId}`);
      let litresMl = 0n;
      if (reading) {
        const sale = reading.closingReadingMl - reading.openingReadingMl - reading.testingMl;
        litresMl = sale < 0n ? 0n : sale;
      }
      const ratePaise = ratePerFuel[a.nozzle.fuelType] ?? 0n;
      const valuePaise = (litresMl * ratePaise) / 1000n;
      return {
        id: a.id,
        shiftReport: a.shiftReport,
        nozzle: a.nozzle,
        litresMl,
        valuePaise,
      };
    });

    res.json({ employee, assignments: result });
  } catch (e) {
    next(e);
  }
});

export default router;

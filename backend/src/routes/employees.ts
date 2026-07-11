import { Router } from 'express';
import { prisma } from '../lib/db';
import { requireAuth, requirePermission } from '../middleware/auth';
import { createEmployeeSchema, updateEmployeeSchema } from '../schemas';
import { AppError } from '../middleware/error';
import { FuelType } from '@prisma/client';

const router = Router();
router.use(requireAuth);

const requirePump = (req: any) => {
  if (!req.user.pumpId) throw new AppError(400, 'No pump assigned to user');
  return req.user.pumpId as string;
};

router.get('/', async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const employees = await prisma.employee.findMany({
      where: { pumpId, isActive: true },
      orderBy: { name: 'asc' },
    });
    res.json(employees);
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

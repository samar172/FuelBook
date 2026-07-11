// Pump / Tank / Nozzle / Fuel rate / Payment channel / Time slot / Expense category management

import { Router } from 'express';
import { prisma } from '../lib/db';
import { requireAuth, requirePermission, requireRole } from '../middleware/auth';
import {
  createTankSchema,
  createNozzleSchema,
  setFuelRateSchema,
  updateFuelRateSchema,
  expenseCategorySchema,
  paymentChannelSchema,
  paymentTimeSlotSchema,
  createPumpSchema,
  updatePumpSchema,
} from '../schemas';
import { litresToMl } from '../lib/money';
import { AppError } from '../middleware/error';
import { signToken } from '../lib/jwt';
import { Role } from '@prisma/client';

const router = Router();
router.use(requireAuth);

const requirePump = (req: any) => {
  if (!req.user.pumpId) throw new AppError(400, 'No pump assigned to user');
  return req.user.pumpId as string;
};

// ===== PUMPS (business-level: list/create/edit/delete, OWNER only) =====
router.get('/pumps', requireRole(Role.OWNER), async (req, res, next) => {
  try {
    if (!req.user!.businessId) throw new AppError(400, 'No business assigned to user');
    const pumps = await prisma.pump.findMany({
      where: { businessId: req.user!.businessId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json(pumps);
  } catch (e) {
    next(e);
  }
});

router.post('/pumps', requireRole(Role.OWNER), async (req, res, next) => {
  try {
    if (!req.user!.businessId) throw new AppError(400, 'No business assigned to user');
    const data = createPumpSchema.parse(req.body);

    const pump = await prisma.pump.create({
      data: {
        businessId: req.user!.businessId,
        name: data.name,
        code: data.code,
        address: data.address,
        city: data.city,
        state: data.state,
      },
    });

    // Auto-activate the owner's first pump so subsequent pump-scoped
    // requests (dashboard, shifts, etc.) have something to resolve to.
    let token: string | undefined;
    if (!req.user!.pumpId) {
      await prisma.user.update({
        where: { id: req.user!.userId },
        data: { pumpId: pump.id },
      });
      token = signToken({
        userId: req.user!.userId,
        businessId: req.user!.businessId,
        pumpId: pump.id,
        role: req.user!.role,
        name: req.user!.name,
      });
    }

    res.status(201).json({ pump, token });
  } catch (e) {
    next(e);
  }
});

router.patch('/pumps/:id', requireRole(Role.OWNER), async (req, res, next) => {
  try {
    if (!req.user!.businessId) throw new AppError(400, 'No business assigned to user');
    const existing = await prisma.pump.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.businessId !== req.user!.businessId) {
      throw new AppError(404, 'Pump not found');
    }
    const data = updatePumpSchema.parse(req.body);
    const pump = await prisma.pump.update({ where: { id: existing.id }, data });
    res.json(pump);
  } catch (e) {
    next(e);
  }
});

router.delete('/pumps/:id', requireRole(Role.OWNER), async (req, res, next) => {
  try {
    if (!req.user!.businessId) throw new AppError(400, 'No business assigned to user');
    const existing = await prisma.pump.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.businessId !== req.user!.businessId) {
      throw new AppError(404, 'Pump not found');
    }
    if (existing.id === req.user!.pumpId) {
      throw new AppError(400, 'Switch to a different pump before deleting this one');
    }
    const activeCount = await prisma.pump.count({
      where: { businessId: req.user!.businessId, isActive: true },
    });
    if (activeCount <= 1) {
      throw new AppError(400, 'Cannot delete your only pump');
    }
    await prisma.pump.update({ where: { id: existing.id }, data: { isActive: false } });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

// ===== PUMP (the caller's currently active pump) =====
router.get('/pump', async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const pump = await prisma.pump.findUniqueOrThrow({ where: { id: pumpId } });
    res.json(pump);
  } catch (e) {
    next(e);
  }
});

router.patch('/pump', requirePermission('canManagePump'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const data = updatePumpSchema.parse(req.body);
    const pump = await prisma.pump.update({
      where: { id: pumpId },
      data,
    });
    res.json(pump);
  } catch (e) {
    next(e);
  }
});

// ===== TANKS =====
router.get('/tanks', async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const tanks = await prisma.tank.findMany({
      where: { pumpId },
      include: { nozzles: true },
      orderBy: { name: 'asc' },
    });
    res.json(tanks);
  } catch (e) {
    next(e);
  }
});

router.post('/tanks', requirePermission('canManagePump'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const data = createTankSchema.parse(req.body);
    const tank = await prisma.tank.create({
      data: {
        pumpId,
        name: data.name,
        fuelType: data.fuelType,
        capacityMl: litresToMl(data.capacityLitres),
      },
    });
    res.status(201).json(tank);
  } catch (e) {
    next(e);
  }
});

router.patch('/tanks/:id', requirePermission('canManagePump'), async (req, res, next) => {
  try {
    const updates: any = { ...req.body };
    if (typeof updates.capacityLitres === 'number') {
      updates.capacityMl = litresToMl(updates.capacityLitres);
      delete updates.capacityLitres;
    }
    const tank = await prisma.tank.update({ where: { id: req.params.id }, data: updates });
    res.json(tank);
  } catch (e) {
    next(e);
  }
});

// ===== NOZZLES =====
router.get('/nozzles', async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const nozzles = await prisma.nozzle.findMany({
      where: { pumpId },
      include: { tank: true },
      orderBy: { code: 'asc' },
    });
    res.json(nozzles);
  } catch (e) {
    next(e);
  }
});

router.post('/nozzles', requirePermission('canManagePump'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const data = createNozzleSchema.parse(req.body);
    const tank = await prisma.tank.findUniqueOrThrow({ where: { id: data.tankId } });
    const nozzle = await prisma.nozzle.create({
      data: { pumpId, tankId: tank.id, code: data.code, fuelType: tank.fuelType },
    });
    res.status(201).json(nozzle);
  } catch (e) {
    next(e);
  }
});

router.patch('/nozzles/:id', requirePermission('canManagePump'), async (req, res, next) => {
  try {
    const nozzle = await prisma.nozzle.update({ where: { id: req.params.id }, data: req.body });
    res.json(nozzle);
  } catch (e) {
    next(e);
  }
});

// ===== FUEL RATES =====
router.get('/fuel-rates', async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const rates = await prisma.fuelRate.findMany({
      where: { pumpId },
      orderBy: [{ fuelType: 'asc' }, { effectiveFrom: 'desc' }],
    });
    // Latest per fuel type
    const latestByFuel: Record<string, typeof rates[number]> = {};
    for (const r of rates) {
      if (!latestByFuel[r.fuelType]) latestByFuel[r.fuelType] = r;
    }
    res.json({ all: rates, current: latestByFuel });
  } catch (e) {
    next(e);
  }
});

router.post('/fuel-rates', requirePermission('canEditFuelRates'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const data = setFuelRateSchema.parse(req.body);
    const rate = await prisma.fuelRate.create({
      data: {
        pumpId,
        fuelType: data.fuelType,
        ratePaise: data.ratePaise,
        effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : new Date(),
        createdBy: req.user!.userId,
      },
    });
    res.status(201).json(rate);
  } catch (e) {
    next(e);
  }
});

router.patch('/fuel-rates/:id', requirePermission('canEditFuelRates'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const existing = await prisma.fuelRate.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.pumpId !== pumpId) {
      throw new AppError(404, 'Fuel rate not found');
    }
    const data = updateFuelRateSchema.parse(req.body);
    const rate = await prisma.fuelRate.update({
      where: { id: existing.id },
      data: {
        ...(data.ratePaise !== undefined ? { ratePaise: data.ratePaise } : {}),
        ...(data.effectiveFrom !== undefined ? { effectiveFrom: new Date(data.effectiveFrom) } : {}),
      },
    });
    res.json(rate);
  } catch (e) {
    next(e);
  }
});

// ===== EXPENSE CATEGORIES =====
router.get('/expense-categories', async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const cats = await prisma.expenseCategory.findMany({
      where: { pumpId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    res.json(cats);
  } catch (e) {
    next(e);
  }
});

router.post('/expense-categories', requirePermission('canManageExpenseCategories'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const data = expenseCategorySchema.parse(req.body);
    const cat = await prisma.expenseCategory.create({ data: { pumpId, ...data } });
    res.status(201).json(cat);
  } catch (e) {
    next(e);
  }
});

router.patch('/expense-categories/:id', requirePermission('canManageExpenseCategories'), async (req, res, next) => {
  try {
    const cat = await prisma.expenseCategory.update({ where: { id: req.params.id }, data: req.body });
    res.json(cat);
  } catch (e) {
    next(e);
  }
});

// ===== PAYMENT CHANNELS =====
router.get('/payment-channels', async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const channels = await prisma.paymentChannel.findMany({
      where: { pumpId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    res.json(channels);
  } catch (e) {
    next(e);
  }
});

router.post('/payment-channels', requirePermission('canManagePump'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const data = paymentChannelSchema.parse(req.body);
    const ch = await prisma.paymentChannel.create({ data: { pumpId, ...data } });
    res.status(201).json(ch);
  } catch (e) {
    next(e);
  }
});

router.patch('/payment-channels/:id', requirePermission('canManagePump'), async (req, res, next) => {
  try {
    const ch = await prisma.paymentChannel.update({ where: { id: req.params.id }, data: req.body });
    res.json(ch);
  } catch (e) {
    next(e);
  }
});

router.delete('/payment-channels/:id', requirePermission('canManagePump'), async (req, res, next) => {
  try {
    await prisma.paymentChannel.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

// ===== PAYMENT TIME SLOTS =====
router.get('/payment-time-slots', async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const slots = await prisma.paymentTimeSlot.findMany({
      where: { pumpId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    res.json(slots);
  } catch (e) {
    next(e);
  }
});

router.post('/payment-time-slots', requirePermission('canManagePump'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const data = paymentTimeSlotSchema.parse(req.body);
    const slot = await prisma.paymentTimeSlot.create({ data: { pumpId, ...data } });
    res.status(201).json(slot);
  } catch (e) {
    next(e);
  }
});

router.patch('/payment-time-slots/:id', requirePermission('canManagePump'), async (req, res, next) => {
  try {
    const slot = await prisma.paymentTimeSlot.update({ where: { id: req.params.id }, data: req.body });
    res.json(slot);
  } catch (e) {
    next(e);
  }
});

router.delete('/payment-time-slots/:id', requirePermission('canManagePump'), async (req, res, next) => {
  try {
    await prisma.paymentTimeSlot.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

export default router;

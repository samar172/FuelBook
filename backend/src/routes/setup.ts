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
  updatePaymentTimeSlotSchema,
  createPumpSchema,
  updatePumpSchema,
} from '../schemas';
import { litresToMl } from '../lib/money';
import { AppError } from '../middleware/error';
import { ensureChartOfAccounts } from '../services/ledger';
import { recomputeShift } from '../services/shiftCalc';
import { signToken } from '../lib/jwt';
import { Role, ShiftType, ShiftStatus } from '@prisma/client';

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

    // Give the new pump its chart of accounts up front, so the ledger works from
    // the first shift. (It is also created lazily, for pumps made before this.)
    await prisma.$transaction((tx) => ensureChartOfAccounts(tx, pump.id));

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
    // Open shifts are valued at the current rate, so they have to be re-valued now.
    const revalued = await revalueOpenShifts(pumpId);
    res.status(201).json({ ...rate, revaluedShifts: revalued });
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
    const revalued = await revalueOpenShifts(pumpId);
    res.json({ ...rate, revaluedShifts: revalued });
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
    // ?shiftType=DAY|NIGHT returns only the slots that belong to that shift, plus
    // any untagged slot (which applies to both). Without it, every slot is returned.
    const shiftTypeRaw = String(req.query.shiftType || '').toUpperCase();
    if (shiftTypeRaw && shiftTypeRaw !== 'DAY' && shiftTypeRaw !== 'NIGHT') {
      throw new AppError(400, 'shiftType must be DAY or NIGHT');
    }
    const slots = await prisma.paymentTimeSlot.findMany({
      where: {
        pumpId,
        ...(shiftTypeRaw
          ? { OR: [{ shiftType: shiftTypeRaw as ShiftType }, { shiftType: null }] }
          : {}),
      },
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
    const pumpId = requirePump(req);
    const existing = await prisma.paymentTimeSlot.findFirst({
      where: { id: req.params.id, pumpId },
    });
    if (!existing) throw new AppError(404, 'Time slot not found');
    const data = updatePaymentTimeSlotSchema.parse(req.body);
    const slot = await prisma.paymentTimeSlot.update({ where: { id: existing.id }, data });
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

/**
 * Re-values every shift that is still open after a fuel rate changes.
 *
 * Shift totals are denormalised (sales = litres x the rate at the time they were
 * saved), so a rate set AFTER the readings were entered used to leave the shift
 * showing zero sales until someone happened to re-save a tab. LOCKED shifts are
 * deliberately excluded: their journal is already posted and their figures must
 * not move under the books.
 */
async function revalueOpenShifts(pumpId: string) {
  const open = await prisma.shiftReport.findMany({
    where: { pumpId, status: { in: [ShiftStatus.DRAFT, ShiftStatus.SUBMITTED] } },
    select: { id: true },
  });
  if (open.length === 0) return 0;
  const pump = await prisma.pump.findUniqueOrThrow({
    where: { id: pumpId },
    select: { discrepancyMlThreshold: true },
  });
  for (const s of open) {
    await prisma.$transaction((tx) => recomputeShift(tx, s.id, pump.discrepancyMlThreshold));
  }
  return open.length;
}

// ===== ONBOARDING =====
// Drives the "Getting started" guide: every step reports whether it is actually
// done, derived from the pump's own data rather than a checkbox someone ticked.
// Order matters — it is the sequence a new dealer should work through.
router.get('/onboarding', async (req, res, next) => {
  try {
    const pumpId = requirePump(req);

    const [
      pump,
      tanks,
      nozzles,
      rates,
      channels,
      timeSlots,
      categories,
      employees,
      customers,
      dipPoints,
      bankAccounts,
      licences,
      shifts,
      lockedShifts,
      journalEntries,
      openingEntries,
      products,
    ] = await Promise.all([
      prisma.pump.findUniqueOrThrow({ where: { id: pumpId } }),
      prisma.tank.findMany({ where: { pumpId, isActive: true }, select: { id: true, fuelType: true, name: true } }),
      prisma.nozzle.findMany({ where: { pumpId, isActive: true }, select: { id: true, tankId: true, fuelType: true } }),
      prisma.fuelRate.findMany({ where: { pumpId }, orderBy: { effectiveFrom: 'desc' } }),
      prisma.paymentChannel.findMany({ where: { pumpId, isActive: true }, select: { id: true, kind: true } }),
      prisma.paymentTimeSlot.findMany({ where: { pumpId, isActive: true }, select: { id: true, shiftType: true } }),
      prisma.expenseCategory.count({ where: { pumpId, isActive: true } }),
      prisma.employee.count({ where: { pumpId, isActive: true } }),
      prisma.creditCustomer.count({ where: { pumpId, isActive: true } }),
      prisma.tankDipChartPoint.groupBy({ by: ['tankId'], where: { tank: { pumpId } }, _count: true }),
      prisma.bankAccount.count({ where: { pumpId, isActive: true } }),
      prisma.licence.count({ where: { pumpId, isActive: true } }),
      prisma.shiftReport.count({ where: { pumpId } }),
      prisma.shiftReport.count({ where: { pumpId, status: 'LOCKED' } }),
      prisma.journalEntry.count({ where: { pumpId } }),
      prisma.journalEntry.count({ where: { pumpId, source: 'MANUAL' } }),
      prisma.product.count({ where: { pumpId, isActive: true } }),
    ]);

    // A fuel is "in use" once a tank holds it; every such fuel needs a price.
    const fuelsInUse = [...new Set(tanks.map((t) => t.fuelType))];
    const pricedFuels = new Set(rates.map((r) => r.fuelType));
    const unpriced = fuelsInUse.filter((f) => !pricedFuels.has(f));

    const tanksWithoutNozzle = tanks.filter((t) => !nozzles.some((n) => n.tankId === t.id));
    const hasCashChannel = channels.some((c) => c.kind === 'CASH');
    const untaggedSlots = timeSlots.filter((t) => t.shiftType === null).length;
    const tanksWithDipChart = dipPoints.length;

    type Status = 'DONE' | 'TODO' | 'ATTENTION';
    const step = (
      id: string,
      title: string,
      status: Status,
      detail: string,
      href: string,
      required: boolean,
      why: string,
    ) => ({ id, title, status, detail, href, required, why });

    const steps = [
      step(
        'pump',
        'Confirm your pump details',
        pump.name && pump.address && pump.city ? 'DONE' : 'TODO',
        pump.name ? `${pump.name} — ${pump.city}, ${pump.state}` : 'Name and address not filled in',
        '/settings/pump',
        true,
        'Your pump name and address appear on statements you give customers.',
      ),
      step(
        'tanks',
        'Add your tanks',
        tanks.length > 0 ? 'DONE' : 'TODO',
        tanks.length > 0 ? `${tanks.length} tank(s): ${tanks.map((t) => t.name).join(', ')}` : 'No tanks yet',
        '/settings/pump',
        true,
        'Stock, dips and fuel purchases are all tracked per tank.',
      ),
      step(
        'nozzles',
        'Add the nozzles on each tank',
        nozzles.length === 0 ? 'TODO' : tanksWithoutNozzle.length > 0 ? 'ATTENTION' : 'DONE',
        nozzles.length === 0
          ? 'No nozzles yet'
          : tanksWithoutNozzle.length > 0
            ? `${nozzles.length} nozzle(s), but no nozzle on: ${tanksWithoutNozzle.map((t) => t.name).join(', ')}`
            : `${nozzles.length} nozzle(s) across ${tanks.length} tank(s)`,
        '/settings/pump',
        true,
        'Meter readings are per nozzle — this is how sales are measured.',
      ),
      step(
        'rates',
        'Set today\'s fuel rates',
        unpriced.length === 0 && rates.length > 0 ? 'DONE' : 'TODO',
        rates.length === 0
          ? 'No rates set'
          : unpriced.length > 0
            ? `No price yet for: ${unpriced.join(', ')}`
            : `Priced: ${[...pricedFuels].join(', ')}`,
        '/rates',
        true,
        'Sales value = litres sold x the rate, so nothing can be valued without it.',
      ),
      step(
        'channels',
        'List how customers pay you',
        channels.length === 0 ? 'TODO' : hasCashChannel ? 'DONE' : 'ATTENTION',
        channels.length === 0
          ? 'No payment channels yet'
          : hasCashChannel
            ? `${channels.length} channel(s), including cash`
            : `${channels.length} channel(s), but none marked as CASH`,
        '/settings/pump',
        true,
        'Cash, card, UPI and bank deposits are reconciled separately.',
      ),
      step(
        'timeslots',
        'Tag your shift time slots',
        timeSlots.length === 0 ? 'TODO' : untaggedSlots > 0 ? 'ATTENTION' : 'DONE',
        timeSlots.length === 0
          ? 'No time slots yet (optional if you record one total per shift)'
          : untaggedSlots > 0
            ? `${untaggedSlots} slot(s) not tagged Day or Night, so they show on both`
            : `${timeSlots.length} slot(s), each tagged to a shift`,
        '/settings/pump',
        false,
        'Tagging a slot Day or Night keeps a night slot off your day shift.',
      ),
      step(
        'categories',
        'Set up your expense heads',
        categories > 0 ? 'DONE' : 'TODO',
        categories > 0 ? `${categories} expense categor(ies)` : 'No expense categories yet',
        '/expenses',
        true,
        'Daily expenses are grouped by these on every shift and in the P&L.',
      ),
      step(
        'employees',
        'Add your staff',
        employees > 0 ? 'DONE' : 'TODO',
        employees > 0 ? `${employees} active staff` : 'No staff yet',
        '/employees',
        true,
        'Sales and cash are pinned to the attendant who worked each nozzle.',
      ),
      step(
        'customers',
        'Add credit customers and their vehicles',
        customers > 0 ? 'DONE' : 'TODO',
        customers > 0 ? `${customers} credit customer(s)` : 'None yet — add them when you first sell on credit',
        '/credit',
        false,
        'Needed only if you sell fuel on udhaar. Each customer can hold many vehicles.',
      ),
      step(
        'firstshift',
        'Create your first shift',
        shifts > 0 ? 'DONE' : 'TODO',
        shifts > 0 ? `${shifts} shift(s) created` : 'No shifts yet',
        '/shifts/new',
        true,
        'A shift is the day\'s book: readings, collections, credit, expenses and cash.',
      ),
      step(
        'lockshift',
        'Lock a shift to start the books',
        lockedShifts > 0 ? 'DONE' : 'TODO',
        lockedShifts > 0
          ? `${lockedShifts} shift(s) locked, ${journalEntries} journal entr(ies) posted`
          : 'Nothing locked yet — the ledger starts from your first locked shift',
        '/shifts',
        true,
        'Locking freezes the shift and posts it to the double-entry ledger.',
      ),
      step(
        'opening',
        'Post your opening balances',
        openingEntries > 0 ? 'DONE' : 'TODO',
        openingEntries > 0
          ? `${openingEntries} manual entr(ies) posted`
          : 'Cash in hand, what customers already owe, and fuel already in the tanks',
        '/books/new-entry',
        false,
        'Without this the balance sheet starts from zero and understates what you own.',
      ),
      step(
        'dipcharts',
        'Load your tank dip charts',
        tanksWithDipChart === 0 ? 'TODO' : tanksWithDipChart < tanks.length ? 'ATTENTION' : 'DONE',
        tanks.length === 0
          ? 'Add tanks first'
          : `${tanksWithDipChart} of ${tanks.length} tank(s) have a calibration chart`,
        '/wet-stock',
        false,
        'Turns a dipstick reading into litres, which is what wet-stock variance needs.',
      ),
      step(
        'bank',
        'Add your bank account',
        bankAccounts > 0 ? 'DONE' : 'TODO',
        bankAccounts > 0 ? `${bankAccounts} account(s)` : 'None yet',
        '/cash',
        false,
        'Needed to record deposits and reconcile card and UPI settlement.',
      ),
      step(
        'licences',
        'Record your licences and their expiry',
        licences > 0 ? 'DONE' : 'TODO',
        licences > 0 ? `${licences} licence(s) tracked` : 'PESO, stamping, fire and pollution NOC',
        '/compliance',
        false,
        'A lapsed licence or unstamped nozzle can stop you trading.',
      ),
      step(
        'products',
        'Add lubricants and other non-fuel lines',
        products > 0 ? 'DONE' : 'TODO',
        products > 0 ? `${products} product(s)` : 'None yet',
        '/products',
        false,
        'Fuel margins are fixed; lubes are where the real margin is.',
      ),
    ];

    const required = steps.filter((s) => s.required);
    const requiredDone = required.filter((s) => s.status === 'DONE').length;
    const nextStep = steps.find((s) => s.required && s.status !== 'DONE')
      ?? steps.find((s) => s.status !== 'DONE')
      ?? null;

    res.json({
      pump: { id: pump.id, name: pump.name, cashHandoverMode: pump.cashHandoverMode },
      steps,
      progress: {
        requiredTotal: required.length,
        requiredDone,
        percent: required.length === 0 ? 100 : Math.round((requiredDone / required.length) * 100),
        allRequiredDone: requiredDone === required.length,
      },
      nextStepId: nextStep?.id ?? null,
      readyForFirstShift: ['pump', 'tanks', 'nozzles', 'rates', 'channels', 'categories', 'employees'].every(
        (id) => steps.find((s) => s.id === id)?.status !== 'TODO',
      ),
    });
  } catch (e) {
    next(e);
  }
});

export default router;

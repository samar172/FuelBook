import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/db';
import { signToken } from '../lib/jwt';
import { loginSchema, registerSchema, switchPumpSchema } from '../schemas';
import { requireAuth, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/error';
import { Role } from '@prisma/client';
import { ensureShiftForNow, markAttendanceForShift, windowFor } from '../services/shiftAuto';

const router = Router();

router.post('/login', async (req, res, next) => {
  try {
    const { phone, pin } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { phone },
      include: { permissions: true, pump: true, business: true },
    });
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const ok = await bcrypt.compare(pin, user.pinHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken({
      userId: user.id,
      businessId: user.businessId,
      pumpId: user.pumpId,
      role: user.role,
      name: user.name,
    });

    // Opening the day's shift and marking the person present are conveniences.
    // Neither may stop someone signing in, so the whole block is best-effort and
    // its failures are logged rather than returned.
    let autoStarted: { reportDate: string; shiftType: string } | null = null;
    let markedPresent = false;
    if (user.pumpId && user.pump) {
      try {
        if (user.pump.autoStartShift) {
          const result = await ensureShiftForNow(user.pumpId, user.id);
          if (result.created && result.shift) {
            autoStarted = {
              reportDate: result.window.reportDate.toISOString().slice(0, 10),
              shiftType: result.window.shiftType,
            };
          }
        }
        if (user.pump.autoMarkAttendance && user.employeeId) {
          const w = windowFor(user.pump);
          const running = await prisma.shiftReport.findUnique({
            where: {
              pumpId_reportDate_shiftType: {
                pumpId: user.pumpId,
                reportDate: w.reportDate,
                shiftType: w.shiftType,
              },
            },
            select: { id: true },
          });
          // Only while a shift is actually open: signing in at 3am with no shift
          // running is not a day's attendance.
          if (running) {
            await markAttendanceForShift(prisma, {
              employeeId: user.employeeId,
              reportDate: w.reportDate,
              shiftType: w.shiftType,
              shiftReportId: running.id,
              source: 'LOGIN',
              markedById: user.id,
            });
            markedPresent = true;
          }
        }
      } catch (e) {
        console.error('[login] auto shift/attendance failed', e);
      }
    }

    return res.json({
      token,
      autoStartedShift: autoStarted,
      markedPresent,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        businessId: user.businessId,
        businessName: user.business?.name,
        pumpId: user.pumpId,
        pumpName: user.pump?.name,
        permissions: user.role === Role.OWNER ? null : user.permissions,
      },
    });
  } catch (e) {
    next(e);
  }
});

router.post('/register', async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);

    // Pre-check for a clean error message; the DB-level unique constraint
    // on phone is the real safety net against a concurrent duplicate.
    const existing = await prisma.user.findUnique({ where: { phone: data.phone } });
    if (existing) {
      return res.status(409).json({ error: 'Phone number already registered' });
    }

    const pinHash = await bcrypt.hash(data.pin, 10);

    const { business, owner } = await prisma.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: { name: data.businessName },
      });
      const owner = await tx.user.create({
        data: {
          businessId: business.id,
          pumpId: null,
          name: data.name,
          phone: data.phone,
          pinHash,
          role: Role.OWNER,
        },
      });
      return { business, owner };
    });

    const token = signToken({
      userId: owner.id,
      businessId: business.id,
      pumpId: null,
      role: owner.role,
      name: owner.name,
    });

    return res.status(201).json({
      token,
      user: {
        id: owner.id,
        name: owner.name,
        phone: owner.phone,
        role: owner.role,
        businessId: business.id,
        businessName: business.name,
        pumpId: null,
        pumpName: undefined,
        permissions: null,
      },
    });
  } catch (e) {
    next(e);
  }
});

router.post('/switch-pump', requireAuth, requireRole(Role.OWNER), async (req, res, next) => {
  try {
    const { pumpId } = switchPumpSchema.parse(req.body);
    if (!req.user!.businessId) {
      throw new AppError(400, 'User has no business');
    }
    const pump = await prisma.pump.findUnique({ where: { id: pumpId } });
    if (!pump || pump.businessId !== req.user!.businessId) {
      throw new AppError(403, 'Pump does not belong to your business');
    }

    await prisma.user.update({
      where: { id: req.user!.userId },
      data: { pumpId: pump.id },
    });

    const token = signToken({
      userId: req.user!.userId,
      businessId: req.user!.businessId,
      pumpId: pump.id,
      role: req.user!.role,
      name: req.user!.name,
    });

    return res.json({
      token,
      user: {
        id: req.user!.userId,
        name: req.user!.name,
        role: req.user!.role,
        businessId: req.user!.businessId,
        pumpId: pump.id,
        pumpName: pump.name,
        permissions: req.user!.role === Role.OWNER ? null : req.permissions,
      },
    });
  } catch (e) {
    next(e);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.user!.userId },
      include: { permissions: true, pump: true, business: true },
    });
    return res.json({
      id: user.id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      businessId: user.businessId,
      businessName: user.business?.name,
      pumpId: user.pumpId,
      pumpName: user.pump?.name,
      permissions: user.role === Role.OWNER ? null : user.permissions,
    });
  } catch (e) {
    next(e);
  }
});

export default router;

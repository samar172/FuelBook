import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/db';
import { signToken } from '../lib/jwt';
import { loginSchema } from '../schemas';
import { requireAuth } from '../middleware/auth';
import { Role } from '@prisma/client';

const router = Router();

router.post('/login', async (req, res, next) => {
  try {
    const { phone, pin } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { phone },
      include: { permissions: true, pump: true },
    });
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const ok = await bcrypt.compare(pin, user.pinHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken({
      userId: user.id,
      pumpId: user.pumpId,
      role: user.role,
      name: user.name,
    });

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        pumpId: user.pumpId,
        pumpName: user.pump?.name,
        permissions: user.role === Role.OWNER ? null : user.permissions,
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
      include: { permissions: true, pump: true },
    });
    return res.json({
      id: user.id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      pumpId: user.pumpId,
      pumpName: user.pump?.name,
      permissions: user.role === Role.OWNER ? null : user.permissions,
    });
  } catch (e) {
    next(e);
  }
});

export default router;

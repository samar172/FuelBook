import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/db';
import { requireAuth, requirePermission } from '../middleware/auth';
import { createUserSchema, updatePermissionsSchema } from '../schemas';
import { AppError } from '../middleware/error';

const router = Router();
router.use(requireAuth);

const requirePump = (req: any) => {
  if (!req.user.pumpId) throw new AppError(400, 'No pump assigned to user');
  return req.user.pumpId as string;
};

router.get('/', requirePermission('canManageUsers'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const users = await prisma.user.findMany({
      where: { pumpId },
      include: { permissions: true },
      orderBy: { name: 'asc' },
    });
    res.json(users.map((u) => ({ ...u, pinHash: undefined })));
  } catch (e) {
    next(e);
  }
});

router.post('/', requirePermission('canManageUsers'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const data = createUserSchema.parse(req.body);
    if (data.role === 'OWNER') {
      throw new AppError(403, 'Cannot create another owner via this endpoint');
    }
    const pinHash = await bcrypt.hash(data.pin, 10);
    const user = await prisma.user.create({
      data: {
        pumpId,
        name: data.name,
        phone: data.phone,
        pinHash,
        role: data.role,
        permissions: { create: {} },
      },
      include: { permissions: true },
    });
    res.status(201).json({ ...user, pinHash: undefined });
  } catch (e) {
    next(e);
  }
});

router.patch('/:id', requirePermission('canManageUsers'), async (req, res, next) => {
  try {
    const updates: any = { ...req.body };
    if (updates.pin) {
      updates.pinHash = await bcrypt.hash(updates.pin, 10);
      delete updates.pin;
    }
    delete updates.role; // role changes need a separate flow
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: updates,
      include: { permissions: true },
    });
    res.json({ ...user, pinHash: undefined });
  } catch (e) {
    next(e);
  }
});

router.put('/:id/permissions', requirePermission('canManageUsers'), async (req, res, next) => {
  try {
    const data = updatePermissionsSchema.parse(req.body);
    const perm = await prisma.userPermission.upsert({
      where: { userId: req.params.id },
      update: data,
      create: { userId: req.params.id, ...data },
    });
    res.json(perm);
  } catch (e) {
    next(e);
  }
});

router.post('/:id/deactivate', requirePermission('canManageUsers'), async (req, res, next) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });
    res.json({ ...user, pinHash: undefined });
  } catch (e) {
    next(e);
  }
});

export default router;

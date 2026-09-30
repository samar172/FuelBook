// Logins and what each of them may do.
//
// Two rules run through this file:
//   1. Everything is scoped to the caller's pump. A user id from another pump must
//      simply not resolve — not 403, not "found but refused".
//   2. Only an owner may touch an owner, change a role, or link a login to a staff
//      record. Those are the levers that grant access, so they sit with the dealer.

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { prisma } from '../lib/db';
import { requireAuth, requirePermission, requireRole } from '../middleware/auth';
import {
  createUserSchema,
  updateUserSchema,
  updatePermissionsSchema,
  changeRoleSchema,
} from '../schemas';
import { AppError } from '../middleware/error';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, presetFor } from '../services/roles';

const router = Router();
router.use(requireAuth);

const requirePump = (req: any) => {
  if (!req.user.pumpId) throw new AppError(400, 'No pump assigned to user');
  return req.user.pumpId as string;
};

const strip = (u: any) => ({ ...u, pinHash: undefined });

/** A user of this pump, or 404. Owners are only editable by another owner. */
async function findOwnUser(req: any, id: string, opts: { forWrite?: boolean } = {}) {
  const pumpId = requirePump(req);
  const user = await prisma.user.findFirst({
    where: { id, pumpId },
    include: { permissions: true, employee: { select: { id: true, name: true, code: true } } },
  });
  if (!user) throw new AppError(404, 'User not found');
  if (opts.forWrite && user.role === Role.OWNER && req.user.role !== Role.OWNER) {
    throw new AppError(403, 'Only an owner can change an owner account');
  }
  return user;
}

// The roles on offer, with what each one means. Drives the user-management screen.
router.get('/roles', requirePermission('canManageUsers'), async (_req, res) => {
  res.json(
    (Object.keys(ROLE_LABELS) as Role[])
      // The legacy role is not offered for new accounts; it still renders for
      // anyone who already has it.
      .filter((r) => r !== Role.STAFF)
      .map((role) => ({
        role,
        label: ROLE_LABELS[role],
        description: ROLE_DESCRIPTIONS[role],
        defaults: presetFor(role),
      })),
  );
});

router.get('/', requirePermission('canManageUsers'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const users = await prisma.user.findMany({
      where: { pumpId },
      include: { permissions: true, employee: { select: { id: true, name: true, code: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(users.map(strip));
  } catch (e) {
    next(e);
  }
});

router.post('/', requirePermission('canManageUsers'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const data = createUserSchema.parse(req.body);
    if (data.role === Role.OWNER) {
      throw new AppError(403, 'Cannot create another owner from here');
    }

    // A login can only be tied to a staff member of this same pump.
    if (data.employeeId) {
      const employee = await prisma.employee.findFirst({
        where: { id: data.employeeId, pumpId },
        include: { loginUser: { select: { id: true, name: true } } },
      });
      if (!employee) throw new AppError(400, 'That staff member is not at this pump');
      if (employee.loginUser) {
        throw new AppError(409, `${employee.name} already has a login`);
      }
    }

    const existingPhone = await prisma.user.findUnique({ where: { phone: data.phone } });
    if (existingPhone) throw new AppError(409, 'That phone number already has a login');

    const pinHash = await bcrypt.hash(data.pin, 10);
    const user = await prisma.user.create({
      data: {
        pumpId,
        businessId: (req as any).user.businessId ?? undefined,
        name: data.name,
        phone: data.phone,
        pinHash,
        role: data.role,
        employeeId: data.employeeId ?? null,
        // Start from the role's defaults rather than the column defaults, which
        // were written before these roles existed and are far too permissive.
        permissions: { create: presetFor(data.role) },
      },
      include: { permissions: true, employee: { select: { id: true, name: true, code: true } } },
    });
    res.status(201).json(strip(user));
  } catch (e) {
    next(e);
  }
});

router.patch('/:id', requirePermission('canManageUsers'), async (req, res, next) => {
  try {
    const pumpId = requirePump(req);
    const existing = await findOwnUser(req, req.params.id, { forWrite: true });
    const data = updateUserSchema.parse(req.body);

    if (data.employeeId !== undefined && data.employeeId !== null) {
      if ((req as any).user.role !== Role.OWNER) {
        throw new AppError(403, 'Only an owner can link a login to a staff record');
      }
      const employee = await prisma.employee.findFirst({
        where: { id: data.employeeId, pumpId },
        include: { loginUser: { select: { id: true, name: true } } },
      });
      if (!employee) throw new AppError(400, 'That staff member is not at this pump');
      if (employee.loginUser && employee.loginUser.id !== existing.id) {
        throw new AppError(409, `${employee.name} already has a login`);
      }
    }

    const { pin, ...rest } = data;
    const user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        ...rest,
        ...(pin ? { pinHash: await bcrypt.hash(pin, 10) } : {}),
      },
      include: { permissions: true, employee: { select: { id: true, name: true, code: true } } },
    });
    res.json(strip(user));
  } catch (e) {
    next(e);
  }
});

// Changing a role is an access decision, so it is the owner's call.
router.post('/:id/role', requireRole(Role.OWNER), async (req, res, next) => {
  try {
    const existing = await findOwnUser(req, req.params.id, { forWrite: true });
    const { role, resetPermissions } = changeRoleSchema.parse(req.body);

    if (existing.id === (req as any).user.userId) {
      throw new AppError(400, 'You cannot change your own role');
    }
    if (existing.role === Role.OWNER) {
      throw new AppError(400, 'An owner account cannot be demoted from here');
    }
    if (role === Role.OWNER) {
      throw new AppError(403, 'An owner cannot be created from here');
    }

    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id: existing.id }, data: { role } });
      if (resetPermissions) {
        await tx.userPermission.upsert({
          where: { userId: existing.id },
          update: presetFor(role),
          create: { userId: existing.id, ...presetFor(role) },
        });
      }
      return tx.user.findUniqueOrThrow({
        where: { id: existing.id },
        include: { permissions: true, employee: { select: { id: true, name: true, code: true } } },
      });
    });
    res.json(strip(user));
  } catch (e) {
    next(e);
  }
});

router.put('/:id/permissions', requirePermission('canManageUsers'), async (req, res, next) => {
  try {
    const existing = await findOwnUser(req, req.params.id, { forWrite: true });
    if (existing.role === Role.OWNER) {
      throw new AppError(400, 'An owner already has every permission');
    }
    const data = updatePermissionsSchema.parse(req.body);
    const perm = await prisma.userPermission.upsert({
      where: { userId: existing.id },
      update: data,
      create: { userId: existing.id, ...presetFor(existing.role), ...data },
    });
    res.json(perm);
  } catch (e) {
    next(e);
  }
});

router.post('/:id/deactivate', requirePermission('canManageUsers'), async (req, res, next) => {
  try {
    const existing = await findOwnUser(req, req.params.id, { forWrite: true });
    if (existing.id === (req as any).user.userId) {
      throw new AppError(400, 'You cannot deactivate your own login');
    }
    if (existing.role === Role.OWNER) {
      throw new AppError(400, 'An owner account cannot be deactivated from here');
    }
    const user = await prisma.user.update({
      where: { id: existing.id },
      data: { isActive: false },
      include: { permissions: true },
    });
    res.json(strip(user));
  } catch (e) {
    next(e);
  }
});

router.post('/:id/reactivate', requirePermission('canManageUsers'), async (req, res, next) => {
  try {
    const existing = await findOwnUser(req, req.params.id, { forWrite: true });
    const user = await prisma.user.update({
      where: { id: existing.id },
      data: { isActive: true },
      include: { permissions: true },
    });
    res.json(strip(user));
  } catch (e) {
    next(e);
  }
});

export default router;

import { Request, Response, NextFunction } from 'express';
import { verifyToken, JwtPayload } from '../lib/jwt';
import { prisma } from '../lib/db';
import { Role } from '@prisma/client';
import { presetFor } from '../services/roles';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      permissions?: Record<string, boolean>;
    }
  }
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const token = auth.slice(7);
  try {
    const payload = verifyToken(token);
    req.user = payload;

    // Owner gets implicit all-permissions
    if (payload.role === Role.OWNER) {
      req.permissions = makeOwnerPermissions();
    } else {
      const userPerm = await prisma.userPermission.findUnique({
        where: { userId: payload.userId },
      });
      req.permissions = (userPerm as unknown as Record<string, boolean>) || {};
    }
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

export const requireRole = (...roles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient role' });
    }
    next();
  };
};

export const requirePermission = (perm: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (req.user.role === Role.OWNER) return next();
    if (!req.permissions?.[perm]) {
      return res.status(403).json({ error: `Permission '${perm}' required` });
    }
    next();
  };
};

// An owner passes every check, including permissions added later, so this is
// derived rather than a hand-maintained list that silently falls behind.
const makeOwnerPermissions = () => presetFor(Role.OWNER);

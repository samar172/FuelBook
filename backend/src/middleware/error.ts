import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';

export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (err instanceof ZodError) {
    // Name the field that actually failed. "Validation failed" on its own leaves
    // someone staring at a form with no idea which box is wrong.
    const label = (path: readonly PropertyKey[]) =>
      path
        .filter((p) => typeof p === 'string')
        .join(' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/^./, (c) => c.toUpperCase())
        .trim();
    const parts = err.issues.slice(0, 3).map((i) => {
      const where = label(i.path);
      return where ? `${where}: ${i.message}` : i.message;
    });
    const more = err.issues.length > 3 ? ` (and ${err.issues.length - 3} more)` : '';
    return res.status(400).json({
      error: parts.join('; ') + more,
      details: err.flatten(),
    });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Unique constraint violation', meta: err.meta });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Record not found' });
    }
  }
  if (err instanceof Error) {
    console.error('[error]', err.stack || err.message);
    return res.status(500).json({ error: err.message });
  }
  console.error('[error]', err);
  return res.status(500).json({ error: 'Internal server error' });
};

export class AppError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const appErrorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message });
  }
  next(err);
};

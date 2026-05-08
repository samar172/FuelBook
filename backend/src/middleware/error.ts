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
    return res.status(400).json({
      error: 'Validation failed',
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

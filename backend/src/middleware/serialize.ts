import { Request, Response, NextFunction } from 'express';

// Express's res.json calls JSON.stringify which can't handle BigInt.
// Override to convert BigInt to string transparently.
export const bigIntJson = (_req: Request, res: Response, next: NextFunction) => {
  const original = res.json.bind(res);
  res.json = (data: unknown) => {
    const safe = JSON.parse(
      JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
    );
    return original(safe);
  };
  next();
};

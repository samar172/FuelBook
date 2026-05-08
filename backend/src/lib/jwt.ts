import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';

export interface JwtPayload {
  userId: string;
  pumpId: string | null;
  role: Role;
  name: string;
}

const SECRET = process.env.JWT_SECRET || 'dev-secret';
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';

export const signToken = (payload: JwtPayload): string => {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN } as jwt.SignOptions);
};

export const verifyToken = (token: string): JwtPayload => {
  return jwt.verify(token, SECRET) as JwtPayload;
};

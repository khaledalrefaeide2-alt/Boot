import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AuthUser, Role } from '../types';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, config.jwt.secret, { expiresIn: config.jwt.expiresIn } as any);
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const payload = jwt.verify(token, config.jwt.secret) as AuthUser & { iat: number; exp: number };
    req.user = { id: payload.id, email: payload.email, name: payload.name, role: payload.role };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

const RANK: Record<Role, number> = { viewer: 1, editor: 2, admin: 3 };

/** Require at least the given role. */
export function requireRole(min: Role) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (RANK[req.user.role] < RANK[min]) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

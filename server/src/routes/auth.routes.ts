import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { q } from '../db';
import { requireAuth, signToken } from '../middleware/auth';
import { asyncH, HttpError } from '../middleware/error';
import { audit } from '../services/audit.service';
import { AuthUser, UserRow } from '../types';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: z.string().min(8),
});

function toAuthUser(u: UserRow): AuthUser {
  return { id: u.id, email: u.email, name: u.name, role: u.role };
}

authRouter.post(
  '/login',
  asyncH(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = q.get<UserRow>('SELECT * FROM users WHERE email = ?', email.toLowerCase());
    if (!user || user.status !== 'active') throw new HttpError(401, 'Invalid credentials');
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) throw new HttpError(401, 'Invalid credentials');
    audit(user.id, 'auth.login', undefined, req.ip);
    const authUser = toAuthUser(user);
    res.json({ token: signToken(authUser), user: authUser });
  })
);

// First registered user becomes admin; subsequent self-registrations are viewers.
authRouter.post(
  '/register',
  asyncH(async (req, res) => {
    const { email, name, password } = registerSchema.parse(req.body);
    const exists = q.get('SELECT id FROM users WHERE email = ?', email.toLowerCase());
    if (exists) throw new HttpError(409, 'Email already registered');
    const count = q.get<{ n: number }>('SELECT COUNT(*) n FROM users')?.n || 0;
    const role = count === 0 ? 'admin' : 'viewer';
    const hash = await bcrypt.hash(password, 10);
    const info = q.run(
      'INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)',
      email.toLowerCase(),
      name,
      hash,
      role
    );
    const user = q.get<UserRow>('SELECT * FROM users WHERE id = ?', info.lastInsertRowid);
    audit(user!.id, 'auth.register', `role=${role}`, req.ip);
    const authUser = toAuthUser(user!);
    res.status(201).json({ token: signToken(authUser), user: authUser });
  })
);

authRouter.get(
  '/me',
  requireAuth,
  asyncH(async (req, res) => {
    res.json({ user: req.user });
  })
);

authRouter.post(
  '/change-password',
  requireAuth,
  asyncH(async (req, res) => {
    const schema = z.object({ current: z.string(), next: z.string().min(8) });
    const { current, next } = schema.parse(req.body);
    const user = q.get<UserRow>('SELECT * FROM users WHERE id = ?', req.user!.id);
    if (!user || !(await bcrypt.compare(current, user.password_hash))) {
      throw new HttpError(400, 'Current password is incorrect');
    }
    const hash = await bcrypt.hash(next, 10);
    q.run('UPDATE users SET password_hash = ?, updated_at = datetime(\'now\') WHERE id = ?', hash, user.id);
    audit(user.id, 'auth.change_password', undefined, req.ip);
    res.json({ ok: true });
  })
);

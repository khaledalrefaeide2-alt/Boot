import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { q } from '../db';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncH, HttpError } from '../middleware/error';
import { audit } from '../services/audit.service';
import { UserRow } from '../types';

export const usersRouter = Router();
usersRouter.use(requireAuth);

const publicUser = (u: UserRow) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  status: u.status,
  createdAt: u.created_at,
});

usersRouter.get(
  '/',
  requireRole('admin'),
  asyncH(async (_req, res) => {
    const users = q.all<UserRow>('SELECT * FROM users ORDER BY created_at DESC');
    res.json({ users: users.map(publicUser) });
  })
);

usersRouter.post(
  '/',
  requireRole('admin'),
  asyncH(async (req, res) => {
    const schema = z.object({
      email: z.string().email(),
      name: z.string().min(2),
      password: z.string().min(8),
      role: z.enum(['admin', 'editor', 'viewer']),
    });
    const body = schema.parse(req.body);
    if (q.get('SELECT id FROM users WHERE email = ?', body.email.toLowerCase())) {
      throw new HttpError(409, 'Email already registered');
    }
    const hash = await bcrypt.hash(body.password, 10);
    const info = q.run(
      'INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)',
      body.email.toLowerCase(),
      body.name,
      hash,
      body.role
    );
    audit(req.user!.id, 'user.create', body.email, req.ip);
    const user = q.get<UserRow>('SELECT * FROM users WHERE id = ?', info.lastInsertRowid);
    res.status(201).json({ user: publicUser(user!) });
  })
);

usersRouter.patch(
  '/:id',
  requireRole('admin'),
  asyncH(async (req, res) => {
    const schema = z.object({
      role: z.enum(['admin', 'editor', 'viewer']).optional(),
      status: z.enum(['active', 'disabled']).optional(),
      name: z.string().min(2).optional(),
    });
    const body = schema.parse(req.body);
    const id = Number(req.params.id);
    const user = q.get<UserRow>('SELECT * FROM users WHERE id = ?', id);
    if (!user) throw new HttpError(404, 'User not found');
    q.run(
      `UPDATE users SET role = COALESCE(?, role), status = COALESCE(?, status),
        name = COALESCE(?, name), updated_at = datetime('now') WHERE id = ?`,
      body.role ?? null,
      body.status ?? null,
      body.name ?? null,
      id
    );
    audit(req.user!.id, 'user.update', `id=${id}`, req.ip);
    const updated = q.get<UserRow>('SELECT * FROM users WHERE id = ?', id);
    res.json({ user: publicUser(updated!) });
  })
);

usersRouter.delete(
  '/:id',
  requireRole('admin'),
  asyncH(async (req, res) => {
    const id = Number(req.params.id);
    if (id === req.user!.id) throw new HttpError(400, 'You cannot delete your own account');
    q.run('DELETE FROM users WHERE id = ?', id);
    audit(req.user!.id, 'user.delete', `id=${id}`, req.ip);
    res.json({ ok: true });
  })
);

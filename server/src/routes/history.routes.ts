import { Router } from 'express';
import { q } from '../db';
import { requireAuth } from '../middleware/auth';
import { asyncH } from '../middleware/error';

export const historyRouter = Router();
historyRouter.use(requireAuth);

historyRouter.get(
  '/',
  asyncH(async (req, res) => {
    const includeDeleted = req.query.deleted === '1';
    const type = req.query.type as string | undefined;
    const rows = q.all(
      `SELECT s.*, u.email AS user_email FROM searches s
       LEFT JOIN users u ON u.id = s.user_id
       WHERE (? = 1 OR s.deleted = 0) AND (? IS NULL OR s.type = ?)
       ORDER BY s.created_at DESC LIMIT 200`,
      includeDeleted ? 1 : 0,
      type ?? null,
      type ?? null
    );
    res.json({ searches: rows });
  })
);

historyRouter.post(
  '/:id/favorite',
  asyncH(async (req, res) => {
    const id = Number(req.params.id);
    q.run(`UPDATE searches SET favorite = CASE favorite WHEN 1 THEN 0 ELSE 1 END WHERE id = ?`, id);
    res.json({ ok: true });
  })
);

historyRouter.delete(
  '/:id',
  asyncH(async (req, res) => {
    q.run(`UPDATE searches SET deleted = 1 WHERE id = ?`, Number(req.params.id));
    res.json({ ok: true });
  })
);

historyRouter.post(
  '/:id/restore',
  asyncH(async (req, res) => {
    q.run(`UPDATE searches SET deleted = 0 WHERE id = ?`, Number(req.params.id));
    res.json({ ok: true });
  })
);

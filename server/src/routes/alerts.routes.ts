import { Router } from 'express';
import { z } from 'zod';
import { q } from '../db';
import { requireAuth } from '../middleware/auth';
import { asyncH } from '../middleware/error';
import { evaluateAlerts } from '../services/alerts.service';

export const alertsRouter = Router();
alertsRouter.use(requireAuth);

alertsRouter.get(
  '/',
  asyncH(async (req, res) => {
    const alerts = q.all(`SELECT * FROM alerts WHERE user_id = ? ORDER BY created_at DESC`, req.user!.id);
    res.json({ alerts });
  })
);

alertsRouter.post(
  '/',
  asyncH(async (req, res) => {
    const schema = z.object({
      name: z.string().min(1),
      targetType: z.enum(['keyword', 'hashtag', 'page', 'engagement']),
      target: z.string().min(1),
      metric: z.enum(['engagement', 'mentions', 'trending_score', 'growth']).default('engagement'),
      operator: z.enum(['>', '<', '>=', '<=']).default('>'),
      threshold: z.number(),
    });
    const b = schema.parse(req.body);
    const info = q.run(
      `INSERT INTO alerts (user_id, name, target_type, target, metric, operator, threshold)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      req.user!.id, b.name, b.targetType, b.target, b.metric, b.operator, b.threshold
    );
    res.status(201).json({ alert: q.get(`SELECT * FROM alerts WHERE id = ?`, info.lastInsertRowid) });
  })
);

alertsRouter.patch(
  '/:id',
  asyncH(async (req, res) => {
    const schema = z.object({ active: z.boolean().optional(), threshold: z.number().optional() });
    const b = schema.parse(req.body);
    q.run(
      `UPDATE alerts SET active = COALESCE(?, active), threshold = COALESCE(?, threshold) WHERE id = ? AND user_id = ?`,
      b.active === undefined ? null : b.active ? 1 : 0,
      b.threshold ?? null,
      Number(req.params.id),
      req.user!.id
    );
    res.json({ alert: q.get(`SELECT * FROM alerts WHERE id = ?`, Number(req.params.id)) });
  })
);

alertsRouter.delete(
  '/:id',
  asyncH(async (req, res) => {
    q.run(`DELETE FROM alerts WHERE id = ? AND user_id = ?`, Number(req.params.id), req.user!.id);
    res.json({ ok: true });
  })
);

// Manually evaluate alerts against stored metrics (also runs on a timer).
alertsRouter.post(
  '/evaluate',
  asyncH(async (req, res) => {
    const triggered = evaluateAlerts(req.user!.id);
    res.json({ triggered });
  })
);

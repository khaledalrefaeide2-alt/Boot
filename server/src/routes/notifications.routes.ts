import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { asyncH } from '../middleware/error';
import { listNotifications, markAllRead, markRead } from '../services/notification.service';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get(
  '/',
  asyncH(async (req, res) => {
    const items = listNotifications(req.user!.id);
    const unread = items.filter((n: any) => !n.read).length;
    res.json({ notifications: items, unread });
  })
);

notificationsRouter.post(
  '/:id/read',
  asyncH(async (req, res) => {
    markRead(Number(req.params.id));
    res.json({ ok: true });
  })
);

notificationsRouter.post(
  '/read-all',
  asyncH(async (req, res) => {
    markAllRead(req.user!.id);
    res.json({ ok: true });
  })
);

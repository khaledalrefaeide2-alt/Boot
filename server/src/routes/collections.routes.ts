import { Router } from 'express';
import { z } from 'zod';
import { q } from '../db';
import { requireAuth } from '../middleware/auth';
import { asyncH } from '../middleware/error';

export const collectionsRouter = Router();
collectionsRouter.use(requireAuth);

collectionsRouter.get(
  '/',
  asyncH(async (req, res) => {
    const cols = q.all(
      `SELECT c.*, (SELECT COUNT(*) FROM collection_items ci WHERE ci.collection_id = c.id) AS item_count
       FROM collections c WHERE c.user_id = ? ORDER BY c.created_at DESC`,
      req.user!.id
    );
    res.json({ collections: cols });
  })
);

collectionsRouter.post(
  '/',
  asyncH(async (req, res) => {
    const schema = z.object({
      name: z.string().min(1),
      kind: z.enum(['hashtag', 'keyword', 'report', 'search', 'mixed']).default('mixed'),
      color: z.string().optional(),
    });
    const b = schema.parse(req.body);
    const info = q.run(
      `INSERT INTO collections (user_id, name, kind, color) VALUES (?, ?, ?, ?)`,
      req.user!.id, b.name, b.kind, b.color || '#2563EB'
    );
    res.status(201).json({ collection: q.get(`SELECT * FROM collections WHERE id = ?`, info.lastInsertRowid) });
  })
);

collectionsRouter.get(
  '/:id/items',
  asyncH(async (req, res) => {
    const items = q.all(`SELECT * FROM collection_items WHERE collection_id = ? ORDER BY created_at DESC`, Number(req.params.id));
    res.json({ items });
  })
);

collectionsRouter.post(
  '/:id/items',
  asyncH(async (req, res) => {
    const schema = z.object({
      itemType: z.enum(['hashtag', 'keyword', 'report', 'search', 'post']),
      itemRef: z.string(),
      label: z.string().optional(),
    });
    const b = schema.parse(req.body);
    const info = q.run(
      `INSERT INTO collection_items (collection_id, item_type, item_ref, label) VALUES (?, ?, ?, ?)`,
      Number(req.params.id), b.itemType, b.itemRef, b.label || b.itemRef
    );
    res.status(201).json({ item: q.get(`SELECT * FROM collection_items WHERE id = ?`, info.lastInsertRowid) });
  })
);

collectionsRouter.delete(
  '/:id',
  asyncH(async (req, res) => {
    q.run(`DELETE FROM collections WHERE id = ? AND user_id = ?`, Number(req.params.id), req.user!.id);
    res.json({ ok: true });
  })
);

collectionsRouter.delete(
  '/items/:itemId',
  asyncH(async (req, res) => {
    q.run(`DELETE FROM collection_items WHERE id = ?`, Number(req.params.itemId));
    res.json({ ok: true });
  })
);

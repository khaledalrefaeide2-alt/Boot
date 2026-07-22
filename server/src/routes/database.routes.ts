import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { getDb, initSchema, q } from '../db';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncH } from '../middleware/error';
import { audit } from '../services/audit.service';

export const databaseRouter = Router();
databaseRouter.use(requireAuth);

const TABLES = [
  'users', 'settings', 'searches', 'keyword_metrics', 'hashtag_metrics',
  'posts', 'collections', 'collection_items', 'alerts', 'reports',
  'notifications', 'audit_logs', 'api_logs',
];

databaseRouter.get(
  '/health',
  asyncH(async (_req, res) => {
    const counts: Record<string, number> = {};
    for (const t of TABLES) counts[t] = q.get<{ n: number }>(`SELECT COUNT(*) n FROM ${t}`)?.n || 0;
    let sizeBytes = 0;
    try {
      sizeBytes = fs.statSync(config.db.sqlitePath).size;
    } catch { /* db not created yet */ }
    const integrity = q.get<{ integrity_check: string }>(`PRAGMA integrity_check`);
    res.json({
      client: config.db.client,
      path: config.db.sqlitePath,
      sizeBytes,
      sizeMb: +(sizeBytes / 1048576).toFixed(2),
      tables: counts,
      totalRows: Object.values(counts).reduce((a, b) => a + b, 0),
      integrity: integrity?.integrity_check || 'unknown',
    });
  })
);

databaseRouter.post(
  '/initialize',
  requireRole('admin'),
  asyncH(async (req, res) => {
    initSchema();
    audit(req.user!.id, 'db.initialize', undefined, req.ip);
    res.json({ ok: true });
  })
);

databaseRouter.post(
  '/optimize',
  requireRole('admin'),
  asyncH(async (req, res) => {
    getDb().exec('VACUUM; ANALYZE;');
    audit(req.user!.id, 'db.optimize', undefined, req.ip);
    res.json({ ok: true });
  })
);

// Export the whole database as JSON.
databaseRouter.get(
  '/export',
  requireRole('editor'),
  asyncH(async (_req, res) => {
    const dump: Record<string, any[]> = {};
    for (const t of TABLES) dump[t] = q.all(`SELECT * FROM ${t}`);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="fbintel-export-${Date.now()}.json"`);
    res.json({ exportedAt: new Date().toISOString(), data: dump });
  })
);

// Binary backup — copies the SQLite file.
databaseRouter.get(
  '/backup',
  requireRole('admin'),
  asyncH(async (req, res) => {
    const backupDir = path.join(path.dirname(config.db.sqlitePath), 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const dest = path.join(backupDir, `backup-${Date.now()}.db`);
    await getDb().backup(dest);
    audit(req.user!.id, 'db.backup', dest, req.ip);
    res.download(dest);
  })
);

databaseRouter.post(
  '/clear-cache',
  requireRole('editor'),
  asyncH(async (req, res) => {
    // Cached discovered posts + api logs are treated as cache.
    const posts = q.run(`DELETE FROM posts`).changes;
    const logs = q.run(`DELETE FROM api_logs`).changes;
    audit(req.user!.id, 'db.clear_cache', `posts=${posts},logs=${logs}`, req.ip);
    res.json({ ok: true, cleared: { posts, logs } });
  })
);

databaseRouter.post(
  '/reset',
  requireRole('admin'),
  asyncH(async (req, res) => {
    // Wipe analytics data but keep users + settings.
    for (const t of ['searches', 'keyword_metrics', 'hashtag_metrics', 'posts',
      'collection_items', 'collections', 'alerts', 'reports', 'notifications', 'api_logs']) {
      q.run(`DELETE FROM ${t}`);
    }
    audit(req.user!.id, 'db.reset', undefined, req.ip);
    res.json({ ok: true });
  })
);

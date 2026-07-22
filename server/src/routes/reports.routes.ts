import { Router } from 'express';
import { z } from 'zod';
import { q } from '../db';
import { requireAuth } from '../middleware/auth';
import { asyncH } from '../middleware/error';
import { audit } from '../services/audit.service';
import { buildReportRows, toCsv } from '../services/report.service';

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

const TEMPLATES = ['executive', 'trend', 'hashtag', 'keyword', 'engagement', 'competitor'] as const;

reportsRouter.get(
  '/',
  asyncH(async (req, res) => {
    const reports = q.all(
      `SELECT r.*, u.email AS user_email FROM reports r
       LEFT JOIN users u ON u.id = r.user_id ORDER BY r.created_at DESC LIMIT 100`
    );
    res.json({ reports, templates: TEMPLATES });
  })
);

reportsRouter.post(
  '/',
  asyncH(async (req, res) => {
    const schema = z.object({
      title: z.string().min(1),
      template: z.enum(TEMPLATES),
      format: z.enum(['pdf', 'excel', 'csv']),
      params: z.record(z.string(), z.any()).optional(),
    });
    const b = schema.parse(req.body);
    const info = q.run(
      `INSERT INTO reports (user_id, title, template, format, params, status)
       VALUES (?, ?, ?, ?, ?, 'ready')`,
      req.user!.id, b.title, b.template, b.format, JSON.stringify(b.params || {})
    );
    audit(req.user!.id, 'report.create', `${b.template}/${b.format}`, req.ip);
    res.status(201).json({ report: q.get(`SELECT * FROM reports WHERE id = ?`, info.lastInsertRowid) });
  })
);

// Download report data. CSV is generated server-side; PDF/Excel are delivered
// as structured JSON/CSV payloads the client renders/exports.
reportsRouter.get(
  '/:id/download',
  asyncH(async (req, res) => {
    const report = q.get<any>(`SELECT * FROM reports WHERE id = ?`, Number(req.params.id));
    if (!report) return res.status(404).json({ error: 'Report not found' });
    const rows = buildReportRows(report.template);
    if (report.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${slug(report.title)}.csv"`);
      return res.send(toCsv(rows));
    }
    // For pdf/excel the client library renders from this dataset.
    res.json({ report, rows });
  })
);

reportsRouter.delete(
  '/:id',
  asyncH(async (req, res) => {
    q.run(`DELETE FROM reports WHERE id = ? AND user_id = ?`, Number(req.params.id), req.user!.id);
    res.json({ ok: true });
  })
);

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

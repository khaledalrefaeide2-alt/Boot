import { q } from '../db';

export function audit(userId: number | null, action: string, detail?: string, ip?: string) {
  q.run(
    `INSERT INTO audit_logs (user_id, action, detail, ip) VALUES (?, ?, ?, ?)`,
    userId,
    action,
    detail || null,
    ip || null
  );
}

export function recentAudit(limit = 100) {
  return q.all(
    `SELECT a.*, u.email AS user_email FROM audit_logs a
     LEFT JOIN users u ON u.id = a.user_id
     ORDER BY a.created_at DESC LIMIT ?`,
    limit
  );
}

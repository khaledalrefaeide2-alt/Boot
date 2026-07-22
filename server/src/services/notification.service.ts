import { q } from '../db';

export type NotificationType = 'info' | 'warning' | 'error' | 'success' | 'trend';

export function notify(userId: number | null, type: NotificationType, title: string, body?: string) {
  q.run(
    `INSERT INTO notifications (user_id, type, title, body) VALUES (?, ?, ?, ?)`,
    userId,
    type,
    title,
    body || null
  );
}

export function listNotifications(userId: number, limit = 50) {
  return q.all(
    `SELECT * FROM notifications WHERE user_id = ? OR user_id IS NULL
     ORDER BY created_at DESC LIMIT ?`,
    userId,
    limit
  );
}

export function markRead(id: number) {
  q.run(`UPDATE notifications SET read = 1 WHERE id = ?`, id);
}

export function markAllRead(userId: number) {
  q.run(`UPDATE notifications SET read = 1 WHERE user_id = ? OR user_id IS NULL`, userId);
}

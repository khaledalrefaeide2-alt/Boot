import { q } from '../db';

export interface ApiCall {
  endpoint: string;
  method: string;
  statusCode: number;
  durationMs: number;
  ok: boolean;
  error?: string;
}

export function logApiCall(c: ApiCall): void {
  q.run(
    `INSERT INTO api_logs (endpoint, method, status_code, duration_ms, ok, error)
     VALUES (?, ?, ?, ?, ?, ?)`,
    c.endpoint,
    c.method,
    c.statusCode,
    c.durationMs,
    c.ok ? 1 : 0,
    c.error || null
  );
}

export function recentApiLogs(limit = 50) {
  return q.all(
    `SELECT * FROM api_logs ORDER BY created_at DESC LIMIT ?`,
    limit
  );
}

export function apiUsageStats() {
  const total = q.get<{ n: number }>(`SELECT COUNT(*) n FROM api_logs`)?.n || 0;
  const last24 =
    q.get<{ n: number }>(
      `SELECT COUNT(*) n FROM api_logs WHERE created_at >= datetime('now','-1 day')`
    )?.n || 0;
  const errors =
    q.get<{ n: number }>(`SELECT COUNT(*) n FROM api_logs WHERE ok = 0`)?.n || 0;
  const avg =
    q.get<{ a: number }>(`SELECT AVG(duration_ms) a FROM api_logs`)?.a || 0;
  return {
    total,
    last24h: last24,
    errors,
    avgDurationMs: Math.round(avg),
    errorRate: total ? +((errors / total) * 100).toFixed(1) : 0,
  };
}

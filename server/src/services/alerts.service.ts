import { q } from '../db';
import { notify } from './notification.service';

interface AlertRow {
  id: number;
  user_id: number;
  name: string;
  target_type: string;
  target: string;
  metric: string;
  operator: string;
  threshold: number;
  active: number;
}

const METRIC_TABLE: Record<string, { table: string; col: string; key: string }> = {
  engagement: { table: 'keyword_metrics', col: 'engagement', key: 'keyword' },
  mentions: { table: 'keyword_metrics', col: 'mentions', key: 'keyword' },
  trending_score: { table: 'hashtag_metrics', col: 'trending_score', key: 'hashtag' },
  growth: { table: 'hashtag_metrics', col: 'growth', key: 'hashtag' },
};

function compare(a: number, op: string, b: number): boolean {
  switch (op) {
    case '>': return a > b;
    case '<': return a < b;
    case '>=': return a >= b;
    case '<=': return a <= b;
    default: return false;
  }
}

/** Evaluate a user's active alerts against the latest stored metric snapshots. */
export function evaluateAlerts(userId: number): AlertRow[] {
  const alerts = q.all<AlertRow>(`SELECT * FROM alerts WHERE user_id = ? AND active = 1`, userId);
  const triggered: AlertRow[] = [];
  for (const alert of alerts) {
    const m = METRIC_TABLE[alert.metric];
    if (!m) continue;
    const latest = q.get<{ v: number }>(
      `SELECT ${m.col} v FROM ${m.table} WHERE ${m.key} = ? ORDER BY captured_at DESC LIMIT 1`,
      alert.target.startsWith('#') || alert.target_type === 'hashtag'
        ? (alert.target.startsWith('#') ? alert.target : `#${alert.target}`)
        : alert.target
    );
    if (!latest) continue;
    if (compare(latest.v, alert.operator, alert.threshold)) {
      q.run(`UPDATE alerts SET last_triggered_at = datetime('now') WHERE id = ?`, alert.id);
      notify(userId, 'trend', `Alert: ${alert.name}`,
        `${alert.target} ${alert.metric} is ${latest.v} (${alert.operator} ${alert.threshold})`);
      triggered.push(alert);
    }
  }
  return triggered;
}

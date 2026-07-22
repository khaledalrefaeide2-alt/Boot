import { q } from '../db';

/** Build a tabular dataset for a report template from stored analytics data. */
export function buildReportRows(template: string): Record<string, any>[] {
  switch (template) {
    case 'hashtag':
      return q.all(
        `SELECT hashtag, SUM(mentions) mentions, SUM(engagement) engagement,
                MAX(trending_score) trending_score, AVG(growth) growth
         FROM hashtag_metrics GROUP BY hashtag ORDER BY engagement DESC`
      );
    case 'keyword':
      return q.all(
        `SELECT keyword, SUM(mentions) mentions, SUM(engagement) engagement,
                SUM(reach) reach, AVG(sentiment) sentiment
         FROM keyword_metrics GROUP BY keyword ORDER BY engagement DESC`
      );
    case 'engagement':
      return q.all(
        `SELECT page_name, content, likes, comments, shares, reactions,
                engagement_rate, published_at
         FROM posts ORDER BY engagement_rate DESC LIMIT 200`
      );
    case 'competitor':
      return q.all(
        `SELECT page_name, COUNT(*) posts, SUM(reactions) reactions,
                SUM(comments) comments, SUM(shares) shares, AVG(engagement_rate) avg_engagement
         FROM posts GROUP BY page_name ORDER BY reactions DESC`
      );
    case 'trend':
      return q.all(
        `SELECT date(captured_at) day, SUM(engagement) engagement, SUM(mentions) mentions
         FROM keyword_metrics GROUP BY day ORDER BY day`
      );
    case 'executive':
    default:
      return [
        { metric: 'Total searches', value: q.get<{ n: number }>(`SELECT COUNT(*) n FROM searches WHERE deleted=0`)?.n || 0 },
        { metric: 'Tracked keywords', value: q.get<{ n: number }>(`SELECT COUNT(DISTINCT keyword) n FROM keyword_metrics`)?.n || 0 },
        { metric: 'Tracked hashtags', value: q.get<{ n: number }>(`SELECT COUNT(DISTINCT hashtag) n FROM hashtag_metrics`)?.n || 0 },
        { metric: 'Discovered posts', value: q.get<{ n: number }>(`SELECT COUNT(*) n FROM posts`)?.n || 0 },
        { metric: 'Avg engagement rate', value: +(q.get<{ a: number }>(`SELECT AVG(engagement_rate) a FROM posts`)?.a || 0).toFixed(2) },
        { metric: 'API requests', value: q.get<{ n: number }>(`SELECT COUNT(*) n FROM api_logs`)?.n || 0 },
      ];
  }
}

/** Serialize rows to CSV with proper escaping. */
export function toCsv(rows: Record<string, any>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v: any) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const r of rows) lines.push(headers.map((h) => esc(r[h])).join(','));
  return lines.join('\n');
}

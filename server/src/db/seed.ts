import bcrypt from 'bcryptjs';
import { config } from '../config';
import { initSchema, q } from '.';
import { MockProvider } from '../providers/mockProvider';
import { snapshotHashtag, snapshotKeyword } from '../services/search.service';
import { notify } from '../services/notification.service';

/**
 * Seed the database with an admin user and a rich set of demo analytics so the
 * dashboard and explorers are populated on first launch.
 */
async function seed() {
  initSchema();

  // Admin user
  const email = config.seed.adminEmail.toLowerCase();
  if (!q.get('SELECT id FROM users WHERE email = ?', email)) {
    const hash = await bcrypt.hash(config.seed.adminPassword, 10);
    q.run(
      'INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)',
      email, 'Platform Admin', hash, 'admin'
    );
    console.log(`Created admin: ${email} / ${config.seed.adminPassword}`);
  }
  const admin = q.get<{ id: number }>('SELECT id FROM users WHERE email = ?', email)!;

  // Demo editor + viewer
  for (const [e, name, role] of [
    ['editor@fbintel.local', 'Content Editor', 'editor'],
    ['viewer@fbintel.local', 'Read Only', 'viewer'],
  ] as const) {
    if (!q.get('SELECT id FROM users WHERE email = ?', e)) {
      const hash = await bcrypt.hash('Password123!', 10);
      q.run('INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)', e, name, hash, role);
    }
  }

  const provider = new MockProvider();
  const keywords = ['sustainability', 'ai marketing', 'world cup', 'black friday', 'electric vehicles', 'crypto', 'ramadan', 'gaming'];
  const hashtags = ['#worldcup', '#blackfriday', '#ai', '#sustainability', '#fitness', '#travel', '#foodie', '#crypto'];

  // Build a few days of history for realistic trends.
  for (let day = 6; day >= 0; day--) {
    for (const kw of keywords) {
      const ins = await provider.keywordInsight(kw, {});
      q.run(
        `INSERT INTO keyword_metrics (keyword, mentions, engagement, reach, sentiment, captured_at)
         VALUES (?, ?, ?, ?, ?, datetime('now', ?))`,
        kw,
        Math.round(ins.mentions * (0.7 + Math.random() * 0.6)),
        Math.round(ins.engagement * (0.7 + Math.random() * 0.6)),
        ins.reach,
        ins.sentiment,
        `-${day} day`
      );
    }
    for (const ht of hashtags) {
      const ins = await provider.hashtagInsight(ht, {});
      q.run(
        `INSERT INTO hashtag_metrics (hashtag, mentions, engagement, trending_score, growth, captured_at)
         VALUES (?, ?, ?, ?, ?, datetime('now', ?))`,
        ins.hashtag,
        Math.round(ins.mentions * (0.6 + Math.random() * 0.8)),
        Math.round(ins.engagement * (0.6 + Math.random() * 0.8)),
        ins.trendingScore,
        ins.growth,
        `-${day} day`
      );
    }
  }

  // Discovered posts
  const posts = await provider.searchContent('#worldcup', { limit: 40, sort: 'viral' });
  const insert = `INSERT OR IGNORE INTO posts
    (external_id, page_name, page_id, content, url, media_url, language,
     likes, comments, shares, reactions, engagement_rate, matched_hashtag, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  for (const p of posts) {
    q.run(insert, p.externalId, p.pageName, p.pageId, p.content, p.url, p.mediaUrl || null,
      p.language, p.likes, p.comments, p.shares, p.reactions, p.engagementRate, p.matchedHashtag || null, p.publishedAt);
  }

  // Sample searches
  for (const kw of keywords.slice(0, 5)) {
    q.run(
      `INSERT INTO searches (user_id, type, query, results_count, api_calls, created_at)
       VALUES (?, 'keyword', ?, ?, 1, datetime('now', ?))`,
      admin.id, kw, Math.floor(Math.random() * 5000), `-${Math.floor(Math.random() * 5)} day`
    );
  }

  // Default settings
  if (!q.get('SELECT key FROM settings WHERE key = ?', 'api.provider')) {
    q.run(`INSERT INTO settings (key, value) VALUES ('api.provider', 'mock')`);
    q.run(`INSERT INTO settings (key, value) VALUES ('general.appName', 'FB Intel')`);
    q.run(`INSERT INTO settings (key, value) VALUES ('general.theme', 'system')`);
    q.run(`INSERT INTO settings (key, value) VALUES ('general.language', 'en')`);
  }

  // Sample collection + alert + notification
  if (!q.get('SELECT id FROM collections LIMIT 1')) {
    const c = q.run(`INSERT INTO collections (user_id, name, kind, color) VALUES (?, 'Priority Hashtags', 'hashtag', '#3B82F6')`, admin.id);
    q.run(`INSERT INTO collection_items (collection_id, item_type, item_ref, label) VALUES (?, 'hashtag', '#worldcup', '#worldcup')`, c.lastInsertRowid);
  }
  if (!q.get('SELECT id FROM alerts LIMIT 1')) {
    q.run(
      `INSERT INTO alerts (user_id, name, target_type, target, metric, operator, threshold)
       VALUES (?, 'World Cup surge', 'hashtag', '#worldcup', 'trending_score', '>', 70)`,
      admin.id
    );
  }
  notify(admin.id, 'success', 'Welcome to FB Intel', 'Your platform has been seeded with demo analytics.');
  notify(admin.id, 'trend', 'New trend detected', '#worldcup is trending across monitored pages.');

  console.log('Seed complete.');
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});

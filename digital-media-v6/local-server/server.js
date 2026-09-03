#!/usr/bin/env node
'use strict';

/*
 * الإعلام الرقمي — Local database server
 * ------------------------------------
 * Zero-dependency local server that stores extracted/monitored Facebook
 * posts in a SQLite database file on this computer (fbx-posts.db, created
 * next to this script). Uses Node's built-in sqlite module — no npm install.
 *
 * Run:   node server.js          (Node.js 22.5 or newer)
 * Stop:  Ctrl+C
 */

const http = require('node:http');
const path = require('node:path');

// The built-in node:sqlite module only exists (and only works without an
// experimental flag) from Node 22.13 onward. Fail loudly and clearly here,
// otherwise the user just sees an unexplained "Cannot find module" crash.
function fatal(lines) {
  console.error('');
  for (const l of lines) console.error('  ' + l);
  console.error('');
  process.exit(1);
}
const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 13)) {
  fatal([
    '[ ERROR ]  Your Node.js version is too old.',
    '',
    `Installed version : v${process.versions.node}`,
    'Required version  : 22.13 or newer',
    '',
    'Download the LTS version from https://nodejs.org, install it,',
    'then run this again.'
  ]);
}
// Node prints an alarming-looking "SQLite is an experimental feature" warning
// on some versions. The API we use is stable in practice and this window is
// shown to non-technical users, so hide that one warning and keep the rest.
process.removeAllListeners('warning');   // drops Node's own printing listener
process.on('warning', w => {
  if (w.name === 'ExperimentalWarning' && /SQLite/i.test(w.message)) return;
  console.warn(`${w.name}: ${w.message}`);
});

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (err) {
  fatal([
    '[ ERROR ]  This Node.js build has no built-in SQLite support.',
    '',
    `Installed version : v${process.versions.node}`,
    '',
    'Install the official LTS build from https://nodejs.org and run this again.',
    `Details: ${err.message}`
  ]);
}

const PORT = parseInt(process.env.PORT, 10) || 3300;
// DB_PATH قابل للتجاوز عبر متغيّر بيئة — ضروري على استضافة سحابية حيث
// يُعاد بناء مجلّد الكود عند كل نشر فيُمحى أيّ ملف بداخله؛ ضبط DB_PATH
// على مسار قرص دائم (persistent disk) هناك يحافظ على البيانات بين عمليات
// النشر. الافتراضي (بجانب هذا الملف) يبقى كما هو للاستخدام المحلي.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'fbx-posts.db');

const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    key       TEXT PRIMARY KEY,
    text      TEXT,
    url       TEXT,
    ts        INTEGER,
    author    TEXT,
    avatar    TEXT,
    media     TEXT,
    likes     INTEGER DEFAULT 0,
    comments  INTEGER DEFAULT 0,
    shares    INTEGER DEFAULT 0,
    source    TEXT,
    sentiment TEXT,
    emotion   TEXT,
    intent    TEXT,
    domain    TEXT,
    severity  INTEGER DEFAULT 0,
    action    TEXT,
    flagged   INTEGER DEFAULT 0,
    analysis  TEXT,
    saved_at  INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_posts_ts ON posts (ts DESC);

  -- دليل الصفحات/الحسابات المرشّحة للرصد (يُستورد عادةً من ملف Excel).
  -- key هو الرابط أو المعرّف بعد التطبيع، فيستحيل تكرار الصفحة نفسها.
  CREATE TABLE IF NOT EXISTS pages (
    key       TEXT PRIMARY KEY,
    name      TEXT,
    url       TEXT,
    handle    TEXT,
    platform  TEXT,
    category  TEXT,
    notes     TEXT,
    selected  INTEGER DEFAULT 0,
    added_at  INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_pages_platform ON pages (platform);
  CREATE INDEX IF NOT EXISTS idx_pages_selected ON pages (selected);
`);

// ترقية غير مدمّرة للجداول القديمة: أضف الأعمدة الناقصة إن وُجد جدول سابق
for (const col of [
  ['sentiment', 'TEXT'], ['emotion', 'TEXT'], ['intent', 'TEXT'], ['domain', 'TEXT'],
  ['severity', 'INTEGER DEFAULT 0'], ['action', 'TEXT'], ['flagged', 'INTEGER DEFAULT 0'], ['analysis', 'TEXT']
]) {
  try { db.exec(`ALTER TABLE posts ADD COLUMN ${col[0]} ${col[1]}`); } catch (_) { /* موجود مسبقاً */ }
}

const upsert = db.prepare(`
  INSERT INTO posts (key, text, url, ts, author, avatar, media, likes, comments, shares, source,
                     sentiment, emotion, intent, domain, severity, action, flagged, analysis, saved_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET
    likes = excluded.likes,
    comments = excluded.comments,
    shares = excluded.shares,
    sentiment = excluded.sentiment,
    emotion = excluded.emotion,
    intent = excluded.intent,
    domain = excluded.domain,
    severity = excluded.severity,
    action = excluded.action,
    flagged = excluded.flagged,
    analysis = excluded.analysis
`);
const countStmt = db.prepare('SELECT COUNT(*) AS n FROM posts');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Chrome's Private Network Access preflight (public site -> localhost)
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
}

function json(res, code, body) {
  cors(res);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => {
      data += c;
      if (data.length > 20 * 1024 * 1024) { reject(new Error('body too large')); req.destroy(); }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); return res.end(); }

  try {
    if (u.pathname === '/api/health' && req.method === 'GET') {
      return json(res, 200, { ok: true, name: 'fbx-local-db', total: countStmt.get().n, db: DB_PATH });
    }

    if (u.pathname === '/api/posts' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req) || '{}');
      const posts = Array.isArray(body.posts) ? body.posts : [];
      let saved = 0;
      for (const p of posts) {
        if (!p || typeof p !== 'object') continue;
        const key = String(p.key || p.url || '').trim();
        if (!key) continue;
        upsert.run(
          key,
          String(p.text || ''),
          String(p.url || ''),
          Number.isFinite(p.ts) ? p.ts : null,
          String(p.author || ''),
          String(p.avatar || ''),
          String(p.media || ''),
          Number(p.likes) || 0,
          Number(p.comments) || 0,
          Number(p.shares) || 0,
          String(p.source || ''),
          String(p.sentiment || ''),
          String(p.emotion || ''),
          String(p.intent || ''),
          String(p.domain || ''),
          Number(p.severity) || 0,
          String(p.action || ''),
          Number(p.flagged) ? 1 : 0,
          String(p.analysis || ''),
          Date.now()
        );
        saved++;
      }
      return json(res, 200, { ok: true, saved, total: countStmt.get().n });
    }

    if (u.pathname === '/api/posts' && req.method === 'GET') {
      const limit = Math.min(500, Math.max(1, parseInt(u.searchParams.get('limit'), 10) || 100));
      const offset = Math.max(0, parseInt(u.searchParams.get('offset'), 10) || 0);
      const q = (u.searchParams.get('q') || '').trim();
      let rows;
      if (q) {
        rows = db.prepare(`
          SELECT * FROM posts
          WHERE text LIKE ? OR author LIKE ?
          ORDER BY COALESCE(ts, saved_at) DESC
          LIMIT ? OFFSET ?
        `).all(`%${q}%`, `%${q}%`, limit, offset);
      } else {
        rows = db.prepare(`
          SELECT * FROM posts
          ORDER BY COALESCE(ts, saved_at) DESC
          LIMIT ? OFFSET ?
        `).all(limit, offset);
      }
      return json(res, 200, { ok: true, total: countStmt.get().n, posts: rows });
    }

    if (u.pathname === '/api/posts' && req.method === 'DELETE') {
      db.exec('DELETE FROM posts');
      return json(res, 200, { ok: true, total: 0 });
    }

    if (u.pathname === '/api/stats' && req.method === 'GET') {
      const s = db.prepare(`
        SELECT COUNT(*) AS total,
               COALESCE(SUM(likes), 0) AS likes,
               COALESCE(SUM(comments), 0) AS comments,
               COALESCE(SUM(shares), 0) AS shares,
               MAX(saved_at) AS last_saved_at
        FROM posts
      `).get();
      return json(res, 200, { ok: true, ...s });
    }

    /* ===== دليل الصفحات/الحسابات ===== */

    // حفظ دفعة صفحات (من استيراد Excel أو إضافة يدوية).
    // التكرار مستحيل: نفس المفتاح يُحدَّث بدل أن يُضاف، ويُحافَظ على حالة
    // «مُختارة» و«وقت الإضافة» السابقين حتى لا يمحو استيرادٌ جديد اختياراتك.
    if (u.pathname === '/api/pages' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req) || '{}');
      const list = Array.isArray(body.pages) ? body.pages : [];
      const stmt = db.prepare(`
        INSERT INTO pages (key, name, url, handle, platform, category, notes, selected, added_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          name     = COALESCE(NULLIF(excluded.name, ''), pages.name),
          url      = COALESCE(NULLIF(excluded.url, ''), pages.url),
          handle   = COALESCE(NULLIF(excluded.handle, ''), pages.handle),
          platform = COALESCE(NULLIF(excluded.platform, ''), pages.platform),
          category = COALESCE(NULLIF(excluded.category, ''), pages.category),
          notes    = COALESCE(NULLIF(excluded.notes, ''), pages.notes)
      `);
      let saved = 0;
      const now = Date.now();
      db.exec('BEGIN');
      try {
        for (const p of list) {
          const key = String(p.key || p.url || p.handle || '').trim();
          if (!key) continue;
          stmt.run(key, String(p.name || ''), String(p.url || ''), String(p.handle || ''),
                   String(p.platform || ''), String(p.category || ''), String(p.notes || ''),
                   p.selected ? 1 : 0, now);
          saved++;
        }
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
      const total = db.prepare('SELECT COUNT(*) AS n FROM pages').get().n;
      return json(res, 200, { ok: true, saved, total });
    }

    if (u.pathname === '/api/pages' && req.method === 'GET') {
      const platform = (u.searchParams.get('platform') || '').trim();
      const q = (u.searchParams.get('q') || '').trim();
      const selectedOnly = u.searchParams.get('selected') === '1';
      const where = [], args = [];
      if (platform) { where.push('platform = ?'); args.push(platform); }
      if (selectedOnly) where.push('selected = 1');
      if (q) { where.push('(name LIKE ? OR url LIKE ? OR handle LIKE ? OR category LIKE ?)');
               const like = `%${q}%`; args.push(like, like, like, like); }
      const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const rows = db.prepare(`SELECT * FROM pages ${clause} ORDER BY selected DESC, name COLLATE NOCASE`).all(...args);
      const total = db.prepare('SELECT COUNT(*) AS n FROM pages').get().n;
      return json(res, 200, { ok: true, total, count: rows.length, pages: rows });
    }

    // تحديث الاختيار: {keys:[...], selected:true|false} أو {selectAll:false} لمسح كل الاختيارات
    if (u.pathname === '/api/pages/select' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req) || '{}');
      if (body.selectAll === false) {
        db.exec('UPDATE pages SET selected = 0');
        return json(res, 200, { ok: true, selected: 0 });
      }
      const keys = Array.isArray(body.keys) ? body.keys : [];
      const val = body.selected ? 1 : 0;
      const stmt = db.prepare('UPDATE pages SET selected = ? WHERE key = ?');
      db.exec('BEGIN');
      try { for (const k of keys) stmt.run(val, String(k)); db.exec('COMMIT'); }
      catch (e) { db.exec('ROLLBACK'); throw e; }
      const n = db.prepare('SELECT COUNT(*) AS n FROM pages WHERE selected = 1').get().n;
      return json(res, 200, { ok: true, selected: n });
    }

    if (u.pathname === '/api/pages' && req.method === 'DELETE') {
      const key = u.searchParams.get('key');
      if (key) {
        db.prepare('DELETE FROM pages WHERE key = ?').run(key);
      } else {
        db.exec('DELETE FROM pages');
      }
      const total = db.prepare('SELECT COUNT(*) AS n FROM pages').get().n;
      return json(res, 200, { ok: true, total });
    }

    return json(res, 404, { ok: false, error: 'not found' });
  } catch (err) {
    return json(res, 500, { ok: false, error: String(err.message || err) });
  }
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    fatal([
      `[ ERROR ]  Port ${PORT} is already in use.`,
      '',
      'Either the database server is already running in another window',
      '(check your open windows before starting a second one), or another',
      'program took this port.',
      '',
      'To use a different port instead, run:',
      `  Windows : set PORT=3400 && node server.js`,
      `  Mac/Linux: PORT=3400 node server.js`,
      '',
      'Then set the same address in the site Settings page.'
    ]);
  }
  fatal([`[ ERROR ]  Could not start the server: ${err.message}`]);
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ✅ الإعلام الرقمي — local database server is running');
  console.log(`  📦 Database file : ${DB_PATH}`);
  console.log(`  🔗 API address   : http://localhost:${PORT}`);
  console.log('');
  console.log('  Keep this window open. Press Ctrl+C to stop.');
});

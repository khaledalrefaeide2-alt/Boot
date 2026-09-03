#!/usr/bin/env node
'use strict';

/*
 * الإعلام الرقمي — Local/shared database server (PostgreSQL)
 * -----------------------------------------------------------
 * خادم يخزّن منشورات فيسبوك/X المستخرَجة والمرصودة في PostgreSQL بدل
 * localStorage، ليراها كل من يفتح results.html بغضّ النظر عن جهازه أو
 * متصفّحه. كان هذا الملف يستعمل node:sqlite المدمج بلا أي اعتمادية —
 * تحوّل إلى PostgreSQL لأنه يحتفظ ببياناته فعلياً عند إعادة النشر على
 * استضافة سحابية (SQLite على قرص المشروع يُمحى مع كل نشر هناك)، ويعمل
 * بنفس السطر مع Postgres محلي على جهازك أو مُدار (Render/Railway/…).
 *
 * التشغيل محلياً:
 *   1) ثبّت PostgreSQL وشغّله على جهازك (أو استعمل خادماً موجوداً).
 *   2) أنشئ قاعدة بيانات ومستخدماً لها مرّة واحدة — راجع README.md بجانب
 *      هذا الملف للأوامر بالضبط.
 *   3) npm install   (أوّل مرّة فقط — يجلب حزمة pg الوحيدة المطلوبة)
 *   4) node server.js
 *
 * الاتصال يُضبط عبر متغيّر البيئة DATABASE_URL (الصيغة المعتمَدة في كل
 * خدمات الاستضافة تقريباً: postgres://user:pass@host:port/db). بلا هذا
 * المتغيّر يُستعمل اتصال محلي افتراضي مناسب للتطوير على هذا الجهاز فقط
 * (المستخدم fbx، القاعدة fbx_media) — لا تعتمد على هذا الافتراضي على
 * أي خادم عام.
 */

const http = require('node:http');
const { Pool, types } = require('pg');

// أعمدة BIGINT (ts وsaved_at) تعود افتراضياً كنصّ من pg لتفادي فقدان دقّة
// أرقام تتجاوز Number.MAX_SAFE_INTEGER — قيمنا هنا طوابع زمنية بالمللي
// ثانية، بعيدة جداً عن ذلك الحدّ، فتحويلها لرقم آمن ومتوقَّع من كل كود
// العميل الذي يُجري عليها حسابات (فرز، تنسيق تاريخ...). OID 20 = int8.
types.setTypeParser(20, val => (val === null ? null : Number(val)));

const PORT = parseInt(process.env.PORT, 10) || 3300;

const DATABASE_URL = process.env.DATABASE_URL ||
  `postgres://${process.env.PGUSER || 'fbx'}:${process.env.PGPASSWORD || 'fbx_local_dev'}` +
  `@${process.env.PGHOST || '127.0.0.1'}:${process.env.PGPORT || 5432}/${process.env.PGDATABASE || 'fbx_media'}`;

// اتصال محلي (127.0.0.1/localhost) لا يحتاج TLS عادةً؛ خوادم الاستضافة
// المُدارة (Render وغيرها) تفرضه. تجاوزه ممكن عبر PGSSLMODE=disable.
const isLocalHost = /@(?:localhost|127\.0\.0\.1)[:/]/.test(DATABASE_URL);
const sslMode = process.env.PGSSLMODE;
const useSsl = sslMode === 'disable' ? false : (sslMode === 'require' ? true : !isLocalHost);

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false
});

// نسخة بلا كلمة المرور — للطباعة في السجلّ ورسالة /api/health فقط
function redact(url) {
  try {
    const u = new URL(url);
    u.password = '';
    return u.toString();
  } catch (_) { return '(تعذّر تحليل عنوان الاتصال)'; }
}

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      key       TEXT PRIMARY KEY,
      text      TEXT,
      url       TEXT,
      ts        BIGINT,
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
      saved_at  BIGINT
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
      added_at  BIGINT
    );
    CREATE INDEX IF NOT EXISTS idx_pages_platform ON pages (platform);
    CREATE INDEX IF NOT EXISTS idx_pages_selected ON pages (selected);
  `);
}

const UPSERT_POST = `
  INSERT INTO posts (key, text, url, ts, author, avatar, media, likes, comments, shares, source,
                     sentiment, emotion, intent, domain, severity, action, flagged, analysis, saved_at)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
  ON CONFLICT (key) DO UPDATE SET
    likes = EXCLUDED.likes,
    comments = EXCLUDED.comments,
    shares = EXCLUDED.shares,
    sentiment = EXCLUDED.sentiment,
    emotion = EXCLUDED.emotion,
    intent = EXCLUDED.intent,
    domain = EXCLUDED.domain,
    severity = EXCLUDED.severity,
    action = EXCLUDED.action,
    flagged = EXCLUDED.flagged,
    analysis = EXCLUDED.analysis
`;

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
      const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM posts');
      return json(res, 200, { ok: true, name: 'fbx-local-db', total: rows[0].n, db: redact(DATABASE_URL) });
    }

    if (u.pathname === '/api/posts' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req) || '{}');
      const posts = Array.isArray(body.posts) ? body.posts : [];
      let saved = 0;
      for (const p of posts) {
        if (!p || typeof p !== 'object') continue;
        const key = String(p.key || p.url || '').trim();
        if (!key) continue;
        await pool.query(UPSERT_POST, [
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
        ]);
        saved++;
      }
      const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM posts');
      return json(res, 200, { ok: true, saved, total: rows[0].n });
    }

    if (u.pathname === '/api/posts' && req.method === 'GET') {
      const limit = Math.min(500, Math.max(1, parseInt(u.searchParams.get('limit'), 10) || 100));
      const offset = Math.max(0, parseInt(u.searchParams.get('offset'), 10) || 0);
      const q = (u.searchParams.get('q') || '').trim();
      let rows;
      if (q) {
        ({ rows } = await pool.query(`
          SELECT * FROM posts
          WHERE text ILIKE $1 OR author ILIKE $1
          ORDER BY COALESCE(ts, saved_at) DESC
          LIMIT $2 OFFSET $3
        `, [`%${q}%`, limit, offset]));
      } else {
        ({ rows } = await pool.query(`
          SELECT * FROM posts
          ORDER BY COALESCE(ts, saved_at) DESC
          LIMIT $1 OFFSET $2
        `, [limit, offset]));
      }
      const total = await pool.query('SELECT COUNT(*)::int AS n FROM posts');
      return json(res, 200, { ok: true, total: total.rows[0].n, posts: rows });
    }

    if (u.pathname === '/api/posts' && req.method === 'DELETE') {
      await pool.query('DELETE FROM posts');
      return json(res, 200, { ok: true, total: 0 });
    }

    if (u.pathname === '/api/stats' && req.method === 'GET') {
      const { rows } = await pool.query(`
        SELECT COUNT(*)::int AS total,
               COALESCE(SUM(likes), 0)::int AS likes,
               COALESCE(SUM(comments), 0)::int AS comments,
               COALESCE(SUM(shares), 0)::int AS shares,
               MAX(saved_at) AS last_saved_at
        FROM posts
      `);
      return json(res, 200, { ok: true, ...rows[0] });
    }

    /* ===== دليل الصفحات/الحسابات ===== */

    // حفظ دفعة صفحات (من استيراد Excel أو إضافة يدوية).
    // التكرار مستحيل: نفس المفتاح يُحدَّث بدل أن يُضاف، ويُحافَظ على حالة
    // «مُختارة» و«وقت الإضافة» السابقين حتى لا يمحو استيرادٌ جديد اختياراتك.
    if (u.pathname === '/api/pages' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req) || '{}');
      const list = Array.isArray(body.pages) ? body.pages : [];
      const client = await pool.connect();
      let saved = 0;
      try {
        await client.query('BEGIN');
        for (const p of list) {
          const key = String(p.key || p.url || p.handle || '').trim();
          if (!key) continue;
          await client.query(`
            INSERT INTO pages (key, name, url, handle, platform, category, notes, selected, added_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            ON CONFLICT (key) DO UPDATE SET
              name     = COALESCE(NULLIF(EXCLUDED.name, ''), pages.name),
              url      = COALESCE(NULLIF(EXCLUDED.url, ''), pages.url),
              handle   = COALESCE(NULLIF(EXCLUDED.handle, ''), pages.handle),
              platform = COALESCE(NULLIF(EXCLUDED.platform, ''), pages.platform),
              category = COALESCE(NULLIF(EXCLUDED.category, ''), pages.category),
              notes    = COALESCE(NULLIF(EXCLUDED.notes, ''), pages.notes)
          `, [key, String(p.name || ''), String(p.url || ''), String(p.handle || ''),
              String(p.platform || ''), String(p.category || ''), String(p.notes || ''),
              p.selected ? 1 : 0, Date.now()]);
          saved++;
        }
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
      const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM pages');
      return json(res, 200, { ok: true, saved, total: rows[0].n });
    }

    if (u.pathname === '/api/pages' && req.method === 'GET') {
      const platform = (u.searchParams.get('platform') || '').trim();
      const q = (u.searchParams.get('q') || '').trim();
      const selectedOnly = u.searchParams.get('selected') === '1';
      const where = [], args = [];
      if (platform) { args.push(platform); where.push(`platform = $${args.length}`); }
      if (selectedOnly) where.push('selected = 1');
      if (q) {
        args.push(`%${q}%`);
        const i = args.length;
        where.push(`(name ILIKE $${i} OR url ILIKE $${i} OR handle ILIKE $${i} OR category ILIKE $${i})`);
      }
      const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const { rows } = await pool.query(
        `SELECT * FROM pages ${clause} ORDER BY selected DESC, name COLLATE "C"`, args
      );
      const total = await pool.query('SELECT COUNT(*)::int AS n FROM pages');
      return json(res, 200, { ok: true, total: total.rows[0].n, count: rows.length, pages: rows });
    }

    // تحديث الاختيار: {keys:[...], selected:true|false} أو {selectAll:false} لمسح كل الاختيارات
    if (u.pathname === '/api/pages/select' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req) || '{}');
      if (body.selectAll === false) {
        await pool.query('UPDATE pages SET selected = 0');
        return json(res, 200, { ok: true, selected: 0 });
      }
      const keys = Array.isArray(body.keys) ? body.keys : [];
      const val = body.selected ? 1 : 0;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const k of keys) await client.query('UPDATE pages SET selected = $1 WHERE key = $2', [val, String(k)]);
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
      const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM pages WHERE selected = 1');
      return json(res, 200, { ok: true, selected: rows[0].n });
    }

    if (u.pathname === '/api/pages' && req.method === 'DELETE') {
      const key = u.searchParams.get('key');
      if (key) {
        await pool.query('DELETE FROM pages WHERE key = $1', [key]);
      } else {
        await pool.query('DELETE FROM pages');
      }
      const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM pages');
      return json(res, 200, { ok: true, total: rows[0].n });
    }

    return json(res, 404, { ok: false, error: 'not found' });
  } catch (err) {
    return json(res, 500, { ok: false, error: String(err.message || err) });
  }
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error('');
    console.error(`  [ ERROR ]  Port ${PORT} is already in use.`);
    console.error('');
    console.error('  Either the database server is already running in another window');
    console.error('  (check your open windows before starting a second one), or another');
    console.error('  program took this port.');
    console.error('');
    console.error('  To use a different port instead, run:');
    console.error('    Windows : set PORT=3400 && node server.js');
    console.error('    Mac/Linux: PORT=3400 node server.js');
    console.error('');
    console.error('  Then set the same address in the site Settings page.');
    process.exit(1);
  }
  console.error(`[ ERROR ]  Could not start the server: ${err.message}`);
  process.exit(1);
});

(async () => {
  try {
    await pool.query('SELECT 1'); // يفشل بوضوح الآن إن كان الاتصال خاطئاً، لا عند أوّل طلب
    await migrate();
  } catch (err) {
    console.error('');
    console.error('  [ ERROR ]  تعذّر الاتصال بقاعدة بيانات PostgreSQL.');
    console.error('');
    console.error(`  عنوان الاتصال المُستعمَل : ${redact(DATABASE_URL)}`);
    console.error(`  تفاصيل الخطأ            : ${err.message}`);
    console.error('');
    console.error('  تأكّد أن خادم PostgreSQL يعمل، وأن القاعدة والمستخدم');
    console.error('  موجودان (راجع README.md بجانب هذا الملف)، أو اضبط');
    console.error('  DATABASE_URL يدوياً قبل التشغيل.');
    console.error('');
    process.exit(1);
  }

  server.listen(PORT, () => {
    console.log('');
    console.log('  ✅ الإعلام الرقمي — local database server is running (PostgreSQL)');
    console.log(`  📦 Database      : ${redact(DATABASE_URL)}`);
    console.log(`  🔗 API address   : http://localhost:${PORT}`);
    console.log('');
    console.log('  Keep this window open. Press Ctrl+C to stop.');
  });
})();

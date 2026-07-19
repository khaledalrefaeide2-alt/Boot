#!/usr/bin/env node
'use strict';

/*
 * FB Extractor — Local database server
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
const { DatabaseSync } = require('node:sqlite');

const PORT = parseInt(process.env.PORT, 10) || 3300;
const DB_PATH = path.join(__dirname, 'fbx-posts.db');

const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    key      TEXT PRIMARY KEY,
    text     TEXT,
    url      TEXT,
    ts       INTEGER,
    author   TEXT,
    avatar   TEXT,
    media    TEXT,
    likes    INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    shares   INTEGER DEFAULT 0,
    source   TEXT,
    saved_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_posts_ts ON posts (ts DESC);
`);

const upsert = db.prepare(`
  INSERT INTO posts (key, text, url, ts, author, avatar, media, likes, comments, shares, source, saved_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET
    likes = excluded.likes,
    comments = excluded.comments,
    shares = excluded.shares
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

    return json(res, 404, { ok: false, error: 'not found' });
  } catch (err) {
    return json(res, 500, { ok: false, error: String(err.message || err) });
  }
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ✅ FB Extractor local database server is running');
  console.log(`  📦 Database file : ${DB_PATH}`);
  console.log(`  🔗 API address   : http://localhost:${PORT}`);
  console.log('');
  console.log('  Keep this window open. Press Ctrl+C to stop.');
});

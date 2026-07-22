-- Facebook Analytics & Social Intelligence Platform — SQLite schema
-- All timestamps are ISO-8601 strings (UTC).

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'viewer',  -- admin | editor | viewer
  status        TEXT NOT NULL DEFAULT 'active',  -- active | disabled
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Key/value application + API settings. Sensitive values are stored encrypted.
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  is_secret   INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Every search performed across explorers / discovery.
CREATE TABLE IF NOT EXISTS searches (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  type        TEXT NOT NULL,                 -- keyword | hashtag | content | page
  query       TEXT NOT NULL,
  filters     TEXT,                          -- JSON string
  results_count INTEGER NOT NULL DEFAULT 0,
  api_calls   INTEGER NOT NULL DEFAULT 0,
  favorite    INTEGER NOT NULL DEFAULT 0,
  deleted     INTEGER NOT NULL DEFAULT 0,    -- soft delete for restore
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_searches_user ON searches(user_id);
CREATE INDEX IF NOT EXISTS idx_searches_type ON searches(type);
CREATE INDEX IF NOT EXISTS idx_searches_created ON searches(created_at);

-- Snapshot metrics for monitored keywords over time.
CREATE TABLE IF NOT EXISTS keyword_metrics (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword     TEXT NOT NULL,
  mentions    INTEGER NOT NULL DEFAULT 0,
  engagement  INTEGER NOT NULL DEFAULT 0,
  reach       INTEGER NOT NULL DEFAULT 0,
  sentiment   REAL NOT NULL DEFAULT 0,       -- -1..1
  captured_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_kmetrics_keyword ON keyword_metrics(keyword, captured_at);

-- Snapshot metrics for monitored hashtags over time.
CREATE TABLE IF NOT EXISTS hashtag_metrics (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  hashtag       TEXT NOT NULL,
  mentions      INTEGER NOT NULL DEFAULT 0,
  engagement    INTEGER NOT NULL DEFAULT 0,
  trending_score REAL NOT NULL DEFAULT 0,
  growth        REAL NOT NULL DEFAULT 0,      -- percentage
  captured_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_hmetrics_hashtag ON hashtag_metrics(hashtag, captured_at);

-- Cached / stored public posts discovered through the API.
CREATE TABLE IF NOT EXISTS posts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id   TEXT UNIQUE,
  page_name     TEXT,
  page_id       TEXT,
  content       TEXT,
  url           TEXT,
  media_url     TEXT,
  language      TEXT,
  likes         INTEGER NOT NULL DEFAULT 0,
  comments      INTEGER NOT NULL DEFAULT 0,
  shares        INTEGER NOT NULL DEFAULT 0,
  reactions     INTEGER NOT NULL DEFAULT 0,
  engagement_rate REAL NOT NULL DEFAULT 0,
  matched_keyword TEXT,
  matched_hashtag TEXT,
  published_at  TEXT,
  captured_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_posts_engagement ON posts(engagement_rate);
CREATE INDEX IF NOT EXISTS idx_posts_published ON posts(published_at);

-- User-created collections (folders) of favorites.
CREATE TABLE IF NOT EXISTS collections (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'mixed',  -- hashtag | keyword | report | search | mixed
  color       TEXT DEFAULT '#2563EB',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS collection_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  item_type     TEXT NOT NULL,               -- hashtag | keyword | report | search | post
  item_ref      TEXT NOT NULL,               -- value or id reference
  label         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Alerts / monitors configured by users.
CREATE TABLE IF NOT EXISTS alerts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  target_type TEXT NOT NULL,                 -- keyword | hashtag | page | engagement
  target      TEXT NOT NULL,
  metric      TEXT NOT NULL DEFAULT 'engagement', -- engagement | mentions | trending_score | growth
  operator    TEXT NOT NULL DEFAULT '>',     -- > | < | >= | <=
  threshold   REAL NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1,
  last_triggered_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Generated reports metadata.
CREATE TABLE IF NOT EXISTS reports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  template    TEXT NOT NULL,                 -- executive | trend | hashtag | keyword | engagement | competitor
  format      TEXT NOT NULL,                 -- pdf | excel | csv
  params      TEXT,                          -- JSON
  status      TEXT NOT NULL DEFAULT 'ready', -- pending | ready | failed
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- In-app notifications.
CREATE TABLE IF NOT EXISTS notifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL DEFAULT 'info',  -- info | warning | error | success | trend
  title       TEXT NOT NULL,
  body        TEXT,
  read        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Audit log for security-relevant events.
CREATE TABLE IF NOT EXISTS audit_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  detail      TEXT,
  ip          TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Raw log of outbound API requests (rate-limit monitor + diagnostics).
CREATE TABLE IF NOT EXISTS api_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint    TEXT NOT NULL,
  method      TEXT NOT NULL DEFAULT 'GET',
  status_code INTEGER,
  duration_ms INTEGER,
  ok          INTEGER NOT NULL DEFAULT 1,
  error       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_apilogs_created ON api_logs(created_at);

/* =====================================================================
   سلام — النواة | Salam Core
   State, persistence, Apify client, normalisation and the automatic
   monitoring engine. Framework-free, works straight off the file system.
   ===================================================================== */
'use strict';

/* ============================ Constants ============================ */
const ACTOR_ID = 'apify~facebook-posts-scraper';
const API_BASE = 'https://api.apify.com/v2';
const FEED_CAP = 3000;
const LOG_CAP = 120;

const K = {
  key: 'salam_apify_key',
  platforms: 'salam_platforms',
  posts: 'salam_posts',
  log: 'salam_log',
  settings: 'salam_settings',
  lastRun: 'salam_last_run',
  theme: 'salam_theme',
};

const PLATFORM_TYPES = {
  fact: { label: 'منصة تحقق', chip: 'cyan' },
  news: { label: 'وكالة أنباء', chip: 'gold' },
  gov: { label: 'جهة رسمية', chip: 'crimson' },
  other: { label: 'مصدر آخر', chip: '' },
};

const DEFAULT_SETTINGS = {
  intervalMin: 30,       // دورة الرصد الآلي — نصف ساعة افتراضياً
  perPlatform: 5,        // عدد المنشورات المسحوبة من كل منصة في كل دورة
  autoStart: true,       // تشغيل الرصد تلقائياً عند فتح الموقع
  notify: false,         // إشعارات المتصفح عند وصول منشور جديد
  dbUrl: 'http://localhost:3300',
  dbSync: false,
};

/* ============================ Storage ============================ */
function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (_) { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (err) { console.warn('storage write failed', key, err); return false; }
}

/* ============================ App state ============================ */
const S = {
  token: localStorage.getItem(K.key) || '',
  platforms: load(K.platforms, []),
  posts: load(K.posts, []),
  log: load(K.log, []),
  settings: Object.assign({}, DEFAULT_SETTINGS, load(K.settings, {})),
  lastRun: Number(localStorage.getItem(K.lastRun) || 0),

  /* runtime only */
  monitorOn: false,
  cycleRunning: false,
  freshKeys: new Set(),
  currentRunId: null,
  dbOnline: false,
};

const persist = {
  token() { S.token ? localStorage.setItem(K.key, S.token) : localStorage.removeItem(K.key); },
  platforms() { save(K.platforms, S.platforms); },
  posts() { save(K.posts, S.posts.slice(0, FEED_CAP)); },
  log() { save(K.log, S.log.slice(0, LOG_CAP)); },
  settings() { save(K.settings, S.settings); },
  lastRun() { localStorage.setItem(K.lastRun, String(S.lastRun)); },
};

/* ============================ Helpers ============================ */
const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtNum(n) {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(n % 1e3 === 0 ? 0 : 1) + 'K';
  return String(n);
}

function fmtDateTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('ar', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
function fmtTime(ts) {
  if (!ts) return '--:--';
  return new Date(ts).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });
}
function fmtRelative(ts) {
  if (!ts) return 'وقت غير معروف';
  const diff = Date.now() - ts;
  if (diff < 0) return 'الآن';
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'قبل لحظات';
  if (min < 60) return `قبل ${min} دقيقة`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `قبل ${hr} ساعة`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `قبل ${d} يوم`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `قبل ${mo} شهر`;
  return `قبل ${Math.floor(mo / 12)} سنة`;
}
function fmtDuration(ms) {
  if (!ms && ms !== 0) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} ثانية`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} دقيقة`;
}

/* ============================ Facebook URL utils ============================ */
function normalizeFbUrl(input) {
  let url = String(input || '').trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url.replace(/^\/+/, '');
  try {
    const u = new URL(url);
    if (!/facebook\.com$/i.test(u.hostname.replace(/^(www|m|web|ar-ar|[a-z]{2}-[a-z]{2})\./i, ''))) return '';
    u.hostname = 'www.facebook.com';
    u.search = ''; u.hash = '';
    u.pathname = u.pathname.replace(/\/+$/, '') || '/';
    return u.toString();
  } catch (_) { return ''; }
}

/** Stable identifier of a Facebook page taken from its URL. */
function pageSlug(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    if (!parts.length) return '';
    if (parts[0] === 'profile.php') return (new URL(url)).searchParams.get('id') || '';
    if (parts[0] === 'people' && parts[2]) return parts[2];
    if (parts[0] === 'pages' && parts[parts.length - 1]) return parts[parts.length - 1];
    return parts[0];
  } catch (_) { return ''; }
}

function guessNameFromUrl(url) {
  const slug = pageSlug(url);
  if (!slug) return 'منصة بلا اسم';
  return decodeURIComponent(slug).replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim() || slug;
}

/* ============================ Platform registry ============================ */
function addPlatform({ name, url, type }) {
  const clean = normalizeFbUrl(url);
  if (!clean) return { ok: false, error: 'الرابط غير صالح — يجب أن يكون رابط صفحة على facebook.com' };
  const slug = pageSlug(clean);
  if (S.platforms.some(p => pageSlug(p.url) === slug && slug)) {
    return { ok: false, error: 'هذه المنصة مضافة بالفعل في لوحة التحكم' };
  }
  const platform = {
    id: uid(),
    name: (name || '').trim() || guessNameFromUrl(clean),
    url: clean,
    slug,
    type: PLATFORM_TYPES[type] ? type : 'fact',
    enabled: true,
    addedAt: Date.now(),
  };
  S.platforms.push(platform);
  persist.platforms();
  return { ok: true, platform };
}

function removePlatform(id) {
  S.platforms = S.platforms.filter(p => p.id !== id);
  persist.platforms();
}

function platformById(id) { return S.platforms.find(p => p.id === id) || null; }
function enabledPlatforms() { return S.platforms.filter(p => p.enabled); }

/** Attach an incoming post to one of the registered platforms. */
function matchPlatform(raw, normalized) {
  // Page-level fields identify the source page far more reliably than the
  // post permalink, so they are searched first.
  const pageFields = [raw.facebookUrl, raw.pageUrl, raw.pageAdLibrary?.pageUrl, raw.user?.profileUrl];
  const postFields = [raw.url, raw.topLevelUrl, raw.postUrl];
  for (const fields of [pageFields, postFields]) {
    const haystack = fields.filter(Boolean).map(String).join(' ').toLowerCase();
    if (!haystack) continue;
    for (const p of S.platforms) {
      if (p.slug && haystack.includes('/' + p.slug.toLowerCase())) return p;
    }
  }
  const author = (normalized.author || '').trim().toLowerCase();
  if (author) {
    const byName = S.platforms.find(p => p.name.trim().toLowerCase() === author);
    if (byName) return byName;
  }
  return null;
}

/* ============================ Normalisation ============================ */
function toNumber(v) {
  if (typeof v === 'number') return Math.round(v);
  if (typeof v === 'string') {
    const n = parseInt(v.replace(/[^\d]/g, ''), 10);
    return isNaN(n) ? 0 : n;
  }
  if (v && typeof v === 'object') return toNumber(v.count ?? v.total ?? v.value);
  return 0;
}

function pickMedia(raw) {
  const list = Array.isArray(raw.media) ? raw.media : [];
  for (const m of list) {
    const url = m?.thumbnail || m?.photo_image?.uri || m?.image?.uri || m?.url;
    if (url && /^https?:/i.test(url)) return url;
  }
  const single = raw.thumbnailUrl || raw.imageUrl || raw.photoUrl || raw.previewImage;
  return typeof single === 'string' && /^https?:/i.test(single) ? single : '';
}

function normalizePost(raw) {
  const text = raw.text || raw.message || raw.postText || raw.caption || '';
  const url = raw.url || raw.postUrl || raw.topLevelUrl || raw.link || '';

  const timeVal = raw.time ?? raw.date ?? raw.publishedTime ?? raw.timestamp ?? raw.createdAt ?? null;
  let ts = null;
  if (typeof timeVal === 'number') ts = timeVal > 1e12 ? timeVal : timeVal * 1000;
  else if (timeVal) { const d = new Date(timeVal); if (!isNaN(d.getTime())) ts = d.getTime(); }

  const author = raw.user?.name || raw.pageName || raw.author || raw.username || 'صفحة فيسبوك';
  const avatar = raw.user?.profilePic || raw.pageProfilePic || raw.profilePicture || '';

  const post = {
    key: url || `${author}|${ts || ''}|${String(text).slice(0, 80)}`,
    text: String(text),
    url,
    ts,
    author,
    avatar,
    media: pickMedia(raw),
    likes: toNumber(raw.likes ?? raw.likesCount ?? raw.reactions ?? raw.reactionsCount),
    comments: toNumber(raw.comments ?? raw.commentsCount),
    shares: toNumber(raw.shares ?? raw.sharesCount),
  };
  const matched = matchPlatform(raw, post);
  post.platformId = matched ? matched.id : null;
  post.platformName = matched ? matched.name : author;
  post.platformType = matched ? matched.type : 'other';
  return post;
}

function engagementOf(p) { return (p.likes || 0) + (p.comments || 0) + (p.shares || 0); }

/* ============================ Apify client ============================ */
async function apifyError(res) {
  let msg = `تعذّر إتمام الطلب مع Apify (HTTP ${res.status})`;
  try {
    const body = await res.json();
    if (body?.error?.message) msg += ` — ${body.error.message}`;
  } catch (_) { /* ignore */ }
  if (res.status === 401 || res.status === 403) msg = '🔑 مفتاح Apify غير صحيح أو لا يملك الصلاحية المطلوبة.';
  if (res.status === 402) msg = '💳 رصيد حساب Apify غير كافٍ لتشغيل عملية الرصد.';
  if (res.status === 429) msg = '⏳ تجاوزت حدّ الطلبات في Apify — أعد المحاولة بعد قليل.';
  return new Error(msg);
}

/** Verify the stored token and return account info. */
async function apifyWhoAmI(token) {
  const res = await fetch(`${API_BASE}/users/me?token=${encodeURIComponent(token)}`);
  if (!res.ok) throw await apifyError(res);
  return (await res.json()).data;
}

/**
 * Run the Facebook posts scraper once over a set of pages.
 * `maxItems` is passed to Apify as a hard billing ceiling, so a run can
 * never cost more than the number of posts explicitly requested here.
 */
async function apifyScrape({ token, urls, perPage, onlyPostsNewerThan, onlyPostsOlderThan, onStatus }) {
  const input = {
    startUrls: urls.map(url => ({ url })),
    resultsLimit: perPage,
  };
  if (onlyPostsNewerThan) input.onlyPostsNewerThan = onlyPostsNewerThan;
  if (onlyPostsOlderThan) input.onlyPostsOlderThan = onlyPostsOlderThan;

  const maxItems = Math.max(1, perPage * urls.length);
  const startRes = await fetch(
    `${API_BASE}/acts/${ACTOR_ID}/runs?token=${encodeURIComponent(token)}&maxItems=${maxItems}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }
  );
  if (!startRes.ok) throw await apifyError(startRes);

  const run = (await startRes.json()).data;
  S.currentRunId = run.id;
  let status = run.status;
  let datasetId = run.defaultDatasetId;
  const startedAt = Date.now();

  while (['READY', 'RUNNING'].includes(status)) {
    if (onStatus) onStatus(status, Date.now() - startedAt);
    await sleep(4000);
    const stRes = await fetch(`${API_BASE}/actor-runs/${run.id}?token=${encodeURIComponent(token)}`);
    if (!stRes.ok) throw await apifyError(stRes);
    const d = (await stRes.json()).data;
    status = d.status;
    datasetId = d.defaultDatasetId || datasetId;
  }
  S.currentRunId = null;

  if (status !== 'SUCCEEDED' && status !== 'ABORTED') {
    throw new Error(`انتهت عملية الرصد بحالة «${status}» — تحقق من صحة الروابط ومن رصيد حسابك في Apify.`);
  }

  const itemsRes = await fetch(`${API_BASE}/datasets/${datasetId}/items?clean=true&format=json&token=${encodeURIComponent(token)}`);
  if (!itemsRes.ok) throw await apifyError(itemsRes);
  const items = await itemsRes.json();
  return { items: Array.isArray(items) ? items : [], runId: run.id, status, ms: Date.now() - startedAt };
}

async function apifyAbort(runId, token) {
  if (!runId || !token) return;
  try {
    await fetch(`${API_BASE}/actor-runs/${runId}/abort?token=${encodeURIComponent(token)}`, { method: 'POST' });
  } catch (_) { /* best effort */ }
}

/* ============================ Local database bridge ============================ */
async function dbPing() {
  const url = (S.settings.dbUrl || '').replace(/\/+$/, '');
  if (!url) { S.dbOnline = false; return null; }
  try {
    const res = await fetch(url + '/api/health', { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error('bad status');
    const info = await res.json();
    S.dbOnline = true;
    return info;
  } catch (_) { S.dbOnline = false; return null; }
}

async function dbSave(posts, source) {
  if (!S.settings.dbSync || !S.dbOnline || !posts.length) return 0;
  const url = (S.settings.dbUrl || '').replace(/\/+$/, '');
  try {
    const payload = posts.map(p => ({
      key: p.key, text: p.text, url: p.url, ts: p.ts, author: p.platformName || p.author,
      avatar: p.avatar, media: p.media, likes: p.likes, comments: p.comments, shares: p.shares,
      source: source || 'salam-monitor',
    }));
    const res = await fetch(url + '/api/posts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ posts: payload }),
    });
    if (!res.ok) throw new Error('save failed');
    return payload.length;
  } catch (_) { S.dbOnline = false; return 0; }
}

/* ============================ Audit log ============================ */
function logEntry(entry) {
  S.log.unshift(Object.assign({ id: uid(), at: Date.now() }, entry));
  if (S.log.length > LOG_CAP) S.log.length = LOG_CAP;
  persist.log();
}

/* ============================ Ingestion ============================ */
/**
 * Merge freshly scraped items into the feed.
 * Returns { added, updated, fresh: [posts] } — duplicates are never stored
 * twice; only their engagement counters are refreshed.
 */
function ingest(items, { cycleId } = {}) {
  const index = new Map(S.posts.map(p => [p.key, p]));
  const fresh = [];
  let updated = 0;

  for (const raw of items) {
    const post = normalizePost(raw);
    if (!post.text && !post.url) continue;

    const existing = index.get(post.key);
    if (existing) {
      const changed = existing.likes !== post.likes || existing.comments !== post.comments || existing.shares !== post.shares;
      existing.likes = post.likes; existing.comments = post.comments; existing.shares = post.shares;
      if (!existing.media && post.media) existing.media = post.media;
      if (changed) updated++;
      continue;
    }
    post.seenAt = Date.now();
    post.cycleId = cycleId || null;
    index.set(post.key, post);
    S.posts.push(post);
    fresh.push(post);
  }

  S.posts.sort((a, b) => (b.ts || b.seenAt || 0) - (a.ts || a.seenAt || 0));
  if (S.posts.length > FEED_CAP) S.posts.length = FEED_CAP;
  persist.posts();
  return { added: fresh.length, updated, fresh };
}

/* ============================ Export ============================ */
function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime + ';charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 4000);
}

function exportJson(posts) {
  const payload = {
    generator: 'سلام — منصة رصد منشورات التحقق',
    exportedAt: new Date().toISOString(),
    platforms: S.platforms.map(p => ({ name: p.name, url: p.url, type: PLATFORM_TYPES[p.type]?.label || p.type })),
    count: posts.length,
    posts: posts.map(p => ({
      platform: p.platformName, text: p.text, url: p.url,
      publishedAt: p.ts ? new Date(p.ts).toISOString() : null,
      capturedAt: p.seenAt ? new Date(p.seenAt).toISOString() : null,
      likes: p.likes, comments: p.comments, shares: p.shares, media: p.media,
    })),
  };
  download(`salam-posts-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), 'application/json');
}

function exportCsv(posts) {
  const head = ['المنصة', 'نص المنشور', 'رابط المنشور', 'تاريخ النشر', 'وقت الرصد', 'إعجابات', 'تعليقات', 'مشاركات'];
  const cell = v => `"${String(v == null ? '' : v).replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
  const rows = posts.map(p => [
    p.platformName, p.text, p.url,
    p.ts ? new Date(p.ts).toISOString() : '',
    p.seenAt ? new Date(p.seenAt).toISOString() : '',
    p.likes, p.comments, p.shares,
  ].map(cell).join(','));
  download(`salam-posts-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + [head.map(cell).join(','), ...rows].join('\r\n'), 'text/csv');
}

/* =====================================================================
   سلام — واجهة الاستخدام | Salam UI
   Rendering, the automatic monitoring loop and all event wiring.
   Depends on salam-core.js.
   ===================================================================== */
'use strict';

/* ============================ Icons ============================ */
const I = {
  radar: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19.07 4.93A10 10 0 0 0 6.99 3.34"/><path d="M4 6h.01"/><path d="M2.29 9.62A10 10 0 1 0 21.31 8.35"/><path d="M16.24 7.76A6 6 0 1 0 8.23 16.67"/><path d="M12 18h.01"/><path d="M17.99 11.66A6 6 0 0 1 15.77 16.67"/><circle cx="12" cy="12" r="2"/><path d="m13.41 10.59 5.66-5.66"/></svg>',
  feed: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>',
  chart: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>',
  sliders: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>',
  shield: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>',
  key: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="4.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>',
  plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  trash: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  bolt: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9z"/></svg>',
  check: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  verified: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1.5 14.6 4l3.5-.3.9 3.4 3 1.9-1.6 3.2 1.6 3.2-3 1.9-.9 3.4-3.5-.3L12 22.5 9.4 20l-3.5.3-.9-3.4-3-1.9L4.6 12 3 8.8l3-1.9.9-3.4 3.5.3z"/><path d="m10.8 15.4-3-3 1.4-1.4 1.6 1.6 3.9-3.9 1.4 1.4z" fill="#0A1014"/></svg>',
  like: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7.5-4.7-9.6-9A5.4 5.4 0 0 1 12 6.2 5.4 5.4 0 0 1 21.6 12c-2.1 4.3-9.6 9-9.6 9z"/></svg>',
  comment: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.4 8.9 8.9 0 0 1-3.8-.8L3 21l1.9-5.5A8.3 8.3 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5z"/></svg>',
  share: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M14 4v3.5C7.5 8 4.5 12.5 4 20c1.9-3.6 4.6-5.3 10-5.3V18l7-7z"/></svg>',
  link: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
  clock: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  db: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>',
  download: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg>',
  search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  sun: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  eye: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
  info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/></svg>',
  play: '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8-14 8z"/></svg>',
  pause: '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4h4v16H7zM13 4h4v16h-4z"/></svg>',
  copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
};

/* ============================ Toasts ============================ */
function toast(message, kind) {
  const host = $('toastHost');
  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.innerHTML = esc(message);
  host.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0'; el.style.transform = 'translateY(10px)';
    setTimeout(() => el.remove(), 320);
  }, 4200);
}

/* ============================ Theme ============================ */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(K.theme, theme);
  $('themeBtn').innerHTML = theme === 'pearl' ? I.moon : I.sun;
  $('themeBtn').title = theme === 'pearl' ? 'الوضع الليلي' : 'الوضع اللؤلؤي';
}

/* ============================ View router ============================ */
let currentView = 'monitor';
function showView(name) {
  currentView = name;
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === name));
  if (name === 'analytics') renderAnalytics();
  if (name === 'log') renderLog();
  if (name === 'posts') renderFeed();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ============================ Filters state ============================ */
const F = { platform: 'all', range: 0, query: '', sort: 'newest', mediaOnly: false, limit: 30 };

/* ============================ Monitoring engine ============================ */
function intervalMs() { return Math.max(5, Number(S.settings.intervalMin) || 30) * 60000; }

function setMonitor(on) {
  S.monitorOn = !!on;
  renderMonitorState();
  refreshCountdown();
  if (S.monitorOn) logEntry({ type: 'control', ok: true, note: 'تشغيل الرصد الآلي' });
  else logEntry({ type: 'control', ok: true, note: 'إيقاف الرصد الآلي' });
  renderLog();
}

function tick() {
  refreshCountdown();
  setTimeout(tick, 1000);
}

function refreshCountdown() {
  const pill = $('livePill');
  const cd = $('countdown');
  if (S.cycleRunning) {
    pill.className = 'live-pill busy';
    cd.textContent = 'جارٍ الرصد';
  } else if (S.monitorOn) {
    pill.className = 'live-pill on';
    const remaining = S.lastRun + intervalMs() - Date.now();
    if (remaining <= 0) { runCycle(false); }
    else {
      const m = Math.floor(remaining / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      cd.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
  } else {
    pill.className = 'live-pill';
    cd.textContent = 'متوقف';
  }
  const next = $('nextRunAt');
  if (next) {
    next.textContent = S.monitorOn ? fmtTime(Math.max(Date.now(), S.lastRun + intervalMs())) : '—';
  }
}

async function runCycle(manual, options) {
  if (S.cycleRunning) return;
  const opts = options || {};
  const token = S.token;
  if (!token) { toast('احفظ مفتاح Apify أولاً من لوحة التحكم', 'bad'); showView('control'); return; }

  const targets = opts.platforms || enabledPlatforms();
  if (!targets.length) { toast('أضِف منصة تحقق واحدة على الأقل', 'bad'); showView('control'); return; }

  S.cycleRunning = true;
  const cycleId = uid();
  const startedAt = Date.now();
  renderMonitorState();
  $('cycleBanner').style.display = 'flex';
  $('cycleBannerText').textContent = manual
    ? `رصد فوري لـ ${targets.length} منصة — جارٍ الاتصال بـ Apify…`
    : `دورة رصد آلية لـ ${targets.length} منصة — جارٍ الاتصال بـ Apify…`;
  $('alertBox').style.display = 'none';

  try {
    const perPage = Math.max(1, Number(opts.perPlatform || S.settings.perPlatform) || 5);
    const { items, runId, ms } = await apifyScrape({
      token,
      urls: targets.map(p => p.url),
      perPage,
      onlyPostsNewerThan: opts.from || undefined,
      onlyPostsOlderThan: opts.to || undefined,
      onStatus: (status, elapsed) => {
        $('cycleBannerText').textContent = `التشغيل قيد التنفيذ على Apify (${status}) — ${Math.round(elapsed / 1000)} ثانية`;
      },
    });

    const { added, updated, fresh } = ingest(items, { cycleId });
    S.freshKeys = new Set(fresh.map(p => p.key));
    S.lastRun = Date.now();
    persist.lastRun();

    logEntry({
      type: manual ? 'manual' : 'auto',
      ok: true,
      runId,
      platforms: targets.map(p => p.name),
      fetched: items.length,
      added,
      updated,
      ms: Date.now() - startedAt,
      apifyMs: ms,
      perPlatform: perPage,
      billedCap: perPage * targets.length,
    });

    if (added) {
      toast(`✨ ${added} منشور جديد من ${targets.length} منصة`, 'ok');
      notifyNew(fresh);
      dbSave(fresh, manual ? 'salam-manual' : 'salam-auto');
    } else {
      toast(items.length ? 'اكتملت الدورة — لا منشورات جديدة' : 'اكتملت الدورة — لم تُرجع Apify أي عناصر', 'ok');
    }
    F.limit = 30;
    renderAll();
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    S.lastRun = Date.now();
    persist.lastRun();
    logEntry({ type: manual ? 'manual' : 'auto', ok: false, error: message, platforms: targets.map(p => p.name), ms: Date.now() - startedAt });
    $('alertBox').className = 'alert alert-bad';
    $('alertBox').innerHTML = `<span class="a-ico">${I.info}</span><span><strong>تعذّرت دورة الرصد.</strong><br>${esc(message)}${S.monitorOn ? '<br>ستُعاد المحاولة تلقائياً في الدورة القادمة.' : ''}</span>`;
    $('alertBox').style.display = 'flex';
    toast('فشلت دورة الرصد — التفاصيل في صفحة الرصد', 'bad');
    renderLog();
  } finally {
    S.cycleRunning = false;
    $('cycleBanner').style.display = 'none';
    renderMonitorState();
  }
}

function notifyNew(fresh) {
  if (!S.settings.notify || !fresh.length) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const first = fresh[0];
  try {
    new Notification('سلام — منشورات جديدة', {
      body: `${fresh.length} منشور جديد. آخرها من ${first.platformName}: ${String(first.text || '').slice(0, 80)}`,
      tag: 'salam-monitor',
    });
  } catch (_) { /* ignore */ }
}

/* ============================ Rendering: monitor state ============================ */
function renderMonitorState() {
  const btn = $('toggleMonitor');
  if (btn) {
    btn.innerHTML = S.monitorOn
      ? `${I.pause}<span>إيقاف الرصد الآلي</span>`
      : `${I.play}<span>تشغيل الرصد الآلي</span>`;
    btn.className = 'btn ' + (S.monitorOn ? 'btn-ghost' : 'btn-cyan');
  }
  const state = $('monitorState');
  if (state) {
    state.textContent = S.cycleRunning ? 'دورة رصد قيد التنفيذ' : (S.monitorOn ? 'الرصد الآلي يعمل' : 'الرصد الآلي متوقف');
    state.className = 'chip ' + (S.cycleRunning ? 'gold' : (S.monitorOn ? 'cyan' : ''));
  }
  const last = $('lastRunAt');
  if (last) last.textContent = S.lastRun ? `${fmtTime(S.lastRun)} · ${fmtRelative(S.lastRun)}` : 'لم تبدأ بعد';
  const cyc = $('cycleEvery');
  if (cyc) cyc.textContent = `كل ${S.settings.intervalMin} دقيقة`;
  const runBtn = $('runNow');
  if (runBtn) runBtn.disabled = S.cycleRunning;
  const cover = $('coverCount');
  if (cover) cover.textContent = `${enabledPlatforms().length} / ${S.platforms.length}`;
}

/* ============================ Rendering: stats ============================ */
function statTile(kind, icon, value, label) {
  return `<div class="stat ${kind}"><div class="s-ico">${icon}</div><div><div class="s-val num">${esc(value)}</div><div class="s-lbl">${esc(label)}</div></div></div>`;
}

function renderStats() {
  const posts = S.posts;
  const last24 = posts.filter(p => (p.ts || p.seenAt || 0) > Date.now() - 86400000).length;
  const totalEng = posts.reduce((sum, p) => sum + engagementOf(p), 0);
  $('statGrid').innerHTML = [
    statTile('', I.feed, fmtNum(posts.length), 'منشور مرصود'),
    statTile('cyan', I.shield, String(S.platforms.length), 'منصة تحت الرصد'),
    statTile('', I.clock, fmtNum(last24), 'منشور خلال ٢٤ ساعة'),
    statTile('crimson', I.like, fmtNum(totalEng), 'إجمالي التفاعل'),
  ].join('');
}

/* ============================ Rendering: platforms ============================ */
function initials(name) {
  const clean = String(name || '؟').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] || '') + (parts[1][0] || '');
  return clean.slice(0, 2);
}

function renderPlatforms() {
  const host = $('platformList');
  if (!S.platforms.length) {
    host.innerHTML = `<div class="alert alert-info"><span class="a-ico">${I.info}</span><span>لم تُضِف أي منصة بعد. أضِف صفحات منصات التحقق التي تريد رصدها من النموذج أعلاه، وسيبدأ سلام برصدها آلياً كل ${esc(S.settings.intervalMin)} دقيقة.</span></div>`;
  } else {
    host.innerHTML = S.platforms.map(p => {
      const meta = PLATFORM_TYPES[p.type] || PLATFORM_TYPES.other;
      const count = S.posts.filter(x => x.platformId === p.id).length;
      return `<div class="plat-row ${p.enabled ? '' : 'off'}">
        <div class="avatar">${esc(initials(p.name))}</div>
        <div class="meta">
          <div class="nm">${esc(p.name)}
            <span class="chip ${meta.chip}">${esc(meta.label)}</span>
            <span class="chip">${count} منشور</span>
          </div>
          <div class="u" title="${esc(p.url)}">${esc(p.url)}</div>
        </div>
        <div class="acts">
          <label class="switch" title="تفعيل/تعطيل الرصد">
            <input type="checkbox" data-toggle="${esc(p.id)}" ${p.enabled ? 'checked' : ''}>
            <span class="track"></span>
          </label>
          <a class="btn btn-icon btn-ghost" href="${esc(p.url)}" target="_blank" rel="noopener" title="فتح الصفحة">${I.link}</a>
          <button class="btn btn-icon btn-danger" data-remove="${esc(p.id)}" title="حذف المنصة">${I.trash}</button>
        </div>
      </div>`;
    }).join('');
  }
  const sel = $('filterPlatform');
  if (sel) {
    const prev = F.platform;
    sel.innerHTML = `<option value="all">كل المنصات</option>` +
      S.platforms.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('') +
      `<option value="__other">مصادر غير مسجّلة</option>`;
    sel.value = [...sel.options].some(o => o.value === prev) ? prev : 'all';
    F.platform = sel.value;
  }
  const target = $('manualTargets');
  if (target) {
    target.innerHTML = `<option value="enabled">كل المنصات المفعّلة (${enabledPlatforms().length})</option>` +
      S.platforms.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  }
  renderMonitorState();
}

/* ============================ Rendering: feed ============================ */
function postPlatformName(p) { return p.platformName || p.author || 'مصدر غير معروف'; }

function filteredPosts() {
  const q = F.query.trim().toLowerCase();
  let list = S.posts.filter(p => {
    if (F.platform === '__other') { if (p.platformId) return false; }
    else if (F.platform !== 'all' && p.platformId !== F.platform) return false;
    if (F.mediaOnly && !p.media) return false;
    if (F.range) {
      const t = p.ts || p.seenAt || 0;
      if (t < Date.now() - F.range * 86400000) return false;
    }
    if (q) {
      const hay = `${p.text || ''} ${postPlatformName(p)}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const by = {
    newest: (a, b) => (b.ts || b.seenAt || 0) - (a.ts || a.seenAt || 0),
    oldest: (a, b) => (a.ts || a.seenAt || 0) - (b.ts || b.seenAt || 0),
    engagement: (a, b) => engagementOf(b) - engagementOf(a),
    likes: (a, b) => (b.likes || 0) - (a.likes || 0),
    comments: (a, b) => (b.comments || 0) - (a.comments || 0),
  };
  list.sort(by[F.sort] || by.newest);
  return list;
}

function postCard(p) {
  const fresh = S.freshKeys.has(p.key);
  const meta = PLATFORM_TYPES[p.platformType] || PLATFORM_TYPES.other;
  const text = String(p.text || '').trim();
  const longText = text.length > 260 || (text.match(/\n/g) || []).length > 6;
  const avatar = p.avatar
    ? `<img src="${esc(p.avatar)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`
    : esc(initials(postPlatformName(p)));

  return `<article class="post ${fresh ? 'fresh' : ''}">
    <header class="post-head">
      <div class="avatar sm">${avatar}</div>
      <div class="who">
        <div class="nm">${esc(postPlatformName(p))}${p.platformId ? `<span class="verified" title="مصدر مسجّل في لوحة التحكم">${I.verified}</span>` : ''}</div>
        <div class="tm" title="${esc(fmtDateTime(p.ts))}">${esc(p.ts ? fmtRelative(p.ts) : 'زمن النشر غير متاح')} · ${esc(meta.label)}</div>
      </div>
      ${fresh ? '<span class="chip cyan">جديد</span>' : ''}
    </header>
    ${text ? `<div class="post-body">
      <div class="post-text ${longText ? 'clamped' : ''}">${esc(text)}</div>
      ${longText ? '<button class="more-btn" data-expand>عرض النص كاملاً ↓</button>' : ''}
    </div>` : ''}
    ${p.media ? `<img class="post-media" src="${esc(p.media)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
    <div class="post-metrics">
      <span class="metric likes"><span class="m-ico">${I.like}</span><span class="num">${fmtNum(p.likes)}</span></span>
      <span class="metric comments"><span class="m-ico">${I.comment}</span><span class="num">${fmtNum(p.comments)}</span></span>
      <span class="metric shares"><span class="m-ico">${I.share}</span><span class="num">${fmtNum(p.shares)}</span></span>
    </div>
    <footer class="post-foot">
      <span title="وقت التقاط المنشور بواسطة سلام">رُصد ${esc(fmtDateTime(p.seenAt))}</span>
      ${p.url ? `<a class="src-link" href="${esc(p.url)}" target="_blank" rel="noopener">${I.link} المصدر الأصلي</a>` : '<span class="src-link" style="color:var(--text-3)">لا يوجد رابط</span>'}
    </footer>
  </article>`;
}

function renderFeed() {
  const list = filteredPosts();
  const host = $('feed');
  const countEl = $('feedCount');
  if (countEl) countEl.textContent = `${list.length} منشور`;

  if (!S.posts.length) {
    host.innerHTML = '';
    $('feedEmpty').style.display = 'block';
    $('loadMoreWrap').style.display = 'none';
    return;
  }
  $('feedEmpty').style.display = 'none';

  if (!list.length) {
    host.innerHTML = `<div class="card" style="grid-column:1/-1"><div class="empty"><h3>لا نتائج مطابقة</h3><p>غيّر كلمة البحث أو أعد ضبط عوامل التصفية لعرض منشورات أخرى.</p><button class="btn btn-ghost" id="resetFilters2">إعادة ضبط التصفية</button></div></div>`;
    $('loadMoreWrap').style.display = 'none';
    const btn = $('resetFilters2');
    if (btn) btn.onclick = resetFilters;
    return;
  }

  host.innerHTML = list.slice(0, F.limit).map(postCard).join('');
  const remaining = list.length - F.limit;
  $('loadMoreWrap').style.display = remaining > 0 ? 'flex' : 'none';
  if (remaining > 0) $('loadMore').textContent = `عرض المزيد (${remaining} منشور متبقٍ)`;
}

function renderLatest() {
  const host = $('latestFeed');
  if (!host) return;
  const latest = S.posts.slice(0, 4);
  if (!latest.length) {
    host.innerHTML = `<div class="empty" style="grid-column:1/-1">
      <img class="mascot" src="assets/salam-mascot.svg" alt="سلام">
      <h3>سلام جاهز للرصد</h3>
      <p>أضِف منصات التحقق التي تتابعها في لوحة التحكم، ثم شغّل الرصد الآلي — وسيتولّى سلام جلب منشوراتها كل ${esc(S.settings.intervalMin)} دقيقة وعرضها هنا.</p>
      <button class="btn btn-gold" data-goto="control">${I.plus}<span>إضافة منصة تحقق</span></button>
    </div>`;
    return;
  }
  host.innerHTML = latest.map(postCard).join('');
}

function resetFilters() {
  F.platform = 'all'; F.range = 0; F.query = ''; F.sort = 'newest'; F.mediaOnly = false; F.limit = 30;
  const q = $('searchInput'); if (q) q.value = '';
  const sp = $('filterPlatform'); if (sp) sp.value = 'all';
  const ss = $('sortSelect'); if (ss) ss.value = 'newest';
  const mo = $('mediaOnly'); if (mo) mo.checked = false;
  document.querySelectorAll('[data-range]').forEach(b => b.classList.toggle('active', b.dataset.range === '0'));
  renderFeed();
}

/* ============================ Rendering: analytics ============================ */
function activitySeries(days) {
  const buckets = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const start = today.getTime() - i * 86400000;
    buckets.push({ start, end: start + 86400000, count: 0, engagement: 0 });
  }
  for (const p of S.posts) {
    const t = p.ts || p.seenAt || 0;
    for (const b of buckets) {
      if (t >= b.start && t < b.end) { b.count++; b.engagement += engagementOf(p); break; }
    }
  }
  return buckets;
}

function renderActivityChart() {
  const days = 14;
  const data = activitySeries(days);
  const max = Math.max(1, ...data.map(d => d.count));
  const W = 700, H = 240, padX = 34, padY = 26, baseline = H - 34;
  const slot = (W - padX * 2) / days;
  const barW = Math.min(30, slot * 0.56);

  let bars = '', labels = '', values = '';
  data.forEach((d, i) => {
    const h = Math.round((d.count / max) * (baseline - padY));
    const x = padX + slot * i + (slot - barW) / 2;
    const y = baseline - h;
    bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(h, d.count ? 3 : 0).toFixed(1)}" rx="5" fill="url(#barGrad)"><title>${new Date(d.start).toLocaleDateString('ar', { day: 'numeric', month: 'short' })}: ${d.count} منشور</title></rect>`;
    if (d.count) values += `<text x="${(x + barW / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--text-2)">${d.count}</text>`;
    const dt = new Date(d.start);
    labels += `<text x="${(x + barW / 2).toFixed(1)}" y="${baseline + 18}" text-anchor="middle" font-size="10.5" fill="var(--text-3)">${dt.getDate()}/${dt.getMonth() + 1}</text>`;
  });

  let grid = '';
  for (let g = 0; g <= 3; g++) {
    const y = padY + ((baseline - padY) / 3) * g;
    grid += `<line x1="${padX}" y1="${y.toFixed(1)}" x2="${W - padX}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3 5"/>`;
    grid += `<text x="${padX - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--text-3)">${Math.round(max - (max / 3) * g)}</text>`;
  }

  $('activityChart').innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" font-family="Cairo, sans-serif">
    <defs><linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3FD8E6"/><stop offset="1" stop-color="#0E93A6"/>
    </linearGradient></defs>
    ${grid}
    <line x1="${padX}" y1="${baseline}" x2="${W - padX}" y2="${baseline}" stroke="var(--border-strong)" stroke-width="1.5"/>
    ${bars}${values}${labels}
  </svg>`;
}

function renderPlatformBars() {
  const rows = S.platforms.map(p => {
    const posts = S.posts.filter(x => x.platformId === p.id);
    return {
      name: p.name,
      posts: posts.length,
      engagement: posts.reduce((s, x) => s + engagementOf(x), 0),
    };
  }).filter(r => r.posts > 0).sort((a, b) => b.engagement - a.engagement);

  const host = $('platformBars');
  if (!rows.length) {
    host.innerHTML = `<div class="hint">لا توجد بيانات كافية بعد — شغّل دورة رصد واحدة على الأقل.</div>`;
    return;
  }
  const max = Math.max(...rows.map(r => r.engagement), 1);
  host.innerHTML = rows.map(r => `<div class="bar-item">
    <div class="bar-top"><span>${esc(r.name)}</span><span class="num">${fmtNum(r.engagement)} تفاعل · ${r.posts} منشور</span></div>
    <div class="bar-track"><div class="bar-fill" style="width:${Math.max(3, (r.engagement / max) * 100).toFixed(1)}%"></div></div>
  </div>`).join('');
}

function renderPostingRate() {
  const host = $('rateBars');
  const rows = S.platforms.map(p => {
    const posts = S.posts.filter(x => x.platformId === p.id);
    return { name: p.name, count: posts.length };
  }).filter(r => r.count).sort((a, b) => b.count - a.count);
  if (!rows.length) { host.innerHTML = `<div class="hint">لا توجد بيانات بعد.</div>`; return; }
  const max = Math.max(...rows.map(r => r.count), 1);
  host.innerHTML = rows.map(r => `<div class="bar-item">
    <div class="bar-top"><span>${esc(r.name)}</span><span class="num">${r.count}</span></div>
    <div class="bar-track"><div class="bar-fill cyan" style="width:${Math.max(3, (r.count / max) * 100).toFixed(1)}%"></div></div>
  </div>`).join('');
}

function renderTopPosts() {
  const top = [...S.posts].sort((a, b) => engagementOf(b) - engagementOf(a)).slice(0, 5);
  const host = $('topPosts');
  if (!top.length) { host.innerHTML = `<div class="hint">لا توجد منشورات بعد.</div>`; return; }
  host.innerHTML = top.map((p, i) => `<div class="plat-row">
    <div class="avatar sm" style="background:linear-gradient(140deg,var(--gold-500),var(--gold-700));color:#21170A">${i + 1}</div>
    <div class="meta">
      <div class="nm">${esc(postPlatformName(p))} <span class="chip gold">${fmtNum(engagementOf(p))} تفاعل</span></div>
      <div class="u" style="direction:rtl;text-align:right;color:var(--text-2)">${esc(String(p.text || 'منشور بدون نص').slice(0, 110))}</div>
    </div>
    ${p.url ? `<a class="btn btn-icon btn-ghost" href="${esc(p.url)}" target="_blank" rel="noopener">${I.link}</a>` : ''}
  </div>`).join('');
}

function renderAnalytics() {
  renderActivityChart();
  renderPlatformBars();
  renderPostingRate();
  renderTopPosts();

  const posts = S.posts;
  const withMedia = posts.filter(p => p.media).length;
  const avgEng = posts.length ? Math.round(posts.reduce((s, p) => s + engagementOf(p), 0) / posts.length) : 0;
  const cycles = S.log.filter(l => l.type === 'auto' || l.type === 'manual');
  const okCycles = cycles.filter(l => l.ok).length;
  $('analyticsKv').innerHTML = `
    <dt>متوسط التفاعل للمنشور</dt><dd class="num">${fmtNum(avgEng)}</dd>
    <dt>منشورات تحتوي وسائط</dt><dd class="num">${withMedia} / ${posts.length}</dd>
    <dt>دورات رصد منفّذة</dt><dd class="num">${cycles.length}</dd>
    <dt>نسبة نجاح الدورات</dt><dd class="num">${cycles.length ? Math.round((okCycles / cycles.length) * 100) : 0}%</dd>
    <dt>أقدم منشور محفوظ</dt><dd>${esc(posts.length ? fmtDateTime(posts[posts.length - 1].ts || posts[posts.length - 1].seenAt) : '—')}</dd>
    <dt>أحدث منشور محفوظ</dt><dd>${esc(posts.length ? fmtDateTime(posts[0].ts || posts[0].seenAt) : '—')}</dd>`;
}

/* ============================ Rendering: audit log ============================ */
function renderLog() {
  const host = $('logTrail');
  if (!S.log.length) {
    host.innerHTML = `<div class="hint">لا توجد عمليات مسجّلة بعد. كل دورة رصد — ناجحة كانت أم فاشلة — ستُسجَّل هنا بتوقيتها وتفاصيلها الكاملة.</div>`;
    return;
  }
  host.innerHTML = S.log.map(l => {
    if (l.type === 'control' || l.type === 'data') {
      return `<div class="trail-item ok">
        <div class="t-head">${esc(l.note || 'إجراء')} <span class="t-time">${esc(fmtDateTime(l.at))}</span></div>
      </div>`;
    }
    const kind = l.ok ? 'ok' : 'bad';
    const title = l.type === 'manual' ? 'رصد فوري (يدوي)' : 'دورة رصد آلية';
    const detail = l.ok
      ? `جُلب ${l.fetched} عنصر · أُضيف ${l.added} منشور جديد · حُدِّث ${l.updated || 0} · المنصات: ${esc((l.platforms || []).join('، '))}`
      : `فشل: ${esc(l.error || 'خطأ غير معروف')}`;
    return `<div class="trail-item ${kind}">
      <div class="t-head">${esc(title)}
        <span class="chip ${l.ok ? 'ok' : 'bad'}">${l.ok ? 'نجحت' : 'فشلت'}</span>
        <span class="t-time">${esc(fmtDateTime(l.at))}</span>
      </div>
      <div class="t-detail">${detail}</div>
      <div class="t-detail" style="color:var(--text-3)">المدة: ${esc(fmtDuration(l.ms))}${l.billedCap ? ` · سقف الفوترة المفروض على التشغيل: ${l.billedCap} عنصر` : ''}${l.runId ? ` · معرّف التشغيل: <span class="ltr num">${esc(l.runId)}</span>` : ''}</div>
    </div>`;
  }).join('');
}

/* ============================ Rendering: control panel ============================ */
function renderKeyState(info) {
  const box = $('keyState');
  if (!S.token) {
    box.className = 'alert alert-warn';
    box.innerHTML = `<span class="a-ico">${I.info}</span><span>لم يُحفظ أي مفتاح بعد — الرصد الآلي لن يعمل قبل ربط حساب Apify.</span>`;
    return;
  }
  const masked = S.token.slice(0, 9) + '••••••••' + S.token.slice(-4);
  box.className = 'alert alert-info';
  box.innerHTML = `<span class="a-ico">${I.check}</span><span>المفتاح محفوظ في هذا المتصفح فقط: <span class="ltr num">${esc(masked)}</span>${info ? `<br>الحساب: <strong>${esc(info.username || info.id || '')}</strong>${info.plan?.id ? ` · الخطة: ${esc(info.plan.id)}` : ''}` : ''}</span>`;
}

function renderSettingsInputs() {
  $('setInterval').value = String(S.settings.intervalMin);
  $('setPerPlatform').value = String(S.settings.perPlatform);
  $('setAutoStart').checked = !!S.settings.autoStart;
  $('setNotify').checked = !!S.settings.notify;
  $('setDbUrl').value = S.settings.dbUrl || '';
  $('setDbSync').checked = !!S.settings.dbSync;
  $('storageInfo').innerHTML = `
    <dt>منشورات محفوظة</dt><dd class="num">${S.posts.length}</dd>
    <dt>منصات مسجّلة</dt><dd class="num">${S.platforms.length}</dd>
    <dt>عمليات في السجل</dt><dd class="num">${S.log.length}</dd>
    <dt>مكان التخزين</dt><dd>ذاكرة المتصفح المحلية</dd>`;
}

function renderDbState(info) {
  const el = $('dbState');
  if (!el) return;
  if (S.dbOnline) {
    el.className = 'chip ok';
    el.textContent = `متصل${info && typeof info.count === 'number' ? ` · ${info.count} منشور مخزّن` : ''}`;
  } else {
    el.className = 'chip';
    el.textContent = 'غير متصل';
  }
}

/* ============================ Render all ============================ */
function renderAll() {
  renderStats();
  renderPlatforms();
  renderLatest();
  renderFeed();
  renderMonitorState();
  renderSettingsInputs();
  if (currentView === 'analytics') renderAnalytics();
  if (currentView === 'log') renderLog();
  const badge = $('postsBadge');
  if (badge) {
    badge.textContent = String(S.posts.length);
    badge.style.display = S.posts.length ? '' : 'none';
  }
}

/* ============================ Events ============================ */
function wireEvents() {
  /* Tabs + any [data-goto] shortcut */
  document.addEventListener('click', ev => {
    const tab = ev.target.closest('.tab');
    if (tab) { showView(tab.dataset.view); return; }
    const goto = ev.target.closest('[data-goto]');
    if (goto) { showView(goto.dataset.goto); return; }
    const expand = ev.target.closest('[data-expand]');
    if (expand) {
      const body = expand.previousElementSibling;
      const open = body.classList.toggle('clamped');
      expand.textContent = open ? 'عرض النص كاملاً ↓' : 'طيّ النص ↑';
      return;
    }
    const rm = ev.target.closest('[data-remove]');
    if (rm) {
      const p = platformById(rm.dataset.remove);
      if (p && confirm(`حذف «${p.name}» من قائمة الرصد؟\nالمنشورات المرصودة منها ستبقى محفوظة.`)) {
        removePlatform(p.id);
        logEntry({ type: 'control', ok: true, note: `حذف منصة: ${p.name}` });
        renderAll(); renderLog();
        toast('حُذفت المنصة من قائمة الرصد');
      }
      return;
    }
  });

  document.addEventListener('change', ev => {
    const tg = ev.target.closest('[data-toggle]');
    if (tg) {
      const p = platformById(tg.dataset.toggle);
      if (p) {
        p.enabled = tg.checked;
        persist.platforms();
        logEntry({ type: 'control', ok: true, note: `${p.enabled ? 'تفعيل' : 'تعطيل'} رصد: ${p.name}` });
        renderPlatforms();
      }
    }
  });

  /* Theme */
  $('themeBtn').onclick = () => {
    const next = document.documentElement.getAttribute('data-theme') === 'pearl' ? 'ink' : 'pearl';
    applyTheme(next);
  };

  /* Monitor controls */
  $('toggleMonitor').onclick = () => setMonitor(!S.monitorOn);
  $('runNow').onclick = () => runCycle(true);
  $('livePill').onclick = () => showView('monitor');

  /* API key */
  $('saveKey').onclick = async () => {
    const value = $('apiKey').value.trim();
    if (!value) { toast('أدخل مفتاح Apify أولاً', 'bad'); return; }
    const btn = $('saveKey');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span><span>جارٍ التحقق…</span>';
    try {
      const info = await apifyWhoAmI(value);
      S.token = value; persist.token();
      $('apiKey').value = '';
      renderKeyState(info);
      logEntry({ type: 'control', ok: true, note: `ربط حساب Apify: ${info.username || info.id || 'حساب'}` });
      toast('تم التحقق من المفتاح وحفظه ✅', 'ok');
      renderLog();
    } catch (err) {
      renderKeyState();
      toast(err.message || 'تعذّر التحقق من المفتاح', 'bad');
    } finally {
      btn.disabled = false; btn.innerHTML = `${I.check}<span>تحقّق واحفظ</span>`;
    }
  };
  $('clearKey').onclick = () => {
    if (!S.token) return;
    if (!confirm('حذف مفتاح Apify من هذا المتصفح؟ سيتوقف الرصد الآلي.')) return;
    S.token = ''; persist.token();
    setMonitor(false);
    renderKeyState();
    toast('حُذف المفتاح من المتصفح');
  };
  $('toggleKeyVis').onclick = () => {
    const input = $('apiKey');
    input.type = input.type === 'password' ? 'text' : 'password';
  };

  /* Add platform */
  $('addPlatformForm').addEventListener('submit', ev => {
    ev.preventDefault();
    const res = addPlatform({
      name: $('platName').value,
      url: $('platUrl').value,
      type: $('platType').value,
    });
    if (!res.ok) { toast(res.error, 'bad'); return; }
    $('platName').value = ''; $('platUrl').value = '';
    logEntry({ type: 'control', ok: true, note: `إضافة منصة: ${res.platform.name}` });
    renderAll(); renderLog();
    toast(`أُضيفت «${res.platform.name}» إلى قائمة الرصد ✅`, 'ok');
  });

  /* Bulk add */
  $('bulkAdd').onclick = () => {
    const lines = $('bulkUrls').value.split('\n').map(s => s.trim()).filter(Boolean);
    if (!lines.length) { toast('ألصق روابط الصفحات أولاً', 'bad'); return; }
    let ok = 0, fail = 0;
    for (const line of lines) {
      const res = addPlatform({ url: line, type: $('platType').value });
      res.ok ? ok++ : fail++;
    }
    $('bulkUrls').value = '';
    if (ok) logEntry({ type: 'control', ok: true, note: `إضافة جماعية: ${ok} منصة` });
    renderAll(); renderLog();
    toast(`أُضيفت ${ok} منصة${fail ? ` · تُجوهلت ${fail} (مكررة أو رابط غير صالح)` : ''}`, ok ? 'ok' : 'bad');
  };

  /* Settings */
  $('setInterval').onchange = ev => {
    S.settings.intervalMin = Math.max(5, Number(ev.target.value) || 30);
    persist.settings();
    renderAll();
    toast(`دورة الرصد الآن كل ${S.settings.intervalMin} دقيقة`);
  };
  $('setPerPlatform').onchange = ev => {
    S.settings.perPlatform = Math.min(50, Math.max(1, Number(ev.target.value) || 5));
    ev.target.value = String(S.settings.perPlatform);
    persist.settings();
    renderMonitorState();
  };
  $('setAutoStart').onchange = ev => { S.settings.autoStart = ev.target.checked; persist.settings(); };
  $('setNotify').onchange = async ev => {
    if (ev.target.checked && 'Notification' in window) {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { ev.target.checked = false; toast('لم يُسمح بالإشعارات في المتصفح', 'bad'); }
    }
    S.settings.notify = ev.target.checked; persist.settings();
  };
  $('setDbUrl').onchange = ev => { S.settings.dbUrl = ev.target.value.trim(); persist.settings(); };
  $('setDbSync').onchange = ev => { S.settings.dbSync = ev.target.checked; persist.settings(); };
  $('pingDb').onclick = async () => {
    const btn = $('pingDb');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span><span>فحص…</span>';
    const info = await dbPing();
    renderDbState(info);
    toast(S.dbOnline ? 'قاعدة البيانات المحلية متصلة 🟢' : 'تعذّر الاتصال — تأكد أن الخادم المحلي يعمل', S.dbOnline ? 'ok' : 'bad');
    btn.disabled = false; btn.innerHTML = `${I.db}<span>فحص الاتصال</span>`;
  };
  $('pushAllDb').onclick = async () => {
    if (!S.dbOnline) { toast('افحص الاتصال بقاعدة البيانات أولاً', 'bad'); return; }
    const saved = await dbSave(S.posts, 'salam-bulk');
    toast(saved ? `أُرسل ${saved} منشور إلى قاعدة البيانات المحلية` : 'لم يُحفظ شيء', saved ? 'ok' : 'bad');
  };

  /* Manual scrape */
  $('manualForm').addEventListener('submit', ev => {
    ev.preventDefault();
    const sel = $('manualTargets').value;
    const targets = sel === 'enabled' ? enabledPlatforms() : [platformById(sel)].filter(Boolean);
    if (!targets.length) { toast('اختر منصة صالحة', 'bad'); return; }
    runCycle(true, {
      platforms: targets,
      perPlatform: Number($('manualCount').value) || S.settings.perPlatform,
      from: $('manualFrom').value || undefined,
      to: $('manualTo').value || undefined,
    });
  });

  /* Filters */
  let searchTimer;
  $('searchInput').oninput = ev => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { F.query = ev.target.value; F.limit = 30; renderFeed(); }, 220);
  };
  $('filterPlatform').onchange = ev => { F.platform = ev.target.value; F.limit = 30; renderFeed(); };
  $('sortSelect').onchange = ev => { F.sort = ev.target.value; renderFeed(); };
  $('mediaOnly').onchange = ev => { F.mediaOnly = ev.target.checked; F.limit = 30; renderFeed(); };
  document.querySelectorAll('[data-range]').forEach(btn => {
    btn.onclick = () => {
      F.range = Number(btn.dataset.range);
      F.limit = 30;
      document.querySelectorAll('[data-range]').forEach(b => b.classList.toggle('active', b === btn));
      renderFeed();
    };
  });
  $('resetFilters').onclick = resetFilters;
  $('loadMore').onclick = () => { F.limit += 30; renderFeed(); };

  /* Export */
  $('exportJson').onclick = () => {
    const list = filteredPosts();
    if (!list.length) { toast('لا توجد منشورات للتصدير', 'bad'); return; }
    exportJson(list); toast(`صُدِّر ${list.length} منشور بصيغة JSON`, 'ok');
  };
  $('exportCsv').onclick = () => {
    const list = filteredPosts();
    if (!list.length) { toast('لا توجد منشورات للتصدير', 'bad'); return; }
    exportCsv(list); toast(`صُدِّر ${list.length} منشور بصيغة CSV`, 'ok');
  };

  /* Data management */
  $('clearPosts').onclick = () => {
    if (!S.posts.length) return;
    if (!confirm(`حذف ${S.posts.length} منشور من ذاكرة المتصفح؟ لا يمكن التراجع.`)) return;
    S.posts = []; S.freshKeys = new Set(); persist.posts();
    logEntry({ type: 'data', ok: true, note: 'مسح جميع المنشورات المحفوظة' });
    renderAll(); renderLog();
    toast('مُسحت المنشورات');
  };
  $('clearLog').onclick = () => {
    S.log = []; persist.log(); renderLog(); renderSettingsInputs();
    toast('مُسح سجل العمليات');
  };
  $('exportBackup').onclick = () => {
    download(`salam-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({
      version: 1, exportedAt: new Date().toISOString(),
      platforms: S.platforms, settings: S.settings, posts: S.posts, log: S.log,
    }, null, 2), 'application/json');
    toast('نُزّلت نسخة احتياطية كاملة', 'ok');
  };
  $('importBackup').onchange = ev => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (Array.isArray(data.platforms)) { S.platforms = data.platforms; persist.platforms(); }
        if (Array.isArray(data.posts)) { S.posts = data.posts; persist.posts(); }
        if (Array.isArray(data.log)) { S.log = data.log; persist.log(); }
        if (data.settings) { S.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings); persist.settings(); }
        renderAll(); renderLog();
        toast('استُعيدت النسخة الاحتياطية ✅', 'ok');
      } catch (_) { toast('ملف النسخة الاحتياطية غير صالح', 'bad'); }
    };
    reader.readAsText(file);
    ev.target.value = '';
  };

  /* Keep the countdown honest when the tab wakes up from sleep */
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && S.monitorOn && !S.cycleRunning && Date.now() >= S.lastRun + intervalMs()) runCycle(false);
  });
  window.addEventListener('beforeunload', () => {
    if (S.cycleRunning && S.currentRunId) apifyAbort(S.currentRunId, S.token);
  });
}

/* ============================ Boot ============================ */
function boot() {
  applyTheme(localStorage.getItem(K.theme) || 'ink');
  wireEvents();
  renderKeyState();
  renderAll();
  renderLog();
  renderDbState();

  if (S.settings.dbSync) dbPing().then(renderDbState);

  const ready = S.token && enabledPlatforms().length;
  if (ready && S.settings.autoStart) {
    S.monitorOn = true;
    renderMonitorState();
  }
  if (!S.platforms.length) showView('control');

  tick();
}

document.addEventListener('DOMContentLoaded', boot);

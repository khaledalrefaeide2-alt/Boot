'use strict';

/*
 * FBXCommon — الدوال المشتركة بين كل صفحات الموقع
 * ------------------------------------------------
 * كانت هذه الدوال مكرَّرة حرفياً في أربع صفحات (sevAccent، fmtNum، esc، sleep،
 * apiError، getToken، saveToDb ...)، ما جعل أي إصلاح يحتاج تكراراً يدوياً أربع
 * مرات — وهو مصدر أخطاء مؤكد. جُمعت هنا في مكان واحد.
 *
 * تُصدَّر كخصائص على window (لا كتعريفات let/const عامة) حتى لا تتعارض مع أي
 * تعريف قديم متبقٍّ في صفحة ما؛ إعادة التعريف تستبدل القيمة بهدوء بدل أن
 * تُسقط الصفحة بخطأ «Identifier has already been declared».
 *
 * يجب تحميله قبل أي سكربت صفحة، وبعد analyzer.js و media.js.
 */

(function (W) {

  /* ============================================================
   * مفاتيح التخزين المحلي — مصدر واحد للحقيقة
   * ============================================================ */
  const STORAGE = {
    key: 'fbx_apify_key',
    theme: 'fbx_theme',
    dbUrl: 'fbx_db_url',
    aiKey: 'fbx_ai_key',
    aiModel: 'fbx_ai_model',
    aiAuto: 'fbx_ai_auto'
  };

  /* ============================================================
   * أدوات عامة
   * ============================================================ */
  const $ = id => document.getElementById(id);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function fmtNum(n) {
    n = Number(n) || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
  }

  // أدوات الاستخراج تعيد أرقام التفاعل أحياناً كنص مختصر ("12.7K"، "1.2M"، "٣٤")؛
  // التجريد الساذج للأرقام كان يحوّل "12.7K" إلى 127 بدل 12700، فتُشوَّه كل الإحصاءات.
  const AR_DIGITS = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    if (typeof v !== 'string') return 0;
    const s = v.trim().replace(/[٠-٩]/g, d => AR_DIGITS[d]).replace(/,/g, '');
    const m = s.match(/^(\d+(?:\.\d+)?)\s*([KkMmBb]|ألف|الف|مليون)?/);
    if (!m) return 0;
    const n = parseFloat(m[1]);
    if (isNaN(n)) return 0;
    const suffix = (m[2] || '').toLowerCase();
    const mult = suffix === 'k' || suffix === 'ألف' || suffix === 'الف' ? 1e3
               : suffix === 'm' || suffix === 'مليون' ? 1e6
               : suffix === 'b' ? 1e9 : 1;
    return Math.round(n * mult);
  }

  const validDate = v => !!v && !isNaN(new Date(v).getTime());

  const getToken = () => (localStorage.getItem(STORAGE.key) || '').trim();


  /* ============================================================
   * قائمة التنقّل: تُطوى على الشاشة الواسعة وتنزلق على الضيّقة
   * ============================================================
   * زرّ واحد بسلوكين. فوق 1024px يطوي السكّة إلى أيقونات ويحفظ الحالة؛
   * تحتها يفتح درجاً فوق حجاب.
   *
   * ما يجعل الدرج قابلاً للاستعمال بلوحة المفاتيح — وهو شرط لا تحسين:
   *   · Escape يغلق، والحجاب يغلق بالنقر
   *   · التركيز ينتقل إلى الدرج عند الفتح ويعود إلى الزرّ عند الإغلاق،
   *     فلا يضيع مكان المستخدم
   *   · بقية الصفحة تصير inert وهو مفتوح، فلا يتسلّل التبويب خلف الحجاب
   *     إلى عناصر لا تُرى — وهو «فخّ تركيز» معكوس أسوأ من الفخّ نفسه
   *   · aria-expanded يعلن الحالة، وaria-controls يربط الزرّ بالقائمة
   */
  const NAV_KEY = 'fbx_nav_collapsed';
  const isNarrow = () => W.matchMedia && W.matchMedia('(max-width: 1024px)').matches;

  function initNav() {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const btn = $('navToggle'), scrim = $('navScrim'), nav = $('mainNav'), col = document.querySelector('.main-col');
    if (!btn || !nav) return;

    function label() {
      const open = isNarrow() ? root.hasAttribute('data-nav-open')
                              : root.getAttribute('data-nav') !== 'collapsed';
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-label', open ? 'طيّ قائمة التنقّل' : 'فتح قائمة التنقّل');
    }

    function openDrawer() {
      if (scrim) scrim.hidden = false;
      // إظهار الحجاب ثم رفع السمة في الإطار التالي حتى يُحرَّك التلاشي فعلاً
      requestAnimationFrame(() => root.setAttribute('data-nav-open', ''));
      if (col) col.setAttribute('inert', '');
      const first = nav.querySelector('a, button');
      if (first) first.focus();
      label();
    }
    function closeDrawer(restore) {
      root.removeAttribute('data-nav-open');
      if (col) col.removeAttribute('inert');
      const done = () => { if (scrim) scrim.hidden = true; };
      // ننتظر انتهاء الانزلاق قبل إخفاء الحجاب، وإلا اختفى المشهد فجأةً
      if (scrim) { scrim.addEventListener('transitionend', done, { once: true }); setTimeout(done, 420); }
      if (restore) btn.focus();
      label();
    }
    function toggleCollapsed() {
      const next = root.getAttribute('data-nav') === 'collapsed' ? '' : 'collapsed';
      if (next) root.setAttribute('data-nav', next); else root.removeAttribute('data-nav');
      try { localStorage.setItem(NAV_KEY, next ? '1' : '0'); } catch (e) { /* تخزين محجوب: الحالة تعيش للجلسة */ }
      label();
    }

    btn.onclick = () => {
      if (!isNarrow()) return toggleCollapsed();
      root.hasAttribute('data-nav-open') ? closeDrawer(true) : openDrawer();
    };
    if (scrim) scrim.onclick = () => closeDrawer(true);
    const closeBtn = $('navClose');
    if (closeBtn) closeBtn.onclick = () => closeDrawer(true);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && root.hasAttribute('data-nav-open')) closeDrawer(true);
    });
    // اختيار وجهة يغلق الدرج: الصفحة تتبدّل، وبقاؤه مفتوحاً فوقها لا معنى له
    nav.addEventListener('click', e => {
      if (e.target.closest('a') && isNarrow()) closeDrawer(false);
    });
    // تجاوز نقطة الانكسار وهو مفتوح يترك الصفحة معطَّلة بـ inert بلا حجاب
    if (W.matchMedia) W.matchMedia('(max-width: 1024px)').addEventListener('change', () => {
      if (!isNarrow() && root.hasAttribute('data-nav-open')) closeDrawer(false);
      label();
    });
    // في الحالة المطويّة لا يبقى إلا الرسم، فمستعمل الفأرة بلا دليل على
    // الوجهة. نعكس الاسم الوصفي في title فيظهر تلميحاً — والقارئ الصوتي
    // يقرأ aria-label كما هو.
    nav.querySelectorAll('a[aria-label]').forEach(a => {
      if (!a.title) a.title = a.getAttribute('aria-label');
    });
    label();
  }

  function postKey(p) {
    return p.key || p.url || `${p.author}|${p.ts || ''}|${(p.text || '').slice(0, 80)}`;
  }

  /* ============================================================
   * السمة (فاتح/داكن)
   * ============================================================ */
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    const btn = $('themeBtn');
    // زرّ السمة رسم لا حرف: يتبع لون الشريط الجانبي ولا يختلف شكله بين الأنظمة
    if (btn) btn.innerHTML = W.FBXIcons ? W.FBXIcons.svg(t === 'dark' ? 'sun' : 'moon') : '';
  }

  function initTheme() {
    const saved = localStorage.getItem(STORAGE.theme) ||
      (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(saved);
    const btn = $('themeBtn');
    if (btn) btn.onclick = () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem(STORAGE.theme, next);
      applyTheme(next);
    };
  }

  /* ============================================================
   * التنبيهات المنبثقة
   * ============================================================ */
  function showToast(msg) {
    const toast = $('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  /* ============================================================
   * لون الشريط الجانبي للبطاقة — يعكس التصنيف ومستوى الخطورة فوراً
   * ============================================================ */
  function sevAccent(a) {
    if (!a) return 'var(--border)';
    if (a.classification === 'NEGATIVE') {
      if (a.level === 'HIGH') return 'var(--danger)';
      if (a.level === 'MEDIUM') return 'var(--warn)';
      return '#c98a7a';
    }
    if (a.classification === 'POSITIVE') return 'var(--success)';
    return 'var(--text-2)';
  }

  /* ============================================================
   * طلبات خدمة الاستخراج — طبقة واحدة مُحصَّنة
   * ------------------------------------------------------------
   * كانت الصفحات الأربع تنادي fetch() الخام مباشرة، فورثت ثلاث مشاكل:
   *
   * 1) «Failed to fetch» عند تشغيل الموقع من ملف محلي (file://).
   *    طلب POST بترويسة Content-Type: application/json ليس طلباً «بسيطاً»
   *    في معايير CORS، فيسبقه المتصفح بطلب فحص مسبق (preflight OPTIONS).
   *    وصفحة file:// تُرسل Origin: null، فإن لم يقبله الخادم في ردّ الفحص
   *    المسبق حُجب الطلب كلّه قبل أن يبدأ — ويظهر «Failed to fetch» بلا أي
   *    رمز حالة. الحل: إرسال نفس المحتوى JSON بترويسة text/plain، فيصير
   *    الطلب «بسيطاً» بلا فحص مسبق أصلاً (الخادم يقرأ الجسم كما هو).
   *
   * 2) أي تعثّر لحظي في الشبكة كان يُسقط الدورة كاملة. دورة رصد لاثنتي
   *    عشرة صفحة تستغرق دقائق وتستطلع الحالة عشرات المرات؛ انقطاع ثانية
   *    واحدة في أي استطلاع كان يُلغي العمل كلّه. الحل: إعادة محاولة
   *    بتباعد متزايد لأخطاء الشبكة وحدها (لا لأخطاء الخادم المنطقية).
   *
   * 3) رسالة الخطأ كانت تصل للمستخدم بالإنجليزية وبلا معنى عملي.
   * ============================================================ */
  const NET_HINT = 'تعذّر الوصول إلى خدمة الاستخراج. تحقّق من اتصالك بالإنترنت، ' +
    'ومن أن مانع الإعلانات أو جدار الحماية لا يحجب api.apify.com.';

  // خطأ الشبكة يأتي من fetch كـ TypeError بلا استجابة؛ أخطاء الخادم لها ردّ ورمز حالة.
  const isNetworkError = e => e instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(e && e.message || '');

  async function apiFetch(url, opts, tries) {
    const n = tries || 3;
    let last;
    for (let i = 0; i < n; i++) {
      try {
        return await fetch(url, opts);
      } catch (e) {
        last = e;
        if (!isNetworkError(e)) throw e;         // خطأ منطقي: لا معنى لإعادة المحاولة
        if (i < n - 1) await sleep(1200 * Math.pow(2, i));   // 1.2s ثم 2.4s
      }
    }
    throw new Error(NET_HINT);
  }

  /* POST بجسم JSON بلا فحص مسبق — راجع الشرح (1) أعلاه.
     نجرّب text/plain أولاً لأنه وحده يتفادى الفحص المسبق، وإن ردّ الخادم بما
     يفيد رفض نوع المحتوى (400 أو 415) نعيد الطلب بـ application/json كما كان.
     فالتحسين لا يمكن أن يكون أسوأ من السلوك السابق في أي حال. */
  async function apiPost(url, body) {
    const payload = JSON.stringify(body == null ? {} : body);
    const res = await apiFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: payload
    });
    if (res.status !== 400 && res.status !== 415) return res;
    return apiFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    });
  }

  const apiGet = url => apiFetch(url);

  /* ============================================================
   * أخطاء واجهة الاستخراج
   * ============================================================ */
  async function apiError(res) {
    let msg = `خطأ من خدمة الاستخراج (HTTP ${res.status})`;
    try {
      const body = await res.json();
      if (body?.error?.message) msg += `: ${body.error.message}`;
    } catch (_) {}
    if (res.status === 401) msg = 'مفتاح الاستخراج غير صحيح أو منتهي. تحقق منه في صفحة الإعدادات.';
    if (res.status === 402) msg = 'رصيد حساب الاستخراج غير كافٍ لتشغيل هذه العملية.';
    return new Error(msg);
  }

  /* ============================================================
   * التنزيل والتصدير
   * ============================================================ */
  function csvCell(v) {
    const s = String(v ?? '');
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  /* منفذ حفظ واحد لكل الصادرات. كان المنطق مكرّراً هنا وفي xlsx-export،
     وهو يعمل في المتصفّح وحده: عنصر <a download> لا يفعل شيئاً داخل
     WebView أندرويد، فيبدو التصدير وكأنه نجح بلا ملف. جعله نقطة واحدة
     على window يسمح لغلاف التطبيق باستبداله بكتابة فعلية على القرص، بلا
     شقّ الوحدات نسختين. */
  W.FBXSave = W.FBXSave || function (blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  };

  function download(content, filename, type) {
    W.FBXSave(new Blob([content], { type }), filename);
  }

  function exportCsv(posts, filename) {
    const header = ['author', 'date', 'text', 'classification', 'level', 'action', 'likes', 'comments', 'shares', 'url'];
    const rows = posts.map(p => {
      const a = p.analysis || {};
      return [
        p.author, p.date ? p.date.toISOString() : '', p.text,
        a.classificationLabel || '', a.levelLabel || '', a.actionLabel || '',
        p.likes, p.comments, p.shares, p.url
      ].map(csvCell).join(',');
    });
    // BOM أمام المحتوى ليفتح Excel النص العربي بترميز صحيح
    download('﻿' + [header.join(','), ...rows].join('\r\n'), filename, 'text/csv;charset=utf-8');
  }

  /* ============================================================
   * توحيد المنشور الخام القادم من أداة الاستخراج
   * ============================================================ */
  function normalizePost(raw, platform) {
    const text = raw.text || raw.message || raw.postText || raw.full_text || '';
    const url = raw.url || raw.postUrl || raw.topLevelUrl || raw.twitterUrl || '';
    const timeVal = raw.time || raw.date || raw.publishedTime || raw.timestamp || raw.createdAt || null;
    let ts = null;
    if (typeof timeVal === 'number') ts = timeVal > 1e12 ? timeVal : timeVal * 1000;
    else if (timeVal) { const d = new Date(timeVal); if (!isNaN(d)) ts = d.getTime(); }

    const author = raw.user?.name || raw.pageName || raw.author?.name || raw.author ||
                   raw.authorName || raw.user?.id || (platform === 'twitter' ? 'حساب X' : 'صفحة فيسبوك');
    const avatar = raw.user?.profilePic || raw.pageProfilePic || raw.author?.profilePicture || '';
    const mediaList = W.FBXMedia ? W.FBXMedia.extract(raw) : [];
    const firstImg = mediaList.find(m => m.type === 'image');
    const media = firstImg ? firstImg.src : (mediaList[0]?.thumb || '');

    const p = {
      text, url, ts,
      date: ts ? new Date(ts) : null,
      author, avatar, media, mediaList, platform: platform || 'facebook',
      likes: num(raw.likes ?? raw.likesCount ?? raw.reactions ?? raw.reactionsCount ?? raw.likeCount ?? raw.favorite_count),
      comments: num(raw.comments ?? raw.commentsCount ?? raw.replyCount ?? raw.reply_count),
      shares: num(raw.shares ?? raw.sharesCount ?? raw.retweetCount ?? raw.retweet_count),
      views: num(raw.viewsCount ?? raw.videoViewCount ?? raw.views ?? raw.viewCount ?? 0),
      postId: raw.postId || raw.id || raw.post_id || raw.id_str || '',
      pageUrl: raw.pageUrl || raw.user?.profileUrl || raw.author?.url || '',
      raw
    };
    /* المُعرِّف الفريد للمنشور. صفحتا الرصد تعتمدانه في ثلاثة مواضع: منع التكرار
       بين الدورات، وتمييز الجديد، واختيار ما يُحفظ في قاعدة البيانات. وغيابه لا
       يُعطِّل واحداً منها فحسب بل يعكس معناها: مجموعة المفاتيح تصير {undefined}،
       فيُطابقها كل منشور تالٍ ويُهمَل باعتباره مكرَّراً — أي يتوقف الرصد عن
       إضافة أي شيء. لذلك يُضبط هنا دائماً وبقيمة غير فارغة. */
    p.key = postKey(p);
    p.analysis = W.FBXAnalyzer.analyze(p);   // تحليل وتصنيف فوري
    return p;
  }

  /* ============================================================
   * قاعدة البيانات المحلية (تُضبط من صفحة الإعدادات)
   * ============================================================ */
  const db = {
    url: (localStorage.getItem(STORAGE.dbUrl) || '').trim().replace(/\/+$/, ''),
    online: false
  };

  async function dbCheck(silent) {
    if (!db.url) return false;
    try {
      const r = await fetch(db.url + '/api/health', { signal: AbortSignal.timeout(4000) });
      const d = await r.json();
      if (!d.ok) throw new Error();
      db.online = true;
      if (!silent) showToast('تم الاتصال بقاعدة البيانات المحلية');
    } catch (_) {
      db.online = false;
      if (!silent) showToast('تعذر الاتصال بقاعدة البيانات — اضبطها من صفحة الإعدادات');
    }
    return db.online;
  }

  async function saveToDb(posts, source, silent) {
    if (!posts || !posts.length) return;
    if (!db.online) {
      if (!silent) showToast('قاعدة البيانات غير متصلة — فعّلها من صفحة الإعدادات');
      return;
    }
    try {
      const payload = posts.map(p => {
        const a = p.analysis || W.FBXAnalyzer.analyze(p);
        return {
          key: postKey(p), text: p.text, url: p.url, ts: p.ts,
          author: p.author, avatar: p.avatar, media: p.media,
          likes: p.likes, comments: p.comments, shares: p.shares, source,
          sentiment: a.classification, emotion: a.subCategory, intent: a.levelLabel,
          domain: p.platform || '', severity: a.level === 'HIGH' ? 3 : a.level === 'MEDIUM' ? 2 : 1,
          action: a.action, flagged: a.flagged ? 1 : 0, analysis: JSON.stringify(a)
        };
      });
      const r = await fetch(db.url + '/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ posts: payload })
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || '');
      showToast(`حُفظ ${d.saved} منشور في قاعدة البيانات`);
    } catch (_) {
      db.online = false;
      if (!silent) showToast('فشل الحفظ في قاعدة البيانات');
    }
  }

  /* ============================================================
   * الظهور التدريجي عند التمرير
   * ------------------------------------------------------------
   * المهارة تقترح Parallax عبر GSAP، لكن GSAP مكتبة خارجية تكسر ضمانة أن
   * هذا الموقع لا يطلب أي ملف من الإنترنت. IntersectionObserver مدمج في
   * المتصفح ويؤدّي الغرض نفسه بلا بايت واحد إضافي، ويستيقظ عند التقاطع
   * فقط بدل الإصغاء لكل حدث تمرير — وهو ما تحذّر منه ملاحظات الأداء.
   *
   * العناصر تُكشف مرة واحدة ثم يتوقّف مراقبتها، فلا يتراكم عمل مع طول الصفحة.
   * ============================================================ */
  function initReveal(root) {
    const scope = root || (typeof document !== 'undefined' ? document : null);
    if (!scope || typeof scope.querySelectorAll !== 'function') return;   // خارج المتصفح
    if (!('IntersectionObserver' in W)) return;   // متصفح قديم: المحتوى ظاهر أصلاً
    // من طلب تقليل الحركة يرى المحتوى مباشرة بلا أي تدرّج
    if (typeof W.matchMedia === 'function' && W.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const targets = scope.querySelectorAll('.panel, .stat-tile, .chart-card, .features-band .feature, .notice');
    if (!targets.length) return;

    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        obs.unobserve(e.target);      // مرة واحدة فقط
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });

    targets.forEach((el, i) => {
      if (el.dataset.revealed) return;
      el.dataset.revealed = '1';
      el.classList.add('reveal');
      // تدرّج زمني بسيط داخل الدفعة الواحدة، بسقف حتى لا ينتظر أحد طويلاً
      el.style.transitionDelay = Math.min(i * 40, 220) + 'ms';
      io.observe(el);
    });
  }

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => initReveal());
    else initReveal();
  }

  /* ============================================================
   * التصدير إلى window
   * ============================================================ */
  const api = {
    STORAGE, $, sleep, escapeHtml, escapeAttr: escapeHtml, fmtNum, num, validDate,
    getToken, postKey, applyTheme, initTheme, initNav, showToast, sevAccent, apiError,
    apiFetch, apiPost, apiGet, isNetworkError, NET_HINT, initReveal,
    csvCell, download, exportCsv, normalizePost, db, dbCheck, saveToDb
  };
  W.FBXCommon = api;
  // تُتاح أيضاً كأسماء عامة مباشرة حفاظاً على بساطة كود الصفحات القائم.
  for (const [k, v] of Object.entries(api)) {
    if (k !== 'STORAGE' && k !== 'db') W[k] = v;
  }

})(window);

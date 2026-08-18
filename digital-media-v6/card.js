'use strict';

/*
 * FBXCard — عرض المنشور المستخرج.
 * ------------------------------------------------------------------
 * كان قالب البطاقة مكرَّراً حرفياً في أربع صفحات، فأي تحسين في العرض كان
 * يحتاج أربعة تعديلات متطابقة. صار هنا في مكان واحد:
 *
 *   FBXCard.html(post, opts)     → HTML بطاقة واحدة
 *   FBXCard.rowHtml(post, opts)  → HTML صف واحد في عرض الجدول
 *   FBXCard.render(container, posts, opts) → يرسم القائمة ويربط أحداثها
 *   FBXCard.injectStyles()       → يحقن CSS الخاص بالعرض
 *
 * نموذجان للعرض:
 *   • «بطاقات» — رأس نظيف (الحساب + التاريخ + شارة الحكم)، ثم النصّ، ثم
 *     الوسائط، ثم الفئة، ثم شريط التفاعل. النصّ قبل الصورة عن قصد: المحرك
 *     يحكم على النصّ، فدفنه تحت صورة يخفي ما جاء المستخدم ليقرأه.
 *   • «جدول»  — صفوف مضغوطة للفرز السريع لمئات المنشورات: مصغّرة،
 *     الحساب، مقتطف، الحكم، التفاعل. هو النموذج العملي لعمل الفرز.
 *
 * الأيقونات كلها SVG مضمَّن لا إيموجي: الإيموجي يتغيّر شكله بين ويندوز
 * وأندرويد وiOS، ولا يقبل لون العلامة، ويجعل الواجهة تبدو غير رسمية.
 */

(function (global) {

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* مسارات الأيقونات مصدرها الوحيد icons.js — فلا تُعرَّف نسخة ثانية هنا
     تتباعد عنها مع الوقت. المقاس يُمرَّر صراحة لأن أيقونات البطاقة تُوضع
     داخل أسطر بمقاسات نصّ مختلفة. */
  const PATHS = (global.FBXIcons && global.FBXIcons.paths) || {};
  const icon = (name, size) =>
    `<svg class="fx-i" viewBox="0 0 24 24" width="${size || 15}" height="${size || 15}" fill="none"
      stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"
      aria-hidden="true">${PATHS[name] || ''}</svg>`;

  /* ============================================================
   * مساعدات
   * ============================================================ */
  function fmtNum(n) {
    n = Number(n) || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'K';
    return String(n);
  }

  function dateOf(p) {
    if (p.date instanceof Date || Object.prototype.toString.call(p.date) === '[object Date]') return p.date;
    if (p.ts) return new Date(p.ts);
    if (p.seenAt) return new Date(p.seenAt);
    return null;
  }
  function dateText(p) {
    const d = dateOf(p);
    if (!d || isNaN(d.getTime())) return 'تاريخ غير معروف';
    return d.toLocaleDateString('ar', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  // لون الحكم — يُشتق من التصنيف والمستوى معاً لا من أحدهما
  function accent(a) {
    if (!a) return 'var(--border)';
    if (a.classification === 'NEGATIVE') {
      if (a.level === 'HIGH') return 'var(--danger)';
      if (a.level === 'MEDIUM') return 'var(--warn)';
      return 'var(--danger-lo)';
    }
    if (a.classification === 'POSITIVE') return 'var(--success)';
    return 'var(--text-2)';
  }

  // مقياس الخطورة: ثلاث شرائح تمتلئ بحسب المستوى — تُقرأ بلمحة بلا قراءة نص
  function meter(a) {
    const filled = !a ? 0 : a.level === 'HIGH' ? 3 : a.level === 'MEDIUM' ? 2 : 1;
    return `<span class="fx-meter" title="${a ? esc(a.levelLabel) + ' الخطورة/الأهمية' : ''}">${
      [1, 2, 3].map(i => `<i class="${i <= filled ? 'on' : ''}"></i>`).join('')}</span>`;
  }

  function authorOf(p) { return p.author || p.page || p.handle || 'غير معروف'; }

  function avatarHtml(p) {
    const name = authorOf(p);
    const initial = esc(String(name).charAt(0) || '?');
    return p.avatar
      ? `<img class="fx-av" src="${esc(p.avatar)}" alt="" onerror="this.outerHTML='<span class=fx-av>${initial}</span>'">`
      : `<span class="fx-av">${initial}</span>`;
  }

  function metricsHtml(p) {
    const bits = [
      ['like', p.likes], ['comment', p.comments], ['share', p.shares],
      ['eye', p.views]
    ].filter(([, v]) => Number(v) > 0);
    if (!bits.length) return '';
    return `<div class="fx-metrics">${bits.map(([k, v]) =>
      `<span class="fx-metric">${icon(k, 14)}<b>${fmtNum(v)}</b></span>`).join('')}</div>`;
  }

  /* ============================================================
   * بطاقة واحدة
   * ============================================================ */
  function html(p, opts) {
    opts = opts || {};
    const id = opts.id != null ? opts.id : 0;
    const a = p.analysis;
    const media = global.FBXMedia ? global.FBXMedia.galleryHtml(p) : '';
    const text = String(p.text || '');
    const handle = p.screenName ? `<span class="fx-handle">@${esc(p.screenName)}</span>` : '';

    /* ترتيب المعلومات: الحساب ← الحكم ← النص ← الوسائط ← التفاعل.
       النصّ قبل الصورة عن قصد: هذه أداة فرز محتوى، والمحرك يحكم على النصّ —
       فدفنه تحت صورة كبيرة يخفي بالضبط ما جاء المستخدم ليقرأه. والحكم في
       الرأس يجعل تصنيف عشرات البطاقات يُمسح بنظرة واحدة عبر الشبكة. */
    const head = `<header class="fx-head">
      ${avatarHtml(p)}
      <span class="fx-head-t">
        <b class="fx-author">${esc(authorOf(p))}${handle}${opts.fresh ? '<i class="fx-new">جديد</i>' : ''}</b>
        <span class="fx-meta">${icon('clock', 12)}<span>${dateText(p)}</span>${a ? meter(a) : ''}</span>
      </span>
      ${a ? `<span class="fx-vd fx-vd-${a.classification.toLowerCase()}">${esc(a.classificationLabel)}</span>` : ''}
    </header>`;

    // إعادة النشر معلومة تخصّ المنشور نفسه لا الصفحة التي تعرضه، فتُقرأ من البيانات
    const rt = p.isRetweet
      ? `<span class="fx-rt">${icon('share', 12)}إعادة نشر من @${esc(p.retweetedFrom || '')}</span>` : '';

    const tags = a ? `<div class="fx-tags">
      <span class="fx-vd-sub">${esc(String(a.subCategory || '').split(' — ')[0])}</span>
      ${a.action !== 'KEEP' ? `<span class="fx-vd-act">${icon('warning', 12)}${esc(a.actionLabel)}</span>` : ''}
      ${a.exceptionApplied ? '<span class="fx-vd-exc">استثناء توثيق/إدانة</span>' : ''}
    </div>` : '';

    return `<article class="fx-card${opts.fresh ? ' fx-fresh' : ''}" style="--acc:${accent(a)}${
      opts.delay ? `;animation-delay:${opts.delay}ms` : ''}">
      ${head}
      <div class="fx-body">
        ${rt}
        <p class="fx-text fx-clamp" id="fxt-${id}">${
          esc(text) || `<em class="fx-notext">— ${esc(opts.emptyLabel || 'منشور بدون نص')} —</em>`}</p>
        ${media ? `<div class="fx-media">${media}</div>` : ''}
        ${tags}
      </div>
      <footer class="fx-foot">
        ${metricsHtml(p)}
        <span class="fx-foot-sp"></span>
        ${a ? `<button type="button" class="fx-btn fx-analysis" data-panel="fxp-${id}"
          title="عرض التحليل الكامل" aria-label="عرض التحليل الكامل">${icon('brain', 15)}</button>` : ''}
        ${p.url ? `<a class="fx-btn fx-open" href="${esc(p.url)}" target="_blank" rel="noopener"
          title="فتح ${esc(opts.openLabel || 'المنشور')} الأصلي" aria-label="فتح ${esc(opts.openLabel || 'المنشور')} الأصلي">${icon('link', 15)}</a>` : ''}
      </footer>
      ${a ? `<div class="fx-panel" id="fxp-${id}" hidden>${global.FBXAnalyzer ? global.FBXAnalyzer.panel(a) : ''}</div>` : ''}
    </article>`;
  }

  /* ============================================================
   * صف الجدول — العرض المضغوط للفرز السريع
   * ============================================================ */
  function rowHtml(p, opts) {
    opts = opts || {};
    const id = opts.id != null ? opts.id : 0;
    const a = p.analysis;
    const list = Array.isArray(p.mediaList) ? p.mediaList : [];
    const thumb = (list[0] && (list[0].thumb || list[0].src)) || p.media || '';
    const text = String(p.text || '').replace(/\s+/g, ' ').trim();

    return `<article class="fx-row${opts.fresh ? ' fx-fresh' : ''}" style="--acc:${accent(a)}">
      <span class="fx-row-thumb">${thumb
        ? `<img src="${esc(thumb)}" alt="" loading="lazy" onerror="this.remove()">`
        : avatarHtml(p)}${list.length > 1 ? `<i class="fx-row-n">${list.length}</i>` : ''}</span>
      <span class="fx-row-main">
        <b class="fx-row-author">${esc(authorOf(p))}${opts.fresh ? '<i class="fx-new">جديد</i>' : ''}</b>
        <span class="fx-row-text">${esc(text) || '— منشور بدون نص —'}</span>
      </span>
      <span class="fx-row-verdict">
        ${a ? `<span class="fx-vd fx-vd-${a.classification.toLowerCase()}">${esc(a.classificationLabel)}</span>${meter(a)}` : ''}
      </span>
      <span class="fx-row-metrics">${metricsHtml(p)}</span>
      <span class="fx-row-date">${dateText(p)}</span>
      <span class="fx-row-acts">
        ${a ? `<button type="button" class="fx-btn fx-analysis" data-panel="fxr-${id}" title="عرض التحليل الكامل">${icon('brain', 14)}</button>` : ''}
        ${p.url ? `<a class="fx-btn fx-open" href="${esc(p.url)}" target="_blank" rel="noopener" title="فتح المنشور">${icon('link', 14)}</a>` : ''}
      </span>
      ${a ? `<div class="fx-panel fx-row-panel" id="fxr-${id}" hidden>${global.FBXAnalyzer ? global.FBXAnalyzer.panel(a) : ''}</div>` : ''}
    </article>`;
  }

  /* ============================================================
   * الرسم + ربط الأحداث
   * ============================================================ */
  function render(container, posts, opts) {
    opts = opts || {};
    if (!container) return;
    injectStyles();
    const table = opts.view === 'table';
    const build = table ? rowHtml : html;
    container.className = table ? 'fx-list fx-table' : 'fx-list fx-cards';
    container.innerHTML = (posts || []).map((p, i) => build(p, {
      id: (opts.prefix || 'c') + i,
      fresh: opts.isFresh ? !!opts.isFresh(p) : false,
      delay: table ? 0 : Math.min(i * 28, 320),
      openLabel: opts.openLabel,
      emptyLabel: opts.emptyLabel
    })).join('');
    bind(container);
  }

  /* زرّ «عرض المزيد» يُضاف فقط للنصوص التي تفيض فعلاً عن ثلاثة أسطر.
     تقدير الفيض بعدد الأحرف غير دقيق — يختلف بعرض البطاقة وحجم الخط واللغة —
     فنقيسه من الصفحة نفسها. القياس في جولة والتعديل في جولة أخرى حتى لا
     يتسبّب كل سطر بإعادة تخطيط منفصلة (layout thrashing) مع مئات البطاقات. */
  function addOverflowButtons(container) {
    const texts = [...container.querySelectorAll('.fx-text.fx-clamp')];
    const overflowing = texts.filter(el => el.scrollHeight > el.clientHeight + 2);
    overflowing.forEach(el => {
      if (el.nextElementSibling && el.nextElementSibling.classList.contains('fx-more')) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fx-more';
      btn.dataset.target = el.id;
      btn.innerHTML = 'عرض المزيد ' + icon('chevron', 13);
      el.insertAdjacentElement('afterend', btn);
    });
  }

  function bind(container) {
    addOverflowButtons(container);
    container.querySelectorAll('.fx-more').forEach(btn => {
      btn.onclick = () => {
        const el = container.querySelector('#' + CSS.escape(btn.dataset.target));
        if (!el) return;
        const clamped = el.classList.toggle('fx-clamp');
        btn.innerHTML = (clamped ? 'عرض المزيد ' : 'عرض أقل ') + icon('chevron', 13);
        btn.classList.toggle('up', !clamped);
      };
    });
    container.querySelectorAll('.fx-analysis').forEach(btn => {
      btn.onclick = () => {
        const el = container.querySelector('#' + CSS.escape(btn.dataset.panel));
        if (!el) return;
        el.hidden = !el.hidden;
        btn.classList.toggle('on', !el.hidden);
        btn.title = el.hidden ? 'عرض التحليل الكامل' : 'إخفاء التحليل';
      };
    });
  }

  /* ============================================================
   * الأنماط
   * ============================================================ */
  function injectStyles() {
    if (typeof document === 'undefined' || document.getElementById('fbx-card-styles')) return;
    const style = document.createElement('style');
    style.id = 'fbx-card-styles';
    style.textContent = CSS_TEXT;
    document.head.appendChild(style);
  }

  const CSS_TEXT = `
  /* ===================================================================
     بطاقة السجلّ — الإصدار 6
     -------------------------------------------------------------------
     الإصدار الخامس كان بطاقة زجاجية تميل في الفضاء عند المرور. هذه
     قصاصة سجلّ: سطح أبيض، خطّ شعري، وقضيب حكم على الحافة الابتدائية.
     لا ظلّ ولا ميل ولا مشهد ثلاثي الأبعاد — المرور يغيّر الحدّ فقط،
     وهو كلّ ما تحتاجه العين لتعرف أين هي.

     والحكم لا يُنقل بلون وحده أبداً (إرشاد «Color Only», شدّة عالية):
     قضيب لوني + شارة نصّية صريحة + رسم. من يرى الألوان يقرأ ثلاثتها،
     ومن لا يراها يقرأ اثنتين.
     =================================================================== */
  .fx-i { flex: none; vertical-align: -2px; }

  /* ===================== الحاويات ===================== */
  .fx-list { margin: 0; }
  .fx-list.fx-cards {
    display: grid; gap: var(--gap, 8px);
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    align-items: stretch;
  }
  .fx-list.fx-table { display: block; border: var(--hair); border-radius: var(--r-lg); overflow: hidden; background: var(--card); }

  /* ===================== البطاقة ===================== */
  .fx-card {
    display: flex; flex-direction: column; min-width: 0;
    background: var(--card); border: var(--hair); border-radius: var(--r);
    border-inline-start: 3px solid var(--acc, var(--rule));
    overflow: hidden; position: relative;
    transition: border-color var(--t, 180ms) var(--ease, ease),
                background var(--t, 180ms) var(--ease, ease);
  }
  .fx-card:hover { background: var(--card-2); border-color: var(--ink-3); border-inline-start-color: var(--acc, var(--rule)); }
  .fx-card:focus-within { border-color: var(--focus); }
  /* المنشور الجديد يُعلَّم بشارة نصّية، والوميض تأكيد لا إعلان */
  .fx-fresh { animation: fxFresh 1.4s var(--ease-out, ease) 1; }
  @keyframes fxFresh { 0%, 100% { background: var(--card); } 30% { background: var(--brand-soft); } }

  /* ---- الرأس ---- */
  .fx-head {
    display: flex; align-items: flex-start; gap: var(--sp-3, 8px);
    padding: var(--pad-card, 12px); padding-bottom: var(--sp-3, 8px);
  }
  .fx-av {
    width: 30px; height: 30px; flex: none; border-radius: var(--r-sm, 3px);
    object-fit: cover; background: var(--card-2); color: var(--ink-3);
    display: grid; place-items: center; font-size: 13px; font-weight: 700;
    border: var(--hair);
  }
  .fx-head-t { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .fx-author {
    font-size: var(--fs-xs, 13px); font-weight: 700; color: var(--ink);
    display: flex; align-items: baseline; gap: var(--sp-2, 4px); flex-wrap: wrap;
    overflow: hidden; text-overflow: ellipsis;
  }
  .fx-handle { font-family: var(--mono); font-weight: 400; font-size: var(--fs-2xs, 12px); color: var(--ink-3); }
  .fx-new {
    font-style: normal; font-size: 10px; font-weight: 700; letter-spacing: .04em;
    background: var(--brand); color: var(--brand-ink);
    padding: 1px 5px; border-radius: var(--r-sm, 3px);
  }
  .fx-meta {
    display: flex; align-items: center; gap: var(--sp-2, 4px);
    font-family: var(--mono); font-size: var(--fs-2xs, 12px); color: var(--ink-3);
    font-variant-numeric: tabular-nums;
  }

  /* شارة الحكم: نصّ صريح لا لون وحده */
  .fx-vd {
    flex: none; align-self: flex-start;
    font-size: 11px; font-weight: 700; letter-spacing: -.01em;
    padding: 2px var(--sp-2, 6px); border-radius: var(--r-sm, 3px);
    border: 1px solid; white-space: nowrap;
  }
  .fx-vd-positive { color: var(--keep);   background: var(--keep-soft);   border-color: var(--keep-line); }
  .fx-vd-neutral  { color: var(--ink-2);  background: var(--card-2);      border-color: var(--rule); }
  .fx-vd-negative { color: var(--remove); background: var(--remove-soft); border-color: var(--remove-line); }

  /* مقياس الخطورة: ثلاث شُرَط ممتلئة بقدر المستوى — شكل لا لون */
  .fx-meter { display: inline-flex; gap: 2px; align-items: center; }
  .fx-meter i { width: 8px; height: 3px; border-radius: 1px; background: var(--rule); display: block; }
  .fx-meter i.on { background: var(--acc, var(--ink-3)); }

  /* ---- الجسم ---- */
  .fx-body { display: flex; flex-direction: column; gap: var(--sp-3, 8px); padding: 0 var(--pad-card, 12px); flex: 1; }
  .fx-rt {
    font-family: var(--mono); font-size: var(--fs-2xs, 12px); color: var(--ink-3);
    display: flex; align-items: center; gap: var(--sp-2, 4px);
  }
  .fx-text {
    flex: none; font-size: var(--fs-xs, 13px); line-height: 1.6; color: var(--ink);
    margin: 0; overflow: hidden; word-break: break-word;
    display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 4; line-clamp: 4;
    min-height: calc(3 * 1.6 * var(--fs-xs, 13px));
  }
  /* بلا وسائط، المساحة المحرَّرة تعود للنصّ لا لفراغ */
  .fx-card:not(:has(.fx-media)) .fx-text { -webkit-line-clamp: 12; line-clamp: 12; }
  .fx-text.fx-open-txt { -webkit-line-clamp: unset; line-clamp: unset; display: block; }
  .fx-notext { color: var(--ink-3); font-style: italic; }
  .fx-media { flex: none; border-radius: var(--r-sm, 3px); overflow: hidden; border: var(--hair); }

  .fx-tags { display: flex; flex-wrap: wrap; gap: var(--sp-2, 4px); margin-top: auto; padding-top: var(--sp-2, 4px); }
  .fx-vd-sub, .fx-vd-act, .fx-vd-exc {
    font-size: 11px; padding: 1px var(--sp-2, 6px); border-radius: var(--r-sm, 3px);
    display: inline-flex; align-items: center; gap: 3px; border: 1px solid transparent;
  }
  .fx-vd-sub { background: var(--card-2); color: var(--ink-2); border-color: var(--rule); }
  .fx-vd-act { background: var(--remove-soft); color: var(--remove); border-color: var(--remove-line); font-weight: 700; }
  .fx-vd-exc { background: var(--keep-soft); color: var(--keep); border-color: var(--keep-line); }

  /* ---- التذييل ---- */
  .fx-foot {
    display: flex; align-items: center; gap: var(--sp-2, 4px);
    padding: var(--sp-3, 8px) var(--pad-card, 12px);
    margin-top: var(--sp-3, 8px); border-top: 1px solid var(--rule-2);
    background: var(--card-2);
  }
  .fx-foot-sp { flex: 1; }
  .fx-metrics { display: flex; gap: var(--sp-3, 8px); align-items: center; }
  .fx-metric {
    display: inline-flex; align-items: center; gap: 3px;
    font-size: var(--fs-2xs, 12px); color: var(--ink-3);
  }
  .fx-metric b { font-weight: 600; color: var(--ink-2); font-family: var(--mono); font-variant-numeric: tabular-nums; }
  .fx-btn {
    display: inline-flex; align-items: center; gap: 3px;
    border: var(--hair); border-radius: var(--r-sm, 3px); background: var(--card);
    color: var(--ink-2); font-size: 11px; font-weight: 600; padding: 4px 8px;
    text-decoration: none; position: relative;
    transition: background var(--t, 180ms) var(--ease, ease), color var(--t, 180ms) var(--ease, ease),
                border-color var(--t, 180ms) var(--ease, ease);
  }
  /* هدف اللمس 44×44 دون تضخيم الشكل — شرط في قائمة التسليم */
  .fx-btn::after { content: ""; position: absolute; inset: 50% 50% auto auto; translate: 50% -50%; width: 44px; height: 44px; }
  .fx-btn:hover { background: var(--card-2); color: var(--ink); border-color: var(--ink-3); }
  .fx-open { color: var(--brand); border-color: var(--brand-line); }
  .fx-open:hover { background: var(--brand-soft); border-color: var(--brand); }

  .fx-panel {
    border-top: var(--hair); background: var(--card-2);
    padding: var(--pad-card, 12px); font-size: var(--fs-2xs, 12px);
  }

  /* ===================== صفّ الجدول ===================== */
  .fx-row {
    display: grid; align-items: center; gap: var(--sp-3, 8px);
    grid-template-columns: 40px minmax(0, 1fr) auto auto auto auto;
    min-height: var(--row-h, 36px); padding: var(--sp-2, 4px) var(--sp-3, 8px);
    border-bottom: 1px solid var(--rule-2);
    border-inline-start: 3px solid var(--acc, transparent);
    transition: background var(--t-fast, 120ms) var(--ease, ease);
  }
  .fx-row:last-child { border-bottom: 0; }
  .fx-row:hover { background: var(--card-2); }
  .fx-row-thumb {
    width: 40px; height: 28px; border-radius: var(--r-sm, 3px); object-fit: cover;
    background: var(--card-2); border: var(--hair); position: relative;
    display: grid; place-items: center; color: var(--ink-3);
  }
  .fx-row-n {
    position: absolute; inset-block-end: 0; inset-inline-end: 0;
    background: var(--ink); color: var(--paper); font-family: var(--mono);
    font-size: 9px; font-style: normal; padding: 0 3px; border-radius: 2px 0 0 0;
  }
  .fx-row-main { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .fx-row-author { font-size: var(--fs-2xs, 12px); font-weight: 700; color: var(--ink); }
  .fx-row-text {
    font-size: var(--fs-2xs, 12px); color: var(--ink-2); overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap;
  }
  .fx-row-date, .fx-row-metrics {
    font-family: var(--mono); font-size: 11px; color: var(--ink-3);
    font-variant-numeric: tabular-nums; white-space: nowrap;
  }
  .fx-row-metrics { display: flex; gap: var(--sp-3, 8px); }
  .fx-row-verdict { display: flex; align-items: center; gap: var(--sp-2, 4px); }
  .fx-row-acts { display: flex; gap: var(--sp-2, 4px); }
  .fx-row-acts .fx-btn { padding: 3px 6px; }
  .fx-row-panel { grid-column: 1 / -1; border-top: var(--hair); margin-top: var(--sp-2, 4px); padding: 0; }

  /* ===================== الظهور المدرَّج ===================== */
  .fx-card, .fx-row { animation: fxIn var(--t-slow, 260ms) var(--ease-out, ease) backwards; }
  @keyframes fxIn { from { opacity: 0; transform: translateY(6px); } }

  @media (max-width: 1024px) {
    .fx-row { grid-template-columns: 40px minmax(0, 1fr) auto auto; }
    .fx-row-metrics, .fx-row-date { display: none; }
  }
  @media (max-width: 620px) {
    .fx-list.fx-cards { grid-template-columns: 1fr; }
    .fx-row { grid-template-columns: 32px minmax(0, 1fr) auto; }
    .fx-row-verdict .fx-meter { display: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .fx-card, .fx-row, .fx-fresh { animation: none; }
  }
  `;

  global.FBXCard = { html, rowHtml, render, bind, injectStyles, icon, _fmtNum: fmtNum, _accent: accent, _dateText: dateText, _meter: meter };

})(typeof window !== 'undefined' ? window : this);

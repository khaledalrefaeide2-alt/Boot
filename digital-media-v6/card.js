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
     بطاقة المنشور — هوية «الحديقة الليلية»
     -------------------------------------------------------------------
     لوح زجاجي مصنفر يعلو عند المرور، وقضيب حكم مضيء على الحافة
     الابتدائية. الاستدارة سخيّة والحشو أوسع من النسخة السويسرية:
     المطلوب حيوية، والحيوية تحتاج هواءً وعمقاً.

     والحكم يصل بثلاث طرق مستقلّة لأن الإرشاد الأعلى شدّةً يمنع نقل
     المعلومة باللون وحده: قضيب + شارة نصّية باسم التصنيف + مقياس من
     ثلاث شُرَط. وألوان الحكم مشبَعة عمداً بينما خضرة الإطار مهدَّأة،
     فالتشبّع نفسه صار حاملاً للمعنى في واجهة كلّها خضرة.
     =================================================================== */
  .fx-i { flex: none; vertical-align: -2px; }

  /* ===================== الحاويات ===================== */
  .fx-list { margin: 0; }
  .fx-list.fx-cards {
    display: grid; gap: var(--gap, 14px);
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    align-items: stretch;
  }
  .fx-list.fx-table {
    display: block; border: var(--hair); border-radius: var(--r-lg);
    overflow: hidden; background: var(--glass); box-shadow: var(--sh-2);
    -webkit-backdrop-filter: blur(var(--blur)) saturate(1.35);
    backdrop-filter: blur(var(--blur)) saturate(1.35);
  }

  /* ===================== البطاقة ===================== */
  .fx-card {
    display: flex; flex-direction: column; min-width: 0; position: relative;
    border-radius: var(--r-lg); overflow: hidden;
    box-shadow: var(--sh-2);
    /* تخطّي ما هو خارج الشاشة. أربعون بطاقة شفافة فوق تدرّج رفعت زمن
       الاستجابة إلى 144ms عند تبديل المظهر، لأن كلّاً منها تُرسم من جديد
       ولو كانت خارج المشهد. المقاس الجوهري مصرَّح به حتى لا يقفز شريط
       التمرير عند دخول البطاقة المشهد — وإلا استُبدلت كلفةُ رسمٍ بإزاحة
       تخطيط، وهي أسوأ. */
    content-visibility: auto;
    contain-intrinsic-size: auto 300px;
    transition: transform var(--t, 220ms) var(--ease-spring, ease),
                box-shadow var(--t, 220ms) var(--ease, ease),
                border-color var(--t, 220ms) var(--ease, ease);
  }
  /* قضيب الحكم: شريط مضيء على الحافة الابتدائية، فوق طبقة الزجاج */
  .fx-card::after {
    content: ""; position: absolute; inset-block: 0; inset-inline-start: 0;
    width: 4px; background: var(--acc, transparent);
    box-shadow: 0 0 14px -2px var(--acc, transparent);
    pointer-events: none; z-index: 1;
  }
  .fx-card:hover { transform: translateY(-3px); box-shadow: var(--sh-3); border-color: var(--sage-line); }
  .fx-card:focus-within { border-color: var(--focus); }
  .fx-fresh { animation: fxFresh 1.6s var(--ease-out, ease) 1; }
  @keyframes fxFresh { 0%, 100% { box-shadow: var(--sh-2); } 35% { box-shadow: var(--glow); } }

  /* ---- الرأس ---- */
  .fx-head {
    display: flex; align-items: flex-start; gap: var(--sp-3, 10px);
    padding: var(--pad-card, 16px); padding-bottom: var(--sp-3, 10px);
    position: relative; z-index: 2;
  }
  .fx-av {
    width: 38px; height: 38px; flex: none; border-radius: 50%;
    object-fit: cover; color: var(--sage); font-size: 15px; font-weight: 700;
    display: grid; place-items: center;
    background: var(--sage-soft); border: 1px solid var(--sage-line);
  }
  .fx-head-t { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .fx-author {
    font-size: var(--fs-sm, 14px); font-weight: 700; color: var(--text);
    display: flex; align-items: baseline; gap: var(--sp-2, 6px); flex-wrap: wrap;
    overflow: hidden; text-overflow: ellipsis;
  }
  .fx-handle { font-family: var(--mono); font-weight: 400; font-size: var(--fs-2xs, 12px); color: var(--text-3); }
  .fx-new {
    font-style: normal; font-size: 10px; font-weight: 700; letter-spacing: .03em;
    background: linear-gradient(140deg, var(--sage-2), var(--sage)); color: var(--sage-ink);
    padding: 2px 8px; border-radius: var(--r-pill);
  }
  .fx-meta {
    display: flex; align-items: center; gap: var(--sp-2, 6px);
    font-family: var(--mono); font-size: var(--fs-2xs, 12px); color: var(--text-3);
    font-variant-numeric: tabular-nums;
    flex-wrap: nowrap; min-width: 0;
  }
  /* التاريخ يُقصّ ولا يلتفّ: لفّه كان يهبط بأيقونة الساعة سطراً وحدها
     ويكسر ارتفاع الرأس بين بطاقة وأخرى. */
  .fx-meta > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fx-meta > .fx-meter { flex: none; }

  /* شارة الحكم: حبّة نصّية — النصّ هو الحامل، واللون تأكيد */
  .fx-vd {
    flex: none; align-self: flex-start;
    font-size: 11px; font-weight: 700; letter-spacing: -.01em;
    padding: 4px var(--sp-3, 10px); border-radius: var(--r-pill);
    border: 1px solid; white-space: nowrap;
  }
  .fx-vd-positive { color: var(--keep);   background: var(--keep-soft);   border-color: var(--keep-line); }
  .fx-vd-neutral  { color: var(--text-2); background: var(--glass-2);     border-color: var(--glass-brd); }
  .fx-vd-negative { color: var(--remove); background: var(--remove-soft); border-color: var(--remove-line); }

  /* مقياس الخطورة: امتلاء هندسي يُقرأ بلا لون */
  .fx-meter { display: inline-flex; gap: 3px; align-items: center; }
  .fx-meter i { width: 9px; height: 4px; border-radius: 2px; background: var(--glass-brd); display: block; }
  .fx-meter i.on { background: var(--acc, var(--text-3)); }

  /* ---- الجسم ---- */
  .fx-body { display: flex; flex-direction: column; gap: var(--sp-3, 10px);
             padding: 0 var(--pad-card, 16px); flex: 1; position: relative; z-index: 2; }
  .fx-rt { font-family: var(--mono); font-size: var(--fs-2xs, 12px); color: var(--text-3);
           display: flex; align-items: center; gap: var(--sp-2, 6px); }
  .fx-text {
    flex: none; font-size: var(--fs-sm, 14px); line-height: 1.65; color: var(--text);
    margin: 0; overflow: hidden; word-break: break-word;
    display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 4; line-clamp: 4;
    min-height: calc(3 * 1.65 * var(--fs-sm, 14px));
  }
  .fx-card:not(:has(.fx-media)) .fx-text { -webkit-line-clamp: 11; line-clamp: 11; }
  .fx-text.fx-open-txt { -webkit-line-clamp: unset; line-clamp: unset; display: block; }
  .fx-notext { color: var(--text-3); font-style: italic; }
  .fx-media { flex: none; border-radius: var(--r-sm, 10px); overflow: hidden; border: var(--hair); }

  .fx-tags { display: flex; flex-wrap: wrap; gap: var(--sp-2, 6px); margin-top: auto; padding-top: var(--sp-2, 6px); }
  .fx-vd-sub, .fx-vd-act, .fx-vd-exc {
    font-size: 11px; padding: 3px var(--sp-3, 10px); border-radius: var(--r-pill);
    display: inline-flex; align-items: center; gap: 4px; border: 1px solid transparent;
  }
  .fx-vd-sub { background: var(--glass-2); color: var(--text-2); border-color: var(--glass-brd); }
  .fx-vd-act { background: var(--remove-soft); color: var(--remove); border-color: var(--remove-line); font-weight: 700; }
  .fx-vd-exc { background: var(--keep-soft); color: var(--keep); border-color: var(--keep-line); }

  /* ---- التذييل ---- */
  .fx-foot {
    display: flex; align-items: center; gap: var(--sp-2, 6px);
    padding: var(--sp-4, 14px) var(--pad-card, 16px);
    margin-top: var(--sp-4, 14px); border-top: var(--hair);
    background: var(--wash); position: relative; z-index: 2;
  }
  .fx-foot-sp { flex: 1; }
  .fx-metrics { display: flex; gap: var(--sp-4, 14px); align-items: center; }
  .fx-metric { display: inline-flex; align-items: center; gap: 4px; font-size: var(--fs-2xs, 12px); color: var(--text-3); }
  .fx-metric b { font-weight: 700; color: var(--text-2); font-family: var(--mono); font-variant-numeric: tabular-nums; }
  .fx-btn {
    display: inline-flex; align-items: center; gap: 4px; position: relative;
    border: var(--hair); border-radius: 50%; background: var(--glass-2);
    color: var(--text-2); font-size: 11px; font-weight: 600;
    width: 34px; height: 34px; justify-content: center; text-decoration: none;
    transition: background var(--t, 220ms) var(--ease, ease), color var(--t, 220ms) var(--ease, ease),
                border-color var(--t, 220ms) var(--ease, ease);
  }
  .fx-btn::after { content: ""; position: absolute; inset: 50% 50% auto auto; translate: 50% -50%; width: 44px; height: 44px; }
  .fx-btn:hover { background: var(--raised); color: var(--text); border-color: var(--sage-line); }
  .fx-open { color: var(--sage); border-color: var(--sage-line); }
  .fx-open:hover { background: var(--sage-soft); border-color: var(--sage); }

  .fx-panel {
    border-top: var(--hair); background: var(--wash-2);
    padding: var(--pad-card, 16px); font-size: var(--fs-2xs, 12px);
    position: relative; z-index: 2;
  }

  /* ===================== صفّ الجدول ===================== */
  .fx-row {
    content-visibility: auto; contain-intrinsic-size: auto var(--row-h, 44px);
    display: grid; align-items: center; gap: var(--sp-4, 14px);
    grid-template-columns: 46px minmax(0, 1fr) auto auto auto auto;
    min-height: var(--row-h, 44px); padding: var(--sp-3, 10px) var(--sp-4, 14px);
    border-bottom: 1px solid var(--glass-brd);
    border-inline-start: 4px solid var(--acc, transparent);
    transition: background var(--t-fast, 140ms) var(--ease, ease);
  }
  .fx-row:last-child { border-bottom: 0; }
  .fx-row:hover { background: var(--glass-2); }
  .fx-row-thumb {
    width: 46px; height: 34px; border-radius: var(--r-sm, 10px); object-fit: cover;
    background: var(--sage-soft); border: 1px solid var(--sage-line); position: relative;
    display: grid; place-items: center; color: var(--sage);
  }
  .fx-row-n {
    position: absolute; inset-block-end: 0; inset-inline-end: 0;
    background: var(--bg); color: var(--sage); font-family: var(--mono);
    font-size: 9px; font-style: normal; padding: 0 4px; border-radius: 6px 0 0 0;
  }
  .fx-row-main { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .fx-row-author { font-size: var(--fs-xs, 13px); font-weight: 700; color: var(--text); }
  .fx-row-text { font-size: var(--fs-2xs, 12px); color: var(--text-2); overflow: hidden;
                 text-overflow: ellipsis; white-space: nowrap; }
  .fx-row-date, .fx-row-metrics {
    font-family: var(--mono); font-size: 11px; color: var(--text-3);
    font-variant-numeric: tabular-nums; white-space: nowrap;
  }
  .fx-row-metrics { display: flex; gap: var(--sp-4, 14px); }
  .fx-row-verdict { display: flex; align-items: center; gap: var(--sp-2, 6px); }
  .fx-row-acts { display: flex; gap: var(--sp-2, 6px); }
  .fx-row-acts .fx-btn { width: 30px; height: 30px; }
  .fx-row-panel { grid-column: 1 / -1; border-top: var(--hair); margin-top: var(--sp-3, 10px); padding: 0; }

  /* ===================== الظهور المدرَّج ===================== */
  .fx-card, .fx-row { animation: fxIn var(--t-slow, 320ms) var(--ease-out, ease) backwards; }
  @keyframes fxIn { from { opacity: 0; transform: translateY(10px) scale(.985); } }

  @media (max-width: 1024px) {
    .fx-row { grid-template-columns: 46px minmax(0, 1fr) auto auto; }
    .fx-row-metrics, .fx-row-date { display: none; }
  }
  @media (max-width: 620px) {
    .fx-list.fx-cards { grid-template-columns: 1fr; }
    .fx-row { grid-template-columns: 38px minmax(0, 1fr) auto; }
    .fx-row-verdict .fx-meter { display: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .fx-card, .fx-row, .fx-fresh { animation: none; }
    .fx-card:hover { transform: none; }
  }
  `;

  global.FBXCard = { html, rowHtml, render, bind, injectStyles, icon, _fmtNum: fmtNum, _accent: accent, _dateText: dateText, _meter: meter };

})(typeof window !== 'undefined' ? window : this);

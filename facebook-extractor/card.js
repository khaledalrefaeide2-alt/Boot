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
      return '#c98a7a';
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
  .fx-i { flex: none; vertical-align: -2px; }

  /* ===================== الحاويات ===================== */
  /* المشهد على الحاوية لا على البطاقة: perspective على كل بطاقة يجعل نقطة
     التلاشي في مركزها هي، فتبدو كلٌّ منها في عالم منفصل. على الحاوية يشترك
     الجميع في نقطة تلاشٍ واحدة، وهذا ما يجعل العمق يبدو حقيقياً. */
  /* align-items: start حتى تأخذ كل بطاقة ارتفاع محتواها. الافتراضي (stretch)
     يمطّ بطاقة بلا وسائط إلى ارتفاع جارتها المصوّرة، فيتخلّف فراغ كبير في
     منتصفها بلا سبب. */
  .fx-list.fx-cards { display: grid; gap: 18px; align-items: start;
    grid-template-columns: repeat(auto-fill, minmax(310px, 1fr));
    perspective: var(--persp, 1100px); perspective-origin: 50% 0; }
  .fx-list.fx-table { display: flex; flex-direction: column; gap: 8px; }

  /* ===================== البطاقة ===================== */
  .fx-card {
    --acc: var(--border);
    position: relative; display: flex; flex-direction: column;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow-xs);
    box-shadow: var(--e2);
    transform-style: preserve-3d;
    transition: box-shadow var(--dur-2) var(--ease), transform var(--dur-2) var(--ease),
                border-color var(--dur-2) var(--ease);
    will-change: transform;
    /* fill-mode: backwards لا both. مع both تبقى القيمة الأخيرة للحركة مطبَّقة
       بعد انتهائها، وقيم الحركة تعلو على التصريحات العادية في سلّم الأسلوب —
       فكان transform النهائي (none) يُلغي تحويل :hover إلى الأبد ويقتل العمق. */
    animation: fxUp var(--dur-3) var(--ease) backwards;
  }
  /* الدخول من العمق لا من الأسفل فقط */
  @keyframes fxUp {
    from { opacity: 0; transform: translate3d(0, 12px, -60px) rotateX(5deg); }
    to   { opacity: 1; transform: none; }
  }
  /* المرور يقرّب البطاقة من الناظر ويميلها قليلاً — والخروج بنفس المنحنى */
  .fx-card:hover { box-shadow: var(--e4); transform: translate3d(0, -5px, 34px) rotateX(1.6deg); }
  .fx-card:active { transform: translate3d(0, -1px, 8px); transition-duration: var(--dur-1); }
  /* الوسائط تتقدّم قليلاً على مستوى البطاقة فيُقرأ ارتفاعها فوقها */
  .fx-card:hover .fx-media { transform: translateZ(16px); }
  .fx-media { transition: transform var(--dur-2) var(--ease); }
  /* شريط الحكم أعلى البطاقة — أوضح من حدّ جانبي رفيع، ولا يزاحم النص */
  .fx-card::before { content: ''; position: absolute; inset-inline: 0; top: 0; height: 3px; background: var(--acc); z-index: 4; }
  .fx-fresh { box-shadow: 0 0 0 2px var(--sage-soft), var(--shadow-md); }

  /* الرأس صفّ نظيف فوق سطح البطاقة لا طبقة فوق الصورة. التراكب كان أنيقاً
     على صور اختبار هادئة، لكن صور المنشورات الحقيقية مزدحمة — فيتنازع النص
     والصورة على الانتباه ويخسر كلاهما. */
  .fx-head {
    display: flex; align-items: center; gap: 10px;
    padding: 12px 13px 0; min-width: 0;
  }
  .fx-av {
    width: 34px; height: 34px; border-radius: 11px; flex: none; object-fit: cover;
    background: linear-gradient(150deg, var(--green-600), var(--green-900)); color: #fff;
    display: grid; place-items: center; font-weight: 700; font-size: var(--fs-2xs);
    box-shadow: 0 0 0 1px var(--border);
  }
  .fx-head-t { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .fx-author { font-size: var(--fs-sm); font-weight: 700; display: flex; align-items: center; gap: 6px;
    line-height: 1.45; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fx-meta { display: flex; align-items: center; gap: 5px; font-size: var(--fs-2xs); color: var(--text-2); }
  .fx-meta > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fx-meta .fx-meter { margin-inline-start: 3px; }
  .fx-new { font-style: normal; background: var(--sage); color: #0b1820; border-radius: 999px;
    padding: 1px 7px; font-size: var(--fs-2xs); font-weight: 700; flex: none; }
  .fx-handle { font-weight: 400; font-size: var(--fs-xs); opacity: .72; direction: ltr; }
  .fx-rt { display: inline-flex; align-items: center; gap: 5px; align-self: flex-start;
    background: var(--sage-soft); color: var(--green-700); border-radius: 999px;
    padding: 3px 10px; font-size: var(--fs-2xs); font-weight: 700; }
  [data-theme="dark"] .fx-rt { color: var(--sage); }

  /* الجسم */
  .fx-body { padding: 11px 13px 13px; flex: 1; display: flex; flex-direction: column; gap: 9px; }
  .fx-text { font-size: var(--fs-sm); line-height: 1.75; word-break: break-word; white-space: pre-wrap; margin: 0; }
  .fx-clamp { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .fx-notext { color: var(--text-2); }
  .fx-more { align-self: flex-start; border: none; background: none; cursor: pointer; padding: var(--s1) 0;
    font-family: inherit; font-size: var(--fs-xs); font-weight: 700; color: var(--green-600);
    display: inline-flex; align-items: center; gap: 3px; }
  [data-theme="dark"] .fx-more { color: var(--sage); }
  .fx-more.up .fx-i { transform: rotate(180deg); }
  .fx-more:hover { text-decoration: underline; }

  /* الوسائط داخل الجسم بحوافّ مستديرة ومسافة عن أطراف البطاقة — إطار حول
     الصورة بدل لصقها بالحافة، وهو ما يعطي الإحساس العصري بالبطاقة المطبوعة. */
  .fx-media { margin-top: 1px; }

  /* سطر الفئة والإجراء */
  .fx-tags { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding-top: 2px; }
  .fx-vd-sub { font-size: var(--fs-2xs); color: var(--text-2); background: var(--surface-2);
    border-radius: 999px; padding: 3px 10px; overflow: hidden; text-overflow: ellipsis;
    white-space: nowrap; min-width: 0; }
  .fx-vd-act { font-size: var(--fs-2xs); font-weight: 700; color: var(--danger); background: var(--danger-soft);
    border-radius: 999px; padding: 3px 9px; display: inline-flex; align-items: center; gap: 4px; }
  .fx-vd-exc { font-size: var(--fs-2xs); font-weight: 700; color: var(--green-700); background: var(--primary-soft);
    border-radius: 999px; padding: 3px 9px; }
  [data-theme="dark"] .fx-vd-exc { color: var(--sage); }

  /* شارة الحكم في الرأس: تُمسح عبر شبكة البطاقات بنظرة واحدة */
  .fx-vd { font-size: var(--fs-2xs); font-weight: 700; border-radius: 999px; padding: 4px 11px;
    border: 1px solid transparent; white-space: nowrap; flex: none; align-self: flex-start; }
  .fx-vd-negative { background: var(--danger-soft); color: var(--danger); border-color: color-mix(in srgb, var(--danger) 26%, transparent); }
  .fx-vd-positive { background: var(--success-soft); color: var(--success); border-color: color-mix(in srgb, var(--success) 26%, transparent); }
  .fx-vd-neutral  { background: var(--surface-2); color: var(--text-2); border-color: var(--border); }

  /* مقياس الخطورة */
  .fx-meter { display: inline-flex; gap: 2px; align-items: center; flex: none; }
  .fx-meter i { width: 10px; height: 3px; border-radius: 2px; background: var(--border); display: block; }
  .fx-meter i.on { background: var(--acc); }

  /* القدم */
  .fx-foot { display: flex; align-items: center; gap: 8px; padding: 9px 12px; flex-wrap: nowrap;
    border-top: 1px solid var(--border); background: var(--surface-2); }
  .fx-foot-sp { flex: 1; min-width: 4px; }
  /* سطر واحد لا يلتف: المؤشرات تنكمش والأزرار تحتفظ بمقاسها */
  .fx-metrics { display: flex; align-items: center; gap: 10px; flex-wrap: nowrap; min-width: 0; overflow: hidden; }
  .fx-metric { flex: none; }
  .fx-metric { display: inline-flex; align-items: center; gap: 4px; font-size: var(--fs-2xs); color: var(--text-2); }
  .fx-metric b { font-weight: 700; color: var(--text); font-size: var(--fs-2xs); }
  .fx-btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 5px; flex: none;
    border: 1px solid var(--border); background: var(--surface); color: var(--text);
    border-radius: 999px; padding: 6px 9px; cursor: pointer;
    font-family: inherit; font-size: var(--fs-xs); font-weight: 700; text-decoration: none;
    transition: border-color var(--dur-2) var(--ease), color var(--dur-2) var(--ease),
                background var(--dur-2) var(--ease), transform var(--dur-2) var(--ease),
                box-shadow var(--dur-2) var(--ease);
  }
  .fx-btn:hover { border-color: var(--green-500); color: var(--green-700); transform: translateY(-1px); box-shadow: var(--e2); }
  .fx-btn.on { background: var(--primary-soft); border-color: var(--green-500); color: var(--green-700); }
  [data-theme="dark"] .fx-btn:hover, [data-theme="dark"] .fx-btn.on { color: var(--sage); }
  .fx-panel { border-top: 1px solid var(--border); padding: 0 14px 12px; }

  /* ===================== صف الجدول ===================== */
  .fx-row {
    --acc: var(--border);
    display: grid; align-items: center; gap: 12px;
    grid-template-columns: 54px minmax(0, 1fr) auto auto auto auto;
    position: relative; overflow: hidden;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius-sm); padding: 9px 12px 9px 12px;
    padding-inline-start: 15px;
    transition: box-shadow var(--dur-2) var(--ease), border-color var(--dur-2) var(--ease),
                transform var(--dur-2) var(--ease);
  }
  .fx-row::before { content: ''; position: absolute; inset-block: 0; inset-inline-start: 0; width: 4px; background: var(--acc); }
  .fx-row:hover { box-shadow: var(--e3); transform: translate3d(0, -1px, 10px); border-color: color-mix(in srgb, var(--acc) 30%, var(--border)); }
  .fx-list.fx-table { perspective: var(--persp, 1100px); }
  .fx-row-thumb { position: relative; width: 54px; height: 40px; border-radius: 8px; overflow: hidden;
    background: var(--surface-2); display: grid; place-items: center; }
  .fx-row-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .fx-row-n { position: absolute; inset-block-end: 2px; inset-inline-start: 2px; font-style: normal;
    background: rgba(11,24,32,.75); color: #fff; font-size: var(--fs-2xs); font-weight: 700;
    border-radius: 999px; padding: 0 5px; }
  .fx-row-main { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .fx-row-author { font-size: var(--fs-sm); font-weight: 700; display: flex; align-items: center; gap: 6px; }
  .fx-row-text { font-size: var(--fs-xs); color: var(--text-2); line-height: 1.5;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fx-row-verdict { display: flex; align-items: center; gap: 7px; flex: none; }
  .fx-row-metrics { flex: none; }
  .fx-row-date { font-size: var(--fs-2xs); color: var(--text-2); white-space: nowrap; flex: none; }
  .fx-row-acts { display: flex; gap: 5px; flex: none; }
  .fx-row-acts .fx-btn { padding: 5px 8px; }
  .fx-row-panel { grid-column: 1 / -1; border-top: 1px solid var(--border); margin-top: 8px; padding: 0; }

  @media (max-width: 1024px) {
    .fx-row { grid-template-columns: 54px minmax(0, 1fr) auto auto; }
    .fx-row-metrics, .fx-row-date { display: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .fx-card { animation: none; }
    .fx-card:hover, .fx-row:hover, .fx-card:hover .fx-media { transform: none; }
    .fx-list.fx-cards, .fx-list.fx-table { perspective: none; }
  }
  @media (max-width: 620px) {
    .fx-list.fx-cards { grid-template-columns: 1fr; }
    .fx-row { grid-template-columns: 44px minmax(0, 1fr) auto; }
    .fx-row-verdict .fx-meter { display: none; }
  }
  `;

  global.FBXCard = { html, rowHtml, render, bind, injectStyles, icon, _fmtNum: fmtNum, _accent: accent, _dateText: dateText, _meter: meter };

})(typeof window !== 'undefined' ? window : this);

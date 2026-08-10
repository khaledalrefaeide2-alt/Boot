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
 *   • «بطاقات» — الوسائط أولاً بملء العرض، ورأس المنشور فوقها على تدرّج
 *     داكن، ثم النص، ثم سطر الحكم، ثم شريط التفاعل. بصري وسريع المسح.
 *   • «جدول»  — صفوف مضغوطة للفرز السريع لمئات المنشورات: مصغّرة،
 *     الحساب، مقتطف، الحكم، التفاعل. هو النموذج العملي لعمل الفرز.
 *
 * الأيقونات كلها SVG مضمَّن لا إيموجي: الإيموجي يتغيّر شكله بين ويندوز
 * وأندرويد وiOS، ولا يقبل لون العلامة، ويجعل الواجهة تبدو غير رسمية.
 */

(function (global) {

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ============================================================
   * أيقونات SVG — مقاس موحّد، تأخذ لونها من currentColor
   * ============================================================ */
  const ICON = {
    like: '<path d="M7 22h9.3a2 2 0 0 0 2-1.6l1.4-7A2 2 0 0 0 17.7 11H14l.7-3.9A2.2 2.2 0 0 0 12.5 4.5L9 12"/><rect x="2.5" y="11" width="4.5" height="11" rx="1"/>',
    comment: '<path d="M21 12a8.5 8.5 0 0 1-12.3 7.6L3 21l1.4-5.4A8.5 8.5 0 1 1 21 12Z"/>',
    share: '<path d="m17 2 5 5-5 5"/><path d="M22 7H9a5 5 0 0 0-5 5v1"/><path d="m7 22-5-5 5-5"/><path d="M2 17h13a5 5 0 0 0 5-5v-1"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
    link: '<path d="M13.5 10.5 21 3"/><path d="M15 3h6v6"/><path d="M20 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5"/>',
    brain: '<path d="M12 5.5a3 3 0 0 0-5.6-1.5A2.8 2.8 0 0 0 4 8.6a3 3 0 0 0 .6 5A3 3 0 0 0 12 15Z"/><path d="M12 5.5A3 3 0 0 1 17.6 4 2.8 2.8 0 0 1 20 8.6a3 3 0 0 1-.6 5A3 3 0 0 1 12 15Z"/><path d="M12 15v4.5"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    alert: '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 10v4"/><path d="M12 17.5v.01"/>'
  };
  const icon = (name, size) =>
    `<svg class="fx-i" viewBox="0 0 24 24" width="${size || 15}" height="${size || 15}" fill="none"
      stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"
      aria-hidden="true">${ICON[name] || ''}</svg>`;

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
    const hasMedia = !!media;

    // الرأس فوق الوسائط على تدرّج داكن عند وجود صورة، أو سطر عادي عند غيابها
    const handle = p.screenName ? `<span class="fx-handle">@${esc(p.screenName)}</span>` : '';
    const head = `<div class="fx-head">${avatarHtml(p)}
      <span class="fx-head-t">
        <b class="fx-author">${esc(authorOf(p))}${handle}${opts.fresh ? '<i class="fx-new">جديد</i>' : ''}</b>
        <span class="fx-date">${icon('clock', 12)}${dateText(p)}</span>
      </span></div>`;

    // إعادة النشر معلومة تخصّ المنشور نفسه لا الصفحة التي تعرضه، فتُقرأ من البيانات
    const rt = p.isRetweet
      ? `<span class="fx-rt">${icon('share', 12)}إعادة نشر من @${esc(p.retweetedFrom || '')}</span>` : '';

    const verdict = a ? `<div class="fx-verdict">
      <span class="fx-vd fx-vd-${a.classification.toLowerCase()}">${esc(a.classificationLabel)}</span>
      ${meter(a)}
      <span class="fx-vd-sub">${esc(String(a.subCategory || '').split(' — ')[0])}</span>
      ${a.action !== 'KEEP' ? `<span class="fx-vd-act">${icon('alert', 12)}${esc(a.actionLabel)}</span>` : ''}
      ${a.exceptionApplied ? '<span class="fx-vd-exc">استثناء توثيق/إدانة</span>' : ''}
    </div>` : '';

    return `<article class="fx-card${opts.fresh ? ' fx-fresh' : ''}" style="--acc:${accent(a)}${
      opts.delay ? `;animation-delay:${opts.delay}ms` : ''}">
      ${hasMedia ? `<div class="fx-cover">${media}<div class="fx-scrim">${head}</div></div>` : `<div class="fx-plainhead">${head}</div>`}
      <div class="fx-body">
        ${rt}
        <p class="fx-text fx-clamp" id="fxt-${id}">${
          esc(text) || `<em class="fx-notext">— ${esc(opts.emptyLabel || 'منشور بدون نص')} —</em>`}</p>
        ${verdict}
      </div>
      <div class="fx-foot">
        ${metricsHtml(p)}
        <span class="fx-foot-sp"></span>
        ${a ? `<button type="button" class="fx-btn fx-analysis" data-panel="fxp-${id}"
          title="عرض التحليل الكامل" aria-label="عرض التحليل الكامل">${icon('brain', 15)}</button>` : ''}
        ${p.url ? `<a class="fx-btn fx-open" href="${esc(p.url)}" target="_blank" rel="noopener"
          title="فتح ${esc(opts.openLabel || 'المنشور')} الأصلي" aria-label="فتح ${esc(opts.openLabel || 'المنشور')} الأصلي">${icon('link', 15)}</a>` : ''}
      </div>
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
  .fx-list.fx-cards { display: grid; gap: 18px; grid-template-columns: repeat(auto-fill, minmax(310px, 1fr)); }
  .fx-list.fx-table { display: flex; flex-direction: column; gap: 8px; }

  /* ===================== البطاقة ===================== */
  .fx-card {
    --acc: var(--border);
    position: relative; display: flex; flex-direction: column;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow-xs);
    transition: box-shadow .28s ease, transform .28s ease, border-color .28s ease;
    animation: fxUp .45s cubic-bezier(.22,.8,.28,1) both;
  }
  @keyframes fxUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
  .fx-card:hover { box-shadow: var(--shadow-lg); transform: translateY(-3px); }
  /* شريط الحكم أعلى البطاقة — أوضح من حدّ جانبي رفيع، ولا يزاحم النص */
  .fx-card::before { content: ''; position: absolute; inset-inline: 0; top: 0; height: 3px; background: var(--acc); z-index: 4; }
  .fx-fresh { box-shadow: 0 0 0 2px var(--sage-soft), var(--shadow-md); }

  /* الغلاف: الوسائط بملء العرض والرأس فوقها على تدرّج */
  .fx-cover { position: relative; }
  .fx-cover .media-grid { margin: 0; border-radius: 0; height: 160px; }
  .fx-scrim {
    position: absolute; inset-inline: 0; bottom: 0; z-index: 3; pointer-events: none;
    padding: 26px 13px 9px;
    background: linear-gradient(to top, rgba(8,20,27,.88) 0%, rgba(8,20,27,.55) 45%, transparent 100%);
  }
  .fx-scrim .fx-author, .fx-scrim .fx-date { color: #fff; }
  .fx-scrim .fx-date { opacity: .8; }
  .fx-scrim .fx-av { box-shadow: 0 0 0 2px rgba(255,255,255,.5); }
  .fx-plainhead { padding: 13px 14px 0; }

  .fx-head { display: flex; align-items: center; gap: 9px; min-width: 0; }
  .fx-av {
    width: 30px; height: 30px; border-radius: 50%; flex: none; object-fit: cover;
    background: linear-gradient(155deg, var(--green-600), var(--green-900)); color: #fff;
    display: grid; place-items: center; font-weight: 700; font-size: .74rem;
  }
  .fx-head-t { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .fx-author { font-size: .82rem; font-weight: 700; display: flex; align-items: center; gap: 6px;
    line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fx-new { font-style: normal; background: var(--sage); color: #0b1820; border-radius: 999px;
    padding: 1px 7px; font-size: .58rem; font-weight: 700; flex: none; }
  .fx-date { font-size: .66rem; color: var(--text-2); display: flex; align-items: center; gap: 4px; }
  .fx-handle { font-weight: 400; font-size: .72rem; opacity: .72; direction: ltr; }
  .fx-rt { display: inline-flex; align-items: center; gap: 5px; align-self: flex-start;
    background: var(--sage-soft); color: var(--green-700); border-radius: 999px;
    padding: 3px 10px; font-size: .65rem; font-weight: 700; }
  [data-theme="dark"] .fx-rt { color: var(--sage); }

  /* الجسم */
  .fx-body { padding: 12px 14px 13px; flex: 1; display: flex; flex-direction: column; gap: 9px; }
  .fx-text { font-size: .8rem; line-height: 1.75; word-break: break-word; white-space: pre-wrap; margin: 0; }
  .fx-clamp { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .fx-notext { color: var(--text-2); }
  .fx-more { align-self: flex-start; border: none; background: none; cursor: pointer; padding: 0;
    font-family: inherit; font-size: .7rem; font-weight: 700; color: var(--green-600);
    display: inline-flex; align-items: center; gap: 3px; }
  .fx-more.up .fx-i { transform: rotate(180deg); }
  .fx-more:hover { text-decoration: underline; }

  /* سطر الحكم */
  .fx-verdict { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-top: auto; padding-top: 2px; }
  .fx-vd { font-size: .68rem; font-weight: 700; border-radius: 999px; padding: 3px 11px;
    border: 1px solid transparent; white-space: nowrap; }
  .fx-vd-negative { background: var(--danger-soft); color: var(--danger); border-color: color-mix(in srgb, var(--danger) 22%, transparent); }
  .fx-vd-positive { background: var(--success-soft); color: var(--success); border-color: color-mix(in srgb, var(--success) 22%, transparent); }
  .fx-vd-neutral  { background: var(--surface-2); color: var(--text-2); border-color: var(--border); }
  .fx-vd-sub { font-size: .68rem; color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .fx-vd-act { font-size: .66rem; font-weight: 700; color: var(--danger); background: var(--danger-soft);
    border-radius: 999px; padding: 3px 9px; display: inline-flex; align-items: center; gap: 4px; }
  .fx-vd-exc { font-size: .64rem; font-weight: 700; color: var(--green-700); background: var(--primary-soft);
    border-radius: 999px; padding: 3px 9px; }

  /* مقياس الخطورة */
  .fx-meter { display: inline-flex; gap: 2px; align-items: center; flex: none; }
  .fx-meter i { width: 12px; height: 4px; border-radius: 2px; background: var(--border); display: block; }
  .fx-meter i.on { background: var(--acc); }

  /* القدم */
  .fx-foot { display: flex; align-items: center; gap: 8px; padding: 9px 12px; flex-wrap: nowrap;
    border-top: 1px solid var(--border); background: var(--surface-2); }
  .fx-foot-sp { flex: 1; min-width: 4px; }
  /* سطر واحد لا يلتف: المؤشرات تنكمش والأزرار تحتفظ بمقاسها */
  .fx-metrics { display: flex; align-items: center; gap: 10px; flex-wrap: nowrap; min-width: 0; overflow: hidden; }
  .fx-metric { flex: none; }
  .fx-metric { display: inline-flex; align-items: center; gap: 4px; font-size: .68rem; color: var(--text-2); }
  .fx-metric b { font-weight: 700; color: var(--text); font-size: .7rem; }
  .fx-btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 5px; flex: none;
    border: 1px solid var(--border); background: var(--surface); color: var(--text);
    border-radius: 999px; padding: 6px 9px; cursor: pointer;
    font-family: inherit; font-size: .68rem; font-weight: 700; text-decoration: none;
    transition: border-color .18s ease, color .18s ease, background .18s ease;
  }
  .fx-btn:hover { border-color: var(--green-500); color: var(--green-700); }
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
    transition: box-shadow .2s ease, border-color .2s ease;
  }
  .fx-row::before { content: ''; position: absolute; inset-block: 0; inset-inline-start: 0; width: 4px; background: var(--acc); }
  .fx-row:hover { box-shadow: var(--shadow); }
  .fx-row-thumb { position: relative; width: 54px; height: 40px; border-radius: 8px; overflow: hidden;
    background: var(--surface-2); display: grid; place-items: center; }
  .fx-row-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .fx-row-n { position: absolute; inset-block-end: 2px; inset-inline-start: 2px; font-style: normal;
    background: rgba(11,24,32,.75); color: #fff; font-size: .55rem; font-weight: 700;
    border-radius: 999px; padding: 0 5px; }
  .fx-row-main { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .fx-row-author { font-size: .76rem; font-weight: 700; display: flex; align-items: center; gap: 6px; }
  .fx-row-text { font-size: .74rem; color: var(--text-2); line-height: 1.5;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fx-row-verdict { display: flex; align-items: center; gap: 7px; flex: none; }
  .fx-row-metrics { flex: none; }
  .fx-row-date { font-size: .66rem; color: var(--text-2); white-space: nowrap; flex: none; }
  .fx-row-acts { display: flex; gap: 5px; flex: none; }
  .fx-row-acts .fx-btn { padding: 5px 8px; }
  .fx-row-panel { grid-column: 1 / -1; border-top: 1px solid var(--border); margin-top: 8px; padding: 0; }

  @media (max-width: 1024px) {
    .fx-row { grid-template-columns: 54px minmax(0, 1fr) auto auto; }
    .fx-row-metrics, .fx-row-date { display: none; }
  }
  @media (max-width: 620px) {
    .fx-list.fx-cards { grid-template-columns: 1fr; }
    .fx-row { grid-template-columns: 44px minmax(0, 1fr) auto; }
    .fx-row-verdict .fx-meter { display: none; }
  }
  `;

  global.FBXCard = { html, rowHtml, render, bind, injectStyles, icon, _fmtNum: fmtNum, _accent: accent, _dateText: dateText, _meter: meter };

})(typeof window !== 'undefined' ? window : this);

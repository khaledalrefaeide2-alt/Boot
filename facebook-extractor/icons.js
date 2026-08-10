'use strict';

/*
 * FBXIcons — مجموعة أيقونات الموقع، رسوم SVG مضمَّنة.
 * ------------------------------------------------------------------
 * لماذا لا إيموجي؟ الإيموجي يُرسم بخط النظام لا بخط الموقع: يختلف شكله
 * ولونه وحجمه بين ويندوز وماك وأندرويد، ولا يقبل لون الحالة (فالتحذير
 * لا يصير أحمر والنجاح لا يصير أخضر)، ويخرج الموقع عن الطابع الرسمي.
 * هذه المجموعة رسوم خطّية موحّدة تأخذ لونها من `currentColor` ومقاسها
 * من `font-size`، فتنسجم مع أي نصّ توضع بجانبه تلقائياً.
 *
 * الاستخدام:
 *   في HTML الثابت:  <i class="ic" data-ic="settings"></i>
 *                    ثم يستبدلها FBXIcons.hydrate() عند تحميل الصفحة.
 *   في HTML المولَّد: FBXIcons.svg('settings')
 *
 * كتابة <i data-ic> في الصفحات بدل لصق SVG كامل في كل موضع تُبقي الصفحات
 * مقروءة، وتجعل تعديل أي أيقونة تعديلاً واحداً هنا لا مئات التعديلات.
 */

(function (global) {

  /* المسارات كلها على شبكة 24×24، بلا تعبئة، بحدّ سمكه 1.7 ووصلات مدوّرة */
  const P = {
    /* ------- علامة الموقع والتنقّل ------- */
    logo:      '<path d="M12 3v4"/><circle cx="12" cy="13" r="2.5"/><path d="M7.4 8.4a6.5 6.5 0 0 0 0 9.2"/><path d="M16.6 8.4a6.5 6.5 0 0 1 0 9.2"/><path d="M4.6 5.6a10.5 10.5 0 0 0 0 14.8"/><path d="M19.4 5.6a10.5 10.5 0 0 1 0 14.8"/>',
    search:    '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    chart:     '<path d="M3 21h18"/><rect x="4" y="12" width="4" height="7" rx="1"/><rect x="10" y="7" width="4" height="12" rx="1"/><rect x="16" y="14" width="4" height="5" rx="1"/>',
    signal:    '<circle cx="12" cy="12" r="2"/><path d="M8.5 8.5a5 5 0 0 0 0 7"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M5.8 5.8a9 9 0 0 0 0 12.4"/><path d="M18.2 5.8a9 9 0 0 1 0 12.4"/>',
    x:         '<path d="M4 4h4.2l11.8 16h-4.2Z"/><path d="M19 4 5 20"/>',
    settings:  '<circle cx="12" cy="12" r="3"/><path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"/>',

    /* ------- الحالة ------- */
    moon:      '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>',
    sun:       '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    warning:   '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 10v4"/><path d="M12 17.5v.01"/>',
    check:     '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
    close:     '<path d="M6 6 18 18M18 6 6 18"/>',
    ban:       '<circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/>',
    alarm:     '<path d="M18 9a6 6 0 1 0-12 0c0 6-2 7.5-2 7.5h16S18 15 18 9Z"/><path d="M10.5 20.5a2 2 0 0 0 3 0"/>',
    flag:      '<path d="M5 21V4"/><path d="M5 5h11l-2 3.5L16 12H5Z"/>',
    clock:     '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
    hourglass: '<path d="M7 3h10M7 21h10"/><path d="M8 3v3.5L12 11l4-4.5V3"/><path d="M8 21v-3.5L12 13l4 4.5V21"/>',
    bulb:      '<path d="M9.5 17.5h5"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9V15h7v-1.1A6 6 0 0 0 12 3Z"/>',
    bolt:      '<path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12Z"/>',
    trophy:    '<path d="M8 4h8v5a4 4 0 0 1-8 0Z"/><path d="M8 5.5H5.5A2.5 2.5 0 0 0 8 10"/><path d="M16 5.5h2.5A2.5 2.5 0 0 1 16 10"/><path d="M10 13.5h4"/><path d="M9 20h6"/><path d="M12 13.5V20"/>',
    shield:    '<path d="M12 3 5 5.8v5.4c0 4.3 3 8 7 9.8 4-1.8 7-5.5 7-9.8V5.8Z"/><path d="m9.2 12 2 2 3.6-4"/>',
    sparkle:   '<path d="m12 3 1.9 5.3L19 10l-5.1 1.7L12 17l-1.9-5.3L5 10l5.1-1.7Z"/><path d="M18.5 16.5 19 18l1.5.5L19 19l-.5 1.5L18 19l-1.5-.5L18 18Z"/>',

    /* ------- الإجراءات ------- */
    download:  '<path d="M12 3v12"/><path d="m7.5 11 4.5 4.5 4.5-4.5"/><path d="M4 20h16"/>',
    upload:    '<path d="M12 20V8"/><path d="m7.5 12 4.5-4.5 4.5 4.5"/><path d="M4 4h16"/>',
    save:      '<path d="M5 4h11l3 3v13H5Z"/><path d="M8 4v5h7V4"/><rect x="8" y="13" width="8" height="7"/>',
    database:  '<ellipse cx="12" cy="6" rx="7.5" ry="3"/><path d="M4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6"/><path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3"/>',
    file:      '<path d="M14 3H6v18h12V7Z"/><path d="M14 3v4h4"/><path d="M9 13h6M9 17h4"/>',
    library:   '<path d="M3.5 5.5h6a2.5 2.5 0 0 1 2.5 2.5v11a2 2 0 0 0-2-2h-6.5Z"/><path d="M20.5 5.5h-6A2.5 2.5 0 0 0 12 8v11a2 2 0 0 1 2-2h6.5Z"/>',
    trash:     '<path d="M4 6.5h16"/><path d="M9.5 6.5V4h5v2.5"/><path d="M6.5 6.5 7.5 21h9l1-14.5"/><path d="M10.5 10v7M13.5 10v7"/>',
    plus:      '<path d="M12 5v14M5 12h14"/>',
    play:      '<circle cx="12" cy="12" r="9"/><path d="M10 8.5 16 12l-6 3.5Z"/>',
    pause:     '<circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/>',
    stop:      '<circle cx="12" cy="12" r="9"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
    refresh:   '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v4.5h-4.5"/>',
    rocket:    '<path d="M12 3c3.5 2.4 5 6 5 9.5L12 17l-5-4.5C7 9 8.5 5.4 12 3Z"/><circle cx="12" cy="10" r="1.8"/><path d="M9 17c-1.5.8-2 2-2 4 2 0 3.2-.5 4-2"/><path d="M15 17c1.5.8 2 2 2 4-2 0-3.2-.5-4-2"/>',
    brain:     '<path d="M12 5.5a3 3 0 0 0-5.6-1.5A2.8 2.8 0 0 0 4 8.6a3 3 0 0 0 .6 5A3 3 0 0 0 12 15Z"/><path d="M12 5.5A3 3 0 0 1 17.6 4 2.8 2.8 0 0 1 20 8.6a3 3 0 0 1-.6 5A3 3 0 0 1 12 15Z"/><path d="M12 15v4.5"/>',
    key:       '<circle cx="8" cy="14" r="4"/><path d="m11 11 8-8"/><path d="M16.5 5.5 19 8"/><path d="M14 8l2.5 2.5"/>',
    eye:       '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff:    '<path d="M4 4l16 16"/><path d="M9.9 5.3A9.6 9.6 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4"/><path d="M6.2 8A17 17 0 0 0 2 12s3.6 7 10 7a9.5 9.5 0 0 0 4-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    printer:   '<path d="M7 9V3h10v6"/><rect x="3.5" y="9" width="17" height="7" rx="2"/><path d="M7 14h10v7H7Z"/>',
    plug:      '<path d="M9 3v6M15 3v6"/><path d="M6 9h12v3a6 6 0 0 1-12 0Z"/><path d="M12 18v3"/>',
    inbox:     '<path d="M4 13 6.5 4.5h11L20 13v6H4Z"/><path d="M4 13h5l1 2.5h4L15 13h5"/>',
    calendar:  '<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 10h17"/><path d="M8 3v4M16 3v4"/>',
    news:      '<path d="M4 5h13v15H5.5A1.5 1.5 0 0 1 4 18.5Z"/><path d="M17 8h3v10.5a1.5 1.5 0 0 1-3 0Z"/><path d="M7 8.5h7M7 12h7M7 15.5h4"/>',
    edit:      '<path d="M4 20h4L19 9l-4-4L4 16Z"/><path d="m14.5 5.5 4 4"/>',
    grid:      '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
    rows:      '<path d="M4 6.5h16M4 12h16M4 17.5h16"/>',
    card:      '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19"/><path d="M6 15h4"/>',
    image:     '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m4.5 17 4.5-4.5 3 3 3.5-3.5 4 4.5"/>',
    video:     '<rect x="2.5" y="5.5" width="13" height="13" rx="2.5"/><path d="m15.5 10 6-3v10l-6-3Z"/>',
    arrowDown: '<path d="M12 4v15"/><path d="m6.5 13.5 5.5 5.5 5.5-5.5"/>',

    /* ------- التفاعل على المنشورات ------- */
    like:      '<path d="M7 22h9.3a2 2 0 0 0 2-1.6l1.4-7A2 2 0 0 0 17.7 11H14l.7-3.9A2.2 2.2 0 0 0 12.5 4.5L9 12"/><rect x="2.5" y="11" width="4.5" height="11" rx="1"/>',
    comment:   '<path d="M21 12a8.5 8.5 0 0 1-12.3 7.6L3 21l1.4-5.4A8.5 8.5 0 1 1 21 12Z"/>',
    share:     '<path d="m17 2 5 5-5 5"/><path d="M22 7H9a5 5 0 0 0-5 5v1"/><path d="m7 22-5-5 5-5"/><path d="M2 17h13a5 5 0 0 0 5-5v-1"/>',
    link:      '<path d="M13.5 10.5 21 3"/><path d="M15 3h6v6"/><path d="M20 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5"/>',
    chevron:   '<path d="m6 9 6 6 6-6"/>',

    /* ------- المؤشرات الدلالية (نقاط ملوّنة) ------- */
    dot:       '<circle cx="12" cy="12" r="5"/>'
  };

  function svg(name, cls) {
    const d = P[name];
    return `<svg class="ic-svg${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"
      aria-hidden="true" focusable="false">${d || ''}</svg>`;
  }

  const has = name => Object.prototype.hasOwnProperty.call(P, name);

  /* يستبدل كل <i data-ic="..."> داخل عنصر برسم SVG. آمن للاستدعاء مراراً:
     العناصر المعالَجة تُعلَّم فلا تُعاد معالجتها مع كل إعادة رسم. */
  function hydrate(root) {
    const scope = root || (typeof document !== 'undefined' ? document : null);
    if (!scope || !scope.querySelectorAll) return 0;
    let n = 0;
    scope.querySelectorAll('i.ic[data-ic]:not([data-ic-done])').forEach(el => {
      el.setAttribute('data-ic-done', '1');
      el.innerHTML = svg(el.dataset.ic);
      n++;
    });
    return n;
  }

  function injectStyles() {
    if (typeof document === 'undefined' || document.getElementById('fbx-icon-styles')) return;
    const style = document.createElement('style');
    style.id = 'fbx-icon-styles';
    // المقاس من font-size واللون من currentColor: الأيقونة تتبع النص المجاور تلقائياً
    style.textContent = `
    .ic { display: inline-flex; align-items: center; justify-content: center; flex: none; line-height: 0; }
    .ic-svg { width: 1.15em; height: 1.15em; display: block; }
    .ic.lg .ic-svg { width: 1.5em; height: 1.5em; }
    .ic.tone-ok   { color: var(--success); }
    .ic.tone-warn { color: var(--warn); }
    .ic.tone-bad  { color: var(--danger); }
    .ic.tone-mute { color: var(--text-2); }
    /* الأيقونة داخل زرّ أو شريحة تتباعد عن النص تلقائياً */
    .btn .ic, .pill .ic, .hero-cta .ic, .side-nav a .ic { margin-inline-end: 1px; }
    `;
    document.head.appendChild(style);
  }

  function init() {
    injectStyles();
    hydrate(document);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  global.FBXIcons = { svg, hydrate, injectStyles, has, paths: P };

})(typeof window !== 'undefined' ? window : this);

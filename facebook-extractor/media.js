'use strict';

/*
 * FBXMedia — استخراج وعرض الوسائط (صور + فيديو) لمنشورات فيسبوك.
 * ------------------------------------------------------------
 * وحدة مشتركة تُستخدم في صفحات الموقع لعرض معرض وسائط داخل بطاقة المنشور:
 *   FBXMedia.extract(raw)          → [{type:'image'|'video', src, thumb}]
 *   FBXMedia.galleryHtml(post)     → HTML لمعرض الوسائط
 *   FBXMedia.injectStyles()        → يحقن CSS الخاص بالمعرض
 * لا ترسل أي بيانات للخارج — كل شيء يجري محلياً في المتصفح.
 */

(function (global) {

  const isImgUrl = u => typeof u === 'string' && /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(u);
  const isVidUrl = u => typeof u === 'string' && /\.(mp4|webm|mov|m3u8)(\?|$)/i.test(u);

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // يستخرج قائمة الوسائط من عنصر خام بمختلف الأشكال التي تعيدها أداة الاستخراج.
  function extract(raw) {
    if (!raw || typeof raw !== 'object') return [];
    const out = [], seen = new Set();
    const push = (type, src, thumb) => {
      src = src || ''; thumb = thumb || '';
      const kk = type + '|' + (src || thumb);
      if ((!src && !thumb) || seen.has(kk)) return;
      seen.add(kk); out.push({ type, src, thumb });
    };
    const arrays = [raw.media, raw.attachments, raw.images, raw.photos, raw.videos].filter(Array.isArray);
    for (const arr of arrays) {
      for (const m of arr) {
        if (!m) continue;
        if (typeof m === 'string') { isVidUrl(m) ? push('video', m, '') : push('image', '', m); continue; }
        const tn = String(m.__typename || m.type || m.mediaType || '').toLowerCase();
        const thumb = m.thumbnail || m.thumbnailUrl || m.photo_image?.uri || m.image?.uri || m.preview || '';
        const vids = m.videoUrl || m.video_url || m.video?.uri || m.playableUrl || m.playable_url ||
                     (isVidUrl(m.url) ? m.url : '') || (isVidUrl(m.src) ? m.src : '');
        const imgs = m.photo_image?.uri || m.image?.uri || (isImgUrl(m.url) ? m.url : '') ||
                     (isImgUrl(m.src) ? m.src : '') || m.thumbnail || '';
        if (tn.includes('video') || vids) push('video', vids, thumb || imgs);
        else if (imgs || thumb) push('image', imgs || thumb, '');
        else if (m.url) push('image', '', m.url);
      }
    }
    const topVid = raw.videoUrl || raw.video_url || raw.video?.uri || (isVidUrl(raw.url) ? raw.url : '');
    if (topVid) push('video', topVid, raw.thumbnail || raw.previewImage || '');
    return out;
  }

  /* ------------------------------------------------------------------
   * المعرض داخل البطاقة: فسيفساء مضغوطة (بارتفاع ثابت) + عارض مكبّر عند النقر.
   * البطاقة تبقى قصيرة كما طُلب، والصورة/الفيديو يُشاهَد كبيراً في العارض عند الطلب —
   * فلا تعارض بين إيجاز البطاقة وجودة العرض.
   * ------------------------------------------------------------------ */

  // قائمة الوسائط تُخزَّن على عنصر الشبكة نفسه (data-media) لا في سجلّ عام،
  // فلا يتراكم شيء في الذاكرة مع إعادة رسم آلاف البطاقات.
  function galleryHtml(post) {
    let list = Array.isArray(post.mediaList) ? post.mediaList : [];
    if (!list.length && post.media) list = [{ type: 'image', src: post.media, thumb: '' }];
    list = list.filter(m => m && (m.src || m.thumb));
    if (!list.length) return '';

    const postUrl = post.url || '';
    const shown = list.slice(0, 4);
    const extra = list.length - shown.length;

    const tiles = shown.map((m, i) => {
      const isVid = m.type === 'video';
      const poster = m.thumb || (isVid ? '' : m.src) || '';
      const plus = (i === shown.length - 1 && extra > 0)
        ? `<span class="media-more">+${extra}</span>` : '';
      const badge = isVid ? '<span class="media-play">▶</span>' : '';
      const visual = poster
        ? `<img class="media-el" loading="lazy" src="${esc(poster)}" alt="" onerror="this.closest('.media-item').classList.add('no-img')" onload="FBXMedia.autoCrop(this)">`
        : `<span class="media-blank">${isVid ? '🎬' : '🖼️'}</span>`;

      // فيديو بلا رابط تشغيل مباشر لا يمكن عرضه في العارض — يفتح المنشور الأصلي
      if (isVid && !m.src) {
        return `<a class="media-item" href="${esc(postUrl || '#')}" target="_blank" rel="noopener" title="فتح المنشور الأصلي">
          ${visual}${badge}${plus}</a>`;
      }
      return `<button type="button" class="media-item" data-i="${i}" aria-label="عرض الوسيط ${i + 1} من ${list.length}">
        ${visual}${badge}${plus}</button>`;
    }).join('');

    const payload = esc(JSON.stringify({ items: list, url: postUrl }));
    return `<div class="media-grid n${shown.length}" data-media="${payload}">${tiles}</div>`;
  }

  /* ------------------------------------------------------------------
   * العارض المكبّر (Lightbox)
   * ------------------------------------------------------------------ */
  let lb = null, lbItems = [], lbIndex = 0, lbUrl = '', lbReturnFocus = null;

  function buildLightbox() {
    if (lb) return lb;
    lb = document.createElement('div');
    lb.className = 'fbx-lb';
    lb.hidden = true;
    lb.setAttribute('role', 'dialog');
    lb.setAttribute('aria-modal', 'true');
    lb.innerHTML = `
      <button type="button" class="fbx-lb-x" aria-label="إغلاق">✕</button>
      <button type="button" class="fbx-lb-nav prev" aria-label="السابق">›</button>
      <div class="fbx-lb-stage"></div>
      <button type="button" class="fbx-lb-nav next" aria-label="التالي">‹</button>
      <div class="fbx-lb-bar">
        <span class="fbx-lb-count" dir="ltr"></span>
        <a class="fbx-lb-open" target="_blank" rel="noopener">فتح المنشور الأصلي ↗</a>
      </div>`;
    lb.addEventListener('click', e => {
      if (e.target === lb) return closeLightbox();
      if (e.target.closest('.fbx-lb-x')) return closeLightbox();
      if (e.target.closest('.fbx-lb-nav.prev')) return step(-1);
      if (e.target.closest('.fbx-lb-nav.next')) return step(1);
    });
    document.body.appendChild(lb);
    return lb;
  }

  function renderSlide() {
    const m = lbItems[lbIndex];
    if (!m) return;
    const stage = lb.querySelector('.fbx-lb-stage');
    const src = m.type === 'video' ? (m.src || m.thumb) : (m.src || m.thumb);
    stage.innerHTML = m.type === 'video' && m.src
      ? `<video controls autoplay playsinline ${m.thumb ? `poster="${esc(m.thumb)}"` : ''} src="${esc(src)}"></video>`
      : `<img src="${esc(src)}" alt="">`;
    lb.querySelector('.fbx-lb-count').textContent = lbItems.length > 1 ? `${lbIndex + 1} / ${lbItems.length}` : '';
    const open = lb.querySelector('.fbx-lb-open');
    open.href = lbUrl || src || '#';
    const multi = lbItems.length > 1;
    lb.querySelectorAll('.fbx-lb-nav').forEach(b => { b.style.display = multi ? '' : 'none'; });
  }

  function step(d) {
    if (lbItems.length < 2) return;
    lbIndex = (lbIndex + d + lbItems.length) % lbItems.length;
    renderSlide();
  }

  function openLightbox(items, index, url) {
    if (!Array.isArray(items) || !items.length) return;
    buildLightbox();
    lbItems = items; lbIndex = Math.max(0, Math.min(index | 0, items.length - 1)); lbUrl = url || '';
    lbReturnFocus = document.activeElement;
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
    renderSlide();
    lb.querySelector('.fbx-lb-x').focus();
  }

  function closeLightbox() {
    if (!lb || lb.hidden) return;
    lb.querySelector('.fbx-lb-stage').innerHTML = ''; // يوقف تشغيل الفيديو فوراً
    lb.hidden = true;
    document.body.style.overflow = '';
    if (lbReturnFocus && lbReturnFocus.focus) lbReturnFocus.focus();
    lbReturnFocus = null;
  }

  // مستمع واحد على المستند بدل مستمع لكل بطاقة — يعمل مع البطاقات المُضافة لاحقاً
  function bindOnce() {
    if (global.__fbxMediaBound) return;
    global.__fbxMediaBound = true;
    document.addEventListener('click', e => {
      const tile = e.target.closest('button.media-item');
      if (!tile) return;
      const grid = tile.closest('.media-grid');
      if (!grid) return;
      let data;
      try { data = JSON.parse(grid.dataset.media || '{}'); } catch (_) { return; }
      if (!data.items || !data.items.length) return;
      e.preventDefault();
      openLightbox(data.items, parseInt(tile.dataset.i, 10) || 0, data.url);
    });
    document.addEventListener('keydown', e => {
      if (!lb || lb.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); closeLightbox(); }
      // في واجهة من اليمين لليسار: السهم الأيسر يتقدّم، والأيمن يرجع
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step(1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); step(-1); }
    });
  }

  // يقيس نسبة الحواف السوداء الفعلية داخل بيانات بكسل الصورة (لا يخمّن نسبة ثابتة)، ويعيد
  // إحداثيات القصّ إن وُجدت حواف حقيقية بأمان، أو null إن تعذّر القياس أو لم توجد حواف تُذكر.
  function detectCropBox(imgEl) {
    const iw = imgEl.naturalWidth, ih = imgEl.naturalHeight;
    if (!iw || !ih) return null;
    const maxSide = 90;
    const scale = Math.min(1, maxSide / Math.max(iw, ih));
    const sw = Math.max(1, Math.round(iw * scale)), sh = Math.max(1, Math.round(ih * scale));
    const cvs = document.createElement('canvas');
    cvs.width = sw; cvs.height = sh;
    const ctx = cvs.getContext('2d');
    ctx.drawImage(imgEl, 0, 0, sw, sh);
    let data;
    try { data = ctx.getImageData(0, 0, sw, sh).data; }
    catch (e) { return null; } // مصدر بلا CORS يمنع قراءة البكسلات — نتجاهل بأمان ونترك الصورة كما هي
    const rowLum = new Float64Array(sh), colLum = new Float64Array(sw);
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const i = (y * sw + x) * 4;
        const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        rowLum[y] += l; colLum[x] += l;
      }
    }
    for (let y = 0; y < sh; y++) rowLum[y] /= sw;
    for (let x = 0; x < sw; x++) colLum[x] /= sh;
    const THRESH = 16, maxCutFrac = 0.4;
    const scanIn = (arr, fromStart) => {
      const n = arr.length, maxCut = Math.floor(n * maxCutFrac);
      let i = 0;
      if (fromStart) { while (i < maxCut && arr[i] < THRESH) i++; }
      else { while (i < maxCut && arr[n - 1 - i] < THRESH) i++; }
      return i;
    };
    const top = scanIn(rowLum, true), bottom = scanIn(rowLum, false);
    const left = scanIn(colLum, true), right = scanIn(colLum, false);
    if ((top + bottom) < sh * 0.06 && (left + right) < sw * 0.06) return null; // لا حواف تُذكر
    if (sh - top - bottom < sh * 0.35 || sw - left - right < sw * 0.35) return null; // أمان: تجنّب قصّ مبالغ فيه
    const fx = iw / sw, fy = ih / sh;
    const cx = Math.round(left * fx), cy = Math.round(top * fy);
    const cw = Math.max(1, iw - Math.round((left + right) * fx));
    const ch = Math.max(1, ih - Math.round((top + bottom) * fy));
    return { cx, cy, cw, ch };
  }

  // يُستدعى عند تحميل كل صورة معرض (onload) لقصّ حوافها السوداء الحقيقية آلياً إن أمكن قياسها،
  // دون التأثير على الصور السليمة (لا حواف) أو كسر العرض عند تعذّر القراءة (قيود CORS مثلاً).
  function autoCrop(imgEl) {
    if (imgEl.dataset.fbxCropDone) return;
    imgEl.dataset.fbxCropDone = '1';
    try {
      const box = detectCropBox(imgEl);
      if (!box) return;
      const out = document.createElement('canvas');
      out.width = box.cw; out.height = box.ch;
      out.getContext('2d').drawImage(imgEl, box.cx, box.cy, box.cw, box.ch, 0, 0, box.cw, box.ch);
      out.toBlob(blob => {
        if (!blob) return;
        imgEl.src = URL.createObjectURL(blob);
        imgEl.classList.add('fbx-cropped');
      }, 'image/jpeg', 0.87);
    } catch (e) { /* أي خطأ يُتجاهل بأمان — تبقى الصورة الأصلية معروضة كما هي */ }
  }

  function injectStyles() {
    bindOnce();
    if (document.getElementById('fbx-media-styles')) return;
    const css = `
    /* ===== فسيفساء داخل البطاقة: ارتفاع ثابت مهما كان عدد الوسائط، فلا تطول البطاقة أبداً ===== */
    .media-grid { display: grid; gap: 2px; margin: 7px 0 0; height: 152px;
      border-radius: 14px; overflow: hidden; background: var(--border, #e0eaee); }
    .media-grid.n1 { grid-template-columns: 1fr; }
    .media-grid.n2 { grid-template-columns: 1fr 1fr; }
    .media-grid.n3 { grid-template-columns: 1.55fr 1fr; grid-template-rows: 1fr 1fr; }
    .media-grid.n3 > .media-item:first-child { grid-row: span 2; }
    .media-grid.n4 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }

    /* الصور/الأغلفة المستخرجة كثيراً ما تأتي بأشرطة سوداء مضمَّنة داخل بكسلات الصورة نفسها.
       autoCrop يقيسها ويقصّها فعلياً؛ وريثما تنجح تلك العملية أو تفشل بأمان، تبقى الصورة فوق
       مِرآة (matte) بتدرّج ألوان الهوية بدل السواد، وتُعرض كاملة (contain) بلا فقد للمحتوى. */
    .media-item { position: relative; display: block; width: 100%; height: 100%; padding: 0;
      overflow: hidden; border: none; cursor: pointer; text-decoration: none; font: inherit;
      background: radial-gradient(130% 130% at 25% 15%, var(--sage, #a8c9d4) 0%, var(--green-600, #2b7f97) 55%, var(--green-800, #17303d) 100%); }
    .media-item:focus-visible { outline: 2px solid var(--green-600, #2b7f97); outline-offset: -2px; }
    img.media-el { position: relative; z-index: 1; width: 100%; height: 100%;
      object-fit: contain; display: block; transition: transform .4s cubic-bezier(.22,.8,.28,1); }
    /* بعد نجاح القصّ الآلي لم تعد هناك حواف يجب حمايتها بـ contain، فتُملأ الخانة بالكامل. */
    img.media-el.fbx-cropped { object-fit: cover; }
    .media-item.no-img img.media-el { display: none; }
    .media-item:hover img.media-el { transform: scale(1.05); }
    .media-blank { position: relative; z-index: 1; display: grid; place-items: center;
      width: 100%; height: 100%; font-size: 20px; opacity: .85; }
    .media-play { position: absolute; z-index: 2; inset: 0; margin: auto; width: 34px; height: 34px;
      display: grid; place-items: center; font-size: 12px; color: #fff; padding-inline-start: 2px;
      background: rgba(11, 24, 32, .5); border: 1.5px solid rgba(255,255,255,.9); border-radius: 50%;
      pointer-events: none; backdrop-filter: blur(3px); transition: background .2s ease, transform .2s ease; }
    .media-item:hover .media-play { background: rgba(11, 24, 32, .78); transform: scale(1.08); }
    .media-more { position: absolute; z-index: 3; inset: 0; display: grid; place-items: center;
      background: rgba(11, 24, 32, .55); backdrop-filter: blur(2px);
      color: #fff; font-size: 1.05rem; font-weight: 800; pointer-events: none; }

    /* ===== العارض المكبّر ===== */
    .fbx-lb { position: fixed; inset: 0; z-index: 9999; display: grid; place-items: center;
      background: rgba(8, 18, 24, .93); backdrop-filter: blur(6px); padding: 60px 68px;
      animation: fbxLbIn .2s ease both; }
    .fbx-lb[hidden] { display: none; }
    @keyframes fbxLbIn { from { opacity: 0; } to { opacity: 1; } }
    .fbx-lb-stage { max-width: 100%; max-height: 100%; display: grid; place-items: center; }
    .fbx-lb-stage img, .fbx-lb-stage video { max-width: 100%; max-height: calc(100vh - 130px);
      border-radius: 12px; display: block; box-shadow: 0 24px 60px rgba(0,0,0,.55);
      animation: fbxLbZoom .25s cubic-bezier(.22,.8,.28,1) both; }
    @keyframes fbxLbZoom { from { opacity: 0; transform: scale(.96); } to { opacity: 1; transform: none; } }
    .fbx-lb-x { position: absolute; top: 16px; inset-inline-end: 18px; width: 40px; height: 40px; }
    .fbx-lb-nav { position: absolute; top: 50%; transform: translateY(-50%); width: 44px; height: 44px; font-size: 22px; }
    .fbx-lb-nav.prev { inset-inline-end: 16px; }
    .fbx-lb-nav.next { inset-inline-start: 16px; }
    .fbx-lb-x, .fbx-lb-nav { display: grid; place-items: center; cursor: pointer; color: #fff;
      background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.22); border-radius: 50%;
      font-family: inherit; font-size: 17px; line-height: 1; transition: background .18s ease; }
    .fbx-lb-x:hover, .fbx-lb-nav:hover { background: rgba(255,255,255,.24); }
    .fbx-lb-bar { position: absolute; inset-block-end: 18px; inset-inline: 0; display: flex;
      align-items: center; justify-content: center; gap: 16px; color: #dfe9ee; font-size: .78rem; font-weight: 700; }
    .fbx-lb-open { color: #dfe9ee; text-decoration: none; border: 1px solid rgba(255,255,255,.24);
      border-radius: 999px; padding: 6px 16px; transition: background .18s ease; }
    .fbx-lb-open:hover { background: rgba(255,255,255,.14); }
    @media (max-width: 640px) {
      .fbx-lb { padding: 56px 12px 64px; }
      .fbx-lb-nav.prev { inset-inline-end: 6px; } .fbx-lb-nav.next { inset-inline-start: 6px; }
    }
    `;
    const style = document.createElement('style');
    style.id = 'fbx-media-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  global.FBXMedia = { extract, galleryHtml, injectStyles, autoCrop, openLightbox, closeLightbox };

})(typeof window !== 'undefined' ? window : this);

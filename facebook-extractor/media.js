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

  function galleryHtml(post) {
    let list = Array.isArray(post.mediaList) ? post.mediaList : [];
    if (!list.length && post.media) list = [{ type: 'image', src: post.media, thumb: '' }];
    if (!list.length) return '';
    const items = list.slice(0, 8).map(m => {
      if (m.type === 'video') {
        if (m.src) {
          return `<div class="media-item">
            <video class="media-el" controls preload="metadata" ${m.thumb ? `poster="${esc(m.thumb)}"` : ''} src="${esc(m.src)}"></video>
            <span class="media-tag">🎬 فيديو</span>
          </div>`;
        }
        const th = m.thumb || post.media || '';
        return `<a class="media-item media-video-link" href="${esc(post.url || '#')}" target="_blank" rel="noopener">
          ${th ? `<img class="media-el" loading="lazy" src="${esc(th)}" alt="" onerror="this.remove()" onload="FBXMedia.autoCrop(this)">` : '<div class="media-el media-blank">فيديو</div>'}
          <span class="media-play">▶</span><span class="media-tag">🎬 فيديو — افتح المنشور</span>
        </a>`;
      }
      const src = m.src || m.thumb;
      if (!src) return '';
      return `<a class="media-item" href="${esc(src)}" target="_blank" rel="noopener">
        <img class="media-el" loading="lazy" src="${esc(src)}" alt="" onerror="this.closest('.media-item').remove()" onload="FBXMedia.autoCrop(this)">
        <span class="media-tag">🖼️ صورة</span>
      </a>`;
    }).join('');
    const cls = list.length === 1 ? 'media-grid one' : 'media-grid';
    return `<div class="${cls}">${items}</div>`;
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
    if (document.getElementById('fbx-media-styles')) return;
    const css = `
    .media-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 3px; margin: 5px 0 0; }
    .media-grid.one { grid-template-columns: 1fr; }
    /* الصور/الأغلفة المستخرجة كثيراً ما تأتي بحواف/أشرطة سوداء صريحة مضمَّنة داخل الصورة نفسها (خاصة أغلفة الفيديو).
       قصّها (crop) بنسبة ثابتة غير موثوق لأن نسبة الحواف تختلف من صورة لأخرى وقد يقصّ المحتوى الحقيقي،
       وتمويه نفس الصورة لا يفيد لأن الحواف غالباً سوداء صرفة بلا تدرّج يمكن تمويهه.
       الحل: مِرآة (matte) بتدرّج ألوان الهوية البصرية خلف الصورة، والصورة كاملة فوقها دون قصّ (object-fit: contain)
       — فتختفي الحواف السوداء تماماً ويحل محلها تدرّج أنيق بدل الأسود، دون أي فقد للمحتوى الحقيقي. */
    .media-item { position: relative; display: block; border-radius: 8px; overflow: hidden; height: 62px;
      background: radial-gradient(130% 130% at 25% 15%, var(--c-accent-2, #c026d3) 0%, var(--c-accent, #7c3aed) 45%, var(--surface-2, #eef1ea) 100%);
      border: 1px solid var(--border, #dfe4d8); text-decoration: none; }
    .media-grid.one .media-item { height: 150px; }
    img.media-el, video.media-el { position: relative; z-index: 1; width: 100%; height: 100%;
      object-fit: contain; display: block; transition: transform .3s ease, opacity .25s ease; }
    /* بعد نجاح القصّ الآلي للحواف السوداء الفعلية (autoCrop) لم تعد هناك حواف يجب حمايتها بـ contain،
       فتُملأ الخانة بالكامل (cover) لعرض أجمل بلا مساحات فارغة. */
    img.media-el.fbx-cropped { object-fit: cover; }
    a.media-item:hover img.media-el, a.media-item:hover video.media-el { transform: scale(1.04); }
    .media-blank { position: relative; z-index: 1; display: grid; place-items: center;
      color: var(--text-2, #667167); font-weight: 800; height: 62px; font-size: .64rem; }
    .media-tag { position: absolute; z-index: 2; inset-block-end: 3px; inset-inline-start: 3px;
      background: rgba(15, 32, 25, .78); color: #f3f0e6; font-size: .55rem; font-weight: 800;
      padding: 1px 6px; border-radius: 999px; backdrop-filter: blur(4px); }
    .media-play { position: absolute; z-index: 2; inset: 0; margin: auto; width: 26px; height: 26px;
      display: grid; place-items: center; font-size: 11px; color: #fff;
      background: rgba(15, 32, 25, .55); border: 2px solid rgba(255,255,255,.8); border-radius: 50%; pointer-events: none; }
    .media-video-link:hover .media-play { background: rgba(28, 69, 52, .8); }
    `;
    const style = document.createElement('style');
    style.id = 'fbx-media-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  global.FBXMedia = { extract, galleryHtml, injectStyles, autoCrop };

})(typeof window !== 'undefined' ? window : this);

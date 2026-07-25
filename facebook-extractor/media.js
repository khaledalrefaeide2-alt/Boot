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
          ${th ? `<img class="media-el" loading="lazy" src="${esc(th)}" alt="" onerror="this.remove()">` : '<div class="media-el media-blank">فيديو</div>'}
          <span class="media-play">▶</span><span class="media-tag">🎬 فيديو — افتح المنشور</span>
        </a>`;
      }
      const src = m.src || m.thumb;
      if (!src) return '';
      return `<a class="media-item" href="${esc(src)}" target="_blank" rel="noopener">
        <img class="media-el" loading="lazy" src="${esc(src)}" alt="" onerror="this.closest('.media-item').remove()">
        <span class="media-tag">🖼️ صورة</span>
      </a>`;
    }).join('');
    const cls = list.length === 1 ? 'media-grid one' : 'media-grid';
    return `<div class="${cls}">${items}</div>`;
  }

  function injectStyles() {
    if (document.getElementById('fbx-media-styles')) return;
    const css = `
    .media-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 5px; margin: 8px 0 0; }
    .media-grid.one { grid-template-columns: 1fr; }
    .media-item { position: relative; display: block; border-radius: 9px; overflow: hidden;
      background: var(--surface-2, #eef1ea); border: 1px solid var(--border, #dfe4d8); text-decoration: none; aspect-ratio: 16 / 10; }
    .media-grid.one .media-item { aspect-ratio: auto; max-height: 220px; }
    .media-el { width: 100%; height: 100%; object-fit: cover; display: block; background: #000; }
    .media-grid.one .media-el { max-height: 220px; object-fit: contain; }
    video.media-el { object-fit: contain; }
    .media-blank { display: grid; place-items: center; color: var(--text-2, #667167); font-weight: 800; aspect-ratio: 16/10; font-size: .72rem; }
    .media-tag { position: absolute; inset-block-end: 4px; inset-inline-start: 4px;
      background: rgba(15, 32, 25, .78); color: #f3f0e6; font-size: .6rem; font-weight: 800;
      padding: 2px 7px; border-radius: 999px; backdrop-filter: blur(4px); }
    .media-play { position: absolute; inset: 0; margin: auto; width: 34px; height: 34px;
      display: grid; place-items: center; font-size: 14px; color: #fff;
      background: rgba(15, 32, 25, .55); border: 2px solid rgba(255,255,255,.8); border-radius: 50%; pointer-events: none; }
    .media-video-link:hover .media-play { background: rgba(28, 69, 52, .8); }
    `;
    const style = document.createElement('style');
    style.id = 'fbx-media-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  global.FBXMedia = { extract, galleryHtml, injectStyles };

})(typeof window !== 'undefined' ? window : this);

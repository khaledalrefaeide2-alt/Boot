'use strict';

/*
 * FBXPages — دليل الصفحات/الحسابات: استيراد من Excel، تخزين، واختيار للرصد.
 * ---------------------------------------------------------------------------
 * يحلّ مشكلة عملية: عندك مئات الصفحات في ملف Excel، ولا يُعقل لصقها يدوياً
 * في كل مرة. تستوردها مرة واحدة إلى قاعدة البيانات المحلية، ثم تفتح نافذة
 * الاختيار وتضغط على ما تريد رصده فيُملأ حقل الإدخال تلقائياً.
 *
 *   FBXPages.openPicker({ platform, onPick })   → يفتح نافذة الاختيار
 *
 * يعتمد على قاعدة البيانات المحلية (local-server) لتخزين الدليل، وعلى
 * xlsx-import.js لقراءة ملف Excel محلياً داخل المتصفح.
 */

(function (W) {

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const dbUrl = () => (W.FBXCommon ? W.FBXCommon.db.url : '');

  /* ============================================================
   * تطبيع الصفوف القادمة من Excel
   * ============================================================ */
  const URL_RE = /(https?:\/\/[^\s,;]+)|((?:www\.)?(?:facebook|fb|twitter|x)\.com\/[^\s,;]+)/i;

  // رؤوس الأعمدة المحتملة بالعربية والإنجليزية — نتعرّف على العمود من رأسه
  // إن وُجد، وإلا نستنتجه من شكل القيم نفسها.
  const HEADER_HINTS = {
    url:      ['رابط', 'الرابط', 'لينك', 'url', 'link', 'page url', 'profile'],
    name:     ['اسم', 'الاسم', 'الصفحة', 'اسم الصفحة', 'الحساب', 'name', 'page', 'title', 'account'],
    handle:   ['معرف', 'المعرف', 'يوزر', 'username', 'handle', 'user'],
    platform: ['منصة', 'المنصة', 'platform', 'source', 'نوع'],
    category: ['تصنيف', 'التصنيف', 'فئة', 'الفئة', 'قسم', 'category', 'type', 'group'],
    notes:    ['ملاحظات', 'ملاحظة', 'notes', 'note', 'comment', 'وصف']
  };

  const norm = s => String(s ?? '').trim().toLowerCase();

  function detectColumns(headerRow, sampleRows) {
    const map = {};
    if (headerRow) {
      headerRow.forEach((cell, i) => {
        const h = norm(cell);
        if (!h) return;
        for (const [field, hints] of Object.entries(HEADER_HINTS)) {
          if (map[field] !== undefined) continue;
          if (hints.some(x => h === x || h.includes(x))) { map[field] = i; break; }
        }
      });
    }
    // استنتاج من القيم: العمود الذي أغلب قيمه روابط هو عمود الرابط،
    // وأول عمود نصي غير الرابط هو الاسم.
    if (map.url === undefined) {
      const width = Math.max(...sampleRows.map(r => r.length), 0);
      let best = -1, bestScore = 0;
      for (let i = 0; i < width; i++) {
        const score = sampleRows.filter(r => URL_RE.test(r[i] || '')).length;
        if (score > bestScore) { bestScore = score; best = i; }
      }
      if (bestScore >= Math.max(1, sampleRows.length * 0.4)) map.url = best;
    }
    if (map.name === undefined) {
      const width = Math.max(...sampleRows.map(r => r.length), 0);
      for (let i = 0; i < width; i++) {
        if (i === map.url) continue;
        const filled = sampleRows.filter(r => (r[i] || '').length > 1 && !URL_RE.test(r[i])).length;
        if (filled >= Math.max(1, sampleRows.length * 0.5)) { map.name = i; break; }
      }
    }
    return map;
  }

  // هل الصف الأول رؤوس أعمدة أم بيانات؟ إن لم يحوِ روابط وحوى كلمات رأس معروفة
  // فهو رأس — وإلا فهو بيانات (بعض الملفات تبدأ بالبيانات مباشرة).
  function looksLikeHeader(row) {
    if (!row || !row.length) return false;
    if (row.some(c => URL_RE.test(c || ''))) return false;
    const all = Object.values(HEADER_HINTS).flat();
    return row.some(c => { const h = norm(c); return h && all.some(x => h === x || h.includes(x)); });
  }

  function detectPlatform(url, handle, explicit) {
    const e = norm(explicit);
    if (/face|fb|فيس/.test(e)) return 'facebook';
    if (/twit|^x$|تويتر|اكس|إكس/.test(e)) return 'twitter';
    const u = norm(url) + ' ' + norm(handle);
    if (/facebook\.com|fb\.com|fb\.me/.test(u)) return 'facebook';
    if (/twitter\.com|\bx\.com/.test(u)) return 'twitter';
    return '';
  }

  // معرّف X من رابط أو نص: "@user" أو "x.com/user" → "user"
  function parseHandle(v) {
    let s = String(v || '').trim();
    if (!s) return '';
    const m = s.match(/(?:twitter\.com|x\.com)\/(?:#!\/)?@?([A-Za-z0-9_]{1,15})/i);
    if (m) return m[1];
    s = s.replace(/^@/, '');
    return /^[A-Za-z0-9_]{1,15}$/.test(s) ? s : '';
  }

  function cleanUrl(v) {
    let s = String(v || '').trim();
    if (!s) return '';
    const m = s.match(URL_RE);
    if (!m) return '';
    s = m[0];
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    return s.replace(/[),.\]]+$/, '');
  }

  /* يحوّل صفوف الورقة إلى سجلات صفحات جاهزة للحفظ */
  function rowsToPages(rows) {
    const nonEmpty = rows.filter(r => r.some(c => (c || '').trim()));
    if (!nonEmpty.length) return { pages: [], skipped: 0, columns: {} };

    const hasHeader = looksLikeHeader(nonEmpty[0]);
    const header = hasHeader ? nonEmpty[0] : null;
    const body = hasHeader ? nonEmpty.slice(1) : nonEmpty;
    const columns = detectColumns(header, body.slice(0, 40));

    const pages = [], seen = new Set();
    let skipped = 0;
    for (const r of body) {
      const rawUrl = columns.url !== undefined ? r[columns.url] : '';
      const rawHandle = columns.handle !== undefined ? r[columns.handle] : '';
      // بعض الملفات تضع الرابط في عمود الاسم أو العكس — نبحث في كل الصف كملاذ أخير
      const url = cleanUrl(rawUrl) || cleanUrl(r.find(c => URL_RE.test(c || '')) || '');
      const handle = parseHandle(rawHandle) || parseHandle(url);
      const platform = detectPlatform(url, handle, columns.platform !== undefined ? r[columns.platform] : '');
      let name = (columns.name !== undefined ? r[columns.name] : '') || '';
      if (!name) name = handle || url;
      name = String(name).trim();

      const key = url || (handle ? `@${handle}` : '');
      if (!key) { skipped++; continue; }
      if (seen.has(key)) { skipped++; continue; }
      seen.add(key);

      pages.push({
        key, name: name || key, url, handle, platform,
        category: (columns.category !== undefined ? String(r[columns.category] || '').trim() : ''),
        notes: (columns.notes !== undefined ? String(r[columns.notes] || '').trim() : '')
      });
    }
    return { pages, skipped, columns, hasHeader };
  }

  /* ============================================================
   * نداءات قاعدة البيانات
   * ============================================================ */
  async function apiGet(params) {
    const url = new URL(dbUrl() + '/api/pages');
    for (const [k, v] of Object.entries(params || {})) if (v) url.searchParams.set(k, v);
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'تعذّر جلب الصفحات');
    return d;
  }

  async function savePages(pages) {
    const r = await fetch(dbUrl() + '/api/pages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pages })
    });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'تعذّر الحفظ');
    return d;
  }

  async function setSelected(keys, selected) {
    const r = await fetch(dbUrl() + '/api/pages/select', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys, selected })
    });
    return (await r.json());
  }

  async function clearSelection() {
    const r = await fetch(dbUrl() + '/api/pages/select', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectAll: false })
    });
    return (await r.json());
  }

  async function deletePage(key) {
    const url = new URL(dbUrl() + '/api/pages');
    if (key) url.searchParams.set('key', key);
    const r = await fetch(url, { method: 'DELETE' });
    return (await r.json());
  }

  /* ============================================================
   * واجهة الاختيار
   * ============================================================ */
  function injectStyles() {
    if (document.getElementById('fbx-pages-styles')) return;
    const css = `
    .fbxp-overlay { position: fixed; inset: 0; z-index: 9000; background: rgba(10,8,20,.62);
      backdrop-filter: blur(3px); display: grid; place-items: center; padding: 16px; animation: fbxpIn .18s ease; }
    @keyframes fbxpIn { from { opacity: 0 } to { opacity: 1 } }
    .fbxp-modal { width: min(920px, 100%); max-height: 88vh; display: flex; flex-direction: column;
      background: var(--surface, #fff); border: 1px solid var(--border, #e8e5f2);
      border-radius: var(--r-lg, 18px); box-shadow: 0 24px 60px rgba(0,0,0,.3); overflow: hidden; }
    .fbxp-head { padding: 14px 18px; border-bottom: 1px solid var(--border, #e8e5f2);
      display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .fbxp-title { font-weight: 900; font-size: 1.02rem; margin-inline-end: auto; }
    .fbxp-close { border: 0; background: transparent; font-size: 1.2rem; cursor: pointer; color: var(--text-2, #667); }
    .fbxp-tools { padding: 10px 18px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center;
      border-bottom: 1px solid var(--border, #e8e5f2); }
    .fbxp-tools .input { flex: 1 1 200px; }
    .fbxp-body { overflow: auto; padding: 6px 10px 10px; flex: 1; }
    .fbxp-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px;
      cursor: pointer; border: 1px solid transparent; }
    .fbxp-row:hover { background: var(--surface-2, #f3f1fa); }
    .fbxp-row.on { background: var(--primary-soft, #efe9fd); border-color: var(--primary, #7c3aed); }
    .fbxp-row input { width: 17px; height: 17px; flex: none; cursor: pointer; accent-color: var(--primary, #7c3aed); }
    .fbxp-name { font-weight: 800; font-size: .88rem; }
    .fbxp-sub { font-size: .72rem; color: var(--text-2, #667); word-break: break-all; }
    .fbxp-tag { font-size: .64rem; font-weight: 800; padding: 2px 8px; border-radius: 999px;
      background: var(--surface-2, #f3f1fa); color: var(--text-2, #667); white-space: nowrap; }
    .fbxp-del { margin-inline-start: auto; border: 0; background: transparent; cursor: pointer;
      color: var(--text-2, #889); font-size: .95rem; padding: 2px 6px; border-radius: 8px; }
    .fbxp-del:hover { color: var(--danger, #b3261e); background: var(--surface-2, #f3f1fa); }
    .fbxp-foot { padding: 12px 18px; border-top: 1px solid var(--border, #e8e5f2);
      display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .fbxp-count { margin-inline-end: auto; font-size: .82rem; color: var(--text-2, #667); font-weight: 700; }
    .fbxp-empty { text-align: center; padding: 34px 16px; color: var(--text-2, #667); font-size: .88rem; line-height: 1.9; }
    .fbxp-file { display: none; }
    `;
    const st = document.createElement('style');
    st.id = 'fbx-pages-styles';
    st.textContent = css;
    document.head.appendChild(st);
  }

  const PLATFORM_LABEL = { facebook: 'فيسبوك', twitter: 'X' };

  function openPicker(opts) {
    opts = opts || {};
    const platform = opts.platform || '';
    injectStyles();

    if (!dbUrl() || !(W.FBXCommon && W.FBXCommon.db.online)) {
      // نحاول الاتصال مرة قبل الاستسلام — قد يكون الخادم شُغّل بعد فتح الصفحة
      if (W.dbCheck) W.dbCheck(true);
    }

    const overlay = document.createElement('div');
    overlay.className = 'fbxp-overlay';
    overlay.innerHTML = `
      <div class="fbxp-modal" role="dialog" aria-modal="true">
        <div class="fbxp-head">
          <span class="fbxp-title">📚 دليل الصفحات ${platform ? `— ${PLATFORM_LABEL[platform] || platform}` : ''}</span>
          <button class="fbxp-close" title="إغلاق">✕</button>
        </div>
        <div class="fbxp-tools">
          <input class="input" type="search" id="fbxpSearch" placeholder="ابحث بالاسم أو الرابط أو التصنيف...">
          <button class="btn btn-ghost btn-sm" id="fbxpImport">📥 استيراد من Excel</button>
          <button class="btn btn-ghost btn-sm" id="fbxpAll">تحديد الكل</button>
          <button class="btn btn-ghost btn-sm" id="fbxpNone">إلغاء التحديد</button>
          <input type="file" class="fbxp-file" id="fbxpFile" accept=".xlsx">
        </div>
        <div class="fbxp-body" id="fbxpBody"></div>
        <div class="fbxp-foot">
          <span class="fbxp-count" id="fbxpCount"></span>
          <button class="btn btn-ghost btn-sm" id="fbxpCancel">إلغاء</button>
          <button class="btn btn-primary btn-sm" id="fbxpOk">✅ استخدام المحدَّد</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const $$ = id => overlay.querySelector('#' + id);
    const body = $$('fbxpBody'), countEl = $$('fbxpCount');
    let all = [], chosen = new Set();

    const close = () => { document.removeEventListener('keydown', onKey); overlay.remove(); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(); });
    overlay.querySelector('.fbxp-close').addEventListener('click', close);
    $$('fbxpCancel').onclick = close;

    function visible() {
      const q = ($$('fbxpSearch').value || '').trim().toLowerCase();
      if (!q) return all;
      return all.filter(p => [p.name, p.url, p.handle, p.category, p.notes]
        .some(v => String(v || '').toLowerCase().includes(q)));
    }

    function render() {
      const list = visible();
      countEl.textContent = `${chosen.size} محدَّدة من ${all.length}${list.length !== all.length ? ` · معروض ${list.length}` : ''}`;
      if (!all.length) {
        body.innerHTML = `<div class="fbxp-empty">
          لا توجد صفحات محفوظة بعد.<br>
          اضغط <strong>«📥 استيراد من Excel»</strong> واختر ملفك — سيُقرأ محلياً في متصفحك ويُحفظ في قاعدة بياناتك.
        </div>`;
        return;
      }
      if (!list.length) { body.innerHTML = `<div class="fbxp-empty">لا نتائج مطابقة لبحثك.</div>`; return; }
      body.innerHTML = list.map(p => `
        <label class="fbxp-row ${chosen.has(p.key) ? 'on' : ''}" data-key="${esc(p.key)}">
          <input type="checkbox" ${chosen.has(p.key) ? 'checked' : ''}>
          <span style="min-width:0;flex:1">
            <span class="fbxp-name">${esc(p.name || p.key)}</span>
            <span class="fbxp-sub">${esc(p.url || (p.handle ? '@' + p.handle : ''))}</span>
          </span>
          ${p.category ? `<span class="fbxp-tag">${esc(p.category)}</span>` : ''}
          ${p.platform ? `<span class="fbxp-tag">${esc(PLATFORM_LABEL[p.platform] || p.platform)}</span>` : ''}
          <button class="fbxp-del" title="حذف من الدليل" data-del="${esc(p.key)}">🗑</button>
        </label>`).join('');
    }

    body.addEventListener('click', async e => {
      const del = e.target.closest('[data-del]');
      if (del) {
        e.preventDefault(); e.stopPropagation();
        const key = del.getAttribute('data-del');
        await deletePage(key);
        all = all.filter(p => p.key !== key);
        chosen.delete(key);
        render();
        return;
      }
      const row = e.target.closest('.fbxp-row');
      if (!row) return;
      const key = row.getAttribute('data-key');
      if (chosen.has(key)) chosen.delete(key); else chosen.add(key);
      // نمنع السلوك الافتراضي للـ label حتى لا ينقلب المربع مرتين
      e.preventDefault();
      render();
    });

    $$('fbxpSearch').addEventListener('input', render);
    $$('fbxpAll').onclick = () => { visible().forEach(p => chosen.add(p.key)); render(); };
    $$('fbxpNone').onclick = () => { chosen.clear(); render(); };

    /* ---- الاستيراد ---- */
    $$('fbxpImport').onclick = () => $$('fbxpFile').click();
    $$('fbxpFile').onchange = async e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const btn = $$('fbxpImport');
      const label = btn.textContent;
      btn.disabled = true; btn.textContent = '⏳ جارٍ القراءة...';
      try {
        const wb = await W.FBXExcelImport.readFile(file);
        // نجمع كل الأوراق — بعض الملفات تقسّم الصفحات على أوراق حسب التصنيف
        let rows = [];
        for (const sh of wb.sheets) rows = rows.concat(sh.rows);
        const { pages, skipped } = rowsToPages(rows);
        if (!pages.length) {
          alert('لم يُعثر على أي صفحة صالحة في الملف.\n\nتأكد أن فيه عموداً يحوي روابط الصفحات (أو معرّفات حسابات X).');
        } else {
          const withPlatform = pages.map(p => ({ ...p, platform: p.platform || platform || '' }));
          const d = await savePages(withPlatform);
          await load();
          alert(`✅ استُوردت ${d.saved} صفحة.\nإجمالي الدليل الآن: ${d.total}` +
                (skipped ? `\n(تُخطّيت ${skipped} صفاً بلا رابط صالح أو مكرّراً)` : ''));
        }
      } catch (err) {
        alert('⚠️ تعذّرت قراءة الملف:\n' + (err.message || err));
      } finally {
        btn.disabled = false; btn.textContent = label; e.target.value = '';
      }
    };

    /* ---- التأكيد ---- */
    $$('fbxpOk').onclick = async () => {
      const picked = all.filter(p => chosen.has(p.key));
      if (!picked.length) { alert('لم تحدّد أي صفحة.'); return; }
      // نحفظ الاختيار في قاعدة البيانات ليبقى بين الجلسات:
      // نمسح الاختيار القديم أولاً ثم نثبّت الجديد.
      try {
        await clearSelection();
        await setSelected(picked.map(p => p.key), true);
      } catch (_) { /* الاختيار المحلي يكفي حتى لو فشل الحفظ */ }
      close();
      if (typeof opts.onPick === 'function') opts.onPick(picked);
    };

    async function load() {
      body.innerHTML = `<div class="fbxp-empty">⏳ جارٍ تحميل الدليل...</div>`;
      try {
        const d = await apiGet({ platform });
        all = d.pages || [];
        chosen = new Set(all.filter(p => p.selected).map(p => p.key));
        render();
      } catch (err) {
        all = [];
        body.innerHTML = `<div class="fbxp-empty">
          ⚠️ قاعدة البيانات المحلية غير متصلة.<br>
          شغّل <strong dir="ltr">START-DATABASE.bat</strong> من مجلد <strong>local-server</strong>،
          ثم اضغط «فحص الاتصال» في صفحة الإعدادات وأعد المحاولة.
        </div>`;
        countEl.textContent = '';
      }
    }
    load();
  }

  W.FBXPages = {
    openPicker, injectStyles,
    // مكشوفة للاختبار
    _rowsToPages: rowsToPages, _detectColumns: detectColumns, _looksLikeHeader: looksLikeHeader,
    _detectPlatform: detectPlatform, _parseHandle: parseHandle, _cleanUrl: cleanUrl
  };

})(typeof window !== 'undefined' ? window : this);

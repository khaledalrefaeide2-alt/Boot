'use strict';

/*
 * FBXExcelImport — قارئ ملفات Excel (.xlsx) نقي بلا أي مكتبات خارجية.
 * --------------------------------------------------------------------
 * ملف .xlsx هو في حقيقته حزمة ZIP تحوي ملفات XML. هذه الوحدة:
 *   1) تقرأ فهرس الـ ZIP وتستخرج الملفات المطلوبة،
 *   2) تفك ضغط DEFLATE عبر DecompressionStream المدمجة في المتصفح،
 *   3) تحلّل XML الورقة وجدول النصوص المشتركة إلى صفوف نصية.
 *
 * الاستخدام:
 *   const wb = await FBXExcelImport.readFile(file);   // File أو ArrayBuffer
 *   wb.sheets[0].rows  →  [['العمود أ','العمود ب'], ['قيمة', 'قيمة'], ...]
 *
 * كل شيء يجري محلياً في المتصفح — الملف لا يُرفع إلى أي خادم.
 */

(function (global) {

  const dec = new TextDecoder('utf-8');

  /* ============================================================
   * 1) قراءة حزمة ZIP
   * ============================================================ */
  // نقرأ سجل نهاية الفهرس (EOCD) من آخر الملف ثم نمشي على الفهرس المركزي،
  // وهو الطريقة الصحيحة لقراءة ZIP (البحث عن التواقيع من البداية يخطئ متى
  // ما ظهرت بايتات مطابقة للتوقيع داخل بيانات مضغوطة).
  function findEOCD(view, len) {
    const maxBack = Math.min(len, 0xFFFF + 22);
    for (let i = 22; i <= maxBack; i++) {
      const p = len - i;
      if (view.getUint32(p, true) === 0x06054b50) return p;
    }
    return -1;
  }

  function listEntries(buf) {
    const view = new DataView(buf), len = buf.byteLength;
    const eocd = findEOCD(view, len);
    if (eocd < 0) throw new Error('الملف ليس بصيغة Excel صالحة (لم يُعثر على فهرس ZIP).');

    let count = view.getUint16(eocd + 10, true);
    let cdOffset = view.getUint32(eocd + 16, true);

    // ZIP64: القيم الحقيقية في سجل منفصل عندما تتجاوز الحدود القديمة
    if (cdOffset === 0xFFFFFFFF || count === 0xFFFF) {
      for (let p = eocd - 20; p >= 0; p--) {
        if (view.getUint32(p, true) === 0x07064b50) {
          const z64 = Number(view.getBigUint64(p + 8, true));
          if (view.getUint32(z64, true) === 0x06064b50) {
            count = Number(view.getBigUint64(z64 + 32, true));
            cdOffset = Number(view.getBigUint64(z64 + 48, true));
          }
          break;
        }
      }
    }

    const entries = new Map();
    let p = cdOffset;
    for (let i = 0; i < count; i++) {
      if (view.getUint32(p, true) !== 0x02014b50) break;
      const method = view.getUint16(p + 10, true);
      const compSize = view.getUint32(p + 20, true);
      const nameLen = view.getUint16(p + 28, true);
      const extraLen = view.getUint16(p + 30, true);
      const commentLen = view.getUint16(p + 32, true);
      const localOffset = view.getUint32(p + 42, true);
      const name = dec.decode(new Uint8Array(buf, p + 46, nameLen));
      entries.set(name, { method, compSize, localOffset });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  }

  async function readEntry(buf, entry) {
    const view = new DataView(buf);
    const o = entry.localOffset;
    if (view.getUint32(o, true) !== 0x04034b50) throw new Error('سجل ZIP تالف.');
    // أطوال الاسم/الإضافات في السجل المحلي قد تختلف عن الفهرس — نقرأها من هنا.
    const nameLen = view.getUint16(o + 26, true);
    const extraLen = view.getUint16(o + 28, true);
    const start = o + 30 + nameLen + extraLen;
    let size = entry.compSize;
    if (!size) size = view.getUint32(o + 18, true);
    const raw = new Uint8Array(buf, start, size);

    if (entry.method === 0) return dec.decode(raw);          // مخزَّن بلا ضغط
    if (entry.method !== 8) throw new Error(`طريقة ضغط غير مدعومة (${entry.method}).`);
    if (typeof DecompressionStream !== 'function') {
      throw new Error('متصفحك لا يدعم فك ضغط الملفات — استخدم Chrome أو Edge حديثاً.');
    }
    const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return dec.decode(new Uint8Array(await new Response(stream).arrayBuffer()));
  }

  /* ============================================================
   * 2) تحليل XML
   * ============================================================ */
  const parseXml = xml => new DOMParser().parseFromString(xml, 'application/xml');

  // النصوص المشتركة: Excel يخزّن كل النصوص مرة واحدة ويشير إليها بالفهرس.
  function sharedStrings(xml) {
    if (!xml) return [];
    const doc = parseXml(xml);
    return [...doc.getElementsByTagName('si')].map(si => {
      // النص قد يكون مجزّأً إلى عدة أجزاء <t> عند اختلاف التنسيق داخل الخلية
      const parts = si.getElementsByTagName('t');
      let out = '';
      for (const t of parts) out += t.textContent;
      return out;
    });
  }

  // "BC12" → 54 (فهرس العمود صفري) — نحتاجه لأن Excel يحذف الخلايا الفارغة
  // تماماً من الـ XML، فبدون قراءة المرجع تنزاح كل الأعمدة التالية.
  function colIndex(ref) {
    let n = 0;
    for (let i = 0; i < ref.length; i++) {
      const c = ref.charCodeAt(i);
      if (c < 65 || c > 90) break;
      n = n * 26 + (c - 64);
    }
    return n - 1;
  }

  function sheetRows(xml, strings) {
    const doc = parseXml(xml);
    const rows = [];
    for (const row of doc.getElementsByTagName('row')) {
      const cells = [];
      let maxCol = -1;
      for (const c of row.getElementsByTagName('c')) {
        const ref = c.getAttribute('r') || '';
        const idx = ref ? colIndex(ref) : maxCol + 1;
        const type = c.getAttribute('t');
        let value = '';
        if (type === 'inlineStr') {
          const parts = c.getElementsByTagName('t');
          for (const t of parts) value += t.textContent;
        } else {
          const v = c.getElementsByTagName('v')[0];
          if (v) {
            value = v.textContent;
            if (type === 's') value = strings[parseInt(value, 10)] ?? '';
          }
        }
        cells[idx] = String(value).trim();
        if (idx > maxCol) maxCol = idx;
      }
      for (let i = 0; i <= maxCol; i++) if (cells[i] === undefined) cells[i] = '';
      rows.push(cells);
    }
    return rows;
  }

  /* ============================================================
   * 3) الواجهة العامة
   * ============================================================ */
  async function readBuffer(buf) {
    const entries = listEntries(buf);

    // أسماء الأوراق وترتيبها من workbook.xml، وربطها بملفاتها عبر العلاقات
    let names = [];
    const wbEntry = entries.get('xl/workbook.xml');
    if (wbEntry) {
      const doc = parseXml(await readEntry(buf, wbEntry));
      names = [...doc.getElementsByTagName('sheet')].map(s => s.getAttribute('name') || '');
    }

    const strings = entries.has('xl/sharedStrings.xml')
      ? sharedStrings(await readEntry(buf, entries.get('xl/sharedStrings.xml')))
      : [];

    const sheetFiles = [...entries.keys()]
      .filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
      .sort((a, b) => (parseInt(a.match(/(\d+)/)[1], 10) - parseInt(b.match(/(\d+)/)[1], 10)));

    if (!sheetFiles.length) throw new Error('لا توجد أوراق عمل داخل الملف.');

    const sheets = [];
    for (let i = 0; i < sheetFiles.length; i++) {
      const rows = sheetRows(await readEntry(buf, entries.get(sheetFiles[i])), strings);
      sheets.push({ name: names[i] || `ورقة ${i + 1}`, rows });
    }
    return { sheets };
  }

  async function readFile(file) {
    const buf = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
    return readBuffer(buf);
  }

  global.FBXExcelImport = { readFile, readBuffer, _colIndex: colIndex, _sheetRows: sheetRows, _sharedStrings: sharedStrings };

})(typeof window !== 'undefined' ? window : this);

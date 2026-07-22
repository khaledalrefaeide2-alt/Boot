'use strict';

/*
 * FBXExcel — مولّد ملفات Excel (.xlsx) نقي بلا أي مكتبات خارجية.
 * ----------------------------------------------------------------
 * يبني ملف OOXML حقيقياً (workbook + worksheet + styles) ويضغطه في حزمة ZIP
 * (بطريقة التخزين بلا ضغط مع CRC32) ثم ينزّله. يدعم:
 *   - رؤوس أعمدة منسّقة (خلفية خضراء + خط أبيض عريض)
 *   - عرض أعمدة مخصّص
 *   - تجميد صف الرأس
 *   - اتجاه من اليمين لليسار (RTL) للعربية
 *   - أعمدة نصية ورقمية
 *
 * الاستخدام:
 *   FBXExcel.download('اسم-الملف.xlsx', columns, rows, 'اسم الورقة');
 *   columns = [{ header:'النص', width:60, type:'text'|'number' }, ...]
 *   rows    = [[v1, v2, ...], ...]   // بترتيب الأعمدة نفسه
 */

(function (global) {

  /* ===== CRC32 ===== */
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  const enc = new TextEncoder();
  const B = s => enc.encode(s);

  /* ===== ZIP (store, no compression) ===== */
  function zip(files) {
    const chunks = [], central = [];
    let offset = 0;
    const dosTime = 0, dosDate = 0x21; // 1980-01-01
    for (const f of files) {
      const name = B(f.name), data = f.data, crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true); lh.setUint16(6, 0, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
      lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      chunks.push(new Uint8Array(lh.buffer), name, data);

      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
      ch.setUint16(28, name.length, true); ch.setUint16(30, 0, true); ch.setUint16(32, 0, true);
      ch.setUint16(34, 0, true); ch.setUint16(36, 0, true); ch.setUint32(38, 0, true);
      ch.setUint32(42, offset, true);
      central.push({ header: new Uint8Array(ch.buffer), name });
      offset += 30 + name.length + data.length;
    }
    const centralStart = offset;
    let centralSize = 0;
    for (const c of central) { chunks.push(c.header, c.name); centralSize += c.header.length + c.name.length; }
    const eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054b50, true);
    eocd.setUint16(8, central.length, true); eocd.setUint16(10, central.length, true);
    eocd.setUint32(12, centralSize, true); eocd.setUint32(16, centralStart, true);
    chunks.push(new Uint8Array(eocd.buffer));
    return new Blob(chunks, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  /* ===== XML helpers ===== */
  function escXml(s) {
    return String(s == null ? '' : s)
      .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]))
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ''); // حذف رموز التحكم غير المسموحة في XML
  }
  function colName(n) { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

  const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;

  const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

  const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF23553F"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

  function workbookXml(sheetName) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escXml(sheetName).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  }

  function sheetXml(columns, rows) {
    const cols = '<cols>' + columns.map((c, i) =>
      `<col min="${i + 1}" max="${i + 1}" width="${c.width || 20}" customWidth="1"/>`).join('') + '</cols>';

    let body = '';
    // صف الرأس
    body += `<row r="1" ht="22" customHeight="1">` + columns.map((c, i) =>
      `<c r="${colName(i)}1" t="inlineStr" s="1"><is><t xml:space="preserve">${escXml(c.header)}</t></is></c>`).join('') + `</row>`;
    // الصفوف
    rows.forEach((row, ri) => {
      const r = ri + 2;
      body += `<row r="${r}">` + columns.map((c, i) => {
        const v = row[i];
        const ref = colName(i) + r;
        if (c.type === 'number' && v !== '' && v != null && isFinite(v)) {
          return `<c r="${ref}"><v>${Number(v)}</v></c>`;
        }
        return `<c r="${ref}" t="inlineStr" s="2"><is><t xml:space="preserve">${escXml(v)}</t></is></c>`;
      }).join('') + `</row>`;
    });

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView rightToLeft="1" tabSelected="1" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${body}</sheetData></worksheet>`;
  }

  function build(columns, rows, sheetName) {
    const files = [
      { name: '[Content_Types].xml', data: B(CONTENT_TYPES) },
      { name: '_rels/.rels', data: B(RELS) },
      { name: 'xl/workbook.xml', data: B(workbookXml(sheetName || 'Sheet1')) },
      { name: 'xl/_rels/workbook.xml.rels', data: B(WORKBOOK_RELS) },
      { name: 'xl/styles.xml', data: B(STYLES) },
      { name: 'xl/worksheets/sheet1.xml', data: B(sheetXml(columns, rows)) }
    ];
    return zip(files);
  }

  function download(filename, columns, rows, sheetName) {
    const blob = build(columns, rows, sheetName);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename.endsWith('.xlsx') ? filename : filename + '.xlsx';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  global.FBXExcel = { download, build };

})(typeof window !== 'undefined' ? window : this);

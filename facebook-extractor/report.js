'use strict';

/*
 * FBXReport — تقرير رسمي قابل للطباعة أو الحفظ بصيغة PDF
 * -------------------------------------------------------
 * التصدير المتاح سابقاً (CSV/JSON/Excel) يعطي بيانات خام؛ أما الجهة التي تتلقى
 * العمل فتريد مستنداً: ملخصاً تنفيذياً، وتوزيعاً بصرياً، وجدول الحالات عالية
 * الخطورة باستنادها القانوني، ثم السجل الكامل.
 *
 * يُبنى المستند في نافذة مستقلة ثم تُفتح نافذة الطباعة، فيحفظه المستخدم PDF عبر
 * «الحفظ بصيغة PDF» في متصفحه — بلا أي مكتبة خارجية وبلا إرسال أي بيانات للخارج،
 * وبدعم كامل للعربية واتجاه RTL (وهو ما تفشل فيه أغلب مكتبات PDF الجاهزة).
 */

(function (W) {

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const AR_DATE = { year: 'numeric', month: 'long', day: 'numeric' };
  const fmtDate = d => (d instanceof Date && !isNaN(d)) ? d.toLocaleDateString('ar', AR_DATE) : '—';
  const fmtDateTime = d => (d instanceof Date && !isNaN(d))
    ? d.toLocaleDateString('ar', { ...AR_DATE, hour: '2-digit', minute: '2-digit' }) : '—';

  function fmtNum(n) {
    n = Number(n) || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
  }

  const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);

  /* ============================================================
   * تنسيقات المستند — مضبوطة للطباعة على A4
   * ============================================================ */
  const CSS = `
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, "Liberation Sans", "Segoe UI", Tahoma, sans-serif;
    margin: 0; color: #14181c; background: #fff; line-height: 1.6; font-size: 11pt; }
  h1, h2, h3 { margin: 0; line-height: 1.35; }
  .sheet { max-width: 190mm; margin: 0 auto; padding: 6mm 0; }

  .cover { border-bottom: 3px solid #1a5164; padding-bottom: 14px; margin-bottom: 18px; }
  .cover .eyebrow { color: #1a5164; font-weight: 900; font-size: 10pt; letter-spacing: .3px; }
  .cover h1 { font-size: 22pt; font-weight: 900; margin: 6px 0 4px; }
  .cover .meta { color: #5b6470; font-size: 9.5pt; display: flex; flex-wrap: wrap; gap: 4px 16px; margin-top: 8px; }

  h2.sec { font-size: 13pt; font-weight: 900; margin: 22px 0 10px; padding-right: 10px;
    border-right: 4px solid #1a5164; }

  .cards { display: flex; flex-wrap: wrap; gap: 8px; }
  .card { flex: 1 1 88px; border: 1px solid #dfe3e8; border-radius: 8px; padding: 9px 11px; background: #fbfbfd; }
  .card .k { font-size: 8.5pt; color: #5b6470; font-weight: 700; }
  .card .v { font-size: 17pt; font-weight: 900; line-height: 1.2; }
  .v-neg { color: #b3261e; } .v-pos { color: #1c6b39; } .v-neu { color: #4c5550; }
  .v-high { color: #b3261e; } .v-mid { color: #8a6100; }

  .bars { margin-top: 6px; }
  .bar-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-size: 9.5pt; }
  .bar-row .lbl { width: 130px; flex: none; font-weight: 700; }
  .bar-track { flex: 1; height: 13px; background: #eef0f3; border-radius: 999px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 999px; }
  .bar-row .val { width: 62px; flex: none; text-align: left; color: #5b6470; font-weight: 700; }

  table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 9pt; }
  th, td { border: 1px solid #dfe3e8; padding: 6px 8px; text-align: right; vertical-align: top; }
  th { background: #f3f0fa; font-weight: 900; font-size: 8.5pt; }
  tbody tr:nth-child(even) { background: #fafafc; }
  td.txt { max-width: 0; }

  .pill { display: inline-block; padding: 1px 7px; border-radius: 999px;
    font-size: 8pt; font-weight: 900; white-space: nowrap; }
  .p-neg { background: #fbe2de; color: #a3341f; }
  .p-pos { background: #e1f2e5; color: #1c6b39; }
  .p-neu { background: #eceff1; color: #4c5550; }
  .p-high { background: #fbe0d3; color: #a1471d; }
  .p-mid  { background: #fff2cf; color: #8a6100; }
  .p-low  { background: #e5f2e8; color: #2f7a49; }
  .p-ai   { background: #ede9fe; color: #5b21b6; }

  .case { border: 1px solid #dfe3e8; border-right: 4px solid #b3261e; border-radius: 8px;
    padding: 10px 12px; margin-bottom: 9px; page-break-inside: avoid; }
  .case .head { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 5px; }
  .case .who { font-weight: 900; font-size: 10pt; }
  .case .body { font-size: 9.5pt; margin: 4px 0; }
  .case .kv { font-size: 8.5pt; color: #3c454f; margin-top: 4px; }
  .case .kv b { color: #14181c; }
  .case a { color: #5b21b6; word-break: break-all; font-size: 8pt; }

  .note { font-size: 8.5pt; color: #5b6470; background: #f7f7fa;
    border: 1px solid #e6e8ec; border-radius: 8px; padding: 9px 11px; margin-top: 8px; }
  footer { margin-top: 22px; padding-top: 10px; border-top: 1px solid #dfe3e8;
    color: #5b6470; font-size: 8.5pt; display: flex; justify-content: space-between; gap: 10px; }

  .toolbar { position: fixed; inset-block-start: 0; inset-inline: 0; background: #1e1b31; color: #fff;
    padding: 9px 14px; display: flex; gap: 10px; align-items: center; justify-content: center;
    font-size: 10pt; z-index: 99; }
  .toolbar button { font: inherit; font-weight: 800; cursor: pointer; border: 0; border-radius: 8px;
    padding: 7px 15px; background: #1f6178; color: #fff; }
  .toolbar button.ghost { background: transparent; border: 1px solid #ffffff55; }
  .spacer { height: 46px; }
  @media print { .toolbar, .spacer { display: none !important; } .case { border-right-width: 3px; } }
  `;

  /* ============================================================
   * أقسام التقرير
   * ============================================================ */
  function summarySection(stats, posts) {
    const eng = posts.reduce((s, p) => s + (p.likes || 0) + (p.comments || 0) + (p.shares || 0), 0);
    const c = (k, v, cls) => `<div class="card"><div class="k">${k}</div><div class="v ${cls || ''}">${v}</div></div>`;
    return `<h2 class="sec">الملخص التنفيذي</h2>
    <div class="cards">
      ${c('إجمالي المنشورات', stats.total)}
      ${c('سلبي', stats.negative, 'v-neg')}
      ${c('إيجابي', stats.positive, 'v-pos')}
      ${c('حيادي', stats.neutral, 'v-neu')}
      ${c('خطورة عالية', stats.high, 'v-high')}
      ${c('حذف فوري', stats.needsDelete, 'v-neg')}
      ${c('مراجعة بشرية', stats.needsReview, 'v-mid')}
      ${c('إجمالي التفاعل', fmtNum(eng))}
    </div>`;
  }

  function bar(label, n, total, color) {
    return `<div class="bar-row">
      <div class="lbl">${esc(label)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct(n, total)}%;background:${color}"></div></div>
      <div class="val">${n} (${pct(n, total)}%)</div>
    </div>`;
  }

  function distributionSection(stats) {
    const t = stats.total || 1;
    return `<h2 class="sec">توزيع التصنيف ومستوى الخطورة</h2>
    <div class="bars">
      ${bar('سلبي', stats.negative, t, '#b3261e')}
      ${bar('إيجابي', stats.positive, t, '#1c6b39')}
      ${bar('حيادي', stats.neutral, t, '#8b95a1')}
    </div>
    <div class="bars" style="margin-top:12px">
      ${bar('خطورة/أهمية عالية', stats.high, t, '#c2410c')}
      ${bar('متوسطة', stats.medium, t, '#b8860b')}
      ${bar('منخفضة', stats.low, t, '#2f7a49')}
    </div>`;
  }

  function categorySection(posts) {
    const map = new Map();
    for (const p of posts) {
      const a = p.analysis; if (!a) continue;
      const key = a.subCategory || 'غير مصنّف';
      const e = map.get(key) || { n: 0, cls: a.classification, level: a.level };
      e.n++; map.set(key, e);
    }
    const rows = [...map.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 12).map(([k, v]) => `
      <tr>
        <td>${esc(k)}</td>
        <td style="width:80px">${pill(v.cls, 'cls')}</td>
        <td style="width:70px">${pill(v.level, 'lvl')}</td>
        <td style="width:52px;font-weight:900">${v.n}</td>
      </tr>`).join('');
    if (!rows) return '';
    return `<h2 class="sec">الفئات الأكثر تكراراً</h2>
    <table><thead><tr><th>الفئة</th><th>التصنيف</th><th>المستوى</th><th>العدد</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
  }

  function pill(v, kind) {
    if (kind === 'cls') {
      const m = { NEGATIVE: ['p-neg', 'سلبي'], POSITIVE: ['p-pos', 'إيجابي'], NEUTRAL: ['p-neu', 'حيادي'] }[v] || ['p-neu', '—'];
      return `<span class="pill ${m[0]}">${m[1]}</span>`;
    }
    const m = { HIGH: ['p-high', 'عالي'], MEDIUM: ['p-mid', 'متوسط'], LOW: ['p-low', 'منخفض'] }[v] || ['p-low', '—'];
    return `<span class="pill ${m[0]}">${m[1]}</span>`;
  }

  function criticalSection(posts) {
    const critical = posts.filter(p => p.analysis &&
      (p.analysis.action === 'DELETE' || p.analysis.action === 'REVIEW'))
      .sort((a, b) => (a.analysis.action === 'DELETE' ? -1 : 1) - (b.analysis.action === 'DELETE' ? -1 : 1));
    if (!critical.length) {
      return `<h2 class="sec">الحالات المستوجبة لإجراء</h2>
        <div class="note">لم تُرصد أي حالة تستوجب الحذف أو المراجعة البشرية ضمن هذه العيّنة.</div>`;
    }
    const items = critical.map(p => {
      const a = p.analysis;
      const accent = a.action === 'DELETE' ? '#b3261e' : '#b8860b';
      return `<div class="case" style="border-right-color:${accent}">
        <div class="head">
          <span class="who">${esc(p.author || 'مصدر غير معروف')}</span>
          ${pill(a.classification, 'cls')} ${pill(a.level, 'lvl')}
          <span class="pill ${a.action === 'DELETE' ? 'p-neg' : 'p-mid'}">${esc(a.actionLabel || '')}</span>
          ${a.engine === 'ai' ? '<span class="pill p-ai">مراجَع بالذكاء الاصطناعي</span>' : ''}
          ${a.exceptionApplied ? '<span class="pill p-pos">استثناء توثيق/إدانة</span>' : ''}
          <span style="margin-inline-start:auto;color:#5b6470;font-size:8.5pt">${fmtDateTime(p.date)}</span>
        </div>
        <div class="body">${esc((p.text || '').slice(0, 420))}${(p.text || '').length > 420 ? '…' : ''}</div>
        <div class="kv"><b>الفئة:</b> ${esc(a.subCategory || '—')}</div>
        <div class="kv"><b>التحليل السياقي:</b> ${esc(a.contextualAnalysis || '—')}</div>
        <div class="kv"><b>الاستناد القانوني والأخلاقي:</b> ${esc(a.legalBasis || '—')}</div>
        <div class="kv"><b>التفاعل:</b> ${fmtNum(p.likes)} إعجاب · ${fmtNum(p.comments)} تعليق · ${fmtNum(p.shares)} مشاركة</div>
        ${p.url ? `<div class="kv"><a href="${esc(p.url)}">${esc(p.url)}</a></div>` : ''}
      </div>`;
    }).join('');
    return `<h2 class="sec">الحالات المستوجبة لإجراء (${critical.length})</h2>${items}`;
  }

  function logSection(posts) {
    const rows = posts.map(p => {
      const a = p.analysis || {};
      return `<tr>
        <td style="width:78px">${fmtDate(p.date)}</td>
        <td style="width:110px">${esc(p.author || '—')}</td>
        <td class="txt">${esc((p.text || '').slice(0, 150))}${(p.text || '').length > 150 ? '…' : ''}</td>
        <td style="width:62px">${pill(a.classification, 'cls')}</td>
        <td style="width:58px">${pill(a.level, 'lvl')}</td>
        <td style="width:96px">${esc(a.actionLabel || '—')}</td>
      </tr>`;
    }).join('');
    return `<h2 class="sec">السجل الكامل (${posts.length})</h2>
    <table><thead><tr>
      <th>التاريخ</th><th>المصدر</th><th>النص</th><th>التصنيف</th><th>المستوى</th><th>الإجراء</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
  }

  /* ============================================================
   * بناء المستند
   * ============================================================ */
  function buildHtml(posts, meta) {
    meta = meta || {};
    const stats = W.FBXAnalyzer.aggregate(posts.map(p => p.analysis));
    const dates = posts.map(p => p.date).filter(d => d instanceof Date && !isNaN(d)).sort((a, b) => a - b);
    const range = dates.length ? `${fmtDate(dates[0])} — ${fmtDate(dates[dates.length - 1])}` : '—';
    const sources = new Set(posts.map(p => p.author).filter(Boolean));
    const aiCount = posts.filter(p => p.analysis && p.analysis.engine === 'ai').length;
    const title = meta.title || 'تقرير رصد وتحليل المحتوى الرقمي';
    const platform = meta.platform === 'twitter' ? 'منصة X (تويتر)'
                   : meta.platform === 'facebook' ? 'فيسبوك' : 'فيسبوك ومنصة X';

    return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
<title>${esc(title)}</title>
<style>${CSS}</style></head><body>

<div class="toolbar">
  <span>المستند جاهز — اختر «الحفظ بصيغة PDF» في وجهة الطباعة</span>
  <button onclick="window.print()">طباعة / حفظ PDF</button>
  <button class="ghost" onclick="window.close()">إغلاق</button>
</div>
<div class="spacer"></div>

<div class="sheet">
  <div class="cover">
    <div class="eyebrow">الإعلام الرقمي · وحدة الثقة والأمان</div>
    <h1>${esc(title)}</h1>
    <div class="meta">
      <span><b>المنصة:</b> ${esc(platform)}</span>
      <span><b>الفترة المشمولة:</b> ${esc(range)}</span>
      <span><b>عدد المصادر:</b> ${sources.size}</span>
      <span><b>تاريخ إصدار التقرير:</b> ${fmtDateTime(new Date())}</span>
    </div>
  </div>

  ${summarySection(stats, posts)}
  ${distributionSection(stats)}
  ${categorySection(posts)}
  ${criticalSection(posts)}
  ${logSection(posts)}

  <div class="note">
    <b>منهجية التصنيف:</b> يُصنَّف كل منشور وفق قانون الجرائم المعلوماتية السوري رقم 20 لعام 2022،
    ومدونة السلوك المهني والأخلاقي لقطاع الإعلام في سورية، ومعايير منصتي ميتا وإكس لخطاب الكراهية والتحريض.
    ويمر الحكم بمسار تسلسلي: التصنيف ← مستوى الخطورة/الأهمية ← التحليل السياقي ← الاستناد القانوني ← الإجراء الموصى به،
    مع تطبيق استثناءات مقرَّرة أهمها اعتبار نقل الانتهاك بقصد الإدانة والتوثيق محتوى إيجابياً لا مخالفاً.
    ${aiCount ? `<br><b>مراجعة الذكاء الاصطناعي:</b> روجِع ${aiCount} من ${posts.length} منشوراً بنموذج لغوي لضبط السياق.` : ''}
    <br><b>تنبيه:</b> هذا التقرير أداة مساندة لقرار المراجع البشري ولا يغني عنه؛ الحالات المصنَّفة
    «تحويل للمراجعة البشرية» تستوجب حكماً بشرياً قبل أي إجراء.
  </div>

  <footer>
    <span>الإعلام الرقمي — تقرير آلي · تحليل محلي</span>
    <span>${esc(range)} · ${posts.length} منشوراً</span>
  </footer>
</div>
</body></html>`;
  }

  /* ============================================================
   * الفتح
   * ============================================================ */
  function open(posts, meta) {
    if (!posts || !posts.length) return { ok: false, error: 'لا توجد نتائج لإصدار تقرير عنها.' };
    const win = W.open('', '_blank');
    if (!win) return { ok: false, error: 'مانع النوافذ المنبثقة منع فتح التقرير — اسمح بالنوافذ المنبثقة لهذا الموقع ثم أعد المحاولة.' };
    win.document.write(buildHtml(posts, meta));
    win.document.close();
    return { ok: true, count: posts.length };
  }

  W.FBXReport = { open, buildHtml };

})(typeof window !== 'undefined' ? window : this);

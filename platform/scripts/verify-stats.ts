/**
 * فحص شريط المقاييس.
 *
 * العطب الذي جاء منه هذا الملف لا يظهر في أي اختبار منطقي: عشرُ بطاقات على
 * أربعة أعمدة تُخرج صفّاً أخيراً فيه بطاقتان وفجوة بعرض نصف الشاشة. الأرقام
 * صحيحة، والبيانات صحيحة، والشبكة «تعمل» — وتبدو مكسورة.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const SOURCE = readFileSync(path.join(root, 'src/components/ui/stat-card.tsx'), 'utf8');

const checks: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
}

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) tsxFiles(full, out);
    else if (entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

const files = tsxFiles(path.join(root, 'src')).filter(
  (file) => !file.endsWith(`${path.sep}stat-card.tsx`),
);
const sources = new Map(files.map((file) => [file, readFileSync(file, 'utf8')]));

/*
 * القاعدة الوحيدة التي تمنع الصفّ الأخير الأعرج: كل عدد أعمدة يقسم عدد
 * البطاقات بلا باقٍ.
 */
const columnsBlock = SOURCE.match(/const COLUMNS[^=]*=\s*\{([\s\S]*?)\n\};/)?.[1] ?? '';
const entries = [...columnsBlock.matchAll(/(\d+):\s*'([^']+)'/g)];

check('جدول الأعمدة موجود', entries.length > 0, `${entries.length} مدخلاً`);

/*
 * المقيس هو أوسع نقطة توقّف وحدها.
 *
 * هي الشاشة التي اشتُكي منها: صفٌّ أخير فيه بطاقتان وفجوة بعرض نصف الشاشة.
 * أما النقاط الأضيق فبعضُ الأعداد لا يقبل القسمة عليها أصلاً — خمس بطاقات
 * لا تنقسم على ثلاثة أعمدة مهما رُتّبت — وصفٌّ أخير ناقصُ بطاقة على لوح
 * ليس عطباً بل حدّ الرياضيات.
 */
for (const [, countRaw, classes] of entries) {
  const count = Number(countRaw);
  const columns = [...(classes ?? '').matchAll(/grid-cols-(\d+)/g)].map((m) => Number(m[1]));
  const widest = columns[columns.length - 1] ?? 0;
  check(
    `${count} بطاقة: أوسع شاشة تعرضها في صفٍّ منظّم`,
    widest > 0 && count % widest === 0,
    `الأعمدة ${columns.join(' ← ')} — الأوسع ${widest}`,
  );
}

/*
 * عدد البطاقات يطابق ما أُعلن.
 *
 * `count` يختار الأعمدة، فإن خالف عدد الأبناء عاد الصفّ الأعرج من الباب
 * الذي أُغلق — وبصمت، لأن الشبكة تقبل أي عدد.
 */
function countChildren(text: string, from: number): { declared: number; actual: number } | null {
  const open = text.slice(from, from + 200).match(/count=\{(\d+)\}/);
  if (!open) return null;

  const close = text.indexOf('</StatGrid>', from);
  if (close < 0) return null;

  const body = text.slice(from, close);
  const actual = (body.match(/<(StatCard|HighlightCard)\b/g) ?? []).length;
  return { declared: Number(open[1]), actual };
}

const mismatched: string[] = [];
let grids = 0;
for (const [file, text] of sources) {
  for (const match of text.matchAll(/<StatGrid\b/g)) {
    grids += 1;
    const result = countChildren(text, match.index);
    if (!result) continue;
    if (result.declared !== result.actual) {
      const line = text.slice(0, match.index).split('\n').length;
      mismatched.push(
        `${path.relative(root, file)}:${line} — أُعلن ${result.declared} والموجود ${result.actual}`,
      );
    }
  }
}
check(`عدد البطاقات يطابق count في ${grids} شبكة`, mismatched.length === 0, mismatched.join(' · '));

/*
 * الأيقونة ليست زينة: هي ما يُعرف به المقياس قبل قراءة اسمه، وبطاقةٌ بلا
 * أيقونة بين أخواتها تكسر انتظام الصفّ وتبدو ناقصة.
 */
function readTag(text: string, from: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (ch === '>' && depth === 0) return text.slice(from, i);
  }
  return text.slice(from);
}

const iconless: string[] = [];
let cards = 0;
for (const [file, text] of sources) {
  for (const match of text.matchAll(/<StatCard\b/g)) {
    cards += 1;
    if (!/icon=/.test(readTag(text, match.index))) {
      iconless.push(`${path.relative(root, file)}:${text.slice(0, match.index).split('\n').length}`);
    }
  }
}
check(`كل بطاقة تحمل أيقونة (${cards} بطاقة)`, iconless.length === 0, iconless.join('، '));

// ── المكوّن نفسه
check('الأيقونات معرّفة في خريطة واحدة', SOURCE.includes('export const METRIC_ICONS'));
check('الرقم بخانات متساوية العرض', SOURCE.includes('tabular-nums'));
check('البطاقة أفقية مضغوطة', /items-center gap-2\.5[^']*px-3\.5 py-3/.test(SOURCE));
check('الاسم بالحدّ الأدنى للعربية (12px)', SOURCE.includes('className="eyebrow truncate"'));

console.log('\n>> فحص شريط المقاييس\n');
let failed = 0;
for (const c of checks) {
  console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? `\n      ${c.detail}` : ''}`);
  if (!c.ok) failed += 1;
}
if (failed > 0) {
  console.error(`\n✗ ${failed} من ${checks.length} فحصاً فشل.\n`);
  process.exit(1);
}
console.log(`\n✓ سليم: ${checks.length} فحصاً كلها تمرّ.\n`);

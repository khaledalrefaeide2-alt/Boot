/**
 * فحص شريط المقاييس.
 *
 * العطب الذي جاء منه هذا الملف لا يظهر في أي اختبار منطقي: عشرُ بطاقات على
 * أربعة أعمدة تُخرج صفّاً أخيراً فيه بطاقتان وفجوة بعرض نصف الشاشة. الأرقام
 * صحيحة، والبيانات صحيحة، والشبكة «تعمل» — وتبدو مكسورة.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { formatPublishedAt } from '../src/lib/utils';

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
 * بطاقاتٌ متساوية العرض — وهذه قاعدةٌ حلّت محلّ سابقتها بطلبٍ صريح.
 *
 * كانت القاعدة «لا فجوة في آخر صفّ»، وتُنفَّذ بمدّ البطاقة الأخيرة لتملأ
 * ما بقي حين لا ينقسم العدد على الأعمدة. وثمنُها أنّ بطاقةً واحدة تصير
 * ضعف جاراتها بلا سبب في بياناتها — فتُقرأ أهمَّ منها وهي ليست كذلك،
 * ويخرج الصفّ عن الاستقامة.
 *
 * فصار المحروس أن لا تُمدّ بطاقةٌ أصلاً: الصفّ الأخير الناقص شكلٌ مألوف
 * في كلّ لوحة، والبطاقة الشاذّة العرض تُربك الترتيب كلّه.
 *
 * ونقاط التوقّف تتوارث: ما لم يُعلَن عند نقطةٍ يبقى على قيمته من أصغرها.
 */
const BREAKPOINTS = ['base', 'sm', 'md', 'lg', 'xl', '2xl'] as const;

function valueAt(classes: string, pattern: RegExp, fallback: number): Map<string, number> {
  const resolved = new Map<string, number>();
  let current = fallback;
  for (const bp of BREAKPOINTS) {
    const prefix = bp === 'base' ? '' : `${bp}:`;
    const match = classes.match(
      new RegExp(`(?:^|\\s)${prefix.replace(':', '\\:')}${pattern.source}`),
    );
    if (match?.[1]) current = Number(match[1]);
    resolved.set(bp, current);
  }
  return resolved;
}

for (const [, countRaw, classesRaw] of entries) {
  const count = Number(countRaw);
  const classes = classesRaw ?? '';
  const columns = valueAt(classes, /grid-cols-(\d+)/, 1);
  const stretched = /\[&>\*\:last-child\]\:col-span-/.test(classes);

  check(
    `${count} بطاقة: أعمدة متساوية بلا بطاقة ممدودة`,
    !stretched,
    stretched
      ? 'البطاقة الأخيرة تُمدّ فتصير أعرض من جاراتها'
      : [...new Set(BREAKPOINTS.map((bp) => columns.get(bp)))].join(' ← ') + ' عمود',
  );

  /*
   * سقف الأعمدة خمسة: ما فوقها يقصّ الاسم العربي والرقم معاً.
   */
  const widest = Math.max(...BREAKPOINTS.map((bp) => columns.get(bp) ?? 1));
  check(`${count} بطاقة: لا تتجاوز خمسة أعمدة`, widest <= 5, `الأوسع ${widest}`);
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
/*
 * الخانات المتساوية من صنف `.num` لا من صنفٍ يُكتب على كلّ رقم.
 *
 * `.num` في ملفّ الأنماط يجمع الثلاثة التي يحتاجها كلّ رقم: خانات
 * متساوية العرض، واتجاهاً من اليسار، وعزلاً عن السياق العربي. فيُفحص
 * أنّ الرقم يحمله، وأنّه يحمل الخانات المتساوية فعلاً.
 */
const GLOBALS = readFileSync(path.join(root, 'src/app/globals.css'), 'utf8');
check(
  'الرقم بخانات متساوية العرض',
  /<span className="num">\{amount\}<\/span>/.test(SOURCE) &&
    /\.num,[\s\S]{0,40}\{[\s\S]{0,80}tabular-nums/.test(GLOBALS),
);
/*
 * البطاقة بيضاء بحدٍّ خفيف — وتملأ ارتفاع خليّتها فتستوي الشبكة.
 *
 * كان الفحص يثبّت سطحاً ملوّناً بزاوية 20px وقصّاً لما يفيض (موجةٌ
 * زخرفية كانت تتسرّب). والتصميم الجديد أبيض بزاوية البطاقات كلّها
 * (`rounded-card`) وبلا موجة، فلا شيء يُقصّ — وقصُّ البطاقة كان سيقصّ
 * الرقم الطويل معها. والمحروس ما لم يتغيّر قصده: أنّها تملأ خليّتها.
 */
check(
  'البطاقة تستوي في شبكتها',
  /flex h-full flex-col[^']*rounded-card[^']*bg-surface/.test(SOURCE),
);
check('والبطاقة بيضاء لا ملوّنة السطح', !/bg-tint-[a-z]+-surface/.test(SOURCE));
/*
 * الفحوص الثلاثة التالية تُطابق المعنى لا نصّ الصنف حرفاً بحرف.
 *
 * والاسم الآن 14px (`text-sm`) — فوق حدّ الـ12 للعربية.
 */
const LABEL = /<p className="line-clamp-2 text-sm[^"]*" title=\{label\}>/;
check('الاسم بالحدّ الأدنى للعربية (12px)', LABEL.test(SOURCE));
/*
 * فحصان على القصّ، وهما سبب هذه المراجعة كلها.
 *
 * «معدل التف…» و«4.3 ن…» كانتا على الشاشة فعلاً: الاسم يُقصّ فيصير لغزاً،
 * والرقم يُقصّ فيصير كذباً.
 */
check('الاسم يلتفّ ولا يُقصّ', LABEL.test(SOURCE) && !/title=\{label\}[^>]*truncate/.test(SOURCE));
/*
 * والمقاس لا يُثبَّت في الفحص، إنّما يُثبَّت المنع: الرقم لا يلتفّ ولا
 * يُقصّ مهما كان مقاسه — ويصغر مع البطاقة (`@container`) قبل أن يضيق.
 */
check(
  'الرقم لا يُقصّ أبداً',
  /<p className="mt-2 whitespace-nowrap text-(lg|xl|2xl|3xl)[^"]*">\s*<span className="num">\{amount\}/.test(SOURCE) &&
    !/num[^"']*truncate/.test(SOURCE),
);
/*
 * والوحدة بعد الرقم في القراءة العربية — يساره لا يمينه.
 *
 * لو عُزل السطر كلّه اتّجاهاً لاتينياً لوقعت «ألف» يمين الرقم، أي قبله.
 * فالعزل على الرقم وحده، والوحدة خارجه.
 */
check(
  'الوحدة خارج عزل الرقم',
  /<span className="num">\{amount\}<\/span>\s*\{unit && <span className="ms-1\.5/.test(SOURCE),
);

// ══════════════ بطاقة المنشور: الوقت والمقاييس ══════════════

/*
 * وقت النشر — دالّةٌ خالصة بمعامل «الآن»، فتُفحص بأوقاتٍ ثابتة.
 */
const NOW = new Date('2026-10-13T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
check('وقت النشر: «الآن» لأقلّ من دقيقة', formatPublishedAt(ago(20_000), NOW) === 'الآن');
check(
  'ونسبيٌّ بالدقائق ثم بالساعات لما دون اليوم',
  /دقيقة|دقائق/.test(formatPublishedAt(ago(25 * 60_000), NOW)) &&
    /ساعة|ساعات|ساعتين/.test(formatPublishedAt(ago(3 * 3_600_000), NOW)),
  `${formatPublishedAt(ago(25 * 60_000), NOW)} · ${formatPublishedAt(ago(3 * 3_600_000), NOW)}`,
);
check(
  'ومطلقٌ بيومه وساعته لما بعده في السنة الجارية',
  /أكتوبر/.test(formatPublishedAt('2026-10-10T14:05:00Z', NOW)) &&
    /\d{1,2}:\d{2}/.test(formatPublishedAt('2026-10-10T14:05:00Z', NOW)) &&
    !/2026/.test(formatPublishedAt('2026-10-10T14:05:00Z', NOW)),
  formatPublishedAt('2026-10-10T14:05:00Z', NOW),
);
check(
  'وبسنته بلا ساعة لما قبلها',
  /2025/.test(formatPublishedAt('2025-03-02T14:05:00Z', NOW)) &&
    !/\d{1,2}:\d{2}/.test(formatPublishedAt('2025-03-02T14:05:00Z', NOW)),
  formatPublishedAt('2025-03-02T14:05:00Z', NOW),
);
check('ولا شيء بلا تاريخ', formatPublishedAt(null, NOW) === '—');

const CARD = readFileSync(path.join(root, 'src/components/posts/post-card.tsx'), 'utf8');
check(
  'البطاقة تعرض وقت النشر بعنصر `time` ووقته الكامل في التلميح',
  /<time\s+dateTime=\{post\.publishedAt\}\s+title=\{formatDateTime\(post\.publishedAt\)\}/.test(CARD) &&
    /formatPublishedAt\(post\.publishedAt\)/.test(CARD),
);
check(
  'والوقت لا يُقصّ والمنصّة بعده تُقصّ',
  /<time[\s\S]{0,160}shrink-0 whitespace-nowrap/.test(CARD) && /className="truncate" title=\{platformLabel/.test(CARD),
);
/*
 * المقياس: الرقم معزولٌ وحده والوحدة بعده، والسطر لا يلتفّ.
 * كان «1.8 مليون» كلّه في عزلٍ لاتيني: الوحدة قبل الرقم في القراءة،
 * و«مليون» تسقط تحت «1.8» في البطاقة الضيّقة — وكانا على الشاشة.
 */
check(
  'مقياس البطاقة: الوحدة خارج عزل الرقم والسطر لا يلتفّ',
  /splitUnit\(formatCompactNumber\(value\)\)/.test(CARD) &&
    /<span className="num[^"]*">\{amount\}<\/span>\s*\{unit && <span>\{unit\}<\/span>\}/.test(CARD) &&
    /whitespace-nowrap text-xs text-muted-foreground/.test(CARD),
);
check(
  'وأعمدة المقاييس ثابتة تنقسم في البطاقة الضيّقة',
  /<footer className="grid grid-cols-2[^"]*@\[19rem\]:grid-cols-4">/.test(CARD),
);

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

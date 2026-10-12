/**
 * فحص نظام الأزرار.
 *
 * يقرأ مصدر المكوّن والواجهة لا المتصفّح، لأن ما يُفحص هنا مكتوبٌ في
 * الشيفرة أصلاً: مقاسات ثابتة، وحالاتٌ لكل نوع، وقواعد توزيع. وأكثر ما
 * يُخالَف منها لا يظهر في لقطة شاشة — زرٌّ أيقوني بلا اسم مقروء يبدو
 * سليماً تماماً لمن يرى.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { readdirSync, statSync } from 'node:fs';

const root = process.cwd();
/*
 * الملفّان معاً: الأنواع في وحدةٍ محايدة والمكوّن في وحدة عميل.
 *
 * فُصلا لأنّ صفحة «غير موجود» مكوّنُ خادم يحتاج الأنواع، ووحدةٌ تبدأ
 * بـ`use client` لا تُنادى دالّتها من الخادم. والفحص يقرأ الاثنين
 * بوصفهما نظاماً واحداً — فما يهمّه أنّ النوع موجودٌ بحالاته، لا في
 * أيّ ملفٍّ كُتب.
 */
const BUTTON = [
  'src/components/ui/button-variants.ts',
  'src/components/ui/button.tsx',
]
  .map((file) => readFileSync(path.join(root, file), 'utf8'))
  .join('\n');

const checks: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
}

/** كل ملفات الواجهة عدا مكوّنات النظام نفسها */
function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) tsxFiles(full, out);
    else if (entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

const appFiles = tsxFiles(path.join(root, 'src')).filter(
  (file) => !file.includes(`${path.sep}components${path.sep}ui${path.sep}`),
);
const sources = new Map(appFiles.map((file) => [file, readFileSync(file, 'utf8')]));

/*
 * ── المقاسات من المواصفة: ارتفاع | حشوة | خط | أيقونة | فجوة | عرض أدنى
 *
 *   القياسي 44 | 16 | 14 | 20 | 8 — والمضغوط 36 | 12 | 14 | 18 | 8
 *   والكبير 48 | 20 | 16 | 20 | 8 — والأيقوني 44 × 44 بأيقونة 20
 *
 * والارتفاع رمزٌ (`h-control`) لا رقم: الحقل يقرأ الرمز نفسه، فيُفحص هنا
 * أنّ الرمز يساوي الرقم المطلوب، وفي الحقل أنّه يستعمل الرمز.
 */
const SIZES: Record<string, string[]> = {
  sm: ['h-control-compact', 'min-w-16', 'gap-2', 'px-3', 'text-sm', '[--btn-icon:18px]'],
  md: ['h-control', 'min-w-22', 'gap-2', 'px-4', 'text-sm', '[--btn-icon:20px]'],
  lg: ['h-control-lg', 'min-w-30', 'gap-2', 'px-5', 'text-base', '[--btn-icon:20px]'],
};

for (const [size, tokens] of Object.entries(SIZES)) {
  const line = BUTTON.match(new RegExp(`\\n\\s+'?${size}'?:\\s*'([^']+)'`))?.[1] ?? '';
  const missing = tokens.filter((token) => !line.includes(token));
  check(`مقاس ${size} كامل`, missing.length === 0, missing.length ? `ناقص: ${missing.join(' ')}` : line);
}

check(
  'المقاسات الأيقونية مربّعة وبلا عرض أدنى',
  ['icon-sm', 'icon', 'icon-lg'].every((size) => {
    const line = BUTTON.match(new RegExp(`'?${size}'?:\\s*'([^']+)'`))?.[1] ?? '';
    return line.includes('min-w-0') && line.includes('p-0') && /size-control/.test(line);
  }),
);

/*
 * الرموز نفسها بالأرقام المطلوبة — فلا يتغيّر ارتفاع الزرّ بتعديل رمزٍ
 * في ملفّ الأنماط دون أن يسقط هذا الفحص.
 */
const CSS = readFileSync(path.join(root, 'src/app/globals.css'), 'utf8');
const TOKENS: [string, string][] = [
  ['--spacing-control', '2.75rem'],
  ['--spacing-control-compact', '2.25rem'],
  ['--spacing-control-lg', '3rem'],
  ['--radius-control', '0.625rem'],
  ['--radius-card', '0.75rem'],
  ['--radius-modal', '1rem'],
];
for (const [token, value] of TOKENS) {
  check(
    `الرمز ${token} = ${value}`,
    new RegExp(`${token}:\\s*${value.replace('.', '\\.')};`).test(CSS),
  );
}

/*
 * الحقل والقائمة بارتفاع الزرّ وزاويته — فيستوي صفّ الفلاتر.
 */
const FIELD = readFileSync(path.join(root, 'src/components/ui/field.tsx'), 'utf8');
check('الحقل بارتفاع الزرّ', /'h-control'/.test(FIELD) && /'h-control cursor-pointer/.test(FIELD));
check('والحقل بزاوية الزرّ', /rounded-control/.test(FIELD));

/*
 * الزرّ يضبط مقاس أيقونته — أيّاً كان ما كُتب عليها.
 */
check('الأيقونة بمقاس الزرّ', BUTTON.includes('[&_svg]:size-[var(--btn-icon)]'));

// ── الأساس
const BASE = [
  ['inline-flex', 'inline-flex'],
  ['توسيط', 'items-center'],
  ['توسيط أفقي', 'justify-center'],
  ['وزن 600', 'font-semibold'],
  ['حدّ شفاف يحجز مكانه', 'border border-transparent'],
  ['زاوية 10px', 'rounded-control'],
  ['ارتفاع سطر 1', 'leading-none'],
  ['بلا التفاف', 'whitespace-nowrap'],
  ['مؤشّر الممنوع عند التعطيل', 'disabled:cursor-not-allowed'],
] as const;
for (const [label, token] of BASE) check(`الأساس: ${label}`, BUTTON.includes(token));

check(
  'حلقة التركيز حلقتان — بلون السطح ثم بلون الحلقة',
  /focus-visible:shadow-\[0_0_0_2px_var\(--surface\),0_0_0_4px_var\(--ring\)\]/.test(BUTTON),
);

// ── الأنواع الستة وحالاتها
const VARIANTS = ['primary', 'secondary', 'outline', 'tonal', 'ghost', 'danger', 'link'];
for (const variant of VARIANTS) {
  const block = BUTTON.match(new RegExp(`\\n\\s+'?${variant}'?:\\s*\\[([\\s\\S]*?)\\]\\.join`))?.[1] ?? '';
  check(`${variant}: موجود`, block.length > 0);
  check(`${variant}: له تحويم`, block.includes('hover:'), undefined);
  check(`${variant}: له ضغط`, block.includes('active:'));
  check(`${variant}: له تعطيل`, block.includes('disabled:'));
}

/*
 * الشبح والرابط يفقدان النصّ وحده عند التعطيل.
 * خلفيةٌ رمادية عليهما تخترع صندوقاً لم يكن موجوداً، فيبدو الزرّ وقد ظهر
 * لا وقد عُطّل.
 */
for (const variant of ['ghost', 'link']) {
  const block = BUTTON.match(new RegExp(`\\n\\s+'?${variant}'?:\\s*\\[([\\s\\S]*?)\\]\\.join`))?.[1] ?? '';
  check(
    `${variant}: التعطيل بلا خلفية`,
    block.includes('disabled:bg-transparent') && !block.includes('disabled:bg-disabled-bg'),
  );
}

check('الرابط بلا حشوة ولا عرض أدنى', /variant: 'link'[\s\S]*?class: 'h-auto min-w-0 px-0'/.test(BUTTON));
check('التحميل يضع aria-busy', BUTTON.includes('aria-busy={loading || undefined}'));
check('التحميل يُعطّل الزرّ', BUTTON.includes('disabled={disabled || loading}'));
/*
 * التحميل لا يغيّر عرض الزرّ: المحتوى يبقى في مكانه مخفيّاً، والمؤشّر فوقه.
 * ولو أُضيف بجوار النصّ لاتّسع الزرّ لحظةَ الضغط ودفع جاره تحت الإصبع.
 */
check(
  'التحميل لا يغيّر عرض الزرّ',
  /loading && \([\s\S]{0,200}absolute inset-0[\s\S]{0,200}animate-spin/.test(BUTTON) &&
    /loading && 'invisible'/.test(BUTTON),
);

/*
 * لا زرّ داخل رابط.
 *
 * عنصران تفاعليان متداخلان: لوحة المفاتيح تقف مرّتين على إجراءٍ واحد،
 * وقارئ الشاشة يُعلن «رابط، زرّ». والبديل `LinkButton`.
 */
const nested: string[] = [];
for (const [file, text] of sources) {
  for (const match of text.matchAll(/<(Link|a)\b[^>]*>\s*(?:\{\/\*[\s\S]*?\*\/\}\s*)?<Button\b/g)) {
    nested.push(`${path.relative(root, file)}:${text.slice(0, match.index).split('\n').length}`);
  }
}
check('لا زرّ داخل رابط', nested.length === 0, nested.join('، '));

// ── قواعد على مواضع الاستعمال
const legacy: string[] = [];
for (const [file, text] of sources) {
  if (/variant=["']soft["']|variant=\{[^}]*'soft'/.test(text)) legacy.push(path.relative(root, file));
}
check('لا بقايا من النوع القديم soft', legacy.length === 0, legacy.join('، '));

/*
 * الزرّ الأيقوني بلا اسم مقروء.
 *
 * هذا أكثر ما يُنسى وأقلّه ظهوراً: الزرّ يبدو سليماً لمن يراه، ولا يقول
 * لقارئ الشاشة إلا «زرّ».
 */
/*
 * الوسم يُقرأ بعدّاد أقواس لا بأوّل `>`.
 *
 * `onClick={() => x}` يحمل `>` داخله، فقصُّ الوسم عند أوّل علامة يقطعه قبل
 * `aria-label` ويُبلّغ عن نقصٍ ليس موجوداً. والفحص الذي يُنذر كذباً يُطفأ
 * بعد ثالث إنذار، فيصير وجوده وعدمه سواء.
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

const unnamed: string[] = [];
for (const [file, text] of sources) {
  for (const match of text.matchAll(/<Button\b/g)) {
    const tag = readTag(text, match.index);
    if (/size="icon/.test(tag) && !/aria-label/.test(tag)) {
      unnamed.push(`${path.relative(root, file)}:${text.slice(0, match.index).split('\n').length}`);
    }
  }
}
check('كل زرّ أيقوني يحمل aria-label', unnamed.length === 0, unnamed.join('، '));

/*
 * إجراءات الصفّ.
 *
 * ثلاثة أزرار فأكثر في خلية واحدة تعني صفّاً تمسحه العين كلَّه قبل أن تجد
 * ما تريد — في كل صفّ من مئة. والحدّ اثنان ثم «المزيد».
 */
const crowded: string[] = [];
for (const [file, text] of sources) {
  for (const match of text.matchAll(/<div className="flex items-center justify-end gap-[\d.]+">/g)) {
    const rest = text.slice(match.index);
    const end = rest.indexOf('</div>');
    const cluster = rest.slice(0, end > 0 ? end : 2000);
    const count = (cluster.match(/<Button\b/g) ?? []).length;
    if (count > 2) {
      crowded.push(`${path.relative(root, file)}:${text.slice(0, match.index).split('\n').length} (${count})`);
    }
  }
}
check('لا خلية فيها أكثر من إجراءين ظاهرين', crowded.length === 0, crowded.join('، '));

console.log('\n>> فحص نظام الأزرار\n');
let failed = 0;
for (const c of checks) {
  console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.detail && !c.ok ? `\n      ${c.detail}` : ''}`);
  if (!c.ok) failed += 1;
}
if (failed > 0) {
  console.error(`\n✗ ${failed} من ${checks.length} فحصاً فشل.\n`);
  process.exit(1);
}
console.log(`\n✓ سليم: ${checks.length} فحصاً كلها تمرّ.\n`);

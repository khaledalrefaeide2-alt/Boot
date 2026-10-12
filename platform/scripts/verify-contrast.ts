/**
 * قياس التباين في السمتين من رموز `globals.css` مباشرةً.
 *
 *   npm run verify:contrast
 *
 * لماذا يُقرأ الملف لا المتصفح: القياس عبر المتصفح يمرّ بـ `getComputedStyle`،
 * وTailwind v4 يُخرج ألوان الشفافية بصيغة `oklab()` — فيقرأها أي محلّل ساذج
 * أرقاماً في المدى 0–255 ويعطي نتائج سليمة المظهر فاسدة القيمة. والرموز هنا
 * مكتوبة بالست عشري في الملف، فقياسها من المصدر أدقّ ولا يحتاج متصفحاً.
 *
 * الحدّان من WCAG 2.1 AA: 4.5:1 للنص العادي، و3:1 للعناصر الرسومية وحدود
 * الواجهة (1.4.11). والعناوين الكبيرة يسمح لها المعيار بـ3:1، لكننا نطبّق
 * 4.5:1 عليها أيضاً — العربية أدقّ تفاصيل من اللاتينية في المقاس نفسه.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const CSS = readFileSync(path.join(process.cwd(), 'src/app/globals.css'), 'utf8');

/*
 * صفحةُ السقوط الأخير لها لوحةٌ ثانية داخلها.
 *
 * `global-error.tsx` تحلّ محلّ التخطيط الجذري، فلا تصلها ورقة الأنماط —
 * وألوانها مكتوبةٌ في نصٍّ داخلها. ولوحةٌ لا يقيسها شيء هي لوحةٌ تُكتب
 * مرّةً وتُنسى، فتُقاس هنا كما تُقاس الأولى، ويُفحص أنّها لم تفترق عنها.
 */
const FALLBACK = readFileSync(path.join(process.cwd(), 'src/app/global-error.tsx'), 'utf8');

type RGB = [number, number, number];

/** استخراج كتلة محدّد بعينه من الملف */
function block(selector: string, source = CSS): Record<string, string> {
  const start = source.indexOf(selector + ' {');
  if (start < 0) throw new Error(`لم يُعثر على الكتلة ${selector}`);
  let depth = 0;
  let i = source.indexOf('{', start);
  const from = i;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) break;
  }
  const body = source.slice(from + 1, i);
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = m;
    if (name && value) out[name] = value.trim();
  }
  return out;
}

function parseColor(value: string): RGB | null {
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex?.[1]) {
    const n = Number.parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = value.match(/^rgba?\(\s*(\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*([\d.]+))?\s*\)$/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return null;
}

/** نسبة الشفافية إن وُجدت */
function alphaOf(value: string): number {
  const m = value.match(/\/\s*([\d.]+)\s*\)/);
  return m?.[1] ? Number(m[1]) : 1;
}

function composite(fg: RGB, alpha: number, bg: RGB): RGB {
  return [0, 1, 2].map((i) =>
    Math.round((fg[i] ?? 0) * alpha + (bg[i] ?? 0) * (1 - alpha)),
  ) as RGB;
}

function luminance([r, g, b]: RGB): number {
  const f = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function ratio(a: RGB, b: RGB): number {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** النص على الأرضية، ونصّ الأزرار، وحدود الواجهة، وسلاسل الرسوم */
const TEXT_ON: Array<[string, string[]]> = [
  ['--foreground', ['--background', '--surface', '--surface-2', '--surface-3']],
  ['--heading', ['--background', '--surface']],
  ['--muted-foreground', ['--background', '--surface', '--surface-2']],
  ['--subtle-foreground', ['--background', '--surface']],
  ['--primary', ['--background', '--surface', '--surface-2']],
  ['--primary-foreground', ['--primary']],
  ['--primary-soft-foreground', ['--primary-soft']],
  ['--success', ['--background', '--surface', '--success-soft']],
  ['--warning', ['--background', '--surface', '--warning-soft']],
  ['--danger', ['--background', '--surface', '--danger-soft']],
  ['--info', ['--background', '--surface', '--info-soft']],

  /*
   * نظام الأزرار.
   *
   * كل سطر هنا حالةٌ يراها المستخدم فعلاً — لا تركيبة نظرية: الزرّ
   * الأساسي وتحويمه وضغطه، ونصّ الثانوي على أسطحه الثلاثة، والمتدرّج على
   * درجاته، والشبح على ما يقف عليه. وبدونها يبقى السلّم لوحةً جميلة لا
   * يعرف أحد أيّ درجتين منها تلتقيان في زرّ حقيقي.
   */
  ['--olive-700', ['--surface', '--background', '--surface-2', '--olive-50', '--olive-100']],
  ['--olive-800', ['--surface', '--background', '--olive-50', '--olive-100']],
  ['--olive-900', ['--olive-100', '--olive-200', '--olive-300']],
  ['--danger-foreground', ['--danger', '--danger-hover', '--danger-active']],
  ['--disabled-text', ['--disabled-bg', '--surface', '--background']],

  /*
   * أسطح المقاييس الملوّنة.
   *
   * لوحة مقاييس ملوّنة هي أكثر ما يسقط في التباين: السطح يُختار لأنه
   * «هادئ» والحبر لأنه «يطابق اللون»، ولا يُقاس الزوج قطّ. فكل حبر هنا
   * مقيسٌ على سطحه وعلى رقاقته، ويُقاس نصُّ البطاقة العادي عليها كذلك —
   * الاسم والتلميح يقعان على السطح الملوّن لا على الأبيض.
   */
  ['--tint-sky-ink', ['--tint-sky-surface', '--tint-sky-chip']],
  ['--tint-mint-ink', ['--tint-mint-surface', '--tint-mint-chip']],
  ['--tint-amber-ink', ['--tint-amber-surface', '--tint-amber-chip']],
  ['--tint-rose-ink', ['--tint-rose-surface', '--tint-rose-chip']],
  ['--tint-violet-ink', ['--tint-violet-surface', '--tint-violet-chip']],
  ['--tint-teal-ink', ['--tint-teal-surface', '--tint-teal-chip']],
  ['--tint-olive-ink', ['--tint-olive-surface', '--tint-olive-chip']],

  [
    '--foreground',
    [
      '--tint-sky-surface',
      '--tint-mint-surface',
      '--tint-amber-surface',
      '--tint-rose-surface',
      '--tint-violet-surface',
      '--tint-teal-surface',
      '--tint-olive-surface',
    ],
  ],
  [
    '--muted-foreground',
    [
      '--tint-sky-surface',
      '--tint-mint-surface',
      '--tint-amber-surface',
      '--tint-rose-surface',
      '--tint-violet-surface',
      '--tint-teal-surface',
      '--tint-olive-surface',
    ],
  ],
];

const GRAPHIC_ON: Array<[string, string[]]> = [
  ['--border-input', ['--surface', '--background']],
  ['--ring', ['--background', '--surface']],
  /*
   * حدّ الزرّ الثانوي وحلقة التركيز — كلاهما يقع تحت 1.4.11.
   * الحدّ هو ما يجعل زرّاً أبيض على بطاقة بيضاء مرئياً، والحلقة هي ما
   * يقول لمن يتنقّل بلوحة المفاتيح «أنت هنا».
   */
  ['--olive-400', ['--surface', '--background', '--surface-2']],
  ['--olive-500', ['--surface', '--background', '--olive-50']],
  ['--chart-1', ['--surface']],
  ['--chart-2', ['--surface']],
  ['--chart-3', ['--surface']],
  ['--chart-4', ['--surface']],
  ['--chart-5', ['--surface']],
  ['--chart-6', ['--surface']],
  ['--chart-axis', ['--surface']],
];

const TEXT_MIN = 4.5;
const GRAPHIC_MIN = 3;

/*
 * الحدود الزخرفية تُقاس ولا تُرسَّب.
 *
 * WCAG 1.4.11 يفرض 3:1 على ما يُعرّف مكوّناً تفاعلياً أو يحدّه — لا على كل
 * خط في الواجهة. وحافة البطاقة والفاصل بين صفَّين زخرفٌ يُستغنى عنه بلا
 * فقدان معنى، وهو في هذه الهوية شعرة بيضاء بشفافية 8% عمداً. فتُطبع قيمتها
 * للعلم ولا تُعدّ فشلاً. أما ما يحدّ حقل إدخال فانتقل إلى --border-input
 * ويُقاس بالحدّ الكامل أعلاه.
 */
const INFORMATIONAL: Array<[string, string[]]> = [
  ['--border', ['--surface', '--background']],
  ['--border-strong', ['--surface']],
];

let failures = 0;
let checked = 0;
let worst = { label: '', value: Infinity };

function run(
  theme: string,
  tokens: Record<string, string>,
  textOn: Array<[string, string[]]> = TEXT_ON,
  graphicOn: Array<[string, string[]]> = GRAPHIC_ON,
  informational: Array<[string, string[]]> = INFORMATIONAL,
): void {
  console.log(`\n  ── ${theme} ──────────────────────────────`);

  /*
   * `var(--x)` تُتبَّع حتى قيمةٍ صريحة.
   *
   * بدون هذا يصمت الفحص بدل أن يفشل: الرمز الذي لا يُفهم يُتخطّى، فيمرّ
   * `--primary: var(--olive-700)` بلا قياس ويبدو الملف «سليماً» لأنه لم
   * يقِس شيئاً. والسكوت أخطر من الرسوب هنا.
   */
  const literal = (name: string, depth = 0): string | null => {
    if (depth > 8) return null;
    const raw = tokens[name];
    if (!raw) return null;
    const ref = raw.match(/^var\(\s*(--[\w-]+)\s*\)$/);
    return ref?.[1] ? literal(ref[1], depth + 1) : raw;
  };

  const resolve = (name: string, over?: RGB): RGB | null => {
    const raw = literal(name);
    if (!raw) return null;
    const c = parseColor(raw);
    if (!c) return null;
    const a = alphaOf(raw);
    return a < 1 && over ? composite(c, a, over) : c;
  };

  const check = (fgName: string, bgName: string, min: number): void => {
    const bg = resolve(bgName);
    if (!bg) return;
    const fg = resolve(fgName, bg);
    if (!fg) return;
    checked++;
    const r = ratio(fg, bg);
    const ok = r >= min;
    if (!ok) failures++;
    const label = `${fgName} على ${bgName}`;
    if (r < worst.value) worst = { label: `${theme}: ${label}`, value: r };
    if (!ok) console.log(`    ✗ ${label.padEnd(46)} ${r.toFixed(2)}:1  (المطلوب ${min})`);
  };

  for (const [fg, bgs] of textOn) for (const bg of bgs) check(fg, bg, TEXT_MIN);
  for (const [fg, bgs] of graphicOn) for (const bg of bgs) check(fg, bg, GRAPHIC_MIN);

  for (const [fg, bgs] of informational) {
    for (const bg of bgs) {
      const b = resolve(bg);
      if (!b) continue;
      const f = resolve(fg, b);
      if (!f) continue;
      console.log(`    · ${`${fg} على ${bg}`.padEnd(46)} ${ratio(f, b).toFixed(2)}:1  (زخرفي — بلا حدّ)`);
    }
  }

  console.log(`    ${failures === 0 ? '✓' : ' '} ${checked} تركيبة مقيسة حتى الآن`);
}

console.log('\n>> تباين اللوحة — WCAG 2.1 AA\n');

const light = block(':root');
const dark = { ...light, ...block('.dark') };

run('السمة الفاتحة', light);
run('السمة الداكنة', dark);

// ══════════ لوحةُ صفحة السقوط الأخير ══════════

/*
 * ما يُقاس فيها هو ما يراه القارئ: نصُّها على سطحها، وحبرُ زرّها الأساسي
 * على أرضيته، وحدُّ زرّها الثانوي (وهو الدليلُ الوحيد على أنّ هناك زرّاً،
 * فخلفيّته خلفيّةُ البطاقة نفسها)، وأيقونةُ الخطر على رقاقتها.
 */
const FALLBACK_TEXT_ON: Array<[string, string[]]> = [
  ['--text', ['--bg', '--surface']],
  ['--muted', ['--surface']],
  ['--primary-text', ['--primary', '--primary-hover']],
  ['--danger', ['--danger-soft']],
];
const FALLBACK_GRAPHIC_ON: Array<[string, string[]]> = [['--btn-line', ['--surface']]];

const darkAt = FALLBACK.indexOf('@media (prefers-color-scheme: dark)');
if (darkAt < 0) throw new Error('صفحة السقوط بلا كتلة للسمة الداكنة');
const fbLight = block(':root', FALLBACK);
const fbDark = { ...fbLight, ...block(':root', FALLBACK.slice(darkAt)) };

run('صفحة السقوط — فاتحة', fbLight, FALLBACK_TEXT_ON, FALLBACK_GRAPHIC_ON, []);
run('صفحة السقوط — داكنة', fbDark, FALLBACK_TEXT_ON, FALLBACK_GRAPHIC_ON, []);

/*
 * ★ ولا تفترق اللوحتان.
 *
 *   القيمة مكتوبةٌ مرّتين بالضرورة: صفحةُ السقوط لا تصلها ورقة الأنماط.
 *   والنسخةُ الثانية تبقى صحيحةً ما ذكّر بها شيء — فهذا ما يذكّر. ومن
 *   غيّر الهوية في `globals.css` يسقط عنده هذا الفحص باسم الرمز الذي
 *   نسيه، لا بعد أن يراه مستخدمٌ على شاشةٍ من هويّةٍ قديمة.
 */
const MIRROR: Array<[string, string]> = [
  ['--bg', '--background'],
  ['--surface', '--surface'],
  ['--text', '--foreground'],
  ['--muted', '--muted-foreground'],
  ['--line', '--border'],
  ['--btn-line', '--olive-400'],
  ['--danger', '--danger'],
  ['--danger-soft', '--danger-soft'],
  ['--primary', '--olive-700'],
  ['--primary-hover', '--olive-800'],
  ['--primary-text', '--primary-foreground'],
];

console.log('\n  ── مطابقةُ لوحة السقوط للوحة الأصل ────────────');
let drift = 0;
for (const [theme, fb, real] of [
  ['الفاتحة', fbLight, light],
  ['الداكنة', fbDark, dark],
] as const) {
  for (const [fallbackToken, realToken] of MIRROR) {
    const mine = fb[fallbackToken];
    const theirs = real[realToken];
    if (!mine || !theirs) {
      drift += 1;
      console.log(`    ✗ ${theme}: ${fallbackToken} أو ${realToken} غير موجود`);
      continue;
    }
    if (mine.toLowerCase() !== theirs.toLowerCase()) {
      drift += 1;
      console.log(`    ✗ ${theme}: ${fallbackToken} = ${mine} و${realToken} = ${theirs}`);
    }
  }
}
failures += drift;
if (drift === 0) console.log(`    ✓ ${MIRROR.length * 2} رمزاً مطابقاً في السمتين`);

console.log(
  failures === 0
    ? `\n>> سليم: ${checked} تركيبة كلها تجتاز الحدّ. أدناها ${worst.value.toFixed(2)}:1 — ${worst.label}\n`
    : `\n>> ✗ ${failures} من ${checked} تركيبة دون الحدّ.\n`,
);
process.exit(failures === 0 ? 0 : 1);

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

type RGB = [number, number, number];

/** استخراج كتلة محدّد بعينه من الملف */
function block(selector: string): Record<string, string> {
  const start = CSS.indexOf(selector + ' {');
  if (start < 0) throw new Error(`لم يُعثر على الكتلة ${selector}`);
  let depth = 0;
  let i = CSS.indexOf('{', start);
  const from = i;
  for (; i < CSS.length; i++) {
    if (CSS[i] === '{') depth++;
    else if (CSS[i] === '}' && --depth === 0) break;
  }
  const body = CSS.slice(from + 1, i);
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
  ['--danger-foreground', ['--danger']],
  ['--band-foreground', ['--band']],
  ['--band-muted', ['--band']],
  ['--band-accent', ['--band']],
  ['--primary-soft-foreground', ['--primary-soft']],
  ['--success', ['--background', '--surface', '--success-soft']],
  ['--warning', ['--background', '--surface', '--warning-soft']],
  ['--danger', ['--background', '--surface', '--danger-soft']],
  ['--info', ['--background', '--surface', '--info-soft']],
];

const GRAPHIC_ON: Array<[string, string[]]> = [
  ['--border-input', ['--surface', '--background']],
  ['--ring', ['--background', '--surface']],
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

function run(theme: 'light' | 'dark', tokens: Record<string, string>): void {
  console.log(`\n  ── ${theme === 'light' ? 'السمة الفاتحة' : 'السمة الداكنة'} ──────────────────────────────`);

  const resolve = (name: string, over?: RGB): RGB | null => {
    const raw = tokens[name];
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

  for (const [fg, bgs] of TEXT_ON) for (const bg of bgs) check(fg, bg, TEXT_MIN);
  for (const [fg, bgs] of GRAPHIC_ON) for (const bg of bgs) check(fg, bg, GRAPHIC_MIN);

  for (const [fg, bgs] of INFORMATIONAL) {
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

run('light', light);
run('dark', dark);

console.log(
  failures === 0
    ? `\n>> سليم: ${checked} تركيبة كلها تجتاز الحدّ. أدناها ${worst.value.toFixed(2)}:1 — ${worst.label}\n`
    : `\n>> ✗ ${failures} من ${checked} تركيبة دون الحدّ.\n`,
);
process.exit(failures === 0 ? 0 : 1);

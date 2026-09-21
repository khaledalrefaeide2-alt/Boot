/**
 * فحص تقطيع المدى الطويل.
 *
 * يوجد لأن خطأً هنا لا يُرى إلا في البيانات الناقصة بعد أسابيع: فجوةُ يوم
 * بين نافذتين تعني منشورات ذلك اليوم لم تُطلب قطّ، وتداخلُ يوم يعني تشغيلة
 * تدفع ثمن ما جُلب قبلها. وكلاهما ينتهي بسجلّ يبدو ناجحاً.
 */
import {
  MAX_CHUNKS,
  ChunkPlanError,
  ceilingItems,
  inclusiveDays,
  planChunks,
} from '../src/lib/extraction/chunks';

const checks: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
}

function dayBefore(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ── مدى خمس سنوات بنافذة شهر
const years = planChunks('2021-01-01', '2025-12-31', 30);

check('المدى الطويل يُقسَّم نوافذ', years.length > 50, `${years.length} نافذة`);
check('يبدأ من الأحدث', years[0]?.to === '2025-12-31', years[0]?.to);
check('ينتهي عند الأقدم', years[years.length - 1]?.from === '2021-01-01', years[years.length - 1]?.from);

/*
 * أهمّ فحصين في الملف: لا فجوة ولا تداخل.
 *
 * كلٌّ منهما يُنتج سجلّاً ناجحاً وبياناتٍ خاطئة — الأوّل بنقصٍ صامت،
 * والثاني بإنفاقٍ مضاعف على ما جُلب مرّتين.
 */
let gaps = 0;
let overlaps = 0;
for (let i = 0; i < years.length - 1; i += 1) {
  const current = years[i]!;
  const next = years[i + 1]!;
  if (next.to !== dayBefore(current.from)) {
    if (next.to < dayBefore(current.from)) gaps += 1;
    else overlaps += 1;
  }
}
check('لا فجوة بين نافذتين متتاليتين', gaps === 0, `${gaps} فجوة`);
check('لا تداخل بين نافذتين متتاليتين', overlaps === 0, `${overlaps} تداخل`);

check(
  'تغطية النوافذ تساوي المدى كاملاً',
  years.reduce((sum, chunk) => sum + inclusiveDays(chunk.from, chunk.to), 0) ===
    inclusiveDays('2021-01-01', '2025-12-31'),
  'مجموع أيام النوافذ = أيام المدى',
);

check(
  'الترتيب تنازلي بلا انقطاع في الترقيم',
  years.every((chunk, index) => chunk.seq === index + 1),
);

// ── الحواف
const single = planChunks('2026-03-10', '2026-03-10', 30);
check('يومٌ واحد ينتج نافذة واحدة', single.length === 1 && single[0]?.from === '2026-03-10');

const exact = planChunks('2026-01-01', '2026-01-30', 30);
check('مدى يساوي نافذةً بالضبط لا ينتج نافذةً فارغة', exact.length === 1, `${exact.length} نافذة`);

const remainder = planChunks('2026-01-01', '2026-02-05', 30);
check(
  'الباقي الأقصر يصير نافذةً أخيرة مقصوصة عند البداية',
  remainder.length === 2 && remainder[1]?.from === '2026-01-01',
  remainder.map((c) => `${c.from}→${c.to}`).join(' · '),
);

// ── الرفض
function rejects(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof ChunkPlanError ? error.message : 'خطأ من نوع آخر';
  }
}

check('البداية بعد النهاية تُرفض', Boolean(rejects(() => planChunks('2026-05-01', '2026-01-01', 30))));
check('نافذة بصفر أيام تُرفض', Boolean(rejects(() => planChunks('2026-01-01', '2026-05-01', 0))));
check('نافذة أطول من الحدّ تُرفض', Boolean(rejects(() => planChunks('2026-01-01', '2026-05-01', 120))));
check('صيغة تاريخ خاطئة تُرفض', Boolean(rejects(() => planChunks('01-01-2026', '2026-05-01', 30))));

const tooLong = rejects(() => planChunks('1900-01-01', '2026-01-01', 7));
check('مدى يتجاوز سقف المقاطع يُرفض قبل إنشاء شيء', Boolean(tooLong), tooLong ?? undefined);

check(
  'السقف نفسه لا يُرفض',
  planChunks('2026-01-01', '2026-01-01', 1).length <= MAX_CHUNKS,
);

check('سقف العناصر حاصل ضرب لا جمع', ceilingItems(60, 500) === 30_000);

console.log('\n>> فحص تقطيع الاستخراج التاريخي\n');
let failed = 0;
for (const c of checks) {
  console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? `\n      ${c.detail}` : ''}`);
  if (!c.ok) failed += 1;
}
if (failed > 0) {
  console.error(`\n✗ ${failed} من ${checks.length} فحصاً فشل.\n`);
  process.exit(1);
}
console.log(`\n✓ سليم: ${checks.length} فحوص كلها تمرّ.\n`);

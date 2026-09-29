/**
 * فحص تجميع الأحداث.
 *
 * التجميع حسابٌ صامت: يعمل في مكنسة خلفية، ونتيجته أرقامٌ تُقرأ في شاشة
 * بلا من يراجع كيف خرجت. فخطؤه لا يظهر خطأً بل يظهر رقماً معقولاً —
 * «حدثٌ واحد، ٦٠٠ منشور» لأنّ النافذة الزمنية سقطت، أو «ستمئة حدث من
 * منشور واحد» لأنّ العتبة ارتفعت. ولذلك تُفحص الرياضيات وحدها هنا،
 * ويُفحص في الشيفرة ما لا يظهر إلا حين يقع.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  mergeCentroid,
  normalizeVector,
  pickStory,
  similarity,
  type StoryCandidate,
} from '../src/lib/analysis/story-math';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

/** قراءة الشيفرة بلا تعليقاتها — ملفّات هذا المشروع تشرح ما لا تفعله */
const readCode = (path: string) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

const checks: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
}

const close = (a: number, b: number, epsilon = 1e-9) => Math.abs(a - b) < epsilon;
const length = (vector: number[]) =>
  Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

// ══════════════ توحيد الطول ══════════════

/*
 * جيب التمام هنا ضربُ نقطة لا غير.
 *
 * وهو صحيحٌ ما دام الطرفان مُوحَّدَي الطول. ومتوسّط عدّة متّجهات ليس
 * مُوحَّداً، فلو تُرك بلا توحيد لصارت المقارنة تقيس الطول مع الاتجاه —
 * وتُفضَّل العناقيد الكبيرة على المتشابهة بلا أن يظهر ذلك في أيّ رقم.
 */
check('التوحيد يعطي طولاً واحداً', close(length(normalizeVector([3, 4])), 1));
check('ويحفظ الاتجاه', close(normalizeVector([3, 4])[0]!, 0.6));
check(
  'والمتّجه الصفري يُعاد فارغاً',
  normalizeVector([0, 0, 0]).length === 0,
  'قسمةٌ على صفر تنتج NaN تنتشر في كلّ مقارنة بعدها بصمت',
);
check('وغير المنتهي كذلك', normalizeVector([Number.NaN, 1]).length === 0);

// ══════════════ التشابه ══════════════

const A = normalizeVector([1, 0, 0]);
const B = normalizeVector([0, 1, 0]);

check('المتّجه مع نفسه واحد', close(similarity(A, A), 1));
check('والمتعامدان صفر', close(similarity(A, B), 0));
check(
  'والطولان المختلفان صفر لا رقمٌ محسوب',
  similarity([1, 0, 0], [1, 0]) === 0,
  'متّجهان ولّدهما نموذجان مختلفان ليسا أقلّ تشابهاً بل غير قابلين للمقارنة',
);
check('والفارغ صفر', similarity([], []) === 0);

// ══════════════ ضمّ المتّجه إلى المركز ══════════════

check(
  'ضمّ المتّجه إلى مركزٍ يساويه لا يحرّكه',
  close(similarity(mergeCentroid(A, 4, A), A), 1),
);
const merged = mergeCentroid(A, 1, B);
check('وضمّ المتعامد يقع بينهما', close(similarity(merged, A), similarity(merged, B)));
check('والناتج مُوحَّد الطول', close(length(merged), 1));
check(
  'والعضو الواحد يزن نصف العضوين',
  similarity(mergeCentroid(A, 2, B), A) > similarity(mergeCentroid(A, 1, B), A),
  'المتوسّط مرجّحٌ بعدد الأعضاء، وإلا جرّ آخرُ منضمٍّ المركزَ إليه',
);

// ══════════════ انتقاء العنقود ══════════════

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-09-20T10:00:00.000Z');
const WINDOW = 3 * DAY;

const near: StoryCandidate = {
  id: 'near',
  centroid: A,
  members: 3,
  firstPostAt: new Date(NOW.getTime() - DAY),
  lastPostAt: new Date(NOW.getTime() - DAY),
};
const far: StoryCandidate = {
  id: 'far',
  centroid: A,
  members: 9,
  firstPostAt: new Date(NOW.getTime() - 40 * DAY),
  lastPostAt: new Date(NOW.getTime() - 39 * DAY),
};
const unrelated: StoryCandidate = { ...near, id: 'unrelated', centroid: B };

check(
  'المنشور ينضمّ إلى العنقود المتشابه القريب',
  pickStory(A, NOW, [near], 0.72, WINDOW)?.candidate.id === 'near',
);
check(
  'والمتباعد نصّاً يُردّ ولو كان قريباً زمنياً',
  pickStory(A, NOW, [unrelated], 0.72, WINDOW) === null,
);
check(
  'والمتطابق نصّاً يُردّ إن خرج عن النافذة',
  pickStory(A, NOW, [far], 0.72, WINDOW) === null,
  '«انقطاع الكهرباء» يتكرّر كل شهر بنصّ متقارب — وبلا نافذة يصير حدثاً واحداً يمتدّ سنة',
);
check(
  'والأقرب يُختار من بين المتشابهين',
  pickStory(A, NOW, [far, near], 0.72, WINDOW)?.candidate.id === 'near',
);
check('وبلا مرشّحين لا شيء', pickStory(A, NOW, [], 0.72, WINDOW) === null);
check(
  'والعتبة هي الحاكم لا الأقربية',
  pickStory(A, NOW, [unrelated], 0, WINDOW)?.candidate.id === 'unrelated',
  'بلا عتبة يدخل كل منشور في عنقود، ويصير «الحدث» اسماً آخر لـ«المنشور»',
);

// ══════════════ المكنسة ══════════════

const sweep = readCode('src/lib/analysis/stories.ts');
const math = readCode('src/lib/analysis/story-math.ts');

check(
  'الرياضيات مفصولة عن القاعدة',
  !/@\/lib\/db/.test(math),
  'ما لا يُفحص إلا بخادمٍ وبيانات لا يُفحص أبداً',
);

check(
  'المكنسة لا ترمي أبداً',
  /catch \(error\)[\s\S]*?return \{ swept: false/.test(sweep),
  'تعمل في مؤقّت بلا من يلتقط خطأها، والاستثناء الخارج منها يسقط العامل كله',
);
check(
  'والعتبة تُقصّ إلى مداها في المكنسة نفسها',
  /Math\.min\(MAX_THRESHOLD, Math\.max\(MIN_THRESHOLD/.test(sweep),
  'قيمةٌ خاطئة في الإعدادات تجعل كل منشور عضواً في أوّل عنقود يُقارَن به',
);
check(
  'والمرشّحون محدودو العدد',
  /take: MAX_CANDIDATES/.test(sweep),
  'بلا حدّ ينمو زمن الدورة مع نموّ القاعدة حتى تبتلع الدورةُ الفاصلَ بينها وبين تاليتها',
);
check(
  'والعنقود الجديد يصير مرشّحاً قبل كتابته',
  /candidates\.push\(fresh\)/.test(sweep),
  'خمسون منشوراً عن خبر واحد تصل معاً — ولو انتظر كلٌّ كتابةَ سابقه لصارت خمسين عنقوداً',
);
check(
  'وعدد الأعضاء يُحسب ولا يُقرأ من عمود',
  /groupBy\(\{[\s\S]{0,120}?by: \['storyId'\]/.test(sweep) &&
    !/postCount/.test(sweep),
  'عمودٌ يُزاد عند كل ضمّ ينحرف عند أوّل دورة تنقطع، والانحراف يفسد المتوسّط بلا أن يظهر',
);
check(
  'والإسناد جملة واحدة بمعاملات مربوطة',
  /unnest\(\$\{assignment\.map/.test(sweep),
  'الإدراج النصّي في SQL بابُ حقن، والجملة لكلّ عنقود تُطيل قفل المعاملة',
);
check(
  'والدفعة تبدأ بالأحدث',
  /orderBy: \{ publishedAt: 'desc' \}/.test(sweep),
  'البدء بالأقدم يُبقي شاشة الأحداث — وافتراضها آخر ثلاثين يوماً — فارغةً حتى يُصفّى الأرشيف كلّه',
);
check(
  'وحدودها تُقرأ من طرفيها لا من ترتيبها',
  /Math\.min\(\.\.\.times\)/.test(sweep) && /Math\.max\(\.\.\.times\)/.test(sweep),
  'نافذةٌ مقلوبة لا تُحمّل مرشّحاً واحداً، فيصير كل منشور حدثاً وحده بلا رسالة خطأ',
);
check(
  'والمنشور بلا تاريخ لا يُجمَّع',
  /publishedAt: \{ not: null \}/.test(sweep),
  'النافذة الزمنية تُحسب من تاريخ النشر، وبلا تاريخ لا نافذة',
);

// ══════════════ المخطّط ══════════════

const schema = read('prisma/schema.prisma');
const storyModel = /model Story \{[\s\S]*?\n\}/.exec(schema)?.[0] ?? '';

check('نموذج الحدث موجود', storyModel.length > 0);
check(
  'ولا عنوان مخزَّن فيه',
  !/\btitle\b/.test(storyModel),
  'العنوان المحفوظ يُعرض لصاحب النطاق المحدود نصَّ منشورٍ من حسابٍ لا يملك فتحه',
);
check(
  'ولا عدّاد مخزَّن فيه',
  !/postCount/.test(storyModel),
  'العدد يختلف باختلاف نطاق القارئ ونافذته، والعمود الواحد لا يحمل إلا رقماً واحداً',
);
check(
  'وحذف الحدث لا يحذف منشوراته',
  /storyId.*references: \[id\], onDelete: SetNull/s.test(schema),
  'عنقودٌ خاطئ يُحذف — ولا يجوز أن يمضي معه ما جُمّع فيه',
);

// ══════════════ الإعدادات ══════════════

/*
 * الإعداد يُكتب في الترحيل لا في ملفّ البذور وحده.
 *
 * الإنتاج يشغّل `prisma migrate deploy` ولا يشغّل البذور، فالإعداد الذي
 * يُكتب في البذور وحدها لا يظهر في شاشة الإعدادات على الخادم أبداً —
 * ويبقى الموظّف يبحث عن مفتاحٍ لا وجود له.
 */
const migration = read('prisma/migrations/20260929120000_stories/migration.sql');
for (const key of ['stories.auto', 'stories.batch', 'stories.threshold', 'stories.windowDays']) {
  check(`الإعداد «${key}» مبذورٌ في الترحيل`, migration.includes(`'${key}'`));
  check(`و«${key}» في ملفّ البذور كذلك`, read('prisma/seed.ts').includes(`'${key}'`));
}
check(
  'والبذر لا يفشل على قاعدة فيها الإعداد',
  /ON CONFLICT \("key"\) DO NOTHING/.test(migration),
);

// ══════════════ العامل الخلفي ══════════════

const worker = readCode('src/worker/index.ts');
check('العامل يشغّل مكنسة التجميع', /sweepStories\(/.test(worker));
check('ويحترم مفتاح الإطفاء', /if \(!settings\.auto\) return null;[\s\S]{0,200}?sweepStories/.test(worker));
check('ويوقفها عند الإغلاق', /clearInterval\(storyTimer\)/.test(worker));

// ══════════════ القراءة والنطاق ══════════════

const queries = readCode('src/lib/queries/stories.ts');
check(
  'العدّ يمرّ بـbuildPostWhere نفسها',
  /buildPostWhere\(filters, scope\)/.test(queries),
  'شرطٌ موازٍ ينحرف عن شاشة المنشورات عند أوّل فلتر يُضاف إلى أحدهما',
);
check(
  'والعنوان يُشتقّ من منشورات القارئ',
  /orderBy: \[\{ engagementTotal: 'desc' \}/.test(queries),
);
check(
  'والحدث من منشورٍ واحد لا يُعرض',
  /having: \{ storyId: \{ _count: \{ gte: MIN_STORY_POSTS \} \} \}/.test(queries) &&
    /MIN_STORY_POSTS = 2/.test(queries),
  'أكثر ما في الجدول عناقيدُ من عضو واحد، وعرضها يُخفي الأحداث الحقيقية بينها',
);
check(
  'والحدث خارج النطاق يُقرأ «غير موجود»',
  /if \(totals\._count\._all === 0 \|\| !title\) return null;/.test(queries),
  'صفٌّ بأصفارٍ يؤكّد وجود الحدث لمن لا يرى منشوراته',
);

const listRoute = read('src/app/api/stories/route.ts');
const oneRoute = read('src/app/api/stories/[id]/route.ts');
check('مسار الأحداث محروس بـPOSTS_VIEW', /PERMISSIONS\.POSTS_VIEW/.test(listRoute));
check('ومسار الحدث الواحد كذلك', /PERMISSIONS\.POSTS_VIEW/.test(oneRoute));
check(
  'وكلاهما يطبّق نطاق الحسابات',
  /getAccountScope\(\)/.test(listRoute) && /getAccountScope\(\)/.test(oneRoute),
);
check(
  'والشاشتان محروستان في الخادم',
  /PERMISSIONS\.POSTS_VIEW/.test(read('src/app/(app)/stories/page.tsx')) &&
    /PERMISSIONS\.POSTS_VIEW/.test(read('src/app/(app)/stories/[id]/page.tsx')),
);

// ══════════════ النتيجة ══════════════

const failed = checks.filter((item) => !item.ok);

console.log('\n>> فحص تجميع الأحداث\n');
for (const item of checks) {
  console.log(`  ${item.ok ? '✓' : '✗'} ${item.name}`);
  if (!item.ok && item.detail) console.log(`      ${item.detail}`);
}

console.log(`\n${checks.length - failed.length}/${checks.length} فحصاً ناجحاً`);
if (failed.length > 0) {
  console.log(`\n✗ ${failed.length} فحصاً فاشلاً\n`);
  process.exit(1);
}
console.log('');

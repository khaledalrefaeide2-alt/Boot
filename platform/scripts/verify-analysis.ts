/**
 * فحص جولات التحليل والتقاط التوجيهات.
 *
 * أكثره حول القيد الحاكم: ما يلتقطه المساعد من كلام المستخدمين يُحفظ ولا
 * يُفعَّل. التوجيه المفعّل يدخل تحليلَ كلّ منشور بعده فيُغيّر تصنيف الجميع
 * لا تصنيف قائله، ولو فُعّل تلقائياً لأمكن لمستخدمٍ واحد — بجملة في
 * محادثة خاصة — أن يعيد تعريف «المحتوى الضارّ» للمنصة كلها بلا أن يمرّ
 * القرار بأحد. فيُفحص ذلك في المخطّط وفي الشيفرة معاً، لا في أحدهما.
 *
 * وما عدا ذلك فحصُ ما لا يظهر إلا حين يقع: أنّ الجولة لا تُنفَّذ في طلب
 * HTTP، وأنّ المفتاح لا يصل إلى المتصفّح، وأنّ حدّ الكلفة موجود فعلاً.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { looksLikeDirective, normalizeInstruction } from '../src/lib/analysis/directive';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const checks: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
}

// ══════════════ المرشّح النصّي ══════════════

/*
 * المرشّح يمنع استدعاء المزوّد لكل رسالة تُكتب للمساعد.
 *
 * وأكثر الرسائل أسئلة، فلو مرّت كلها إلى الاستخراج لدُفعت كلفةُ بحثٍ لا
 * يجد شيئاً في كل مرة. وخطؤه رخيص في الاتجاهين — لكنّ فتحه لكلّ سؤال
 * يُبطل سببَ وجوده.
 */
const DIRECTIVES = [
  'اعتبر المطالبة بتحسين الخدمات نقداً لا معارضة للدولة',
  'لا تعتبر انتقاد أداء البلدية تحريضاً على العنف',
  'صنّف منشورات الوزارات الرسمية محايدة ما لم تحمل رأياً',
  'من الآن فصاعدا تجاهل الهاشتاغات في تحديد الموقف',
  'يجب أن تكون المنشورات الإخبارية محايدة دائما',
];
for (const text of DIRECTIVES) {
  check(`يُلتقط أمراً: «${text.slice(0, 34)}…»`, looksLikeDirective(text));
}

const QUESTIONS = [
  'كم منشوراً نُشر هذا الأسبوع؟',
  'ما أبرز الحسابات تفاعلاً؟',
  'أعطني تقريراً عن الأسبوع الماضي',
  'ما التصنيف الأكثر تكراراً في منشورات الوزارات؟',
  'اعرض لي المنشورات السلبية',
  'كم عدد الحسابات النشطة؟',
];
for (const text of QUESTIONS) {
  check(`لا يُلتقط سؤالاً: «${text.slice(0, 34)}…»`, !looksLikeDirective(text));
}

check('الرسالة القصيرة تُردّ قبل أي شيء', !looksLikeDirective('اعتبر'));

// ══════════════ توحيد النصّ ══════════════

/*
 * التوحيد يمنع تكرار القاعدة الواحدة بصياغات متقاربة.
 *
 * المستخدم يعيد قاعدته عبر محادثات بفوارق تشكيل وهمزة وترقيم، والحفظ
 * الأعمى يملأ شاشة المراجعة بنُسَخٍ لا تُقرأ فلا تُفعَّل واحدة منها.
 */
const SAME: [string, string][] = [
  ['اعتبرْ المطالبةَ بالخدمات نقداً، لا معارضة.', 'إعتبر المطالبه بالخدمات نقدا لا معارضه'],
  ['تجاهل  الهاشتاغات', 'تجاهل الهاشتاغات'],
  ['صنّف الأخبار محايدة!', 'صنّف الاخبار محايده'],
];
for (const [a, b] of SAME) {
  check(
    `يُعدّان واحداً: «${a.slice(0, 26)}…»`,
    normalizeInstruction(a) === normalizeInstruction(b),
    `${normalizeInstruction(a)} ≠ ${normalizeInstruction(b)}`,
  );
}
check(
  'ويبقى المختلفان مختلفين',
  normalizeInstruction('تجاهل الهاشتاغات') !== normalizeInstruction('تجاهل الروابط'),
);
check('لا يترك فراغاً في الطرفين', normalizeInstruction('  اعتبرها نقداً.  ') === 'اعتبرها نقدا');

// ══════════════ القيد الحاكم: يُحفظ ولا يُفعَّل ══════════════

const schema = read('prisma/schema.prisma');
const capture = read('src/lib/analysis/capture.ts');
const directive = read('src/lib/analysis/directive.ts');

check(
  'المخطّط: التوجيه الجديد معطَّل افتراضياً',
  /isActive\s+Boolean\s+@default\(false\)/.test(schema),
);
check('المخطّط: للتوجيه مصدر يُعرف منه', /source\s+GuidanceSource\s+@default\(MANUAL\)/.test(schema));
check('المخطّط: نصّ المستخدم الأصلي محفوظ', /sourceMessage\s+String\?/.test(schema));

check('الالتقاط يكتب isActive: false صراحةً', /isActive:\s*false/.test(capture));
check(
  'ولا يكتب isActive: true في أي موضع',
  !/isActive:\s*true/.test(capture),
  'سطرٌ واحد كهذا يُبطل الحاجز كلّه',
);
check('الالتقاط يَسِم المصدر ASSISTANT', /source:\s*'ASSISTANT'/.test(capture));
check('ويحفظ نصّ المستخدم كما كُتب', /sourceMessage:/.test(capture));

/*
 * الالتقاط لا يرمي أبداً.
 *
 * هو أثرٌ جانبي في مسار جواب المساعد، وفشله لا يصحّ أن يُفقد المستخدم
 * جوابه. ولذلك يُبتلع في داخله لا عند مستدعيه.
 */
check(
  'الالتقاط يبتلع فشله في داخله',
  /export async function captureGuidance[\s\S]{0,400}?try\s*\{/.test(capture),
);
check('وله سقفٌ لما ينتظر القرار', /PENDING_CAP/.test(capture));

const chat = read('src/app/api/assistant/chat/route.ts');
check('مسار المحادثة يستدعي الالتقاط', /captureGuidance\(/.test(chat));
check(
  'ولا ينتظره — المستخدم ينتظر جوابه لا حفظ قاعدته',
  /void captureGuidance\(/.test(chat),
  'await هنا يُضيف ثانيةً إلى زمن كل رسالة',
);

// ══════════════ الجولة: أين تُنفَّذ وبأي حدّ ══════════════

const run = read('src/lib/analysis/run.ts');
const worker = read('src/worker/index.ts');
const runsRoute = read('src/app/api/admin/analysis/runs/route.ts');

check('العامل الخلفي وحده ينفّذ الجولة', /executeAnalysisRun\(job\.data\.runId\)/.test(worker));
check(
  'ومسار HTTP لا ينفّذها',
  !/executeAnalysisRun/.test(runsRoute),
  'تحليل ألف منشور لا يكتمل داخل طلب واحد',
);
check('طابور التحليل مستقلّ عن الاستخراج', /ANALYSIS:\s*'analysis'/.test(read('src/lib/queue.ts')));
check(
  'ولا يُعيد المحاولة تلقائياً',
  /QUEUE_NAMES\.ANALYSIS[\s\S]{0,300}?attempts:\s*1/.test(read('src/lib/queue.ts')),
  'إعادة الجولة تدفع كلفة ما حُلّل مرّتين بلا ناتج جديد',
);

check('جولةٌ واحدة في الوقت الواحد', /activeRun\(\)[\s\S]{0,200}?AnalysisRunError\(\s*409/.test(run));
check('للجولة سقف كلفة', /Math\.min\(matching, options\.limit\)/.test(run));
check('وللفشل المتتالي حدّ يوقف الجولة', /CONSECUTIVE_FAILURE_LIMIT/.test(run));
check('والجولة الصامتة تُغلق فلا تقفل ما بعدها', /reapStaleRuns/.test(run));
check(
  'الإلغاء يُقرأ من حالة القاعدة داخل الحلقة',
  /current\.status !== 'RUNNING'/.test(run),
  'بدونه لا سبيل لإيقاف جولة بدأت',
);
check(
  'تعذُّر الطابور يُنهي الجولة لا يتركها معلّقة',
  /enqueueAnalysis[\s\S]{0,600}?status:\s*'FAILED'/.test(run),
);

/*
 * النطاق يُجمَّد لحظة الطلب.
 *
 * العامل الخلفي لا جلسة له. ولو قُرئ النطاق عند التنفيذ لتغيّر الجواب لو
 * عُدّل إسناد الحسابات بين الطلب والتنفيذ، فتُحلَّل حسابات لم يكن لطالبها
 * حقٌّ فيها حين طلب.
 */
check('نطاق الطالب يُحفظ مع الجولة', /scope:\s*string\[\]\s*\|\s*null/.test(run));
check('ويُقرأ منها عند التنفيذ', /readStored\(run\.filters\)/.test(run));
check('والشرط يمرّ ببنّاء المنشورات نفسه', /buildPostWhere\(stored\.filters, stored\.scope\)/.test(run));

// ══════════════ ما لا يُمَسّ ══════════════

/*
 * التحليل يصف ولا يتصرّف — وتصنيفُ المراجع البشريّ فوقه.
 *
 * هذان قيدان قائمان في طبقة الحفظ، والجولة تمرّ بها لا حولها. وفحصهما
 * هنا يمنع أن يُكتب لاحقاً مسارٌ يتجاوزها.
 */
const persist = read('src/lib/analysis/persist.ts');
check(
  'الجولة تمرّ بطبقة الحفظ نفسها',
  /analyzeAndSave\(post\.id, text\)/.test(run),
  'مسارٌ ثانٍ للكتابة يعني قيدين مختلفين على البيانات نفسها',
);
check('ولا تُكتب النتيجة فوق تصنيف يدوي', /NOT:\s*\{\s*sentimentSource:\s*'MANUAL'\s*\}/.test(persist));
/*
 * الحقلان يُذكران في تعليق الملفّ، فيُفحص إسنادهما لا ذكرهما.
 *
 * `isHidden:` و`topicId:` بنقطتيهما مفتاحان في كائن بيانات، والتعليق
 * يكتبهما بين علامتَي اقتباس مائلتين بلا نقطتين. والفحص على الاسم وحده
 * كان يسقط على تعليقٍ يقول إنّ الحقل لا يُمَسّ.
 */
check(
  'ولا يُخفى منشور ولا يُنقل تصنيفه',
  !/\b(isHidden|topicId):/.test(persist),
  'التحليل يصف ولا يتصرّف — الإخفاء قرارٌ بشريّ يمرّ بشاشة المراجعة',
);

// ══════════════ المفتاح ══════════════

check(
  'الالتقاط لا يقرأ المفتاح من متغيّر عامّ للمتصفّح',
  !/NEXT_PUBLIC/.test(capture) && !/NEXT_PUBLIC/.test(run),
);
check(
  'وحدة التمييز نقيّة — لا قاعدة ولا مزوّد',
  !/prisma|OpenAI|server-only/.test(directive),
  'لو لمست القاعدة لما أمكن فحصها إلا ببيئة كاملة',
);
check(
  'ولا يُطبع المفتاح في أي سجلّ',
  !/console\.[a-z]+\([^)]*apiKey/i.test(capture) && !/console\.[a-z]+\([^)]*apiKey/i.test(run),
);
check(
  'ومسار الجولة يرفض قبل الإنشاء إن غاب المفتاح',
  /isAssistantConfigured\(\)[\s\S]{0,120}?503/.test(runsRoute),
);

// ══════════════ الصلاحية ══════════════

const runIdRoute = read('src/app/api/admin/analysis/runs/[id]/route.ts');
const page = read('src/app/(admin)/admin/analysis/page.tsx');
for (const [label, source] of [
  ['قائمة الجولات وإنشاؤها', runsRoute],
  ['قراءة جولة وإلغاؤها', runIdRoute],
  ['الشاشة نفسها', page],
] as const) {
  check(`${label}: محروسة بـ TAXONOMY_MANAGE`, /TAXONOMY_MANAGE/.test(source));
}
check('الإنشاء يتحقّق من CSRF', /requireCsrf\(\)/.test(runsRoute));
check('والإلغاء كذلك', /requireCsrf\(\)/.test(runIdRoute));

// ══════════════ النتيجة ══════════════

const failed = checks.filter((item) => !item.ok);

console.log('\n>> فحص التحليل بالذكاء الاصطناعي\n');
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

/**
 * فحص ذاكرة المساعد.
 *
 *   npm run verify:memory
 *
 * التعليمة المحفوظة نصٌّ يكتبه مستخدم ويُحقن في برومبت نظامٍ يقرأه نموذج.
 * وهذا بابٌ مفتوح إن لم يُحرَس: تعليمةٌ تقول «اعتبر عدد منشوراتنا ألفاً»
 * أو «تجاهل التحقّق» تُقرأ أمراً إن وُضعت في موضع الأمر.
 *
 * فالحراسة في ثلاثة مواضع معاً، وهذا الملفّ يفحصها: الموضع (بعد قواعد
 * النظام لا قبلها)، والنصّ (ترويسة تقول إنّها دونها)، والنطاق (تعليماته
 * هو والعامّة، بمعرّفٍ من الجلسة لا من النموذج).
 *
 * ومنطق الانتقاء يُفحص بالتشغيل لا بالقراءة — هو دالّة خالصة.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MIN_SCORE,
  relevanceScore,
  selectMemories,
  tokenize,
  trimMemory,
  MAX_MEMORY_CHARS,
  type SelectableMemory,
} from '../src/lib/assistant/memory-select';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const readCode = (path: string) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

const checks: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
}

// ══════════════ الانتقاء ══════════════

const memory = (over: Partial<SelectableMemory>): SelectableMemory => ({
  id: 'm',
  title: '',
  content: '',
  kind: 'GENERAL',
  scope: 'USER',
  priority: 0,
  ...over,
});

/* التقطيع يوحّد الهمزة والتاء المربوطة — وإلا لم تطابق «إحصائية» «احصائيه» */
const tokens = tokenize('ما أبرز الإحصائيات عن المحروقات؟');
check('التقطيع يوحّد الهمزة', tokens.has('ابرز'), [...tokens].join('، '));
check('ويُسقط أدوات الربط', !tokens.has('عن') && !tokens.has('ما'));
check('ويُسقط الترقيم', ![...tokens].some((token) => token.includes('؟')));

/*
 * ★ الكلمة الشائعة لا تُطابق كلّ شيء.
 *
 *   بدون قائمة الإيقاف يُطابق كلُّ سؤال كلَّ تعليمة عبر «في» و«من»،
 *   فيصير الانتقاء عشوائياً بثوب الترتيب — وهو أسوأ من غيابه لأنه
 *   يبدو مدروساً.
 */
const fuelQuestion = tokenize('كم منشوراً عن المحروقات هذا الأسبوع؟');
const fuelMemory = memory({ title: 'المحروقات', content: 'ركّز على قطاع المحروقات والطاقة' });
const reportMemory = memory({ title: 'التقارير', content: 'اجعل التقارير مختصرة في صفحة واحدة' });

check(
  'التعليمة المطابقة تعلو غير المطابقة',
  relevanceScore(fuelQuestion, fuelMemory) > relevanceScore(fuelQuestion, reportMemory),
  `${relevanceScore(fuelQuestion, fuelMemory).toFixed(2)} مقابل ${relevanceScore(fuelQuestion, reportMemory).toFixed(2)}`,
);
check('وغير المطابقة دون العتبة', relevanceScore(fuelQuestion, reportMemory) < MIN_SCORE);

const selected = selectMemories([fuelMemory, reportMemory], 'كم منشوراً عن المحروقات؟');
check('فلا تُحقن إلا المرتبطة', selected.length === 1 && selected[0]?.title === 'المحروقات');

/*
 * والأولوية تتجاوز المطابقة: «اجعل تقاريري مختصرة» لا يُطابق سؤالاً عن
 * المحروقات وهو مع ذلك يخصّه — وهذا هو معنى أن يرفعها صاحبها.
 */
const raised = { ...reportMemory, priority: 3 };
const withRaised = selectMemories([fuelMemory, raised], 'كم منشوراً عن المحروقات؟');
check(
  'وما رُفعت أولويّته يدخل بلا مطابقة',
  withRaised.length === 2 && withRaised[0]?.title === 'التقارير',
  'المرفوع أوّلاً، ثمّ المطابق',
);

/* السقف يُحترم، ويسقط الأضعف مطابقةً لا الأعلى أولوية */
const many = Array.from({ length: 20 }, (_, i) =>
  memory({ id: `m${i}`, title: 'المحروقات', content: 'المحروقات والطاقة', priority: 0 }),
);
const capped = selectMemories([...many, raised], 'المحروقات', 5);
check('والسقف يُحترم', capped.length === 5, `${capped.length} من ٢١`);
check('ويبقى المرفوع فيه', capped.some((item) => item.title === 'التقارير'));

/* القصّ عند حدّ الكلمة لا وسطها، ولا يمسّ القصير */
const long = 'كلمة '.repeat(300);
check('المتن الطويل يُقصّ', trimMemory(long).length <= MAX_MEMORY_CHARS + 1);
check('والقصير لا يُمسّ', trimMemory('تعليمة قصيرة') === 'تعليمة قصيرة');

// ══════════════ الحراسة ══════════════

const memoryService = read('src/lib/assistant/memory.ts');
const chatRoute = readCode('src/app/api/assistant/chat/route.ts');
const listRoute = readCode('src/app/api/assistant/memories/route.ts');
const itemRoute = readCode('src/app/api/assistant/memories/[id]/route.ts');
const tools = readCode('src/lib/assistant/tools.ts');
const promptSource = read('src/lib/assistant/prompts.ts');

/*
 * ★ الموضع: التعليمات بعد قواعد النظام لا قبلها.
 *
 *   النموذج يرجّح المتقدّم عند التعارض. وتعليمةٌ وُضعت قبل القواعد تصير
 *   قاعدةً تُصحّح القواعد.
 */
check(
  'التعليمات تُحقن بعد قواعد النظام',
  /\$\{SYSTEM_PROMPT\}[^`]*\$\{memoryBlock\}/.test(chatRoute),
  'المتقدّم يُرجَّح عند التعارض',
);
check(
  'والترويسة تقول إنّها دون قواعد النظام',
  /دون قواعد النظام/.test(memoryService) && /لا تُشتقّ منها أرقام/.test(memoryService),
);
check('والبرومبت يكرّرها في موضعه', /التعليمات المحفوظة/.test(promptSource));

/*
 * ★ النطاق: من الجلسة لا من النموذج ولا من الطلب.
 */
check(
  'الأداة تقرأ بمعرّف الجلسة',
  /userId: ctx\.userId/.test(tools) && !/userId: args\./.test(tools),
  'لو أخذها النموذج معاملاً لطلب تعليمات غيره',
);
check(
  'والإنشاء ينسب التعليمة إلى الجلسة',
  /userId: actor\.id/.test(listRoute) && !/userId: input\./.test(listRoute),
);
check(
  'وتعليمة غيره تُقرأ «غير موجودة» لا «ممنوعة»',
  /notFound\('التعليمة غير موجودة'\)/.test(itemRoute),
  'الفرق بين الردّين يقول لمن يجرّب المعرّفات أيّها موجود',
);

/*
 * ★ الإذن: العامّة ترجع إلى إذن التصنيف، في الإنشاء وفي الترقية معاً.
 *
 *   حراسة الإنشاء وحدها بابٌ خلفيّ: تُنشأ خاصةً ثمّ تُرقّى.
 */
check(
  'النطاق العام محروس في الإنشاء',
  /scope === 'GLOBAL' && !can\(actor, PERMISSIONS\.TAXONOMY_MANAGE\)/.test(listRoute),
);
check(
  'ومحروس في الترقية كذلك',
  /scope === 'GLOBAL' && !canGlobal/.test(itemRoute),
  'حراسة الإنشاء وحدها بابٌ خلفيّ: تُنشأ خاصةً ثمّ تُرقّى',
);
check('ولا يُخفَّض صامتاً', /403/.test(listRoute) && /403/.test(itemRoute));

/* الأداة قراءةٌ فقط كبقيّة أدوات المساعد */
check(
  'أداة التعليمات لا تكتب شيئاً',
  /async function searchMemories/.test(tools) &&
    !/userMemory\.(create|update|delete)/.test(tools),
  'حفظ تعليمة فعلٌ يقصده صاحبها من شاشتها، لا أثرٌ جانبيّ لجملة',
);

/* الحقن لا يُسقط الردّ إن تعثّر: الذاكرة تحسينٌ لا شرط */
check(
  'تعذّر قراءة التعليمات لا يمنع الجواب',
  /catch \(error\)[\s\S]{0,200}?return \[\];/.test(readCode('src/lib/assistant/memory.ts')),
);

/* والتدقيق يسجّل أيّ تعليمات سرت على الجواب */
check('والجواب يحفظ معرّفات ما سرى عليه', /memoryIds: memories\.map/.test(chatRoute));

console.log('\n>> فحص ذاكرة المساعد\n');
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

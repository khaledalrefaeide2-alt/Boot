/**
 * فحص التصنيف التفصيلي: الوسوم، والخطورة، والقواميس.
 *
 *   npm run verify:labels
 *
 * ★ والعطب الذي يحرسه هذا الملفّ ليس عطباً في الشيفرة بل في القراءة.
 *
 *   «سلبي» وحدها لا تصف شيئاً: شكوى من خدمة وخطاب كراهية كلاهما سلبي،
 *   وبينهما ما بين الرصد والجريمة. والوسوم هي ما يفرّق — فإن انزلق
 *   وسمٌ أو سقطت أرضيةُ خطورة، صار منشورٌ يدعو إلى العنف يمرّ في اللوحة
 *   بين الشكاوى العادية ولا يراه أحد.
 *
 * ومنطقُ القواميس والتسوية يُفحص بالتشغيل لا بالقراءة: كلاهما دوالُّ
 * خالصة، وفحصُها على النصّ يقول إنّ الحرف مكتوب لا إنّ المعنى صحيح.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  deobfuscate,
  LEXICONS,
  matchedTerms,
  matchLexicons,
  normalizeForMatch,
  MAX_MATCHED_KEYWORDS,
} from '../src/lib/analysis/lexicons';
import {
  ANALYSIS_RUBRIC,
  CONTENT_LABELS,
  deriveRiskFlags,
  deriveRiskSeverity,
  severityFloor,
} from '../src/lib/analysis/ai-analyzer';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const checks: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
}

// ══════════════ فكّ التمويه ══════════════

/*
 * ★ وأخطر ما في فكّ التمويه أن يُفرط.
 *
 *   قاعدةٌ تدمج ما بين كلّ مسافتين تجعل الجملة كلها كلمةً واحدة لا
 *   تطابق شيئاً — فيسقط الرصدُ كلّه بصمت، وهو أسوأ من ألّا يُفكّ تمويه.
 */
check('التطويل يُزال', deobfuscate('فـاسـد') === 'فاسد');
check('والفاصل داخل الكلمة', deobfuscate('فـا.سـد') === 'فاسد', deobfuscate('فـا.سـد'));
check('والنجمة', deobfuscate('ك*ذاب') === 'كذاب');
check('والكلمة المبعثرة', deobfuscate('ح ر ا م ي') === 'حرامي', deobfuscate('ح ر ا م ي'));
check(
  '★ ولا تُدمج الكلمات العادية',
  deobfuscate('الخدمة في هذه المنطقة ضعيفة') === 'الخدمة في هذه المنطقة ضعيفة',
  'دمجُها يجعل كلّ جملة كلمةً واحدة فيسقط الرصد كلّه بصمت',
);
check(
  'ولا تُمسّ الجملة القصيرة',
  deobfuscate('لا صحة لهذا') === 'لا صحة لهذا',
  deobfuscate('لا صحة لهذا'),
);

// ══════════════ المطابقة ══════════════

check(
  'المطابقة توحّد الهمزة',
  matchLexicons('هذا المسؤول فاسد').some((m) => m.terms.includes('فاسد')),
);
check(
  'وتصيب الكلمة المموَّهة',
  matchLexicons('هذا المسؤول فـا.سـد').some((m) => m.terms.includes('فاسد')),
  'وهو كلّ الغرض: من يكتبها هكذا يقصد تجاوز الرصد',
);
check(
  'والنفي يُلتقط ليُفحص لا ليُصنَّف',
  matchLexicons('ليس فاسداً').some((m) => m.key === 'negation'),
  '«ليس فاسداً» ليست «فاسد» — والنموذج هو من يقرأ السياق',
);
check(
  'والنصّ النظيف لا يُطابق شيئاً',
  matchLexicons('أعلنت الوزارة بدء استقبال الطلبات').length === 0,
);
check(
  'والألفاظ المحفوظة محدودة العدد',
  matchedTerms(matchLexicons(LEXICONS.flatMap((l) => l.terms).join(' '))).length <=
    MAX_MATCHED_KEYWORDS,
  'القائمة دليلٌ للمراجع لا أرشيف',
);
check(
  'ومجموعة التحريض موسومة بالأولوية',
  LEXICONS.find((l) => l.key === 'incitement')?.hint.includes('أولوية قصوى') === true,
);
check('والتطبيع يُسقط الترقيم والمسافات', normalizeForMatch('  فاسد،   جداً  ') === 'فاسد جدا');

// ══════════════ أرضية الخطورة ══════════════

/*
 * ★ وسمٌ خطر بخطورة منخفضة يمرّ في اللوحة بين الشكاوى العادية.
 *
 *   ولا يُكتشف: الصفّ موجود، والوسم مكتوب، والرقم صغير. فالوسم يفرض
 *   حدّاً أدنى لا يُنزَل عنه، والنموذج يملك الرفع فوقه لا الخفض تحته.
 */
check('الدعوة إلى العنف أرضيّتها ٥', severityFloor(['VIOLENCE_INCITEMENT']) === 5);
check('والتهديد كذلك', severityFloor(['THREAT']) === 5);
check('والكراهية ٤', severityFloor(['HATE_SPEECH']) === 4);
check('والاتّهام بلا دليل ٣', severityFloor(['UNVERIFIED_ACCUSATION']) === 3);
check('والنقد المشروع صفر', severityFloor(['CONSTRUCTIVE_CRITICISM']) === 0, 'النقد ليس خطراً');
check(
  'والأشدّ يغلب عند اجتماع الوسوم',
  severityFloor(['CONSTRUCTIVE_CRITICISM', 'HATE_SPEECH', 'SARCASM']) === 4,
);

// ══════════════ التوافق مع القائم ══════════════

/*
 * الإشارات القديمة تُشتقّ من الجديدة، فلا تتفرّق القراءتان.
 *
 * شاشاتٌ وتنبيهاتٌ قائمة تقرأ `riskFlags` و`riskSeverity`. ولو تُركت
 * تُكتب من النموذج مستقلّةً لظهر منشورٌ وسمُه «كراهية» وإشاراته فارغة —
 * فيُنذَر عنه في شاشةٍ ويُسكَت عنه في أخرى.
 */
check(
  'الكراهية تُنتج إشارتها القديمة',
  deriveRiskFlags(['HATE_SPEECH']).includes('HATE_SPEECH'),
);
check(
  'والتحريض الطائفي والعرقي والمناطقي إشارةٌ واحدة',
  deriveRiskFlags(['SECTARIAN_INCITEMENT', 'ETHNIC_INCITEMENT']).length === 1,
);
check('والنقد المشروع لا إشارة له', deriveRiskFlags(['CONSTRUCTIVE_CRITICISM']).length === 0);
check(
  'والخطورة تُترجَم إلى السلّم القديم',
  deriveRiskSeverity(5) === 'HIGH' &&
    deriveRiskSeverity(3) === 'MEDIUM' &&
    deriveRiskSeverity(1) === 'LOW' &&
    deriveRiskSeverity(0) === 'NONE',
);

// ══════════════ السياسة ══════════════

const analyzer = read('src/lib/analysis/ai-analyzer.ts');

check(`الوسوم ${CONTENT_LABELS.length} وسماً`, CONTENT_LABELS.length >= 24);
check(
  '★ ولا تُكرَّر قيم المشاعر وسماً',
  !CONTENT_LABELS.some((label) => ['POSITIVE', 'NEGATIVE', 'NEUTRAL'].includes(label)),
  'صفٌّ سلبيُّ المشاعر يحمل وسم «إيجابي» تناقضٌ بلا قاعدة تحسمه',
);

for (const section of [
  '٧) موقف الكاتب',
  '٨) النقد المشروع والنقد الهدّام',
  '٩) الادّعاء والشائعة',
  '١٠) الكراهية والإساءة والتحريض',
  '١١) الاتّهام والتشهير',
  '١٢) درجة الخطورة',
  '١٣) الثقة والمراجعة',
  '١٤) قبل أن تصنّف',
]) {
  check(`السياسة: ${section}`, ANALYSIS_RUBRIC.includes(section));
}

check(
  '★ السياسة: النقد ليس هدّاماً بالضرورة',
  /سلبيٌّ وليس هدّاماً/.test(ANALYSIS_RUBRIC),
  'الخلط يجعل المنصة أداةَ إسكاتٍ لا أداةَ رصد',
);
check(
  '★ السياسة: «مضلّلة مثبتة» لا تُقال من الذاكرة',
  /لا تستعملها من معرفتك/.test(ANALYSIS_RUBRIC),
);
check(
  'والشيفرة تُنزلها إلى «صياغة شائعة» وتُحيلها',
  /rumorStatus = 'SUSPECTED_RUMOR'/.test(analyzer) &&
    /يحتاج مصدر تحقّق بشرياً/.test(analyzer),
  'حكمٌ على واقعةٍ لم يرها النموذج، يُنشر تحت اسم المنصة',
);
check(
  'السياسة: النافي للشائعة ليس مروّجاً لها',
  /لا تصدّقوا الشائعة/.test(ANALYSIS_RUBRIC) && /ينفيها/.test(ANALYSIS_RUBRIC),
);
check(
  'والألفاظ تُعرض أمراً بالفحص لا حكماً',
  /وجودها لا يصنّف شيئاً/.test(read('src/lib/analysis/lexicons.ts')),
);
check(
  'والنصّ الأصلي لا يُمسّ بالتطبيع',
  /النصّ الأصلي لا يُمسّ/.test(read('src/lib/analysis/lexicons.ts')),
  'وإلا سقطت مطابقة الدليل بنصّ المنشور، وهي حارس الاقتباس المختلَق',
);
check(
  'والخطورة ٣ فما فوق تُحال إلى المراجعة',
  /result\.severityLevel >= 3/.test(analyzer),
);

// ══════════════ العرض ══════════════

/*
 * ★ وسمٌ بلا تسميةٍ عربية يُعرض بمفتاحه الإنجليزي في شاشةٍ عربية.
 *
 *   وهذا الصنف وقع في المنصة مرّتين قبلُ: أقسامُ الإعدادات، ومجموعاتُ
 *   الحسابات. والسقوط إلى المفتاح لا يُعطب شيئاً فلا ينتبه إليه أحد —
 *   يقرأ المراجع «HATE_SPEECH» ويمضي.
 */
const constants = read('src/lib/domain/constants.ts');
const uiLabels = new Set(
  [...(constants.match(/export const CONTENT_LABELS[\s\S]*?\n\};/)?.[0] ?? '').matchAll(
    /^\s{2}([A-Z_]+):/gm,
  )].map((m) => m[1] as string),
);

const unnamed = CONTENT_LABELS.filter((label) => !uiLabels.has(label));
check(
  `كل وسم له تسمية عربية (${CONTENT_LABELS.length} وسماً)`,
  unnamed.length === 0,
  unnamed.length > 0 ? `بلا تسمية: ${unnamed.join('، ')}` : undefined,
);

const severityBlock = constants.match(/export const SEVERITY_LEVELS[\s\S]*?\n\};/)?.[0] ?? '';
const levels = [...severityBlock.matchAll(/^\s{2}(\d):/gm)].map((m) => Number(m[1]));
check(
  'ودرجات الخطورة الستّ كلها مسمّاة',
  [0, 1, 2, 3, 4, 5].every((level) => levels.includes(level)),
  levels.join('، '),
);
check(
  'والنبرة تتدرّج مع الدرجة',
  /4: \{[^}]*tone: 'danger'/.test(severityBlock) && /5: \{[^}]*tone: 'danger'/.test(severityBlock),
  'لو عُرض الخطر بنبرة الهدوء لضاع بين الملاحظات',
);
check(
  'والأخطر يُعرض أوّلاً',
  /export function sortLabels/.test(constants) && /danger: 0/.test(constants),
  'ما يُرى أوّلاً هو ما يُتصرَّف فيه',
);

const card = read('src/components/posts/post-card.tsx');
const panel = read('src/components/analysis/analysis-panel.tsx');

check(
  'البطاقة تُظهر الخطورة من درجة المراقبة فصاعداً',
  /level >= SEVERITY_VISIBLE_FROM/.test(card),
  'ما دونها ضجيجٌ في شبكةٍ من أربعٍ وعشرين بطاقة',
);
check('واللوحة تعرض الوسوم كلها', /sortLabels\(current\.labels/.test(panel));
check(
  'وتعرض المجموعة المستهدفة مع وسم الكراهية',
  /hateTargetGroup/.test(panel),
  '«خطاب كراهية» بلا محكومٍ عليه لا يملك المراجع ما يراجعه',
);
check(
  'وتقول إنّ الألفاظ لا تصنّف',
  /وجودها لا يصنّف\s*\n?\s*شيئاً/.test(panel) || /لا يصنّف/.test(panel),
);
check(
  '★ ولا تُعرض درجتا الخطورة في موضعٍ واحد',
  /levelBadge/.test(panel),
  'القديمة مشتقّةٌ من الجديدة، فعرضُهما معاً يقول الشيء مرّتين بمقياسين',
);
check(
  'والبطاقة تجلب حقلين من التحليل لا الصفّ كله',
  /analysis: \{ select: \{ severityLevel: true, labels: true \} \}/.test(
    read('src/lib/queries/posts.ts'),
  ),
  'الصفّ كاملاً لأربعٍ وعشرين بطاقة يحمل نصوصاً طويلة لا تُعرض',
);

console.log('\n>> فحص التصنيف التفصيلي\n');
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

/**
 * فحص القاعدة الحاكمة للتصنيف — سياسة نوفمبر ٢٠٢٦.
 *
 *   npm run verify:policy
 *
 * السلبيّ واحدٌ من اثنين: نقدُ الدولة السورية الجديدة، أو مخالفةُ معايير
 * ميتا وحقوق الإنسان أيّاً كان المستهدف. وما عداهما ليس سلبياً — نقدُ
 * تاجرٍ أو شركةٍ أو منظمةٍ أو النظام السابق محايد.
 *
 * يُشغِّل هذا الملف مُخرَجاتٍ مصطنعة من النموذج على طبقة التسوية ويفحص
 * الحكم الذي يُكتب في القاعدة — أي يفحص أنّ القاعدة **تُنفَّذ** ولو أخطأ
 * النموذج، لا أنّها مكتوبةٌ في النصّ وحسب.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  applyStatePolicy,
  CONTENT_LABELS,
  normalizeAnalysis,
  POLICY_VIOLATION_LABELS,
  requiresReview,
  TARGET_SCOPES,
  type ContentLabelValue,
  type RawAnalysis,
} from '../src/lib/analysis/ai-analyzer';
import { CONTENT_LABELS as LABEL_TEXT } from '../src/lib/domain/constants';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const checks: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
}

function model(over: Partial<RawAnalysis> = {}): RawAnalysis {
  return {
    sentiment: 'NEUTRAL',
    targetScope: 'NONE',
    target: null,
    subject: 'موضوع',
    rationale: 'تعليل',
    evidence: null,
    isMixed: false,
    isRelayedCriticism: false,
    reviewReason: null,
    confidence: 0.9,
    themes: [],
    entities: [],
    riskFlags: [],
    riskSeverity: 'NONE',
    authorStance: 'NEUTRAL',
    labels: [],
    severityLevel: 0,
    rumorStatus: 'NONE',
    rumorConfidence: null,
    hateTargetGroup: null,
    isSarcasm: false,
    isQuoted: false,
    isConstructive: false,
    isDestructive: false,
    coordinatedSuspected: false,
    ...over,
  };
}

const TEXT = 'نصّ المنشور للاختبار';
const run = (over: Partial<RawAnalysis>) => normalizeAnalysis(model(over), TEXT);

// ══════════════ (أ) نقد الدولة الجديدة ══════════════

{
  const out = run({ sentiment: 'NEGATIVE', targetScope: 'NEW_STATE', severityLevel: 1 });
  check('نقد الدولة الجديدة سلبي، وسببه «نقد الدولة»', out.sentiment === 'NEGATIVE' && out.negativeBasis === 'STATE_CRITICISM');
  check('والموقف «معارض»', out.stance === 'OPPOSED');
  check('والخطورة «سلبي بسيط» باقية', out.severityLevel === 1);
}
{
  const out = run({ sentiment: 'NEGATIVE', targetScope: 'MIXED', isMixed: true });
  check('المستهدف الدولة وغيرها معاً: سلبي', out.sentiment === 'NEGATIVE' && out.isMixed && out.stance === 'MIXED');
}

// ══════════════ ما ليس سلبياً ══════════════

for (const [scope, name] of [
  ['NON_STATE', 'جهة غير حكومية'],
  ['FORMER_REGIME', 'النظام السابق'],
  ['NONE', 'بلا جهة'],
] as const) {
  const out = run({ sentiment: 'NEGATIVE', targetScope: scope, severityLevel: 2, isMixed: true });
  check(`★ نقد ${name} يُنزَل إلى محايد ولو قال النموذج «سلبي»`, out.sentiment === 'NEUTRAL' && out.negativeBasis === null);
  check(`  ولا يبقى «مختلطاً» ولا «معارضاً» (${name})`, !out.isMixed && out.stance === 'NEUTRAL');
  check(`  ولا خطورة بلا وسم (${name})`, out.severityLevel === 0, String(out.severityLevel));
  check(`  ويُقال السبب في التعليل (${name})`, out.rationale.includes('ليس سلبياً بحسب السياسة'));
  check(`  ولا يُرفع إلى المراجعة لأجل ذلك وحده (${name})`, out.reviewReason === null && !requiresReview(out));
}

{
  const out = run({ sentiment: 'NEGATIVE', targetScope: 'NON_STATE', labels: ['PERSONAL_ATTACK'], severityLevel: 2 });
  check('شتم شخصٍ غير حكومي: محايد، والوسم وخطورته باقيان', out.sentiment === 'NEUTRAL' && out.labels.includes('PERSONAL_ATTACK') && out.severityLevel === 2);
}
{
  const out = run({ sentiment: 'NEGATIVE', targetScope: 'NON_STATE', labels: ['UNVERIFIED_ACCUSATION'], severityLevel: 4 });
  check('اتّهام تاجرٍ بلا دليل: محايد، والخطورة إلى أرضيّة الوسم', out.sentiment === 'NEUTRAL' && out.severityLevel === 3, String(out.severityLevel));
}
{
  const out = run({ sentiment: 'NEGATIVE', targetScope: 'NON_STATE', labels: ['COLLECTIVE_BLAME'] });
  check('تعميم اللوم على غير جماعةٍ بهويّتها ليس مخالفة', out.sentiment === 'NEUTRAL');
}

// ══════════════ الإيجابي ══════════════

check('مدح الدولة الجديدة إيجابي', run({ sentiment: 'POSITIVE', targetScope: 'NEW_STATE' }).sentiment === 'POSITIVE');
{
  const out = run({ sentiment: 'POSITIVE', targetScope: 'NON_STATE' });
  check('مدح جهةٍ غير حكومية محايد', out.sentiment === 'NEUTRAL' && out.rationale.includes('ليس إيجابياً'));
}

// ══════════════ (ب) مخالفة معايير ميتا وحقوق الإنسان ══════════════

{
  const out = run({ sentiment: 'NEUTRAL', targetScope: 'NON_STATE', labels: ['HATE_SPEECH'], hateTargetGroup: 'أبناء الطائفة', authorStance: 'SUPPORTIVE' });
  check('★ كراهيةٌ ضد جماعة بلا ذكر الدولة: سلبي لمخالفة السياسات', out.sentiment === 'NEGATIVE' && out.negativeBasis === 'POLICY_VIOLATION');
  check('  وخطورتها ٤ فأكثر وتُحال', out.severityLevel >= 4 && requiresReview(out));
}
{
  const out = run({ sentiment: 'NEGATIVE', targetScope: 'NEW_STATE', labels: ['VIOLENCE_INCITEMENT'], authorStance: 'SUPPORTIVE' });
  check('نقد الدولة مع تحريضٍ على العنف: السببان معاً', out.sentiment === 'NEGATIVE' && out.negativeBasis === 'BOTH' && out.severityLevel === 5);
}
for (const stance of ['OPPOSED', 'REPORTING', 'QUESTIONING'] as const) {
  const out = run({ sentiment: 'NEUTRAL', targetScope: 'NONE', labels: ['HATE_SPEECH'], hateTargetGroup: 'جماعة', authorStance: stance });
  check(`★ نقل الكراهية أو إدانتها أو السؤال عنها ليس مخالفة (${stance})`, out.sentiment === 'NEUTRAL' && out.negativeBasis === null);
}
{
  const out = run({ sentiment: 'UNKNOWN', targetScope: 'NONE', labels: ['THREAT'], authorStance: 'UNCLEAR' });
  check('تهديدٌ في منشورٍ غير محسوم: سلبي', out.sentiment === 'NEGATIVE' && out.negativeBasis === 'POLICY_VIOLATION');
}
check('غير المحسوم بلا مخالفة يبقى غير محسوم', run({ sentiment: 'UNKNOWN' }).sentiment === 'UNKNOWN');

for (const label of ['DANGEROUS_ORGANIZATIONS', 'GRAPHIC_VIOLENCE', 'PRIVACY_VIOLATION', 'SEXUAL_EXPLOITATION', 'DISCRIMINATION'] as const) {
  const out = run({ sentiment: 'NEUTRAL', targetScope: 'NON_STATE', labels: [label] });
  check(`الوسم الجديد ${label}: سلبي، وإشارة «سياسات المنصة»، وخطورة ٣ فأكثر`, out.sentiment === 'NEGATIVE' && out.riskFlags.includes('PLATFORM_POLICY') && out.severityLevel >= 3);
}

// ══════════════ نقل النقد ══════════════

{
  const out = run({ sentiment: 'NEGATIVE', targetScope: 'NEW_STATE', isRelayedCriticism: true });
  check('نقل نقد الدولة بلا تبنٍّ: محايد (قاعدةٌ في السياسة تُنفَّذ هنا)', out.sentiment === 'NEUTRAL' && out.negativeBasis === null);
}

// ══════════════ الدالّة وحدها ══════════════

check(
  'الدالّة لا تغيّر المحايد تجاه الدولة',
  applyStatePolicy({ sentiment: 'NEUTRAL', targetScope: 'NEW_STATE', labels: [], authorStance: 'REPORTING', isRelayedCriticism: false }).sentiment === 'NEUTRAL',
);

// ══════════════ الاتّساق بين الملفّات ══════════════

const schema = read('prisma/schema.prisma');
const enumValues = (name: string) =>
  (new RegExp(`enum ${name} \\{([\\s\\S]*?)\\}`).exec(schema)?.[1] ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[A-Z_]+$/.test(line));

check('جهات المنشور في الشيفرة = TargetScope في المخطّط', JSON.stringify([...TARGET_SCOPES]) === JSON.stringify(enumValues('TargetScope')));
check('أسباب السلبية في المخطّط', JSON.stringify(enumValues('NegativeBasis')) === JSON.stringify(['STATE_CRITICISM', 'POLICY_VIOLATION', 'BOTH']));
check('الوسوم في الشيفرة = ContentLabel في المخطّط', JSON.stringify([...CONTENT_LABELS].sort()) === JSON.stringify(enumValues('ContentLabel').sort()));
check('وسوم المخالفة كلّها وسومٌ معروفة', POLICY_VIOLATION_LABELS.every((label) => (CONTENT_LABELS as readonly string[]).includes(label)));
check(
  'ولكلّ وسم مخالفة تسمية عربية بنبرة «خطر»',
  POLICY_VIOLATION_LABELS.every((label) => LABEL_TEXT[label]?.tone === 'danger'),
  POLICY_VIOLATION_LABELS.filter((label) => LABEL_TEXT[label]?.tone !== 'danger').join(','),
);
const NOT_VIOLATIONS: ContentLabelValue[] = ['PERSONAL_ATTACK', 'ABUSIVE_LANGUAGE', 'COLLECTIVE_BLAME', 'UNVERIFIED_ACCUSATION', 'FEARMONGERING', 'SARCASM', 'SPAM', 'CONSTRUCTIVE_CRITICISM', 'DESTRUCTIVE_CRITICISM'];
check('★ الإساءة والتهويل والاتّهام والسخرية ليست مخالفاتٍ تجعل المنشور سلبياً', NOT_VIOLATIONS.every((label) => !POLICY_VIOLATION_LABELS.includes(label)));

const analyzer = read('src/lib/analysis/ai-analyzer.ts');
check('المخطّط يُلزم النموذج بتحديد الجهة', /'targetScope',/.test(analyzer) && /targetScope: \{ type: 'string', enum: TARGET_SCOPES \}/.test(analyzer));
const persist = read('src/lib/analysis/persist.ts');
check('الجهة وسبب السلبية يُحفظان (إنشاءً وتحديثاً)', (persist.match(/targetScope: result\.targetScope/g) ?? []).length === 2 && (persist.match(/negativeBasis: result\.negativeBasis/g) ?? []).length === 2);
const migration = read('prisma/migrations/20261101090000_state_policy_classification/migration.sql');
check(
  'الترحيل يضيف الوسوم الخمسة والعمودين',
  ['DANGEROUS_ORGANIZATIONS', 'GRAPHIC_VIOLENCE', 'PRIVACY_VIOLATION', 'SEXUAL_EXPLOITATION', 'DISCRIMINATION'].every((l) => migration.includes(`'${l}'`)) &&
    /ADD COLUMN "targetScope"/.test(migration) &&
    /ADD COLUMN "negativeBasis"/.test(migration),
);

const failed = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`${c.ok ? '✓' : '✗'} ${c.name}${!c.ok && c.detail ? `  ← ${c.detail}` : ''}`);
console.log(`\n${checks.length - failed.length}/${checks.length} فحصاً ناجحاً`);
if (failed.length > 0) process.exit(1);

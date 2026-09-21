/**
 * فحص بناء النطاق الزمني في مدخلات المشغّلات.
 *
 * يوجد لأن خطأ يوم واحد هنا لا يظهر في أي مكان: التشغيل ينجح، والعدّادات
 * معقولة، والمنشورات الناقصة لا أثر لها — لا أحد يفتقد ما لم يره قطّ.
 */
import { buildActorInput } from '../src/lib/apify/inputs';
import { mapApifyItem } from '../src/lib/apify/mappers';

const checks: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
}

const x = buildActorInput({
  platformCode: 'x',
  url: 'https://x.com/example',
  username: 'example',
  maxItems: 500,
  windowDays: 7,
  fromDate: '2026-09-01',
  toDate: '2026-09-10',
}) as Record<string, unknown>;

const terms = (x.searchTerms as string[] | undefined)?.[0] ?? '';

check('يُبنى استعلام بحث', terms.length > 0, terms);
check('يحصر بالحساب', terms.includes('from:example'));
check('since يساوي بداية النطاق', terms.includes('since:2026-09-01'));
check(
  'until هو اليوم التالي للنهاية (حصريّ)',
  terms.includes('until:2026-09-11'),
  'المطلوب حتى 2026-09-10، و until حصريّ فيلزم 2026-09-11',
);
check('لا يُمرَّر twitterHandles مع البحث', x.twitterHandles === undefined);
check('السقف مُمرَّر', x.maxItems === 500);
check('start/end مُمرَّران أيضاً', x.start === '2026-09-01' && x.end === '2026-09-10');

// بلا تاريخ نهاية: لا until
const open = buildActorInput({
  platformCode: 'x',
  url: 'https://x.com/example',
  username: 'example',
  maxItems: 100,
  windowDays: 3,
  fromDate: '2026-09-01',
}) as Record<string, unknown>;
const openTerms = (open.searchTerms as string[] | undefined)?.[0] ?? '';
check('بلا نهاية → بلا until', !openTerms.includes('until:'), openTerms);

/*
 * المعرّف يُشتقّ من الرابط حين لا يُخزَّن صراحةً — وهو سلوك مقصود: مسار
 * البحث أدقّ من مسار الرابط، فيُفضَّل كلّما أمكن اشتقاق المعرّف.
 */
const byUrl = buildActorInput({
  platformCode: 'x',
  url: 'https://x.com/someone',
  maxItems: 50,
  windowDays: 3,
}) as Record<string, unknown>;
const byUrlTerms = (byUrl.searchTerms as string[] | undefined)?.[0] ?? '';
check(
  'المعرّف يُشتقّ من الرابط فيُستعمل البحث',
  byUrlTerms.includes('from:someone'),
  byUrlTerms,
);
check(
  'النافذة الافتراضية تُستعمل بلا fromDate',
  byUrlTerms.includes('since:'),
  'windowDays=3 → since قبل ثلاثة أيام',
);

// رابط بلا معرّف قابل للاشتقاق: يعود إلى startUrls
const noHandle = buildActorInput({
  platformCode: 'x',
  url: 'https://x.com/',
  maxItems: 50,
  windowDays: 3,
}) as Record<string, unknown>;
check(
  'رابط بلا معرّف → startUrls',
  noHandle.startUrls !== undefined && noHandle.searchTerms === undefined,
);

// ── استبعاد الردود
check('الردود مستبعَدة افتراضياً', terms.includes('-filter:replies'), terms);

const withReplies = buildActorInput({
  platformCode: 'x',
  url: 'https://x.com/example',
  username: 'example',
  maxItems: 100,
  windowDays: 7,
  fromDate: '2026-09-01',
  excludeReplies: false,
}) as Record<string, unknown>;
const withRepliesTerms = (withReplies.searchTerms as string[] | undefined)?.[0] ?? '';
check(
  'تعطيل الإعداد يُبقي الردود',
  !withRepliesTerms.includes('-filter:replies'),
  withRepliesTerms,
);

// ── كشف الردّ في المحوّل
const reply = mapApifyItem(
  { id: '2', conversationId: '1', inReplyToUsername: 'someone', text: '@someone شكراً', url: 'https://x.com/a/status/2' },
  'x',
);
check('المحوّل يكشف الردّ', reply?.isReply === true);
check('ويعرف من رُدَّ عليه', reply?.replyToUsername === 'someone');

const original = mapApifyItem(
  { id: '1', conversationId: '1', text: 'بيان رسمي', url: 'https://x.com/a/status/1' },
  'x',
);
check('التغريدة الأصلية ليست ردّاً', original?.isReply === false);

const selfThread = mapApifyItem(
  { id: '3', conversationId: '1', inReplyToUsername: 'example', text: 'تتمّة', url: 'https://x.com/a/status/3' },
  'x',
);
check(
  'متابعة السلسلة تُكشف ردّاً ويُعرف صاحبها',
  selfThread?.isReply === true && selfThread?.replyToUsername === 'example',
  'الاستيراد يقارنها بمعرّف الحساب فيُبقيها',
);

console.log('\n>> فحص النطاق الزمني في مدخلات المشغّل\n');
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

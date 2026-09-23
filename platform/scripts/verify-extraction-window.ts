/**
 * فحص بناء النطاق الزمني في مدخلات المشغّلات.
 *
 * يوجد لأن خطأ يوم واحد هنا لا يظهر في أي مكان: التشغيل ينجح، والعدّادات
 * معقولة، والمنشورات الناقصة لا أثر لها — لا أحد يفتقد ما لم يره قطّ.
 */
import { buildActorInput } from '../src/lib/apify/inputs';
import { findProfileImage, mapApifyItem } from '../src/lib/apify/mappers';
import { isDeletableReply } from '../src/lib/extraction/reply-detect';

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

// ── كشف الردّ في صفٍّ محفوظ (سكربت التنظيف)
const storedReply = isDeletableReply(
  { text: '@someone شكراً على التغطية', rawData: null },
  'example',
);
check(
  'النصّ المتصدَّر بمنشن الغير ردٌّ يُحذف — بحكم ظنّي',
  storedReply.deletable && storedReply.confidence === 'likely',
  storedReply.reason,
);

const storedSelf = isDeletableReply({ text: '@example تتمّة البيان', rawData: null }, 'example');
check(
  'السلسلة الذاتية تُبقى ولا تُحذف',
  storedSelf.isReply && !storedSelf.deletable,
  'الاستيراد يُبقيها، فالحذف يلزمه أن يُبقيها',
);

const storedMixed = isDeletableReply({ text: '@example @other ردّ', rawData: null }, 'example');
check(
  'منشنٌ ذاتيّ ومنشنُ غيره → ردٌّ يُحذف',
  storedMixed.deletable,
  'ليست سلسلةً ذاتية ما دام فيها مخاطَبٌ آخر',
);

const storedOriginal = isDeletableReply({ text: 'بيان رسمي', rawData: null }, 'example');
check('المنشور بلا منشن متصدّر لا يُحذف', !storedOriginal.isReply);

const storedMidMention = isDeletableReply(
  { text: 'شكراً لـ @someone على التغطية', rawData: null },
  'example',
);
check('المنشن في وسط النصّ لا يجعله ردّاً', !storedMidMention.isReply);

const storedRetweet = isDeletableReply({ text: 'RT @someone: خبر', rawData: null }, 'example');
check('إعادة التغريدة ليست ردّاً', !storedRetweet.isReply);

const storedRaw = isDeletableReply(
  { text: 'تتمّة', rawData: { id: '2', conversationId: '1', inReplyToUsername: 'someone' } },
  'example',
);
check(
  'حقول المزوّد المحفوظة تحسم الحكم قطعاً',
  storedRaw.deletable && storedRaw.confidence === 'certain',
  storedRaw.reason,
);

/*
 * أهمّ فحص في الباب: نفيٌ صريح من المزوّد يسبق ظنَّ النصّ. وبدونه يحذف
 * السكربت تغريدةً أصليةً تخاطب جهةً، وهي أكثر ما يُخشى عليه هنا.
 */
const storedRawDenies = isDeletableReply(
  { text: '@someone شكراً', rawData: { id: '1', conversationId: '1', isReply: false } },
  'example',
);
check(
  'نفيُ المزوّد الصريح يسبق ظنّ النصّ',
  !storedRawDenies.isReply && !storedRawDenies.deletable,
  storedRawDenies.reason,
);

// ── الحدّ الأعلى في منصّات المسار الزمني
const fb = buildActorInput({
  platformCode: 'facebook',
  url: 'https://facebook.com/example',
  maxItems: 100,
  windowDays: 30,
  fromDate: '2022-01-01',
  toDate: '2022-01-31',
}) as Record<string, unknown>;
/*
 * كان هذا الفحص يُثبّت العطب نفسه.
 *
 * طالب بأن يساوي الحدّ الأعلى تاريخَ النهاية، فمرّ أخضر على شيفرةٍ تُسقط
 * اليوم الأخير من كل تشغيل — والفحص الذي يصف ما تفعله الشيفرة لا ما
 * يجب أن تفعله لا يحرس شيئاً، بل يحرس الخطأ من الإصلاح.
 */
check(
  'فيسبوك يحمل حدّي المدى، والأعلى حصريّ',
  fb.onlyPostsNewerThan === '2022-01-01' && fb.onlyPostsOlderThan === '2022-02-01',
  `${String(fb.onlyPostsNewerThan)} ← ${String(fb.onlyPostsOlderThan)}`,
);

/*
 * الحدّ الأعلى في إنستغرام هو ما يجعل الاستخراج التاريخي ممكناً عليها:
 * بحدٍّ أدنى وحده تُرجع كلّ نافذة أحدثَ المنشورات فتسقط خارج المدى، فيُدفع
 * ثمنها ولا يُحفظ منها شيء.
 */
const ig = buildActorInput({
  platformCode: 'instagram',
  url: 'https://instagram.com/example',
  maxItems: 100,
  windowDays: 30,
  fromDate: '2022-01-01',
  toDate: '2022-01-31',
}) as Record<string, unknown>;
check(
  'إنستغرام تحمل حدّي المدى، والأعلى حصريّ',
  ig.onlyPostsNewerThan === '2022-01-01' && ig.onlyPostsOlderThan === '2022-02-01',
  `${String(ig.onlyPostsNewerThan)} ← ${String(ig.onlyPostsOlderThan)}`,
);

// ── صورة الحساب
/*
 * التسميات هنا مأخوذة من مشغّلات المنصات الثلاث على اختلافها. والغرض ألّا
 * يعود اكتشافُ الصورة معلّقاً على اسمٍ بعينه: القائمة الثابتة سقطت في أوّل
 * تشغيل حقيقي، والنمط هو ما يصمد.
 */
const AVATAR_CASES: [string, unknown, string | null][] = [
  [
    'إكس — author.profilePicture',
    { author: { profilePicture: 'https://pbs.twimg.com/profile_images/1/a_normal.jpg' } },
    'https://pbs.twimg.com/profile_images/1/a_normal.jpg',
  ],
  [
    'إكس القديم — user.profile_image_url_https',
    { user: { profile_image_url_https: 'https://pbs.twimg.com/profile_images/2/b.jpg' } },
    'https://pbs.twimg.com/profile_images/2/b.jpg',
  ],
  [
    'فيسبوك — user.profilePic',
    { user: { profilePic: 'https://scontent.xx.fbcdn.net/v/t1/c.jpg' } },
    'https://scontent.xx.fbcdn.net/v/t1/c.jpg',
  ],
  [
    'إنستغرام — ownerProfilePicUrl في الجذر',
    { ownerProfilePicUrl: 'https://instagram.fcai.fbcdn.net/v/t51/d.jpg' },
    'https://instagram.fcai.fbcdn.net/v/t51/d.jpg',
  ],
  [
    'مفتاح عامّ داخل فرع الحساب',
    { author: { picture: 'https://scontent.xx.fbcdn.net/v/t1/e.jpg' } },
    'https://scontent.xx.fbcdn.net/v/t1/e.jpg',
  ],
  [
    'pageInfo.picture',
    { pageInfo: { picture: 'https://scontent.xx.fbcdn.net/v/t1/f.jpg' } },
    'https://scontent.xx.fbcdn.net/v/t1/f.jpg',
  ],
];

for (const [name, input, expected] of AVATAR_CASES) {
  const found = findProfileImage(input);
  check(`صورة الحساب: ${name}`, found === expected, found ?? 'لم تُوجد');
}

/*
 * ثلاثة نفيٍ أهمّ من الإثبات: كلٌّ منها يضع صورةً خاطئة مكان صورة الحساب،
 * فتظهر البطاقة «صحيحة» وهي تعرض غير ما تدّعي.
 */
check(
  'صورة المنشور ليست صورة الحساب',
  findProfileImage({ full_picture: 'https://scontent.xx.fbcdn.net/v/t1/post.jpg' }) === null,
);
check(
  'رابط صفحة الحساب ليس صورة',
  findProfileImage({ author: { profilePicture: 'https://facebook.com/some-page' } }) === null,
  'isMediaUrl يرفض مضيفات صفحات المنصات',
);
check(
  'وسائط المنشور في الجذر لا يُنزَل إليها',
  findProfileImage({
    media: [{ image: 'https://scontent.xx.fbcdn.net/v/t1/media.jpg' }],
  }) === null,
  'النزول من الجذر محصور في فروع الحساب',
);

/*
 * ★ الحدّ الأعلى في فيسبوك وإنستغرام حصريّ كما في إكس.
 *
 * وهذه الفحوص وُلدت من عطبٍ وقع فعلاً في الإنتاج: كان
 * `onlyPostsOlderThan` يُمرَّر بتاريخ النهاية نفسه، فطلبُ يومٍ واحد يصير
 * نافذةً فارغة — «أحدث من 23» و«أقدم من 23» لا يجتمعان — فيعود المشغّل
 * بـ`{"error":"no_items"}` عن ثمانية عشر حساباً تنشر كل يوم. وبدا العطب
 * في الرمز وفي الرصيد وفي الحسابات، وهو في سطرٍ واحد.
 *
 * وأهمّ فحصٍ هنا هو فحص اليوم الواحد: هو أسوأ حالات الخطأ وأظهرها، ولا
 * يلتقطه فحصُ نطاقٍ واسع لأن النافذة تبقى فيه غير فارغة رغم نقصان يوم.
 */
const SAME_DAY = '2026-09-23';

for (const [label, platformCode] of [
  ['فيسبوك', 'facebook'],
  ['إنستغرام', 'instagram'],
] as const) {
  const wide = buildActorInput({
    platformCode,
    url: 'https://www.facebook.com/example',
    maxItems: 200,
    windowDays: 7,
    fromDate: '2026-09-01',
    toDate: '2026-09-10',
  }) as Record<string, unknown>;

  check(
    `${label}: الحدّ الأدنى هو بداية النطاق`,
    wide.onlyPostsNewerThan === '2026-09-01',
    String(wide.onlyPostsNewerThan),
  );
  check(
    `${label}: الحدّ الأعلى هو اليوم التالي للنهاية`,
    wide.onlyPostsOlderThan === '2026-09-11',
    `المطلوب حتى 2026-09-10، وجاء ${String(wide.onlyPostsOlderThan)}`,
  );

  const day = buildActorInput({
    platformCode,
    url: 'https://www.facebook.com/example',
    maxItems: 200,
    windowDays: 1,
    fromDate: SAME_DAY,
    toDate: SAME_DAY,
  }) as Record<string, unknown>;

  check(
    `${label}: يومٌ واحد لا يُنتج نافذة فارغة`,
    day.onlyPostsNewerThan !== day.onlyPostsOlderThan,
    `${String(day.onlyPostsNewerThan)} ← ${String(day.onlyPostsOlderThan)}`,
  );
  check(
    `${label}: ويومُ الطلب داخلها`,
    day.onlyPostsNewerThan === SAME_DAY && day.onlyPostsOlderThan === '2026-09-24',
    `${String(day.onlyPostsNewerThan)} ← ${String(day.onlyPostsOlderThan)}`,
  );

  const open = buildActorInput({
    platformCode,
    url: 'https://www.facebook.com/example',
    maxItems: 200,
    windowDays: 7,
    fromDate: '2026-09-01',
    toDate: null,
  }) as Record<string, unknown>;
  check(
    `${label}: بلا نهاية لا يُمرَّر حدّ أعلى`,
    open.onlyPostsOlderThan === undefined,
    'حدٌّ أعلى مخترَع يقصّ النطاق المفتوح',
  );
}

// واليوم الواحد في إكس كذلك — النافذة تُقاس بـ since/until لا بالحقول
const xDay = buildActorInput({
  platformCode: 'x',
  url: 'https://x.com/example',
  username: 'example',
  maxItems: 200,
  windowDays: 1,
  fromDate: SAME_DAY,
  toDate: SAME_DAY,
}) as Record<string, unknown>;
const xDayTerms = (xDay.searchTerms as string[] | undefined)?.[0] ?? '';
check(
  'إكس: يومٌ واحد يبقى نطاقاً صالحاً',
  xDayTerms.includes(`since:${SAME_DAY}`) && xDayTerms.includes('until:2026-09-24'),
  xDayTerms,
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

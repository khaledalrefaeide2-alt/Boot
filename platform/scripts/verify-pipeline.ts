/**
 * فحص خط الاستيراد كاملاً ببيانات تحاكي مخرجات Apify الحقيقية للمنصات الثلاث.
 * التشغيل: npx tsx scripts/verify-pipeline.ts
 */
import 'dotenv/config';
import { prisma } from '../src/lib/db';
import { mapApifyItems } from '../src/lib/apify/mappers';
import { importPosts } from '../src/lib/extraction/import';
import { refreshStatsAfterImport } from '../src/lib/stats';
import { buildActorInput } from '../src/lib/apify/inputs';
import { classifyRunOutcome } from '../src/lib/extraction/outcome';

// عينات تحاكي الأشكال الفعلية لمخرجات الـ Actors الثلاثة
const FACEBOOK_ITEMS = [
  {
    postId: 'fb_1001',
    url: 'https://www.facebook.com/testpage/posts/1001',
    text: 'نعلن عن إطلاق الخدمة الجديدة، شكرًا لجهود الفريق المتميز #خدمات #إنجاز',
    time: '2026-09-01T10:00:00.000Z',
    likes: 1250,
    comments: 84,
    shares: 41,
    media: [{ url: 'https://cdn.example.com/img1.jpg' }],
    user: { name: 'الصفحة الرسمية' },
  },
  {
    postId: 'fb_1002',
    url: 'https://www.facebook.com/testpage/posts/1002',
    message: 'تأخير في تنفيذ المشروع بسبب مشكلة فنية، ونعتذر عن الإزعاج',
    timestamp: 1756713600,
    likesCount: 12,
    commentsCount: 230,
    sharesCount: 3,
  },
  // عنصر فاسد عمداً — يجب ألا يُفشل العملية
  { garbage: true, nothing: null },
  null,
  'مجرد نص وليس كائناً',
];

const X_ITEMS = [
  {
    id: 'x_2001',
    twitterUrl: 'https://x.com/testaccount/status/2001',
    full_text: 'بيان رسمي حول تطورات الوضع الحالي',
    createdAt: '2026-09-02T08:30:00.000Z',
    likeCount: 340,
    replyCount: 25,
    retweetCount: 110,
    viewCount: '12.4K',
    author: { name: 'الحساب الرسمي', followers: 45200 },
  },
];

const INSTAGRAM_ITEMS = [
  {
    shortCode: 'ig_3001',
    url: 'https://www.instagram.com/p/ig_3001/',
    caption: 'فعالية اليوم كانت رائعة وناجحة بكل المقاييس #فعاليات',
    timestamp: '2026-09-02T18:00:00.000Z',
    likesCount: 890,
    commentsCount: 45,
    videoViewCount: 5400,
    type: 'Video',
    videoUrl: 'https://cdn.example.com/video.mp4',
    displayUrl: 'https://cdn.example.com/thumb.jpg',
    ownerFullName: 'الحساب الرسمي',
  },
];

async function main() {
  console.log('🔍 فحص خط الاستيراد\n');

  const platforms = await prisma.platform.findMany({ select: { id: true, code: true, name: true } });
  console.log(`المنصات المتاحة: ${platforms.map((p) => p.name).join('، ')}\n`);

  // 1) فحص بناء المدخلات لكل منصة
  console.log('── بناء مدخلات الـ Actor ──');
  for (const platform of platforms) {
    const input = buildActorInput({
      platformCode: platform.code,
      url: `https://example.com/${platform.code}account`,
      username: 'testaccount',
      maxItems: 50,
      windowDays: 30,
    });
    console.log(`${platform.name}: ${JSON.stringify(input)}`);
  }

  const datasets: Record<string, unknown[]> = {
    facebook: FACEBOOK_ITEMS,
    x: X_ITEMS,
    instagram: INSTAGRAM_ITEMS,
  };

  let grandTotalSaved = 0;

  for (const platform of platforms) {
    const items = datasets[platform.code];
    if (!items) continue;

    console.log(`\n── ${platform.name} ──`);

    // 2) حساب تجريبي
    const account = await prisma.account.upsert({
      where: { platformId_url: { platformId: platform.id, url: `https://example.com/${platform.code}account` } },
      create: {
        platformId: platform.id,
        name: `حساب فحص — ${platform.name}`,
        url: `https://example.com/${platform.code}account`,
        username: 'testaccount',
        type: 'PAGE',
        ownership: 'OWNED',
      },
      update: {},
      select: { id: true, name: true },
    });

    const run = await prisma.extractionRun.create({
      data: {
        accountId: account.id,
        platformId: platform.id,
        actorId: 'verify~local',
        status: 'RUNNING',
        trigger: 'MANUAL',
        maxItems: 50,
        startedAt: new Date(),
      },
      select: { id: true },
    });

    // 3) التحويل
    const mapped = mapApifyItems(items, platform.code);
    console.log(`التحويل: ${mapped.posts.length} صالح، ${mapped.failed} متجاهَل`);
    if (mapped.failures.length) console.log(`  أسباب التجاهل: ${mapped.failures.join(' | ')}`);

    // 4) الاستيراد
    const imported = await importPosts(mapped.posts, {
      accountId: account.id,
      platformId: platform.id,
      extractionRunId: run.id,
    });
    console.log(
      `الاستيراد: ${imported.saved} جديد، ${imported.updated} محدّث، ${imported.failed} فاشل`,
    );
    console.log(
      `المشاعر: إيجابي ${imported.sentimentCounts.positive} | سلبي ${imported.sentimentCounts.negative} | محايد ${imported.sentimentCounts.neutral} | غير محدد ${imported.sentimentCounts.unknown}`,
    );
    if (imported.topPost) console.log(`أعلى تفاعل: ${imported.topPost.engagement}`);
    if (imported.followersCount) console.log(`المتابعون: ${imported.followersCount}`);

    grandTotalSaved += imported.saved;

    // 5) الإحصاءات
    await refreshStatsAfterImport(account.id, platform.id, imported.publishedDates);

    await prisma.extractionRun.update({
      where: { id: run.id },
      data: {
        status: imported.saved + imported.updated > 0 ? 'SUCCEEDED' : 'NO_RESULTS',
        finishedAt: new Date(),
        itemsFetched: items.length,
        itemsSaved: imported.saved,
        itemsSkipped: imported.updated,
        itemsFailed: imported.failed + mapped.failed,
      },
    });
  }

  // 6) التحقق من منع التكرار بإعادة الاستيراد
  console.log('\n── فحص منع التكرار (إعادة استيراد نفس البيانات) ──');
  const fbPlatform = platforms.find((p) => p.code === 'facebook');
  if (fbPlatform) {
    const account = await prisma.account.findUnique({
      where: { platformId_url: { platformId: fbPlatform.id, url: 'https://example.com/facebookaccount' } },
      select: { id: true },
    });
    if (account) {
      const run = await prisma.extractionRun.create({
        data: { accountId: account.id, platformId: fbPlatform.id, actorId: 'verify~local', status: 'RUNNING', trigger: 'MANUAL' },
        select: { id: true },
      });
      const mapped = mapApifyItems(FACEBOOK_ITEMS, 'facebook');
      const again = await importPosts(mapped.posts, {
        accountId: account.id,
        platformId: fbPlatform.id,
        extractionRunId: run.id,
      });
      console.log(`إعادة الاستيراد: ${again.saved} جديد (يجب أن يكون 0)، ${again.updated} محدّث`);
      await prisma.extractionRun.update({ where: { id: run.id }, data: { status: 'SUCCEEDED', finishedAt: new Date() } });
    }
  }

  // 7) تصنيف نتيجة التشغيل — أهم ما يراه المستخدم في جدول العمليات
  console.log('\n── تصنيف نتيجة التشغيل ──');
  const outcomeCases: [string, Parameters<typeof classifyRunOutcome>[0], string][] = [
    ['جلب عناصر ورُفضت كلها', { fetched: 1, saved: 0, updated: 0, failed: 1, firstReason: 'الـ Actor أعاد خطأً: Page is private' }, 'FAILED'],
    ['حفظ منشورات جديدة', { fetched: 27, saved: 27, updated: 0, failed: 0, firstReason: null }, 'SUCCEEDED'],
    ['تحديث منشورات قائمة', { fetched: 10, saved: 0, updated: 10, failed: 0, firstReason: null }, 'SUCCEEDED'],
    ['نجاح جزئي مع رفض بعضها', { fetched: 10, saved: 7, updated: 0, failed: 3, firstReason: 'x' }, 'SUCCEEDED'],
    ['عناصر سليمة خارج النطاق', { fetched: 12, saved: 0, updated: 0, failed: 0, firstReason: null }, 'NO_RESULTS'],
  ];
  let outcomeFailures = 0;
  for (const [name, input, expected] of outcomeCases) {
    const { status } = classifyRunOutcome(input);
    const ok = status === expected;
    if (!ok) outcomeFailures += 1;
    console.log(`${ok ? '✅' : '❌'} ${name}: ${status}${ok ? '' : ` (المتوقع ${expected})`}`);
  }
  if (outcomeFailures > 0) throw new Error(`${outcomeFailures} حالة تصنيف غير صحيحة`);

  // 8) النتائج النهائية
  const [postCount, statCount, hashtagCount, notificationCount] = await Promise.all([
    prisma.post.count(),
    prisma.dailyAccountStat.count(),
    prisma.hashtag.count(),
    prisma.notification.count(),
  ]);

  console.log('\n── الحصيلة ──');
  console.log(`المنشورات المخزّنة: ${postCount}`);
  console.log(`سجلات الإحصاءات اليومية: ${statCount}`);
  console.log(`الهاشتاغات: ${hashtagCount}`);
  console.log(`التنبيهات: ${notificationCount}`);

  const sample = await prisma.post.findFirst({
    orderBy: { engagementTotal: 'desc' },
    select: {
      text: true, postType: true, language: true, sentiment: true, sentimentScore: true,
      likes: true, comments: true, shares: true, views: true, engagementTotal: true,
      hashtags: true, publishedAt: true, topic: { select: { name: true } },
    },
  });
  console.log('\nأعلى منشور تفاعلاً:');
  console.log(JSON.stringify(sample, null, 2));

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('❌ فشل الفحص:', error);
  await prisma.$disconnect();
  process.exit(1);
});

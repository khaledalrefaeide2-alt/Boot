import 'server-only';
import { prisma } from '@/lib/db';
import { analyzeSentiment } from '@/lib/analysis/sentiment';
import { classifyTopic, detectKeywords, parseTopicRules } from '@/lib/analysis/classify';
import { normalizeArabic } from '@/lib/analysis/text';
import type { MappedPost } from '@/lib/apify/mappers';

export interface ImportResult {
  saved: number;
  updated: number;
  skipped: number;
  failed: number;
  failures: string[];
  publishedDates: (Date | null)[];
  /** أعلى منشور تفاعلاً في هذه الدفعة — لتنبيه التفاعل المرتفع */
  topPost: { id: string; engagement: number; text: string | null } | null;
  sentimentCounts: { positive: number; negative: number; neutral: number; unknown: number };
  matchedAlertKeywords: string[];
  followersCount: number | null;
}

/** تحميل قواعد التصنيف والكلمات المفتاحية مرة واحدة لكل عملية استيراد */
async function loadAnalysisContext() {
  const [keywords, topics] = await Promise.all([
    prisma.keyword.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, term: true, normalizedTerm: true, isAlerting: true },
    }),
    prisma.topic.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, code: true, rules: true },
    }),
  ]);

  return {
    keywords,
    alertingKeywordIds: new Set(keywords.filter((k) => k.isAlerting).map((k) => k.id)),
    topicRules: topics.map((topic) => ({
      id: topic.id,
      code: topic.code,
      terms: parseTopicRules(topic.rules),
    })),
  };
}

/**
 * استيراد دفعة منشورات إلى قاعدة البيانات.
 *
 * ضمانات:
 *  - فشل منشور واحد لا يوقف الدفعة — يُحصى ويُسجَّل سببه.
 *  - لا تكرار: المفتاح الفريد (accountId, dedupeKey) يحوّل المكرر إلى تحديث
 *    لأرقام التفاعل فقط.
 *  - كل حقل غير متاح يُخزَّن null.
 */
export async function importPosts(
  posts: MappedPost[],
  context: {
    accountId: string;
    platformId: string;
    extractionRunId: string;
    /** حدود النافذة الزمنية المطلوبة — ما خرج عنها لا يُخزَّن */
    windowFrom?: Date | null;
    windowTo?: Date | null;
  },
): Promise<ImportResult> {
  const result: ImportResult = {
    saved: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    failures: [],
    publishedDates: [],
    topPost: null,
    sentimentCounts: { positive: 0, negative: 0, neutral: 0, unknown: 0 },
    matchedAlertKeywords: [],
    followersCount: null,
  };

  if (posts.length === 0) return result;

  const analysis = await loadAnalysisContext();
  const alertKeywords = new Set<string>();

  for (const post of posts) {
    try {
      /*
       * الالتزام بالنافذة التي حددها المشغّل يُفرض هنا أيضاً لا في الـ Actor
       * وحده: بعض الـ Actors تتجاهل حد النهاية أو تُرجع منشورات مثبّتة خارج
       * المدى. الفلترة عندنا تضمن أن ما يدخل التقارير هو ما طُلب بالضبط.
       */
      if (post.publishedAt) {
        const beforeWindow = context.windowFrom && post.publishedAt < context.windowFrom;
        const afterWindow = context.windowTo && post.publishedAt > context.windowTo;
        if (beforeWindow || afterWindow) {
          result.skipped += 1;
          continue;
        }
      }

      const engagementTotal = post.likes + post.comments + post.shares + post.saves;
      const sentiment = analyzeSentiment(post.text);
      const matchedKeywords = detectKeywords(post.text, analysis.keywords);
      const topic = classifyTopic(post.text, analysis.topicRules);

      if (post.followersCount !== null) result.followersCount = post.followersCount;

      const existing = await prisma.post.findUnique({
        where: { accountId_dedupeKey: { accountId: context.accountId, dedupeKey: post.dedupeKey } },
        select: { id: true },
      });

      const data = {
        externalId: post.externalId,
        url: post.url,
        text: post.text,
        publishedAt: post.publishedAt,
        postType: post.postType,
        language: post.language,
        country: post.country,
        location: post.location,
        authorName: post.authorName,
        imageUrl: post.imageUrl,
        videoUrl: post.videoUrl,
        thumbnailUrl: post.thumbnailUrl,
        mediaUrls: (post.mediaUrls ?? undefined) as never,
        likes: post.likes,
        comments: post.comments,
        shares: post.shares,
        views: post.views,
        saves: post.saves,
        engagementTotal,
        hashtags: post.hashtags,
        detectedKeywords: matchedKeywords.map((k) => k.term),
        extractionRunId: context.extractionRunId,
      };

      let postId: string;

      if (existing) {
        // المنشور موجود — نحدّث أرقام التفاعل والتحليل فقط ولا نعيد إنشاءه
        const updated = await prisma.post.update({
          where: { id: existing.id },
          data: {
            ...data,
            sentiment: sentiment.sentiment,
            sentimentScore: sentiment.score,
            sentimentSource: 'RULES',
          },
          select: { id: true },
        });
        postId = updated.id;
        result.updated += 1;
      } else {
        const created = await prisma.post.create({
          data: {
            ...data,
            accountId: context.accountId,
            platformId: context.platformId,
            dedupeKey: post.dedupeKey,
            sentiment: sentiment.sentiment,
            sentimentScore: sentiment.score,
            sentimentSource: 'RULES',
            ...(topic ? { topicId: topic.topicId, topicSource: 'RULES' as const } : {}),
          },
          select: { id: true },
        });
        postId = created.id;
        result.saved += 1;
      }

      // ربط الكلمات المفتاحية المكتشفة
      if (matchedKeywords.length > 0) {
        await prisma.postKeyword.createMany({
          data: matchedKeywords.map((keyword) => ({ postId, keywordId: keyword.id })),
          skipDuplicates: true,
        });
        for (const keyword of matchedKeywords) {
          if (analysis.alertingKeywordIds.has(keyword.id)) alertKeywords.add(keyword.term);
        }
      }

      // ربط الهاشتاغات وتحديث عدّاد استخدامها
      if (post.hashtags.length > 0) {
        const hashtagIds: string[] = [];
        for (const tag of post.hashtags) {
          const normalized = tag.slice(0, 100);
          const hashtag = await prisma.hashtag.upsert({
            where: { tag: normalized },
            create: { tag: normalized, usageCount: 1 },
            update: { usageCount: { increment: existing ? 0 : 1 } },
            select: { id: true },
          });
          hashtagIds.push(hashtag.id);
        }
        // skipDuplicates يمنع خطأ إعادة الربط عند تحديث منشور موجود
        await prisma.postHashtag.createMany({
          data: hashtagIds.map((hashtagId) => ({ postId, hashtagId })),
          skipDuplicates: true,
        });
      }

      result.publishedDates.push(post.publishedAt);

      if (sentiment.sentiment === 'POSITIVE') result.sentimentCounts.positive += 1;
      else if (sentiment.sentiment === 'NEGATIVE') result.sentimentCounts.negative += 1;
      else if (sentiment.sentiment === 'UNKNOWN') result.sentimentCounts.unknown += 1;
      else result.sentimentCounts.neutral += 1;

      if (!result.topPost || engagementTotal > result.topPost.engagement) {
        result.topPost = { id: postId, engagement: engagementTotal, text: post.text };
      }
    } catch (error) {
      // منشور واحد فاسد لا يُفشل العملية كاملة
      result.failed += 1;
      if (result.failures.length < 20) {
        result.failures.push(
          `${post.url ?? post.externalId ?? 'منشور بلا معرّف'}: ${
            error instanceof Error ? error.message : 'خطأ غير معروف'
          }`,
        );
      }
    }
  }

  result.matchedAlertKeywords = Array.from(alertKeywords);

  // تحديث عدّاد المطابقات للكلمات المفتاحية
  try {
    const matchedTerms = Array.from(
      new Set(posts.flatMap((p) => detectKeywords(p.text, analysis.keywords).map((k) => k.id))),
    );
    if (matchedTerms.length > 0) {
      await prisma.keyword.updateMany({
        where: { id: { in: matchedTerms } },
        data: { matchCount: { increment: 1 } },
      });
    }
  } catch {
    // عدّاد إحصائي فقط — تجاهل فشله
  }

  return result;
}

/** تطبيع الكلمة المفتاحية عند الإنشاء أو التعديل */
export function normalizeKeywordTerm(term: string): string {
  return normalizeArabic(term);
}

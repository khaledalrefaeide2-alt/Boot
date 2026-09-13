import 'server-only';
import { Prisma } from '@/generated/prisma';
import { prisma } from '@/lib/db';
import { type AccountScope } from '@/lib/auth/account-scope';
import { ASSISTANT_LIMITS, embeddingDimensions, getAssistantConfig } from './config';
import { generateEmbedding } from './openai';
import type { AssistantContext, PeriodSnapshot, RetrievedPost } from './types';

/*
 * طبقة الاسترجاع.
 *
 * ★ النطاق هنا ليس تحسيناً بل الحاجز الأمني الوحيد.
 *
 * المساعد يقرأ منشورات ويعرضها نصّاً داخل الجواب. فلو تسرّب منشور خارج
 * نطاق المستخدم لم يكن تسريب صفٍّ في جدول بل تسريب محتوى مقروء في فقرة —
 * أصعب اكتشافاً وأسهل نسخاً. لذلك يُمرَّر `scope` إلزامياً إلى كل دالة
 * هنا، ويُطبَّق في جملة SQL نفسها لا بعد الجلب.
 *
 * وكلّ استعلام في هذا الملف للقراءة فقط. لا يُنشئ المساعد صفّاً ولا
 * يعدّله ولا يحذفه — عدا حفظ رسائل المحادثة، وهو خارج هذه الطبقة.
 */

/** شرط النطاق كما يُدرج في Prisma */
function scopeWhere(scope: AccountScope): Prisma.PostWhereInput {
  return scope === null ? {} : { accountId: { in: scope } };
}

/**
 * تحويل المتّجه إلى معامل SQL آمن.
 *
 * القيم أرقام نولّدها نحن لا مدخلات مستخدم، ومع ذلك تُفحص: عنصر غير
 * رقمي يعني متّجهاً تالفاً، وتمريره يبني نصّ مصفوفة معطوباً. والنص
 * يُمرَّر معامَلاً مربوطاً لا مُدرَجاً، فلا مجال للحقن أصلاً.
 */
function toVectorLiteral(vector: number[]): string {
  for (const value of vector) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error('متّجه غير صالح');
    }
  }
  return `{${vector.join(',')}}`;
}

interface SimilarityRow {
  postId: string;
  chunkText: string;
  similarity: number;
}

/**
 * البحث الدلالي.
 *
 * بلا pgvector لا يوجد فهرس متّجهي، فالتكلفة تُحكَم بالتصفية المسبقة:
 * النطاق، والنافذة الزمنية، وسقف مرشّحين. وبعدها يُحسب جيب التمام على
 * المرشّحين وحدهم. والمتّجهات مخزَّنة مُوحَّدة الطول، فجيب التمام هو
 * ضربُ النقطة — جمعُ حواصل ضربٍ بلا جذر ولا قسمة.
 *
 * وشرط `dims` و`model` ليس زينة: صفوفٌ ولّدها نموذج آخر تعطي أرقاماً
 * بلا معنى لو قورنت، فتُستبعد في الاستعلام نفسه بدل أن تُفلتر بعده.
 */
export async function searchSimilarPosts(
  question: string,
  scope: AccountScope,
  from: Date,
  to: Date,
  topK: number = ASSISTANT_LIMITS.retrievalTopK,
): Promise<SimilarityRow[]> {
  const config = getAssistantConfig();
  const dims = embeddingDimensions(config.embedModel);
  const vector = await generateEmbedding(question);
  const literal = toVectorLiteral(vector);

  const scopeFilter =
    scope === null
      ? Prisma.empty
      : scope.length === 0
        ? Prisma.sql`AND FALSE`
        : Prisma.sql`AND p."accountId" IN (${Prisma.join(scope)})`;

  const dimsFilter = dims ? Prisma.sql`AND pe."dims" = ${dims}` : Prisma.empty;

  const rows = await prisma.$queryRaw<SimilarityRow[]>(Prisma.sql`
    WITH candidates AS (
      SELECT pe."postId", pe."chunkText", pe."embedding"
      FROM "post_embeddings" pe
      JOIN "posts" p ON p."id" = pe."postId"
      WHERE p."isHidden" = FALSE
        AND p."publishedAt" >= ${from}
        AND p."publishedAt" <= ${to}
        AND pe."model" = ${config.embedModel}
        ${dimsFilter}
        ${scopeFilter}
      ORDER BY p."publishedAt" DESC
      LIMIT ${ASSISTANT_LIMITS.candidateCap}
    )
    SELECT
      c."postId"    AS "postId",
      c."chunkText" AS "chunkText",
      COALESCE((
        SELECT SUM(a * b)
        FROM unnest(c."embedding", ${literal}::double precision[]) AS t(a, b)
      ), 0) AS similarity
    FROM candidates c
    ORDER BY similarity DESC
    LIMIT ${topK}
  `);

  return rows.map((row) => ({ ...row, similarity: Number(row.similarity) }));
}

/** ترقية نتائج التشابه إلى منشورات كاملة — بإعادة تطبيق النطاق */
async function hydratePosts(
  rows: SimilarityRow[],
  scope: AccountScope,
): Promise<RetrievedPost[]> {
  if (rows.length === 0) return [];

  const ids = [...new Set(rows.map((row) => row.postId))];
  const posts = await prisma.post.findMany({
    // النطاق يُطبَّق ثانيةً هنا قصداً: حاجزان أرخص من تسريبٍ واحد
    where: { id: { in: ids }, isHidden: false, ...scopeWhere(scope) },
    select: {
      id: true,
      url: true,
      publishedAt: true,
      sentiment: true,
      engagementTotal: true,
      account: { select: { name: true } },
      platform: { select: { name: true } },
    },
  });

  const byId = new Map(posts.map((post) => [post.id, post]));

  return rows
    .map((row): RetrievedPost | null => {
      const post = byId.get(row.postId);
      if (!post) return null;
      return {
        postId: post.id,
        chunkText: row.chunkText,
        similarity: row.similarity,
        accountName: post.account.name,
        platformName: post.platform.name,
        publishedAt: post.publishedAt,
        sentiment: post.sentiment,
        engagementTotal: post.engagementTotal,
        url: post.url,
      };
    })
    .filter((post): post is RetrievedPost => post !== null);
}

/** لقطة رقمية عن الفترة — كلّها من القاعدة، ولا رقم منها من النموذج */
export async function buildSnapshot(
  scope: AccountScope,
  from: Date,
  to: Date,
): Promise<PeriodSnapshot> {
  const where: Prisma.PostWhereInput = {
    isHidden: false,
    publishedAt: { gte: from, lte: to },
    ...scopeWhere(scope),
  };

  const [total, sentimentGroups, topicGroups, accountGroups, engagement, notifications] =
    await Promise.all([
      prisma.post.count({ where }),
      prisma.post.groupBy({ by: ['sentiment'], where, _count: { _all: true } }),
      prisma.post.groupBy({
        by: ['topicId'],
        where: { ...where, topicId: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { topicId: 'desc' } },
        take: 6,
      }),
      prisma.post.groupBy({
        by: ['accountId'],
        where,
        _count: { _all: true },
        _sum: { engagementTotal: true },
        orderBy: { _count: { accountId: 'desc' } },
        take: 5,
      }),
      prisma.post.aggregate({ where, _sum: { engagementTotal: true } }),
      prisma.notification.findMany({
        where: { createdAt: { gte: from, lte: to } },
        select: { title: true, severity: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

  const topicIds = topicGroups.map((g) => g.topicId).filter((id): id is string => Boolean(id));
  const accountIds = accountGroups.map((g) => g.accountId);

  const [topics, accounts] = await Promise.all([
    topicIds.length
      ? prisma.topic.findMany({ where: { id: { in: topicIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    accountIds.length
      ? prisma.account.findMany({
          where: { id: { in: accountIds } },
          select: { id: true, name: true, platform: { select: { name: true } } },
        })
      : Promise.resolve([]),
  ]);

  const topicName = new Map(topics.map((t) => [t.id, t.name]));
  const accountInfo = new Map(accounts.map((a) => [a.id, a]));

  /*
   * أبرز الكلمات تُحسب في الذاكرة لا في القاعدة.
   *
   * `detectedKeywords` مصفوفة نصّية داخل صفّ المنشور، وتجميعها في SQL
   * يحتاج unnest على كل الصفوف — استعلامٌ ثقيل بلا فهرس يخدمه. والعيّنة
   * هنا محدودة بالنافذة والنطاق، فالعدّ في الذاكرة أرخص وأوضح.
   */
  const keywordRows = await prisma.post.findMany({
    where: { ...where, detectedKeywords: { isEmpty: false } },
    select: { detectedKeywords: true },
    take: 1000,
    orderBy: { publishedAt: 'desc' },
  });

  const keywordCounts = new Map<string, number>();
  for (const row of keywordRows) {
    for (const term of row.detectedKeywords) {
      keywordCounts.set(term, (keywordCounts.get(term) ?? 0) + 1);
    }
  }

  const sentimentCounts: Record<string, number> = {};
  for (const group of sentimentGroups) {
    sentimentCounts[group.sentiment] = group._count._all;
  }

  return {
    fromDate: from,
    toDate: to,
    totalPosts: total,
    totalEngagement: engagement._sum.engagementTotal ?? 0,
    sentimentCounts,
    topTopics: topicGroups
      .map((g) => ({ name: topicName.get(g.topicId ?? '') ?? 'غير مصنّف', count: g._count._all }))
      .filter((t) => t.name !== 'غير مصنّف'),
    topKeywords: [...keywordCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([term, count]) => ({ term, count })),
    topAccounts: accountGroups.map((g) => {
      const info = accountInfo.get(g.accountId);
      return {
        name: info?.name ?? '—',
        platform: info?.platform.name ?? '—',
        posts: g._count._all,
        engagement: g._sum.engagementTotal ?? 0,
      };
    }),
    recentNotifications: notifications.map((n) => ({
      title: n.title,
      severity: n.severity,
      createdAt: n.createdAt,
    })),
  };
}

/** بناء السياق الكامل لسؤال واحد */
export async function buildContext(
  question: string,
  scope: AccountScope,
  windowDays: number = ASSISTANT_LIMITS.defaultWindowDays,
): Promise<AssistantContext> {
  const to = new Date();
  const from = new Date(to.getTime() - windowDays * 24 * 60 * 60 * 1000);

  // اللقطة والبحث متوازيان: لا يعتمد أحدهما على الآخر
  const [snapshot, rows] = await Promise.all([
    buildSnapshot(scope, from, to),
    searchSimilarPosts(question, scope, from, to),
  ]);

  const posts = await hydratePosts(rows, scope);

  return { snapshot, posts, empty: snapshot.totalPosts === 0 };
}

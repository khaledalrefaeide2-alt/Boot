import 'server-only';
import type { Prisma } from '@/generated/prisma';
import { prisma } from '@/lib/db';
import type { AccountScope } from '@/lib/auth/account-scope';
import type { PostFilters } from '@/lib/validation/posts';
import type { ListStoriesInput } from '@/lib/validation/stories';
import { buildPostWhere } from './posts';

/*
 * استعلامات الأحداث.
 *
 * ★ الحدث في القاعدة مرساةٌ بلا عنوان ولا عدّاد.
 *
 *   جدول `stories` يحمل مركز العنقود ونافذته الزمنية — وهي حسابات
 *   التجميع لا بيانات العرض. والعنوان والعدد والتواريخ كلّها تُشتقّ هنا
 *   من منشورات الحدث **ضمن ما يراه القارئ وضمن فلاتره**.
 *
 *   ولو خُزّن العنوان في الجدول لعُرض لصاحب النطاق المحدود نصُّ منشورٍ من
 *   حسابٍ لا يملك فتحه — وهو تسريبُ محتوىً مقروء لا تسريبُ رقم.
 *
 *   والشرط يُبنى بـ`buildPostWhere` نفسها التي تبني شاشة المنشورات، فلا
 *   يظهر «٥٠ منشوراً» في شاشة و«٤٢» في أخرى بلا تفسير.
 */

/** أقلّ ما يُسمّى حدثاً — منشورٌ واحد ليس حدثاً بل منشور */
export const MIN_STORY_POSTS = 2;

export interface StoryListItem {
  id: string;
  /** نصّ أعلى منشورات الحدث تفاعلاً ضمن ما يراه القارئ */
  headline: string;
  /** معرّف المنشور الذي جاء منه العنوان — ليُفتح كما هو */
  headlinePostId: string;
  posts: number;
  accounts: number;
  engagement: number;
  negative: number;
  positive: number;
  firstPostAt: Date | null;
  lastPostAt: Date | null;
}

/** ضمّ شرطين بلا أن يمحو أحدهما الآخر — انظر نظيرتها في `entities.ts` */
function and(where: Prisma.PostWhereInput, extra: Prisma.PostWhereInput): Prisma.PostWhereInput {
  return { AND: [where, extra] };
}

async function countByStory(where: Prisma.PostWhereInput): Promise<Map<string, number>> {
  const rows = await prisma.post.groupBy({
    by: ['storyId'],
    where,
    _count: { _all: true },
  });
  return new Map(rows.flatMap((row) => (row.storyId ? [[row.storyId, row._count._all]] : [])));
}

/**
 * العنوان: أعلى منشورات الحدث تفاعلاً ممّا يراه القارئ.
 *
 * استعلامٌ لكلّ حدث في الصفحة، متوازيةً. والبديل — جلبُ منشورات الأحداث
 * كلّها ثمّ الانتقاء في الذاكرة — يجرّ نصوص خمسمئة منشور لحدثٍ كبير
 * ليُعرض منها واحد. وكلّ استعلامٍ هنا على فهرس `storyId` بحدّ صفٍّ واحد.
 */
async function headlines(
  ids: string[],
  where: Prisma.PostWhereInput,
): Promise<Map<string, { text: string; postId: string }>> {
  const rows = await Promise.all(
    ids.map((id) =>
      prisma.post.findFirst({
        where: and(where, { storyId: id }),
        orderBy: [{ engagementTotal: 'desc' }, { publishedAt: 'desc' }],
        select: { id: true, text: true, storyId: true },
      }),
    ),
  );

  return new Map(
    rows.flatMap((row) =>
      row?.storyId ? [[row.storyId, { text: row.text ?? '', postId: row.id }]] : [],
    ),
  );
}

/** عدد الحسابات المتمايزة في كلّ حدث — «كم جهةً تناولته» */
async function accountsByStory(
  ids: string[],
  where: Prisma.PostWhereInput,
): Promise<Map<string, number>> {
  const rows = await prisma.post.groupBy({
    by: ['storyId', 'accountId'],
    where: and(where, { storyId: { in: ids } }),
    _count: { _all: true },
  });

  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.storyId) continue;
    counts.set(row.storyId, (counts.get(row.storyId) ?? 0) + 1);
  }
  return counts;
}

/**
 * ترتيب الأحداث تحت شرطٍ ما — الطبقة المشتركة بين الشاشة وأداة المساعد.
 *
 * تُكتب مرّةً وتُستدعى مرّتين، وإلا أجاب المساعد برقمٍ يخالف ما تعرضه
 * الشاشة لصاحبه في اللحظة نفسها.
 *
 * ولا عدد كلّي للصفحات — كنظيرتها في الكيانات: عدّ الأحداث المميَّزة تحت
 * الفلاتر يمرّ على المنشورات كلّها ليُرجع رقماً يُقرأ ولا يُستعمل. فيُجلب
 * عنصرٌ زائد بدله.
 */
export async function rankStories(options: {
  postWhere: Prisma.PostWhereInput;
  sort: 'posts' | 'engagement' | 'negative';
  take: number;
  skip?: number;
}): Promise<{ stories: StoryListItem[]; hasMore: boolean }> {
  const { sort, take, skip = 0 } = options;
  const postWhere = and(options.postWhere, { storyId: { not: null } });

  /*
   * الترتيب على عدد المنشورات أو على التفاعل.
   *
   * و«الأحدث» ليس خياراً هنا: الأحداث تُقرأ بحجمها لا بتاريخها، وقائمةٌ
   * مرتَّبة بالتاريخ تصير قائمةَ منشوراتٍ بخطوةٍ زائدة.
   */
  const ranked = await prisma.post.groupBy({
    by: ['storyId'],
    where: sort === 'negative' ? and(postWhere, { sentiment: 'NEGATIVE' }) : postWhere,
    _count: { _all: true },
    _sum: { engagementTotal: true },
    orderBy:
      sort === 'engagement'
        ? { _sum: { engagementTotal: 'desc' } }
        : { _count: { storyId: 'desc' } },
    /*
     * الحدث من منشورٍ واحد لا يُعرض.
     *
     * التجميع يفتح عنقوداً لكلّ منشورٍ لا يجد له نظيراً، فأكثر الصفوف في
     * الجدول عناقيدُ من عضوٍ واحد. وعرضها يملأ الشاشة بما هو موجودٌ أصلاً
     * في شاشة المنشورات — ويُخفي الأحداث الحقيقية بينها.
     */
    having: { storyId: { _count: { gte: MIN_STORY_POSTS } } },
    skip,
    take: take + 1,
  });

  const hasMore = ranked.length > take;
  const ids = ranked.slice(0, take).flatMap((row) => (row.storyId ? [row.storyId] : []));

  if (ids.length === 0) return { stories: [], hasMore: false };

  const scoped = and(postWhere, { storyId: { in: ids } });
  const [totals, negatives, positives, accounts, titles] = await Promise.all([
    prisma.post.groupBy({
      by: ['storyId'],
      where: scoped,
      _count: { _all: true },
      _sum: { engagementTotal: true },
      _min: { publishedAt: true },
      _max: { publishedAt: true },
    }),
    countByStory(and(scoped, { sentiment: 'NEGATIVE' })),
    countByStory(and(scoped, { sentiment: 'POSITIVE' })),
    accountsByStory(ids, postWhere),
    headlines(ids, postWhere),
  ]);

  const summary = new Map(totals.flatMap((row) => (row.storyId ? [[row.storyId, row]] : [])));

  const stories = ids.flatMap((id) => {
    const row = summary.get(id);
    const title = titles.get(id);
    // حدثٌ لم يُرجع عنواناً لا يُعرض: بطاقةٌ بلا نصّ لا تقول شيئاً
    if (!row || !title) return [];
    return [
      {
        id,
        headline: title.text,
        headlinePostId: title.postId,
        posts: row._count._all,
        accounts: accounts.get(id) ?? 0,
        engagement: row._sum.engagementTotal ?? 0,
        negative: negatives.get(id) ?? 0,
        positive: positives.get(id) ?? 0,
        firstPostAt: row._min.publishedAt,
        lastPostAt: row._max.publishedAt,
      },
    ];
  });

  return { stories, hasMore };
}

/** قائمة شاشة الأحداث — الفلاتر المعتادة فوق الطبقة المشتركة */
export async function listStories(
  filters: ListStoriesInput,
  scope: AccountScope,
): Promise<{ stories: StoryListItem[]; page: number; pageSize: number; hasMore: boolean }> {
  const { stories, hasMore } = await rankStories({
    postWhere: buildPostWhere(filters, scope),
    sort: filters.sort,
    skip: (filters.page - 1) * filters.pageSize,
    take: filters.pageSize,
  });

  return { stories, page: filters.page, pageSize: filters.pageSize, hasMore };
}

export interface StorySummary extends StoryListItem {
  sentiment: { positive: number; negative: number; neutral: number; unknown: number };
  topAccounts: { id: string; name: string; posts: number }[];
}

/**
 * ملخّص حدثٍ واحد ضمن فلاتر القارئ.
 *
 * والحدث الذي لا يظهر منه شيء في نطاق القارئ يُقرأ «غير موجود» — الجواب
 * نفسه الذي يُعطى لمعرّف مختلق، فلا يُستدلّ من الفرق على وجوده.
 */
export async function storySummary(
  storyId: string,
  filters: PostFilters,
  scope: AccountScope,
): Promise<StorySummary | null> {
  const where = buildPostWhere({ ...filters, storyId }, scope);

  const [groups, totals, title, accountGroups] = await Promise.all([
    prisma.post.groupBy({ by: ['sentiment'], where, _count: { _all: true } }),
    prisma.post.aggregate({
      where,
      _count: { _all: true },
      _sum: { engagementTotal: true },
      _min: { publishedAt: true },
      _max: { publishedAt: true },
    }),
    prisma.post.findFirst({
      where,
      orderBy: [{ engagementTotal: 'desc' }, { publishedAt: 'desc' }],
      select: { id: true, text: true },
    }),
    prisma.post.groupBy({
      by: ['accountId'],
      where,
      _count: { _all: true },
      orderBy: { _count: { accountId: 'desc' } },
      take: 8,
    }),
  ]);

  if (totals._count._all === 0 || !title) return null;

  const count = (value: string) =>
    groups.find((group) => group.sentiment === value)?._count._all ?? 0;

  const accountIds = accountGroups.map((group) => group.accountId);
  const accounts = accountIds.length
    ? await prisma.account.findMany({
        where: { id: { in: accountIds } },
        select: { id: true, name: true },
      })
    : [];
  const accountName = new Map(accounts.map((account) => [account.id, account.name]));

  const positive = count('POSITIVE');
  const negative = count('NEGATIVE');
  const neutral = count('NEUTRAL');

  return {
    id: storyId,
    headline: title.text ?? '',
    headlinePostId: title.id,
    posts: totals._count._all,
    accounts: accountGroups.length,
    engagement: totals._sum.engagementTotal ?? 0,
    negative,
    positive,
    firstPostAt: totals._min.publishedAt,
    lastPostAt: totals._max.publishedAt,
    sentiment: {
      positive,
      negative,
      neutral,
      unknown: totals._count._all - positive - negative - neutral,
    },
    topAccounts: accountGroups.flatMap((group) => {
      const name = accountName.get(group.accountId);
      return name ? [{ id: group.accountId, name, posts: group._count._all }] : [];
    }),
  };
}

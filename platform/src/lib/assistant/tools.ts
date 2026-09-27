import 'server-only';
import { Prisma } from '@/generated/prisma';
import { prisma } from '@/lib/db';
import { intersectScope, type AccountScope } from '@/lib/auth/account-scope';

/*
 * أدوات المساعد — استعلاماته الخاصة على القاعدة.
 *
 * قبلها كان يتلقّى ملخّصاً جاهزاً عن نافذة ثابتة يختارها المستخدم من
 * قائمة، فلا يستطيع أن يسأل شيئاً خارجه. «قارن حسابين في شهرين» و«أعطني
 * منشورات حساب بعينه عن الكهرباء» و«كيف تغيّر الحساب بين الربعين» —
 * كلّها أسئلةٌ صحيحة لا جواب لها في ملخّصٍ مُعدّ سلفاً.
 *
 * وبهذه الأدوات يسأل بنفسه: يحدّد المدى، ويرشّح، ويجمّع، ويقرأ النصّ
 * كاملاً حين يلزم. وهو الفرق بين من يقرأ تقريراً وبين من يجلس إلى
 * القاعدة.
 *
 * ★ وثلاثة قيود تحكم هذا الملف كلّه:
 *
 *   ١) قراءةٌ فقط. لا `create` ولا `update` ولا `delete` ولا `$executeRaw`
 *      في أيّ مسار هنا. النموذج يصف ويحلّل، ولا يتصرّف في البيانات.
 *
 *   ٢) النطاق يُفرَض في الخادم لا يُؤخَذ من النموذج. كلّ معرّف حساب يصل
 *      في معاملات الأداة يمرّ بـ`intersectScope` قبل أن يبلغ الاستعلام،
 *      فطلبُ حسابٍ خارج نطاق القارئ يُسقَط ولا يُنفَّذ. ولو اعتُمد على
 *      النموذج في ذلك لكان تسريباً ينتظر جملةً ذكيّة.
 *
 *   ٣) لكلّ أداة سقف صفوف. ردٌّ بعشرة آلاف صفّ يملأ نافذة النموذج فيسقط
 *      السياق كله — والسؤال يفشل لأن جوابه كان أكبر من أن يُقرأ.
 */

/** أقصى ما تُرجعه أداة واحدة */
const MAX_ROWS = 50;
const MAX_TEXT = 700;

export interface ToolContext {
  scope: AccountScope;
}

/** نطاق زمني من نصّين — والافتراض آخر ثلاثين يوماً */
function range(from?: string, to?: string): { gte: Date; lte: Date } {
  const end = to ? new Date(`${to}T23:59:59.999Z`) : new Date();
  const start = from
    ? new Date(`${from}T00:00:00.000Z`)
    : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

  // تاريخٌ غير صالح يعيد Invalid Date، وتمريره إلى Prisma يرمي بخطأ غامض
  const safeEnd = Number.isNaN(end.getTime()) ? new Date() : end;
  const safeStart = Number.isNaN(start.getTime())
    ? new Date(safeEnd.getTime() - 30 * 24 * 60 * 60 * 1000)
    : start;

  return { gte: safeStart, lte: safeEnd };
}

/**
 * حصر معرّفات الحسابات على ما يملكه القارئ.
 *
 * `intersectScope` هي الحاجز نفسه الذي تستعمله شاشات المنصة، فلا يختلف
 * ما يراه المساعد عمّا يراه صاحبه في الجداول.
 */
function accountFilter(ctx: ToolContext, requested?: string[]): Prisma.PostWhereInput {
  const ids = intersectScope(ctx.scope, requested ?? []);
  return ids === null ? {} : { accountId: { in: ids } };
}

function baseWhere(
  ctx: ToolContext,
  args: { from?: string; to?: string; accountIds?: string[]; platformCode?: string },
): Prisma.PostWhereInput {
  return {
    isHidden: false,
    publishedAt: range(args.from, args.to),
    ...accountFilter(ctx, args.accountIds),
    ...(args.platformCode ? { platform: { code: args.platformCode } } : {}),
  };
}

// ══════════════════ الأدوات ══════════════════

async function listAccounts(ctx: ToolContext, args: { search?: string }) {
  const ids = intersectScope(ctx.scope, []);
  const rows = await prisma.account.findMany({
    where: {
      isActive: true,
      ...(ids === null ? {} : { id: { in: ids } }),
      ...(args.search ? { name: { contains: args.search, mode: 'insensitive' } } : {}),
    },
    select: {
      id: true,
      name: true,
      platform: { select: { name: true, code: true } },
      group: { select: { name: true } },
    },
    orderBy: { name: 'asc' },
    take: MAX_ROWS * 4,
  });

  return {
    count: rows.length,
    accounts: rows.map((row) => ({
      id: row.id,
      name: row.name,
      platform: row.platform.name,
      platformCode: row.platform.code,
      group: row.group?.name ?? null,
    })),
  };
}

async function getStats(
  ctx: ToolContext,
  args: {
    from?: string;
    to?: string;
    accountIds?: string[];
    platformCode?: string;
    groupBy?: 'day' | 'account' | 'platform' | 'sentiment' | 'total';
  },
) {
  const where = baseWhere(ctx, args);
  const groupBy = args.groupBy ?? 'total';

  const [total, engagement] = await Promise.all([
    prisma.post.count({ where }),
    prisma.post.aggregate({ where, _sum: { engagementTotal: true } }),
  ]);

  const summary = {
    posts: total,
    engagement: engagement._sum.engagementTotal ?? 0,
    from: range(args.from, args.to).gte.toISOString().slice(0, 10),
    to: range(args.from, args.to).lte.toISOString().slice(0, 10),
  };

  if (groupBy === 'total') return summary;

  if (groupBy === 'sentiment') {
    const rows = await prisma.post.groupBy({
      by: ['sentiment'],
      where,
      _count: { _all: true },
      _sum: { engagementTotal: true },
    });
    return {
      ...summary,
      bySentiment: rows.map((r) => ({
        sentiment: r.sentiment,
        posts: r._count._all,
        engagement: r._sum.engagementTotal ?? 0,
      })),
    };
  }

  if (groupBy === 'day') {
    const { gte, lte } = range(args.from, args.to);
    const ids = intersectScope(ctx.scope, args.accountIds ?? []);
    const scopeSql =
      ids === null
        ? Prisma.empty
        : ids.length === 0
          ? Prisma.sql`AND FALSE`
          : Prisma.sql`AND p."accountId" IN (${Prisma.join(ids)})`;
    const platformSql = args.platformCode
      ? Prisma.sql`AND pl."code" = ${args.platformCode}`
      : Prisma.empty;

    const rows = await prisma.$queryRaw<
      { day: Date; posts: bigint; engagement: bigint | null; negative: bigint }[]
    >(Prisma.sql`
      SELECT DATE(p."publishedAt") AS "day",
             COUNT(*) AS "posts",
             SUM(p."engagementTotal") AS "engagement",
             COUNT(*) FILTER (WHERE p."sentiment" = 'NEGATIVE') AS "negative"
      FROM "posts" p
      JOIN "platforms" pl ON pl."id" = p."platformId"
      WHERE p."isHidden" = FALSE
        AND p."publishedAt" >= ${gte}
        AND p."publishedAt" <= ${lte}
        ${scopeSql}
        ${platformSql}
      GROUP BY 1 ORDER BY 1 DESC LIMIT 180
    `);

    return {
      ...summary,
      byDay: rows.map((r) => ({
        day: r.day.toISOString().slice(0, 10),
        posts: Number(r.posts),
        engagement: Number(r.engagement ?? 0),
        negative: Number(r.negative),
      })),
    };
  }

  const key = groupBy === 'account' ? 'accountId' : 'platformId';
  const rows = await prisma.post.groupBy({
    by: [key],
    where,
    _count: { _all: true },
    _sum: { engagementTotal: true },
  });

  const sorted = rows.sort((a, b) => b._count._all - a._count._all).slice(0, MAX_ROWS);
  const names =
    groupBy === 'account'
      ? new Map(
          (
            await prisma.account.findMany({
              where: { id: { in: sorted.map((r) => r.accountId) } },
              select: { id: true, name: true },
            })
          ).map((a) => [a.id, a.name]),
        )
      : new Map(
          (
            await prisma.platform.findMany({
              where: { id: { in: sorted.map((r) => r.platformId) } },
              select: { id: true, name: true },
            })
          ).map((p) => [p.id, p.name]),
        );

  return {
    ...summary,
    groups: sorted.map((r) => ({
      id: groupBy === 'account' ? r.accountId : r.platformId,
      name: names.get(groupBy === 'account' ? r.accountId : r.platformId) ?? '—',
      posts: r._count._all,
      engagement: r._sum.engagementTotal ?? 0,
    })),
  };
}

async function searchPosts(
  ctx: ToolContext,
  args: {
    query?: string;
    from?: string;
    to?: string;
    accountIds?: string[];
    platformCode?: string;
    sentiment?: string;
    sortBy?: 'recent' | 'engagement';
    limit?: number;
  },
) {
  const where: Prisma.PostWhereInput = {
    ...baseWhere(ctx, args),
    ...(args.sentiment ? { sentiment: args.sentiment as never } : {}),
    ...(args.query
      ? {
          OR: [
            { text: { contains: args.query, mode: 'insensitive' } },
            { hashtags: { has: args.query.replace(/^#/, '') } },
            { detectedKeywords: { has: args.query } },
          ],
        }
      : {}),
  };

  const take = Math.min(Math.max(1, args.limit ?? 15), MAX_ROWS);
  const rows = await prisma.post.findMany({
    where,
    select: {
      id: true,
      text: true,
      url: true,
      publishedAt: true,
      sentiment: true,
      engagementTotal: true,
      likes: true,
      comments: true,
      shares: true,
      account: { select: { name: true } },
      platform: { select: { name: true } },
      analysis: { select: { target: true, subject: true, rationale: true } },
    },
    orderBy:
      args.sortBy === 'engagement'
        ? [{ engagementTotal: 'desc' }]
        : [{ publishedAt: 'desc' }],
    take,
  });

  const total = await prisma.post.count({ where });

  return {
    matched: total,
    returned: rows.length,
    posts: rows.map((row) => ({
      id: row.id,
      account: row.account.name,
      platform: row.platform.name,
      date: row.publishedAt?.toISOString().slice(0, 16) ?? null,
      stance: row.sentiment,
      engagement: row.engagementTotal,
      likes: row.likes,
      comments: row.comments,
      shares: row.shares,
      target: row.analysis?.target ?? null,
      subject: row.analysis?.subject ?? null,
      text: (row.text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT),
      url: row.url,
    })),
  };
}

async function getPost(ctx: ToolContext, args: { postId: string }) {
  const post = await prisma.post.findFirst({
    where: { id: args.postId, isHidden: false, ...accountFilter(ctx) },
    select: {
      id: true,
      text: true,
      url: true,
      publishedAt: true,
      sentiment: true,
      engagementTotal: true,
      likes: true,
      comments: true,
      shares: true,
      views: true,
      hashtags: true,
      detectedKeywords: true,
      account: { select: { name: true } },
      platform: { select: { name: true } },
      topic: { select: { name: true } },
      analysis: {
        select: {
          target: true,
          subject: true,
          rationale: true,
          evidence: true,
          isMixed: true,
          isRelayedCriticism: true,
          confidence: true,
          riskFlags: true,
        },
      },
    },
  });

  // المنشور خارج النطاق يُعامَل كغير موجود، فلا يفرّق الردّ بين ممنوع ومفقود
  if (!post) return { found: false };

  return {
    found: true,
    post: {
      ...post,
      publishedAt: post.publishedAt?.toISOString() ?? null,
      text: (post.text ?? '').slice(0, 4000),
    },
  };
}

async function compareAccounts(
  ctx: ToolContext,
  args: { accountIds: string[]; from?: string; to?: string },
) {
  const ids = intersectScope(ctx.scope, args.accountIds ?? []);
  if (ids !== null && ids.length === 0) {
    return { comparison: [], note: 'لا حسابات ضمن نطاقك بهذه المعرّفات' };
  }

  const where: Prisma.PostWhereInput = {
    isHidden: false,
    publishedAt: range(args.from, args.to),
    ...(ids === null ? {} : { accountId: { in: ids } }),
  };

  const [grouped, accounts] = await Promise.all([
    prisma.post.groupBy({
      by: ['accountId', 'sentiment'],
      where,
      _count: { _all: true },
      _sum: { engagementTotal: true },
    }),
    prisma.account.findMany({
      where: ids === null ? {} : { id: { in: ids } },
      select: { id: true, name: true, platform: { select: { name: true } } },
      take: MAX_ROWS,
    }),
  ]);

  return {
    from: range(args.from, args.to).gte.toISOString().slice(0, 10),
    to: range(args.from, args.to).lte.toISOString().slice(0, 10),
    comparison: accounts.map((account) => {
      const rows = grouped.filter((g) => g.accountId === account.id);
      const posts = rows.reduce((sum, r) => sum + r._count._all, 0);
      return {
        account: account.name,
        platform: account.platform.name,
        posts,
        engagement: rows.reduce((sum, r) => sum + (r._sum.engagementTotal ?? 0), 0),
        negative: rows.find((r) => r.sentiment === 'NEGATIVE')?._count._all ?? 0,
        positive: rows.find((r) => r.sentiment === 'POSITIVE')?._count._all ?? 0,
        neutral: rows.find((r) => r.sentiment === 'NEUTRAL')?._count._all ?? 0,
      };
    }),
  };
}

// ══════════════════ التعريفات المرسَلة إلى النموذج ══════════════════

const DATE_DESC = 'تاريخ بصيغة YYYY-MM-DD. اتركه فارغاً للافتراضي (آخر ٣٠ يوماً).';

/*
 * `strict: false` عن قصد.
 *
 * الوضع الصارم يُلزم بذكر كلّ حقل في كل نداء، فيضطرّ النموذج إلى تمرير
 * `null` لكلّ مرشّح لا يريده — ونداءٌ بعشرة حقول فارغة أكثر عرضةً للخطأ
 * من نداءٍ بحقلين. والمرشّحات هنا اختيارية بطبعها.
 */
export const ASSISTANT_TOOLS = [
  {
    type: 'function' as const,
    name: 'list_accounts',
    description:
      'قائمة الحسابات المرصودة المتاحة للقارئ، بأسمائها ومنصّاتها ومجموعاتها. استعملها أولاً لتحويل اسم حساب ذكره المستخدم إلى معرّف قبل استعمال الأدوات الأخرى.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        search: { type: 'string', description: 'جزء من اسم الحساب للترشيح' },
      },
    },
  },
  {
    type: 'function' as const,
    name: 'get_stats',
    description:
      'أرقام مجمّعة لأي مدى زمني: عدد المنشورات والتفاعل، مجمّعةً حسب اليوم أو الحساب أو المنصة أو الموقف. استعملها لكل سؤال عن أرقام أو اتجاهات أو مقارنة فترات.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        from: { type: 'string', description: DATE_DESC },
        to: { type: 'string', description: DATE_DESC },
        accountIds: { type: 'array', items: { type: 'string' } },
        platformCode: { type: 'string', description: 'facebook أو x أو instagram' },
        groupBy: { type: 'string', enum: ['day', 'account', 'platform', 'sentiment', 'total'] },
      },
    },
  },
  {
    type: 'function' as const,
    name: 'search_posts',
    description:
      'بحث في نصوص المنشورات وهاشتاغاتها وكلماتها المكتشفة، مع ترشيح بالمدى والحساب والمنصة والموقف. استعملها لكل سؤال عن موضوع بعينه أو عن أبرز المنشورات.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string', description: 'كلمة أو عبارة تُبحث في نصّ المنشور' },
        from: { type: 'string', description: DATE_DESC },
        to: { type: 'string', description: DATE_DESC },
        accountIds: { type: 'array', items: { type: 'string' } },
        platformCode: { type: 'string' },
        sentiment: { type: 'string', enum: ['POSITIVE', 'NEGATIVE', 'NEUTRAL', 'UNKNOWN'] },
        sortBy: { type: 'string', enum: ['recent', 'engagement'] },
        limit: { type: 'integer', description: 'حتى ٥٠' },
      },
    },
  },
  {
    type: 'function' as const,
    name: 'get_post',
    description: 'النصّ الكامل لمنشور واحد بمعرّفه، مع تحليله وتفاعله.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { postId: { type: 'string' } },
      required: ['postId'],
    },
  },
  {
    type: 'function' as const,
    name: 'compare_accounts',
    description:
      'مقارنة حسابين أو أكثر في المدى نفسه: عدد المنشورات والتفاعل وتوزيع الموقف لكلٍّ منها.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        accountIds: { type: 'array', items: { type: 'string' } },
        from: { type: 'string', description: DATE_DESC },
        to: { type: 'string', description: DATE_DESC },
      },
      required: ['accountIds'],
    },
  },
];

export type ToolName = (typeof ASSISTANT_TOOLS)[number]['name'];

/**
 * تنفيذ نداء أداة.
 *
 * لا يرمي أبداً: الخطأ يُعاد إلى النموذج نصّاً ليقرأه ويتصرّف — يصحّح
 * معاملاته أو يقول للمستخدم ما تعذّر. ورميُه هنا يُسقط المحادثة كلها
 * لأجل نداءٍ واحد أخطأ في تاريخ.
 */
export async function runTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  try {
    switch (name) {
      case 'list_accounts':
        return await listAccounts(ctx, args as { search?: string });
      case 'get_stats':
        return await getStats(ctx, args as Parameters<typeof getStats>[1]);
      case 'search_posts':
        return await searchPosts(ctx, args as Parameters<typeof searchPosts>[1]);
      case 'get_post':
        return await getPost(ctx, args as { postId: string });
      case 'compare_accounts':
        return await compareAccounts(ctx, args as Parameters<typeof compareAccounts>[1]);
      default:
        return { error: `أداة غير معروفة: ${name}` };
    }
  } catch (error) {
    console.error(`[assistant-tools] فشلت الأداة ${name}:`, error);
    return {
      error: 'تعذّر تنفيذ هذا الاستعلام. راجع المعاملات أو جرّب مدى أضيق.',
    };
  }
}

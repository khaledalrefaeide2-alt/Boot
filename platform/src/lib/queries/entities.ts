import 'server-only';
import type { EntityType, Prisma } from '@/generated/prisma';
import { prisma } from '@/lib/db';
import type { AccountScope } from '@/lib/auth/account-scope';
import type { ListEntitiesInput } from '@/lib/validation/entities';
import type { PostFilters } from '@/lib/validation/posts';
import { entityKey } from '@/lib/analysis/entities';
import { buildPostWhere } from './posts';

/*
 * استعلامات الكيانات.
 *
 * ★ كلّ عددٍ هنا يُحسب من المنشورات المرئية للقارئ ضمن فلاتره.
 *
 *   ولا يُقرأ عدّادٌ مخزَّن على الكيان. جدول `entities` يحمل الاسم والنوع
 *   ولا يحمل رقماً: من نطاقه ثلاثة حسابات يجب أن يرى «وزارة الكهرباء» في
 *   منشورات هذه الثلاثة وحدها، ومن يفتح آخر سبعة أيام يرى عدد الأسبوع.
 *   والعمود الواحد لا يحمل إلا رقماً واحداً، فيعرض لكليهما رقم المنصّة —
 *   وهو في الحالة الأولى تسريبُ حجمِ ما لا يراه.
 *
 *   والشرط يُبنى بـ`buildPostWhere` نفسها التي تبني شاشة المنشورات، لا
 *   بنسخةٍ ثانية منها: لو كُتب هنا شرطٌ موازٍ لانحرف الرقمان عند أوّل
 *   فلتر يُضاف إلى أحدهما، ولظهر «٣٢٠ منشوراً» في شاشة و«٣٠٤» في أخرى
 *   بلا تفسير.
 */

export interface EntityListItem {
  id: string;
  name: string;
  type: EntityType;
  /** عدد المنشورات التي ذُكر فيها ضمن الفلاتر الحالية */
  posts: number;
  negative: number;
  positive: number;
}

/**
 * ضمّ شرطين على المنشور بلا أن يمحو أحدهما الآخر.
 *
 * النشر (`...where`) يستبدل المفتاح المكرّر: مستخدمٌ رشّح «الإيجابي» ثم
 * نُشر فوقه `sentiment: 'NEGATIVE'` لحساب السلبي يحصل على عدد السلبي في
 * كلّ المنشورات لا على صفرٍ كما يقتضي ترشيحه. و`AND` يجمع الشرطين معاً
 * فيعطي الصفر الصحيح.
 */
function and(
  where: Prisma.PostWhereInput,
  extra: Prisma.PostWhereInput,
): Prisma.PostWhereInput {
  return { AND: [where, extra] };
}

/** عدد المنشورات لكلّ كيان تحت شرطٍ ما */
async function countByEntity(
  where: Prisma.PostEntityWhereInput,
): Promise<Map<string, number>> {
  const rows = await prisma.postEntity.groupBy({
    by: ['entityId'],
    where,
    _count: { entityId: true },
  });
  return new Map(rows.map((row) => [row.entityId, row._count.entityId]));
}

/**
 * ترتيب الكيانات بعدد المنشورات التي ذُكرت فيها.
 *
 * الطبقة المشتركة بين شاشة الكيانات وأداة المساعد: كلتاهما تسأل السؤال
 * نفسه بشرطٍ مختلف، فتُكتب مرّةً وتُستدعى مرّتين. ولو كُتبت مرّتين لأجاب
 * المساعد برقمٍ يخالف ما تعرضه الشاشة لصاحبه في اللحظة نفسها.
 *
 * `rankWhere` شرط الترتيب، و`postWhere` شرط العدّ. وهما مختلفان حين
 * يُطلب «الأكثر ذكراً سلبياً»: يقع الترتيب على السلبي وحده، ويبقى
 * «المنشورات» عدداً كاملاً — وإلا قرأ القارئ عدد السلبي تحت عنوان
 * «المنشورات».
 */
export async function rankEntities(options: {
  postWhere: Prisma.PostWhereInput;
  rankWhere?: Prisma.PostWhereInput;
  entityWhere?: Prisma.EntityWhereInput;
  skip?: number;
  take: number;
}): Promise<{ entities: EntityListItem[]; hasMore: boolean }> {
  const { postWhere, rankWhere = postWhere, entityWhere, take, skip = 0 } = options;
  const hasEntityFilter = entityWhere !== undefined && Object.keys(entityWhere).length > 0;

  const ranked = await prisma.postEntity.groupBy({
    by: ['entityId'],
    where: { post: rankWhere, ...(hasEntityFilter ? { entity: entityWhere } : {}) },
    _count: { entityId: true },
    orderBy: { _count: { entityId: 'desc' } },
    skip,
    take: take + 1,
  });

  const hasMore = ranked.length > take;
  const ids = ranked.slice(0, take).map((row) => row.entityId);
  if (ids.length === 0) return { entities: [], hasMore: false };

  const scoped = { entityId: { in: ids } };
  const [rows, totals, negatives, positives] = await Promise.all([
    prisma.entity.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, type: true },
    }),
    countByEntity({ ...scoped, post: postWhere }),
    countByEntity({ ...scoped, post: and(postWhere, { sentiment: 'NEGATIVE' }) }),
    countByEntity({ ...scoped, post: and(postWhere, { sentiment: 'POSITIVE' }) }),
  ]);

  const byId = new Map(rows.map((row) => [row.id, row]));

  // الترتيب من `ranked` لا من `findMany`: الأخيرة تعيد بترتيب القاعدة
  const entities = ids.flatMap((id) => {
    const row = byId.get(id);
    if (!row) return [];
    return [
      {
        id: row.id,
        name: row.name,
        type: row.type,
        posts: totals.get(id) ?? 0,
        negative: negatives.get(id) ?? 0,
        positive: positives.get(id) ?? 0,
      },
    ];
  });

  return { entities, hasMore };
}

/**
 * قائمة شاشة الكيانات.
 *
 * ولا يُعاد عددٌ كلّي للصفحات. عدّ الكيانات المميَّزة تحت الفلاتر يمرّ على
 * جدول الربط كلّه ليُرجع رقماً يُقرأ ولا يُستعمل، فيُجلب عنصرٌ زائد بدله:
 * وجودُه يعني أنّ بعده مزيداً، وهو كلّ ما يحتاجه التمرير.
 */
export async function listEntities(
  filters: ListEntitiesInput,
  scope: AccountScope,
): Promise<{ entities: EntityListItem[]; page: number; pageSize: number; hasMore: boolean }> {
  const postWhere = buildPostWhere(filters, scope);

  const { entities, hasMore } = await rankEntities({
    postWhere,
    rankWhere:
      filters.sort === 'negative' ? and(postWhere, { sentiment: 'NEGATIVE' }) : postWhere,
    entityWhere: {
      ...(filters.type ? { type: filters.type } : {}),
      /*
       * البحث على المفتاح المطبَّع لا على الاسم المعروض.
       *
       * من يكتب «وزارة الكهرباء» بالهمزة يجب أن يجد ما كُتب بلا همزة —
       * وهو الغرض الذي وُجد المفتاح من أجله. والبحث على `name` يعيد صورةً
       * واحدة ويترك القارئ يظنّ أنّ الباقي غير موجود.
       */
      ...(filters.name ? { key: { contains: entityKey(filters.name) } } : {}),
    },
    skip: (filters.page - 1) * filters.pageSize,
    take: filters.pageSize,
  });

  return { entities, page: filters.page, pageSize: filters.pageSize, hasMore };
}

export interface EntitySummary {
  id: string;
  name: string;
  type: EntityType;
  posts: number;
  engagement: number;
  sentiment: { positive: number; negative: number; neutral: number; unknown: number };
  lastPostAt: Date | null;
  accounts: { id: string; name: string; posts: number }[];
}

/**
 * ملخّص كيانٍ واحد ضمن فلاتر القارئ.
 *
 * ★ الكيان الذي لا يظهر في نطاق القارئ غير موجود بالنسبة إليه.
 *
 *   جدول الكيانات عامّ لا مقسَّم على النطاقات، فـ`findUnique` تجده لمن
 *   لا يرى أيّاً من منشوراته. وإعادة صفٍّ بأصفارٍ تؤكّد وجود الاسم في
 *   المنصة، وهي معلومةٌ لا يملكها صاحب النطاق المحدود. فيُعاد `null`
 *   ويُقرأ في المسار «غير موجود» — الجواب نفسه الذي يُعطى لمعرّف مختلق.
 */
export async function entitySummary(
  entityId: string,
  filters: PostFilters,
  scope: AccountScope,
): Promise<EntitySummary | null> {
  const entity = await prisma.entity.findUnique({
    where: { id: entityId },
    select: { id: true, name: true, type: true },
  });
  if (!entity) return null;

  const where = buildPostWhere({ ...filters, entityId }, scope);

  const [groups, totals, latest, accountGroups] = await Promise.all([
    prisma.post.groupBy({ by: ['sentiment'], where, _count: { _all: true } }),
    prisma.post.aggregate({ where, _count: { _all: true }, _sum: { engagementTotal: true } }),
    prisma.post.findFirst({
      where,
      orderBy: { publishedAt: 'desc' },
      select: { publishedAt: true },
    }),
    prisma.post.groupBy({
      by: ['accountId'],
      where,
      _count: { _all: true },
      orderBy: { _count: { accountId: 'desc' } },
      take: 5,
    }),
  ]);

  /*
   * الفلاتر تحدّ النطاق الزمني، والكيان قد يكون قديماً.
   *
   * فصفرُ منشورات هنا لا يعني بالضرورة كياناً خارج النطاق — قد يعني
   * نافذةً لم يُذكر فيها. ومع ذلك يُعاد `null`: الفرق بين «لا يخصّك» و«لا
   * منشور له هذا الشهر» هو نفسه ما لا نريد كشفه، والقارئ يوسّع النافذة
   * فيراه إن كان من نطاقه.
   */
  if (totals._count._all === 0) return null;

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

  return {
    ...entity,
    posts: totals._count._all,
    engagement: totals._sum.engagementTotal ?? 0,
    sentiment: {
      positive: count('POSITIVE'),
      negative: count('NEGATIVE'),
      neutral: count('NEUTRAL'),
      unknown: totals._count._all - count('POSITIVE') - count('NEGATIVE') - count('NEUTRAL'),
    },
    lastPostAt: latest?.publishedAt ?? null,
    accounts: accountGroups.flatMap((group) => {
      const name = accountName.get(group.accountId);
      return name ? [{ id: group.accountId, name, posts: group._count._all }] : [];
    }),
  };
}

import { prisma } from '@/lib/db';
import { jsonError, jsonOk, requirePermission } from '@/lib/api';
import { PERMISSIONS } from '@/lib/auth/rbac';
import { getAccountScope } from '@/lib/auth/account-scope';

/** خيارات الفلاتر المشتركة لكل شاشات الرصد */
export async function GET() {
  try {
    await requirePermission(PERMISSIONS.POSTS_VIEW);

    // قوائم الفلاتر تكشف أسماء الحسابات، فتُحصر بنطاق المستخدم كذلك
    const scope = await getAccountScope();

    const [platforms, accounts, groups, topics, keywords, searchTopics] = await Promise.all([
      prisma.platform.findMany({
        // منصة بلا حساب واحد داخل النطاق لا معنى لظهورها في الفلتر،
        // ووجودها وحده يقول إن هناك رصداً عليها لا يراه المستخدم
        where: {
          status: 'ACTIVE',
          ...(scope === null ? {} : { accounts: { some: { id: { in: scope } } } }),
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, code: true, color: true },
      }),
      prisma.account.findMany({
        where: { status: 'ACTIVE', ...(scope === null ? {} : { id: { in: scope } }) },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, platformId: true, groupId: true },
      }),
      /*
       * المجموعات لا تُحصر بنطاق المستخدم.
       *
       * المجموعة تصنيف تنظيمي لا بيانات رصد: اسمها لا يكشف حساباً ولا
       * منشوراً. وحصرها بما يراه المستخدم يُخفي مجموعة فارغة عنده فيظنّها
       * غير موجودة، ثم تظهر فجأةً حين يُسنَد إليه حساب منها.
       */
      prisma.accountGroup.findMany({
        where: { status: 'ACTIVE' },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, code: true },
      }),
      prisma.topic.findMany({
        where: { status: 'ACTIVE' },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, color: true },
      }),
      prisma.keyword.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { term: 'asc' },
        select: { id: true, term: true },
        take: 300,
      }),
      /*
       * مواضيع البحث لا تُحصر بنطاق المستخدم.
       *
       * الموضوع سطرُ بحثٍ لا بيانات: اسمُه وسطرُه لا يكشفان حساباً ولا
       * منشوراً. والنطاق يُطبَّق على النتيجة لا على الأداة — فمن نطاقه
       * ثلاثة حسابات يرى الموضوع نفسه ويرى منشورات الثلاثة وحدها.
       */
      prisma.searchTopic.findMany({
        where: { status: 'ACTIVE' },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, query: true, color: true },
      }),
    ]);

    return jsonOk({ platforms, accounts, groups, topics, keywords, searchTopics });
  } catch (error) {
    return jsonError(error);
  }
}

import 'server-only';
import type { Prisma } from '@/generated/prisma';
import type { PostFilters } from '@/lib/validation/posts';
import { resolveDateRange } from '@/lib/validation/common';
import { intersectScope, type AccountScope } from '@/lib/auth/account-scope';

/** تحويل قيمة قد تكون نصاً أو مصفوفة إلى مصفوفة نظيفة */
function toArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).filter(Boolean);
}

/**
 * بناء شرط Prisma الموحّد من فلاتر المنشورات.
 * يُستخدم في العرض والإحصاءات والتصدير معاً، فلا تختلف النتائج بينها.
 *
 * `scope` إلزامي لا اختياري: هو الحاجز الذي يمنع مستخدماً مقيّداً من رؤية
 * بيانات حساب خارج نطاقه. لو كان اختيارياً لصار كل موضع استدعاء منسيّ
 * تسريباً صامتاً؛ وبكونه إلزامياً يصير خطأ تصريف يظهر قبل التشغيل.
 */
export function buildPostWhere(
  filters: PostFilters,
  scope: AccountScope,
): Prisma.PostWhereInput {
  const { from, to } = resolveDateRange({
    range: filters.range,
    from: filters.from,
    to: filters.to,
  });

  const platformIds = toArray(filters.platformId);
  // الحصر على تقاطع ما طُلب مع ما هو مسموح، فلا يُتجاوز النطاق بمعامل طلب
  const accountIds = intersectScope(scope, toArray(filters.accountId));

  const where: Prisma.PostWhereInput = {
    ...(filters.includeHidden === 'true' ? {} : { isHidden: false }),
    ...(platformIds.length === 1 ? { platformId: platformIds[0] } : {}),
    ...(platformIds.length > 1 ? { platformId: { in: platformIds } } : {}),
    ...(accountIds === null ? {} : { accountId: { in: accountIds } }),
    ...(filters.postType ? { postType: filters.postType } : {}),
    ...(filters.language ? { language: filters.language } : {}),
    ...(filters.topicId ? { topicId: filters.topicId } : {}),
    ...(filters.sentiment ? { sentiment: filters.sentiment } : {}),
    ...(filters.country ? { country: { contains: filters.country, mode: 'insensitive' } } : {}),
    ...(filters.hashtag ? { hashtags: { has: filters.hashtag.replace(/^#/, '') } } : {}),
    ...(filters.keywordId ? { keywordLinks: { some: { keywordId: filters.keywordId } } } : {}),
  };

  if (from || to) {
    where.publishedAt = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
  }

  // البحث النصي داخل نص المنشور واسم الحساب والهاشتاغات والكلمات المكتشفة
  if (filters.q) {
    const term = filters.q.trim();
    where.OR = [
      { text: { contains: term, mode: 'insensitive' } },
      { authorName: { contains: term, mode: 'insensitive' } },
      { account: { name: { contains: term, mode: 'insensitive' } } },
      { hashtags: { has: term.replace(/^#/, '') } },
      { detectedKeywords: { has: term } },
    ];
  }

  return where;
}

/** الحقول المعروضة في قوائم المنشورات */
export const POST_LIST_SELECT = {
  id: true,
  externalId: true,
  url: true,
  text: true,
  publishedAt: true,
  postType: true,
  language: true,
  country: true,
  location: true,
  authorName: true,
  imageUrl: true,
  videoUrl: true,
  thumbnailUrl: true,
  mediaUrls: true,
  likes: true,
  comments: true,
  shares: true,
  views: true,
  saves: true,
  engagementTotal: true,
  sentiment: true,
  sentimentScore: true,
  hashtags: true,
  detectedKeywords: true,
  isHidden: true,
  createdAt: true,
  account: { select: { id: true, name: true, url: true } },
  platform: { select: { id: true, name: true, code: true, color: true } },
  topic: { select: { id: true, name: true, color: true } },
} satisfies Prisma.PostSelect;

export type PostListItem = Prisma.PostGetPayload<{ select: typeof POST_LIST_SELECT }>;

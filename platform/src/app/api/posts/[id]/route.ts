import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import {
  errors,
  guardMutationRate,
  jsonError,
  jsonOk,
  parseBody,
  requireCsrf,
  requirePermission,
} from '@/lib/api';
import { PERMISSIONS, can } from '@/lib/auth/rbac';
import { updatePostSchema } from '@/lib/validation/posts';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';
import { refreshStatsAfterImport } from '@/lib/stats';
import { getAccountScope, scopeAllows } from '@/lib/auth/account-scope';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requirePermission(PERMISSIONS.POSTS_VIEW);
    const { id } = await params;

    const post = await prisma.post.findUnique({
      where: { id },
      include: {
        account: { select: { id: true, name: true, url: true, followersCount: true } },
        platform: { select: { id: true, name: true, code: true, color: true } },
        topic: { select: { id: true, name: true, color: true } },
        keywordLinks: { include: { keyword: { select: { id: true, term: true } } } },
        reviewedBy: { select: { name: true } },
        extractionRun: { select: { id: true, createdAt: true, actorId: true } },
      },
    });
    if (!post) throw errors.notFound('المنشور غير موجود');

    /*
     * الحصر يُطبَّق بعد الجلب لا في الشرط: نُعيد «غير موجود» لا «ممنوع»،
     * فلا يستدل المستخدم من الفرق على وجود منشور لحساب خارج نطاقه.
     */
    const scope = await getAccountScope();
    if (!scopeAllows(scope, post.accountId)) throw errors.notFound('المنشور غير موجود');
    if (post.isHidden && !can(user, PERMISSIONS.POSTS_REVIEW)) {
      throw errors.notFound('المنشور غير موجود');
    }

    // البيانات الخام لا تُعرض إلا لمن يملك صلاحية المراجعة
    const { rawData, ...safe } = post;
    return jsonOk({ post: can(user, PERMISSIONS.POSTS_REVIEW) ? { ...safe, rawData } : safe });
  } catch (error) {
    return jsonError(error);
  }
}

/** مراجعة المنشور: تصنيف، تصحيح مشاعر، إخفاء أو استعادة */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const actor = await requirePermission(PERMISSIONS.POSTS_REVIEW);
    await requireCsrf();
    await guardMutationRate(actor.id);

    const { id } = await params;
    const input = await parseBody(request, updatePostSchema);

    const existing = await prisma.post.findUnique({
      where: { id },
      select: { id: true, accountId: true, platformId: true, publishedAt: true, isHidden: true },
    });
    if (!existing) throw errors.notFound('المنشور غير موجود');
    // المراجعة تتبع الاطلاع: من لا يرى منشور الحساب لا يعدّله
    if (!scopeAllows(await getAccountScope(), existing.accountId)) {
      throw errors.notFound('المنشور غير موجود');
    }

    const post = await prisma.post.update({
      where: { id },
      data: {
        ...(input.topicId !== undefined
          ? { topicId: input.topicId, topicSource: input.topicId ? 'MANUAL' : null }
          : {}),
        ...(input.sentiment !== undefined
          ? { sentiment: input.sentiment, sentimentSource: 'MANUAL' }
          : {}),
        ...(input.isHidden !== undefined ? { isHidden: input.isHidden } : {}),
        ...(input.reviewNote !== undefined ? { reviewNote: input.reviewNote } : {}),
        reviewedAt: new Date(),
        reviewedById: actor.id,
      },
      select: { id: true, isHidden: true, sentiment: true, topicId: true },
    });

    // الإخفاء يغيّر الإحصاءات لأنها تستثني المخفي
    if (input.isHidden !== undefined && input.isHidden !== existing.isHidden) {
      await refreshStatsAfterImport(existing.accountId, existing.platformId, [existing.publishedAt]);
    }

    await audit(actor, {
      action:
        input.isHidden === true
          ? AUDIT_ACTIONS.POST_HIDDEN
          : input.isHidden === false
            ? AUDIT_ACTIONS.POST_RESTORED
            : AUDIT_ACTIONS.POST_UPDATED,
      entityType: 'post',
      entityId: id,
      summary: 'مراجعة منشور',
      metadata: input as never,
    });

    return jsonOk({ post });
  } catch (error) {
    return jsonError(error);
  }
}

/** حذف نهائي — للبيانات غير الصالحة فقط */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const actor = await requirePermission(PERMISSIONS.POSTS_DELETE);
    await requireCsrf();
    await guardMutationRate(actor.id);

    const { id } = await params;
    const post = await prisma.post.findUnique({
      where: { id },
      select: { id: true, accountId: true, platformId: true, publishedAt: true, url: true },
    });
    if (!post) throw errors.notFound('المنشور غير موجود');
    if (!scopeAllows(await getAccountScope(), post.accountId)) {
      throw errors.notFound('المنشور غير موجود');
    }

    await prisma.post.delete({ where: { id } });
    await refreshStatsAfterImport(post.accountId, post.platformId, [post.publishedAt]);

    await audit(actor, {
      action: AUDIT_ACTIONS.POST_DELETED,
      entityType: 'post',
      entityId: id,
      summary: 'حذف منشور نهائياً',
      metadata: { url: post.url },
    });

    return jsonOk({ deleted: true });
  } catch (error) {
    return jsonError(error);
  }
}

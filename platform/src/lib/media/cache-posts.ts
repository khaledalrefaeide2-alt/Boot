import 'server-only';
import { prisma } from '@/lib/db';
import { isFetchableMedia, storeThumbnail } from '@/lib/media/store';
import type { Prisma } from '@/generated/prisma';

/**
 * حفظ مصغّرات دفعة من المنشورات.
 *
 * تُستدعى بعد كل استيراد — وهي اللحظة الوحيدة التي يكون فيها رابط الصورة
 * حيّاً بيقين — وتُستدعى من المكنسة الخلفية ومن سكربت الجلب الرجعي.
 *
 * ★ وكلّ محاولة تُسجَّل، نجحت أو فشلت.
 *
 *   قبلها كانت المحاولة الفاشلة لا تترك أثراً: المنشور يبقى بلا مفتاح،
 *   ولا أحد يعرف أحاول النظامُ وفشل أم لم يحاول أصلاً. فلا يُعاد إليه،
 *   ولا يُقال إنّه فُقد. وبعد أسبوع يكون الرابط قد مات فلا سبيل إلى
 *   استرجاعه — والصفحة تعرض «تعذّر عرض الوسائط» بلا أن يعرف أحد لماذا.
 */

/*
 * أربعة طلبات معاً.
 *
 * التسلسل يجعل مئة صورة دقيقتين، والتوازي المفتوح يفتح مئة مقبس على خوادم
 * المنصة دفعةً فتُبطئ أو تحجب. والأربعة وسطٌ يُنهي المئة في نحو نصف دقيقة
 * بلا أن يبدو هجوماً.
 */
const CONCURRENCY = 4;

export interface CacheResult {
  attempted: number;
  stored: number;
  /** فشلٌ عابر — يُعاد إليه في دورة قادمة */
  retry: number;
  /** فشلٌ نهائي — رابط ميت أو محتوى محذوف، ولا يُعاد إليه */
  gone: number;
}

/**
 * منشورات تنتظر مصغّراتها.
 *
 * `mediaAttempts` دون الحدّ هو ما يجعل المجموعة تضيق: بدونه تعود المكنسة
 * في كلّ دورة إلى الروابط الميتة نفسها فلا تبلغ الحيّ منها أبداً.
 */
export function pendingMediaWhere(maxAttempts: number): Prisma.PostWhereInput {
  return {
    mediaKey: null,
    mediaAttempts: { lt: maxAttempts },
    OR: [{ thumbnailUrl: { not: null } }, { imageUrl: { not: null } }],
  };
}

/** كم منشوراً ما يزال ينتظر صورته */
export async function pendingMediaCount(maxAttempts: number): Promise<number> {
  return prisma.post.count({ where: pendingMediaWhere(maxAttempts) });
}

/** يجلب مصغّرات المنشورات المطابقة ويحفظ مفاتيحها */
export async function cachePostThumbnails(
  where: Prisma.PostWhereInput,
  limit = 200,
  maxAttempts = 4,
): Promise<CacheResult> {
  const posts = await prisma.post.findMany({
    where: { ...pendingMediaWhere(maxAttempts), AND: [where] },
    select: { id: true, thumbnailUrl: true, imageUrl: true },
    /*
     * الأحدث أوّلاً — وهو ترتيب إنقاذٍ لا عرض.
     *
     * روابط المنصات موقّعة تنتهي بعد ساعات إلى أيام. فمنشور اليوم رابطه
     * حيّ ويُنقذ الآن أو لا يُنقذ أبداً، ومنشور الشهر الماضي مات رابطه
     * على كلّ حال. والبدء بالأقدم ينفق المحاولات على الميّت ويترك الحيّ
     * يموت في الانتظار.
     */
    orderBy: { publishedAt: 'desc' },
    take: limit,
  });

  const targets = posts.map((post) => ({
    id: post.id,
    url: post.thumbnailUrl ?? post.imageUrl,
  }));

  const result: CacheResult = { attempted: 0, stored: 0, retry: 0, gone: 0 };
  let cursor = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor;
      cursor += 1;
      const target = targets[index];
      if (!target) return;

      const now = new Date();

      /*
       * الرابط غير الصالح يُسجَّل نهائياً ولا يُتخطّى.
       *
       * التخطّي الصامت كان يُبقيه في المجموعة إلى الأبد: يُقرأ في كلّ
       * دورة، ويُحسب في «ما ينتظر»، فلا يبلغ العدّاد صفراً أبداً — وهو
       * عين ما وقع في طابور التصنيف من قبل.
       */
      if (!isFetchableMedia(target.url)) {
        result.attempted += 1;
        result.gone += 1;
        await mark(target.id, { mediaAttempts: maxAttempts, mediaCheckedAt: now });
        continue;
      }

      result.attempted += 1;
      const outcome = await storeThumbnail(target.url);

      if (outcome.ok) {
        result.stored += 1;
        await mark(target.id, { mediaKey: outcome.key, mediaCheckedAt: now });
        continue;
      }

      if (outcome.permanent) {
        result.gone += 1;
        await mark(target.id, { mediaAttempts: maxAttempts, mediaCheckedAt: now });
      } else {
        result.retry += 1;
        await mark(target.id, { mediaAttempts: { increment: 1 }, mediaCheckedAt: now });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));
  return result;
}

/**
 * `updateMany` لا `update`: المنشور قد يكون حُذف بين الاستعلام والكتابة،
 * و`update` يرمي على صفٍّ غائب فيُسقط بقية الدفعة.
 */
async function mark(postId: string, data: Prisma.PostUpdateManyMutationInput): Promise<void> {
  await prisma.post.updateMany({ where: { id: postId }, data }).catch(() => undefined);
}

/** مصغّرات منشورات تشغيلٍ بعينه — تُستدعى فور انتهاء الاستيراد */
export async function cacheRunThumbnails(
  runId: string,
  limit = 400,
  maxAttempts = 4,
): Promise<CacheResult> {
  return cachePostThumbnails({ extractionRunId: runId }, limit, maxAttempts);
}

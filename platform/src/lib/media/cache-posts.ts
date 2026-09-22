import 'server-only';
import { prisma } from '@/lib/db';
import { isFetchableMedia, storeThumbnail } from '@/lib/media/store';
import type { Prisma } from '@/generated/prisma';

/**
 * حفظ مصغّرات دفعة من المنشورات.
 *
 * تُستدعى بعد كل استيراد — وهي اللحظة الوحيدة التي يكون فيها رابط الصورة
 * حيّاً بيقين. وتُستدعى كذلك من سكربت الجلب الرجعي، وهناك تنجح فيما لم
 * تنتهِ صلاحيته وتفشل فيما انتهى، وكلاهما متوقَّع.
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
  failed: number;
}

/** يجلب مصغّرات المنشورات المطابقة ويحفظ مفاتيحها */
export async function cachePostThumbnails(
  where: Prisma.PostWhereInput,
  limit = 200,
): Promise<CacheResult> {
  const posts = await prisma.post.findMany({
    where: {
      ...where,
      mediaKey: null,
      OR: [{ thumbnailUrl: { not: null } }, { imageUrl: { not: null } }],
    },
    select: { id: true, thumbnailUrl: true, imageUrl: true },
    orderBy: { publishedAt: 'desc' },
    take: limit,
  });

  const targets = posts
    .map((post) => ({ id: post.id, url: post.thumbnailUrl ?? post.imageUrl }))
    .filter((target): target is { id: string; url: string } => isFetchableMedia(target.url));

  const result: CacheResult = { attempted: targets.length, stored: 0, failed: 0 };
  let cursor = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor;
      cursor += 1;
      const target = targets[index];
      if (!target) return;

      const key = await storeThumbnail(target.url);
      if (!key) {
        result.failed += 1;
        continue;
      }

      /*
       * `updateMany` لا `update`: المنشور قد يكون حُذف بين الاستعلام
       * والكتابة، و`update` يرمي على صفٍّ غائب فيُسقط بقية الدفعة.
       */
      await prisma.post
        .updateMany({ where: { id: target.id }, data: { mediaKey: key } })
        .then(() => {
          result.stored += 1;
        })
        .catch(() => {
          result.failed += 1;
        });
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));
  return result;
}

/** مصغّرات منشورات تشغيلٍ بعينه — تُستدعى فور انتهاء الاستيراد */
export async function cacheRunThumbnails(runId: string, limit = 400): Promise<CacheResult> {
  return cachePostThumbnails({ extractionRunId: runId }, limit);
}

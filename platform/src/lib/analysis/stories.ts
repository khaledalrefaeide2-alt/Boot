import 'server-only';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@/generated/prisma';
import { prisma } from '@/lib/db';
import { embeddingDimensions, getAssistantConfig, isAssistantConfigured } from '@/lib/assistant/config';
import {
  mergeCentroid,
  normalizeVector,
  pickStory,
  type StoryCandidate,
} from './story-math';

/*
 * تجميع الأحداث.
 *
 * المنشورات تُعرض واحداً واحداً، فيظهر الحدث الواحد خمسين مرّة: خمسون
 * حساباً نقلوا الخبر نفسه، وكلٌّ منها بطاقةٌ مستقلّة تُقرأ من جديد.
 * والموظّف الذي يفتح الشاشة صباحاً لا يريد خمسين بطاقة — يريد أن يعرف
 * أنّ حدثاً واحداً جرى، وأنّ خمسين حساباً تناولوه، وأنّ ثلثهم انتقد.
 *
 * ★ والتجميع على ما دُفع ثمنه أصلاً.
 *
 *   المتّجهات موجودة للفهرسة الدلالية، والتجميع يقرأها ولا يُنشئ غيرها:
 *   لا نداء على المزوّد، ولا كلفة فوق كلفة الفهرسة. وهو الفرق بين ميزةٍ
 *   تعمل وميزةٍ تُطفأ في أوّل مراجعةٍ للفاتورة.
 *
 * ★ والنافذة الزمنية شرطٌ لا تحسين.
 *
 *   «انقطاع الكهرباء في حلب» يتكرّر كلّ شهر بنصٍّ متقارب جداً. وبلا نافذة
 *   يصير اثنا عشر حدثاً حدثاً واحداً يمتدّ سنة، ويُقرأ في الشاشة «حدث
 *   واحد، ٦٠٠ منشور» — وهو أسوأ من ألّا نجمّع أصلاً.
 */

/** دورة التجميع — أطول من دورة الفهرسة لأنها تقرأ ما فهرسته */
export const STORY_SWEEP_INTERVAL_MS = 10 * 60 * 1000;

/**
 * أقصى ما يُحمَّل من عناقيد مرشّحة في الدورة.
 *
 * كلّ مرشّح متّجهٌ بألفٍ وخمسمئة رقم يُقارَن بكلّ منشور في الدفعة. والحدّ
 * يجعل زمن الدورة معروفاً سلفاً بدل أن ينمو مع نموّ القاعدة حتى تبتلع
 * الدورةُ الفاصلَ بينها وبين تاليتها.
 */
const MAX_CANDIDATES = 1200;

/** أدنى عتبة وأقصاها — ما خرج عنهما خطأ ضبطٍ لا اختيار */
const MIN_THRESHOLD = 0.5;
const MAX_THRESHOLD = 0.95;

/** المنشورات المفهرسة التي لم تُجمَّع بعد */
export async function unclusteredCount(): Promise<number> {
  return prisma.post.count({
    where: { storyId: null, publishedAt: { not: null }, embeddings: { some: {} } },
  });
}

export type StorySweepOutcome =
  | { swept: false; reason: string }
  | { swept: true; assigned: number; created: number; remaining: number };

/**
 * دورة واحدة من مكنسة التجميع.
 *
 * لا ترمي أبداً — تعمل في مؤقّت بلا من يلتقط خطأها، والاستثناء الخارج
 * منها يسقط العامل الخلفي كله.
 */
export async function sweepStories(options: {
  batch: number;
  threshold: number;
  windowDays: number;
}): Promise<StorySweepOutcome> {
  try {
    if (!isAssistantConfigured()) return { swept: false, reason: 'مفتاح OpenAI غير معرّف' };

    const config = getAssistantConfig();
    const dims = embeddingDimensions(config.embedModel);
    const threshold = Math.min(MAX_THRESHOLD, Math.max(MIN_THRESHOLD, options.threshold));
    const windowMs = Math.max(1, options.windowDays) * 24 * 60 * 60 * 1000;

    /*
     * الأقدم أوّلاً.
     *
     * العنقود يتكوّن بالترتيب الزمني: أوّل منشور يفتحه، وما بعده ينضمّ
     * إليه. ولو عولجت الدفعة بترتيب عشوائي لتكوّنت عناقيد من المتأخّر
     * ثم انضمّ إليها السابق — والنتيجة نفسها في الأغلب، لكنّ النافذة
     * الزمنية تُحسب من حدود عنقودٍ تكوّن بالمصادفة لا بالتسلسل.
     */
    const posts = await prisma.post.findMany({
      where: {
        storyId: null,
        publishedAt: { not: null },
        embeddings: {
          some: { chunkIndex: 0, model: config.embedModel, ...(dims ? { dims } : {}) },
        },
      },
      select: {
        id: true,
        publishedAt: true,
        embeddings: {
          where: { chunkIndex: 0 },
          select: { embedding: true },
          take: 1,
        },
      },
      orderBy: { publishedAt: 'asc' },
      take: options.batch,
    });

    if (posts.length === 0) return { swept: false, reason: 'لا منشورات تنتظر التجميع' };

    const oldest = posts[0]!.publishedAt!.getTime();
    const newest = posts[posts.length - 1]!.publishedAt!.getTime();

    const existing = await prisma.story.findMany({
      where: {
        model: config.embedModel,
        lastPostAt: { gte: new Date(oldest - windowMs) },
        firstPostAt: { lte: new Date(newest + windowMs) },
      },
      select: { id: true, centroid: true, firstPostAt: true, lastPostAt: true },
      orderBy: { lastPostAt: 'desc' },
      take: MAX_CANDIDATES,
    });

    /*
     * عدد الأعضاء يُحسب ولا يُخزَّن.
     *
     * عمودٌ يُزاد عند كلّ ضمّ ينحرف عند أوّل دورةٍ تنقطع في منتصفها،
     * والانحراف يفسد المتوسّط المرجّح بلا أن يظهر في أيّ شاشة. والحساب
     * استعلامٌ واحد في أوّل الدورة يخدمها كلّها.
     */
    const counts = await prisma.post.groupBy({
      by: ['storyId'],
      where: { storyId: { in: existing.map((story) => story.id) } },
      _count: { _all: true },
    });
    const memberCount = new Map(
      counts.flatMap((row) => (row.storyId ? [[row.storyId, row._count._all]] : [])),
    );

    const candidates: StoryCandidate[] = existing.map((story) => ({
      id: story.id,
      centroid: story.centroid,
      members: memberCount.get(story.id) ?? 1,
      firstPostAt: story.firstPostAt,
      lastPostAt: story.lastPostAt,
    }));

    const created = new Map<string, StoryCandidate>();
    const touched = new Set<string>();
    const assignment: { postId: string; storyId: string }[] = [];

    for (const post of posts) {
      const vector = post.embeddings[0]?.embedding;
      const publishedAt = post.publishedAt;
      if (!vector || vector.length === 0 || !publishedAt) continue;

      const match = pickStory(vector, publishedAt, candidates, threshold, windowMs);

      if (match) {
        const { candidate } = match;
        candidate.centroid = mergeCentroid(candidate.centroid, candidate.members, vector);
        candidate.members += 1;
        if (publishedAt < candidate.firstPostAt) candidate.firstPostAt = publishedAt;
        if (publishedAt > candidate.lastPostAt) candidate.lastPostAt = publishedAt;
        if (!created.has(candidate.id)) touched.add(candidate.id);
        assignment.push({ postId: post.id, storyId: candidate.id });
        continue;
      }

      /*
       * عنقودٌ جديد بمعرّف يُولَّد هنا.
       *
       * ليكون مرشّحاً لبقيّة الدفعة قبل أن يُكتب: خمسون منشوراً عن خبرٍ
       * واحد تصل في دفعةٍ واحدة، ولو انتظر كلٌّ منها كتابةَ سابقه لصارت
       * خمسين عنقوداً من منشورٍ واحد.
       */
      const fresh: StoryCandidate = {
        id: randomUUID(),
        centroid: normalizeVector(vector),
        members: 1,
        firstPostAt: publishedAt,
        lastPostAt: publishedAt,
      };
      if (fresh.centroid.length === 0) continue;
      candidates.push(fresh);
      created.set(fresh.id, fresh);
      assignment.push({ postId: post.id, storyId: fresh.id });
    }

    if (assignment.length === 0) {
      return { swept: false, reason: 'لا متّجهات صالحة في هذه الدفعة' };
    }

    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));

    await prisma.$transaction(async (tx) => {
      if (created.size > 0) {
        await tx.story.createMany({
          data: [...created.values()].map((candidate) => ({
            id: candidate.id,
            centroid: candidate.centroid,
            model: config.embedModel,
            dims: candidate.centroid.length,
            firstPostAt: candidate.firstPostAt,
            lastPostAt: candidate.lastPostAt,
          })),
        });
      }

      for (const id of touched) {
        const candidate = byId.get(id);
        if (!candidate) continue;
        await tx.story.update({
          where: { id },
          data: {
            centroid: candidate.centroid,
            firstPostAt: candidate.firstPostAt,
            lastPostAt: candidate.lastPostAt,
          },
        });
      }

      /*
       * الإسناد جملةٌ واحدة لا جملةٌ لكلّ عنقود.
       *
       * دفعةٌ من مئتي منشور قد تتوزّع على مئة عنقود، فمئة `updateMany`
       * داخل معاملةٍ واحدة تُطيل قفلها بلا داعٍ. و`unnest` يُمرِّر
       * الزوجين مصفوفتين مربوطتين — بلا إدراجٍ نصّي ولا مجال للحقن.
       */
      await tx.$executeRaw(Prisma.sql`
        UPDATE "posts" AS p
        SET "storyId" = v."storyId"
        FROM (
          SELECT unnest(${assignment.map((row) => row.postId)}::text[])  AS "postId",
                 unnest(${assignment.map((row) => row.storyId)}::text[]) AS "storyId"
        ) AS v
        WHERE p."id" = v."postId"
      `);
    });

    const remaining = await unclusteredCount();

    return { swept: true, assigned: assignment.length, created: created.size, remaining };
  } catch (error) {
    console.error(
      '[stories] تعثّرت دورة التجميع:',
      error instanceof Error ? error.message : error,
    );
    return { swept: false, reason: 'خطأ غير متوقّع' };
  }
}

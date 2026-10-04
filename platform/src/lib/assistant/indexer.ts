import 'server-only';
import { prisma } from '@/lib/db';
import { generateEmbeddings } from './openai';
import { embeddingDimensions, getAssistantConfig, isAssistantConfigured } from './config';
import { NEWEST_FIRST } from '@/lib/queries/post-order';

/*
 * الفهرسة الدلالية — بناء متّجهات المنشورات.
 *
 * المساعد يقرأ نصوص المنشورات عبر هذه المتّجهات وحدها. وكانت تُبنى بأمرٍ
 * يدوي (`npm run reindex:embeddings`) لا يُشغّله أحد، فبقيت قاعدةٌ فيها
 * خمسة وخمسون ألف منشور بلا متّجه واحد — والمساعد يرى الأرقام ولا يقرأ
 * نصّاً، فيجيب عن «أهمّ المنشورات» بأن لا بيانات. وهو يقول الصدق عمّا
 * وصله: لم يصله شيء.
 *
 * فصار ما كان في السكربت هنا، يتقاسمه السكربت والمكنسة الخلفية معاً —
 * نسخةٌ واحدة من التقطيع ومن الكتابة، فلا يتغيّر أحدهما دون الآخر.
 */

const CHUNK_CHARS = 900;
const CHUNK_OVERLAP = 120;

/**
 * تقسيم النصّ الطويل.
 *
 * التقسيم على حدود الكلمات لا على عدد الحروف: قطعُ كلمة في منتصفها يُنتج
 * مقطعاً بلا معنى، ومتّجهاً يمثّل لا شيء. والتداخل بين المقاطع يمنع ضياع
 * فكرة تقع على الحدّ بين مقطعين.
 */
export function chunkText(text: string): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= CHUNK_CHARS) return clean ? [clean] : [];

  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + CHUNK_CHARS, clean.length);
    if (end < clean.length) {
      const boundary = clean.lastIndexOf(' ', end);
      if (boundary > start + CHUNK_CHARS / 2) end = boundary;
    }
    const piece = clean.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= clean.length) break;
    start = Math.max(end - CHUNK_OVERLAP, start + 1);
  }
  return chunks;
}

export interface IndexBatchResult {
  /** منشورات قُرئت في هذه الدفعة */
  processed: number;
  /** مقاطع كُتبت */
  inserted: number;
  /** منشورات بلا نصّ صالح */
  skipped: number;
  /** معرّف آخر منشور — يُمرَّر مؤشّراً للدفعة التالية */
  cursor: string | null;
}

/**
 * فهرسة دفعة واحدة من المنشورات.
 *
 * المؤشّر يُمرَّر من الخارج ويُعاد، فتتقدّم الحلقة ولا تعيد قراءة ما مرّ
 * عليه. والسكربت والمكنسة يستعملانها كلاهما.
 */
export async function indexBatch(options: {
  take: number;
  cursor?: string | null;
  /** إعادة الكلّ لا الناقص وحده */
  all?: boolean;
  /** حصر بالمنشورات المنشورة بعد هذا التاريخ */
  since?: Date | null;
}): Promise<IndexBatchResult> {
  const config = getAssistantConfig();

  const posts = await prisma.post.findMany({
    where: {
      text: { not: null },
      ...(options.since ? { publishedAt: { gte: options.since } } : {}),
      ...(options.all ? {} : { embeddings: { none: {} } }),
    },
    select: { id: true, text: true },
    /*
     * ★ الأحدث أوّلاً — وكان الأقدم، وهي العلّة نفسها التي أصابت جولة
     *   التحليل ومكنسة الأحداث قبلها.
     *
     *   الفهرسة الدلالية هي ما يقرأ به المساعد نصوص المنشورات. وبترتيبٍ
     *   تصاعديّ يبدأ بأقدم منشورٍ في القاعدة، فيُسأل المساعد عن منشورات
     *   اليوم ويجيب بأن لا بيانات — وهو يملك أرشيف السنة الماضية كاملاً.
     *   ولا يقول شيءٌ ما جرى: المكنسة تعمل، والعدّاد يتقدّم.
     */
    /*
     * ★ الأحدث أوّلاً — وكان الأقدم، وهي العلّة نفسها التي أصابت جولة
     *   التحليل ومكنسة الأحداث قبلها.
     *
     *   الفهرسة الدلالية هي ما يقرأ به المساعد نصوص المنشورات. وبترتيبٍ
     *   تصاعديّ تبدأ بأقدم منشورٍ في القاعدة، فيُسأل المساعد عن منشورات
     *   اليوم فيجيب بأن لا بيانات — وهو يملك أرشيف السنة الماضية كاملاً.
     *   ولا يقول شيءٌ ما جرى: المكنسة تعمل، والعدّاد يتقدّم.
     *
     * ★ وإعادةُ الفهرسة الكاملة وحدها تمشي بمؤشّر.
     *
     *   الفرق بين العملين جوهري: الطابور (`all: false`) مجموعةٌ تضيق —
     *   ما يُفهرَس يخرج منها — فتكفيه قراءةُ أوّلها في كلّ دورة، ويدخل
     *   الوارد الجديد في موضعه من الترتيب. وإعادة الفهرسة الكاملة
     *   مجموعةٌ ثابتة لا تضيق، فتحتاج مؤشّراً يتقدّم عليها.
     *
     *   والمؤشّر على `id` يقتضي ترتيباً على `id`: ترتيبٌ بحقلٍ ومؤشّرٌ
     *   بآخر يُكرّر صفوفاً ويُسقط أخرى صامتاً. ولا يضيرُ هنا — المطلوب
     *   تغطيةُ الكلّ مرّةً واحدة لا ترتيبُها.
     */
    orderBy: options.all ? [{ id: 'desc' }] : NEWEST_FIRST,
    take: options.take,
    ...(options.all && options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
  });

  if (posts.length === 0) return { processed: 0, inserted: 0, skipped: 0, cursor: null };

  const jobs: { postId: string; chunkIndex: number; chunkText: string }[] = [];
  let skipped = 0;

  for (const post of posts) {
    const pieces = chunkText(post.text ?? '');
    if (pieces.length === 0) {
      skipped += 1;
      continue;
    }
    pieces.forEach((piece, chunkIndex) => {
      jobs.push({ postId: post.id, chunkIndex, chunkText: piece });
    });
  }

  // ولا يُعاد المؤشّر إلا في الوضع الذي يستعمله، فلا يُغري غيره بترقيمٍ لا يصحّ
  const cursor = options.all ? posts[posts.length - 1]!.id : null;
  if (jobs.length === 0) {
    return { processed: posts.length, inserted: 0, skipped, cursor };
  }

  const vectors = await generateEmbeddings(jobs.map((job) => job.chunkText));

  // الكتابة معاملة واحدة: دفعةٌ نصفُها مكتوب أسوأ من دفعة فشلت كلها
  await prisma.$transaction(
    jobs.map((job, index) =>
      prisma.postEmbedding.upsert({
        where: { postId_chunkIndex: { postId: job.postId, chunkIndex: job.chunkIndex } },
        create: {
          postId: job.postId,
          chunkIndex: job.chunkIndex,
          chunkText: job.chunkText,
          embedding: vectors[index] ?? [],
          model: config.embedModel,
          dims: (vectors[index] ?? []).length,
        },
        update: {
          chunkText: job.chunkText,
          embedding: vectors[index] ?? [],
          model: config.embedModel,
          dims: (vectors[index] ?? []).length,
        },
      }),
    ),
  );

  return { processed: posts.length, inserted: jobs.length, skipped, cursor };
}

/**
 * حذف المتّجهات غير المتوافقة.
 *
 * صفوفٌ ولّدها نموذج آخر — أو بُعد آخر — لا تُقارَن بالجديدة، ووجودها
 * يضلّل البحث بصمت. فتُحذف صراحةً لا تُترك.
 */
export async function pruneIncompatible(): Promise<number> {
  const config = getAssistantConfig();
  const dims = embeddingDimensions(config.embedModel);

  const { count } = await prisma.postEmbedding.deleteMany({
    where: dims
      ? { OR: [{ model: { not: config.embedModel } }, { dims: { not: dims } }] }
      : { model: { not: config.embedModel } },
  });
  return count;
}

/** المنشورات التي لها نصّ ولا متّجه */
export async function unindexedCount(): Promise<number> {
  return prisma.post.count({ where: { text: { not: null }, embeddings: { none: {} } } });
}

export const INDEX_SWEEP_INTERVAL_MS = 3 * 60 * 1000;

export type IndexSweepOutcome =
  | { swept: false; reason: string }
  | { swept: true; processed: number; inserted: number; remaining: number };

/**
 * دورة واحدة من مكنسة الفهرسة.
 *
 * لا ترمي أبداً — تعمل في مؤقّت بلا من يلتقط خطأها، والاستثناء الخارج
 * منها يسقط العامل الخلفي كله.
 *
 * ودورتها أقصر من دورة التصنيف (ثلاث دقائق لا خمس) لأنها أرخص بكثير:
 * نموذج التضمين جزءٌ من ثمن نموذج المحادثة، والمقاطع تُرسَل دفعةً واحدة
 * لا واحداً واحداً.
 */
export async function sweepIndexing(options: {
  batch: number;
  dailyCap: number;
}): Promise<IndexSweepOutcome> {
  try {
    if (!isAssistantConfigured()) return { swept: false, reason: 'مفتاح OpenAI غير معرّف' };

    const remainingBefore = await unindexedCount();
    if (remainingBefore === 0) return { swept: false, reason: 'كل المنشورات مفهرسة' };

    let take = options.batch;
    if (options.dailyCap > 0) {
      const used = await indexedToday();
      if (used >= options.dailyCap) {
        return { swept: false, reason: `بُلغ سقف الفهرسة اليومي (${options.dailyCap})` };
      }
      take = Math.min(take, options.dailyCap - used);
    }

    /*
     * بلا مؤشّر — والحلقة لا تدور في مكانها رغم ذلك.
     *
     * الشرط `embeddings: { none: {} }` يُخرج المنشور من المجموعة بمجرّد
     * فهرسته، فالدفعة التالية تبدأ حيث انتهت هذه بطبيعتها. والمؤشّر هنا
     * كان سيضرّ: العامل يُعاد تشغيله فيضيع، فتُستأنف الفهرسة من الأول.
     *
     * والمنشور الذي يفشل تقطيعه (نصّ بلا كلمة) يبقى في المجموعة ويُقرأ
     * في كل دورة — وهو سعرٌ زهيد: يُعدّ متخطّى بلا استدعاء للمزوّد.
     */
    const result = await indexBatch({ take });
    const remaining = Math.max(0, remainingBefore - result.processed);

    return {
      swept: true,
      processed: result.processed,
      inserted: result.inserted,
      remaining,
    };
  } catch (error) {
    console.error(
      '[indexer] تعثّرت دورة الفهرسة:',
      error instanceof Error ? error.message : error,
    );
    return { swept: false, reason: 'خطأ غير متوقّع' };
  }
}

/** ما فُهرس في آخر أربع وعشرين ساعة — منه يُحسب السقف */
export async function indexedToday(): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return prisma.postEmbedding.count({ where: { createdAt: { gte: since } } });
}

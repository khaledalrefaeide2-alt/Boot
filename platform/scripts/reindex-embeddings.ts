/**
 * إعادة توليد المتّجهات الدلالية للمنشورات.
 *
 * التشغيل:
 *   npm run reindex:embeddings            # الناقص فقط
 *   npm run reindex:embeddings -- --all   # الكلّ من جديد
 *   npm run reindex:embeddings -- --days 30
 *
 * ويعمل على دفعات لسببين: حدّ الطلبات لدى المزوّد، وذاكرة العملية —
 * تحميل كل المنشورات دفعةً واحدة على قاعدة فيها مئات الآلاف يُسقط
 * العملية قبل أن تبدأ.
 */
import 'dotenv/config';
import { prisma } from '../src/lib/db';
import { generateEmbeddings } from '../src/lib/assistant/openai';
import { embeddingDimensions, getAssistantConfig, MISSING_KEY_MESSAGE } from '../src/lib/assistant/config';

const BATCH = 50;
const CHUNK_CHARS = 900;
const CHUNK_OVERLAP = 120;

/**
 * تقسيم النصّ الطويل.
 *
 * التقسيم على حدود الجُمل لا على عدد الحروف: قطعُ جملة في منتصفها يُنتج
 * مقطعاً بلا معنى، ومتّجهاً يمثّل لا شيء. والتداخل بين المقاطع يمنع ضياع
 * فكرة تقع على الحدّ بين مقطعين.
 */
function chunk(text: string): string[] {
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

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.error(`\n✗ ${MISSING_KEY_MESSAGE}\n`);
    process.exit(1);
  }

  const config = getAssistantConfig();
  const dims = embeddingDimensions(config.embedModel);
  const all = process.argv.includes('--all');
  const days = Number(arg('days') ?? '0');

  console.log('\n>> إعادة فهرسة المتّجهات');
  console.log(`   النموذج: ${config.embedModel}${dims ? ` (${dims} بُعداً)` : ''}`);
  console.log(`   الوضع: ${all ? 'إعادة الكلّ' : 'الناقص فقط'}`);

  /*
   * تنظيف غير المتوافق قبل البدء.
   *
   * صفوفٌ ولّدها نموذج آخر — أو بُعد آخر — لا تُقارَن بالجديدة، ووجودها
   * يضلّل البحث بصمت. فتُحذف صراحةً لا تُترك.
   */
  const stale = await prisma.postEmbedding.deleteMany({
    where: dims
      ? { OR: [{ model: { not: config.embedModel } }, { dims: { not: dims } }] }
      : { model: { not: config.embedModel } },
  });
  if (stale.count > 0) console.log(`   حُذف ${stale.count} متّجهاً غير متوافق`);

  if (all) {
    const wiped = await prisma.postEmbedding.deleteMany({});
    console.log(`   حُذف ${wiped.count} متّجهاً لإعادة التوليد`);
  }

  const since = days > 0 ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : undefined;

  let processed = 0;
  let inserted = 0;
  let skipped = 0;
  let cursor: string | undefined;

  for (;;) {
    const posts = await prisma.post.findMany({
      where: {
        text: { not: null },
        ...(since ? { publishedAt: { gte: since } } : {}),
        ...(all ? {} : { embeddings: { none: {} } }),
      },
      select: { id: true, text: true },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    if (posts.length === 0) break;
    cursor = posts[posts.length - 1]!.id;

    const jobs: { postId: string; chunkIndex: number; chunkText: string }[] = [];
    for (const post of posts) {
      const pieces = chunk(post.text ?? '');
      if (pieces.length === 0) {
        skipped += 1;
        continue;
      }
      pieces.forEach((chunkText, chunkIndex) => {
        jobs.push({ postId: post.id, chunkIndex, chunkText });
      });
    }
    processed += posts.length;

    if (jobs.length === 0) {
      console.log(`   ${processed} منشوراً — لا نصّ صالح في هذه الدفعة`);
      continue;
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

    inserted += jobs.length;
    console.log(`   ${processed} منشوراً · ${inserted} مقطعاً`);
  }

  console.log(`\n✓ اكتمل: ${processed} منشوراً، ${inserted} مقطعاً، ${skipped} بلا نصّ\n`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('\n✗ فشل:', error instanceof Error ? error.message : error, '\n');
  await prisma.$disconnect();
  process.exit(1);
});

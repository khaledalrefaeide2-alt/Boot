/**
 * إعادة توليد المتّجهات الدلالية للمنشورات.
 *
 * التشغيل:
 *   npm run reindex:embeddings            # الناقص فقط
 *   npm run reindex:embeddings -- --all   # الكلّ من جديد
 *   npm run reindex:embeddings -- --days 30
 *
 * والفهرسة تجري تلقائياً في العامل الخلفي كل ثلاث دقائق، فهذا السكربت
 * للحالات التي لا تكفي فيها المكنسة: إعادة بناء الكلّ بعد تغيير النموذج،
 * أو تعجيل أرشيف كامل بلا انتظار السقف اليومي.
 *
 * ويعمل على دفعات لسببين: حدّ الطلبات لدى المزوّد، وذاكرة العملية —
 * تحميل كل المنشورات دفعةً واحدة على قاعدة فيها مئات الآلاف يُسقط
 * العملية قبل أن تبدأ.
 *
 * والتقطيع والكتابة في `src/lib/assistant/indexer.ts` يتقاسمهما هذا
 * السكربت والمكنسة معاً — نسخةٌ واحدة، فلا يتغيّر أحدهما دون الآخر.
 */
import 'dotenv/config';
import { prisma } from '../src/lib/db';
import { indexBatch, pruneIncompatible } from '../src/lib/assistant/indexer';
import { embeddingDimensions, getAssistantConfig, MISSING_KEY_MESSAGE } from '../src/lib/assistant/config';

const BATCH = 50;

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
  const stale = await pruneIncompatible();
  if (stale > 0) console.log(`   حُذف ${stale} متّجهاً غير متوافق`);

  if (all) {
    const wiped = await prisma.postEmbedding.deleteMany({});
    console.log(`   حُذف ${wiped.count} متّجهاً لإعادة التوليد`);
  }

  const since = days > 0 ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : null;

  let processed = 0;
  let inserted = 0;
  let skipped = 0;
  let cursor: string | null = null;

  for (;;) {
    const result = await indexBatch({ take: BATCH, cursor, all, since });
    if (result.processed === 0) break;

    processed += result.processed;
    inserted += result.inserted;
    skipped += result.skipped;
    cursor = result.cursor;

    console.log(`   ${processed} منشوراً · ${inserted} مقطعاً`);
    if (result.cursor === null) break;
  }

  console.log(`\n✓ اكتمل: ${processed} منشوراً، ${inserted} مقطعاً، ${skipped} بلا نصّ\n`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('\n✗ فشل:', error instanceof Error ? error.message : error, '\n');
  await prisma.$disconnect();
  process.exit(1);
});

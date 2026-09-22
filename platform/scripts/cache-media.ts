/**
 * جلب مصغّرات المنشورات المخزّنة سابقاً.
 *
 *   npm run media:cache                 # آخر 500 منشور بلا مصغّرة
 *   npm run media:cache -- --limit 5000 # دفعة أكبر
 *   npm run media:cache -- --days 30    # المنشورة في آخر 30 يوماً وحدها
 *
 * ما ينجح منه هو ما لم تنتهِ صلاحية رابطه بعد — والأحدث أوفر حظاً. وما
 * انتهى رابطه لا سبيل إليه إلا بإعادة استخراج حسابه.
 *
 * والأمر قابل للتكرار: المنشور الذي حُفظت مصغّرته لا يُعاد جلبه.
 */
import 'dotenv/config';
import { prisma } from '../src/lib/db';
import { cachePostThumbnails } from '../src/lib/media/cache-posts';
import { mediaRoot } from '../src/lib/media/store';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const LIMIT = Number(arg('limit') ?? '500');
const DAYS = Number(arg('days') ?? '0');

/*
 * الدفعة الواحدة محدودة ليُطبع تقدّمٌ مرئيّ: جلبُ خمسة آلاف صورة يستغرق
 * دقائق، وأمرٌ صامت طوال ذلك يبدو معلّقاً فيُقطع في منتصفه.
 */
const BATCH = 100;

async function main() {
  const since = DAYS > 0 ? new Date(Date.now() - DAYS * 86_400_000) : undefined;

  const pending = await prisma.post.count({
    where: {
      mediaKey: null,
      ...(since ? { publishedAt: { gte: since } } : {}),
      OR: [{ thumbnailUrl: { not: null } }, { imageUrl: { not: null } }],
    },
  });

  console.log('\n>> جلب مصغّرات المنشورات');
  console.log(`   المخزن: ${mediaRoot()}`);
  console.log(`   بلا مصغّرة: ${pending} منشوراً${since ? ` (آخر ${DAYS} يوماً)` : ''}`);
  console.log(`   سقف هذه الجولة: ${LIMIT}\n`);

  if (pending === 0) {
    console.log('✓ لا شيء يُجلب.\n');
    await prisma.$disconnect();
    return;
  }

  let stored = 0;
  let failed = 0;
  let attempted = 0;

  while (attempted < LIMIT) {
    const take = Math.min(BATCH, LIMIT - attempted);
    const result = await cachePostThumbnails(
      since ? { publishedAt: { gte: since } } : {},
      take,
    );

    if (result.attempted === 0) break;

    attempted += result.attempted;
    stored += result.stored;
    failed += result.failed;
    console.log(`   ${stored} محفوظة · ${failed} متعذّرة (من ${attempted} محاولة)`);

    // دفعةٌ كلها فشل تعني روابط منتهية لا تعثّراً عابراً — لا فائدة من المضيّ
    if (result.stored === 0 && result.failed === result.attempted && attempted >= BATCH * 3) {
      console.log('\n   ثلاث دفعات متتابعة بلا نجاح — يُرجَّح أن روابط الباقي منتهية.');
      break;
    }
  }

  console.log(`\n✓ حُفظت ${stored} مصغّرة، وتعذّرت ${failed}.`);
  if (failed > 0) {
    console.log('  المتعذّر روابطُه منتهية الصلاحية — تُستعاد بإعادة استخراج حساباتها.');
  }
  console.log('');

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('\n✗ فشل التنفيذ:', error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exit(1);
});

/**
 * جلب مصغّرات المنشورات المخزّنة سابقاً.
 *
 *   npm run media:cache -- --status     # حالة المخزن بلا جلب شيء
 *   npm run media:cache                 # آخر 500 منشور بلا مصغّرة
 *   npm run media:cache -- --limit 5000 # دفعة أكبر
 *   npm run media:cache -- --days 30    # المنشورة في آخر 30 يوماً وحدها
 *   npm run media:cache -- --retry-gone # يُعيد المحاولة لما استُنفدت محاولاته
 *
 * ما ينجح منه هو ما لم تنتهِ صلاحية رابطه بعد — والأحدث أوفر حظاً. وما
 * انتهى رابطه لا سبيل إليه إلا بإعادة استخراج حسابه.
 *
 * والأمر قابل للتكرار: المنشور الذي حُفظت مصغّرته لا يُعاد جلبه.
 */
import 'dotenv/config';
import { prisma } from '../src/lib/db';
import { cachePostThumbnails, pendingMediaWhere } from '../src/lib/media/cache-posts';
import { mediaRoot } from '../src/lib/media/store';
import { getMediaSettings } from '../src/lib/settings';

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
  const settings = await getMediaSettings();

  /*
   * `--retry-gone` يفتح ما أُغلق.
   *
   * المنشور الذي استُنفدت محاولاته يخرج من المجموعة إلى الأبد — وهو
   * الصحيح في العمل اليومي. لكنّ سبب الفشل قد يكون خارجياً وقد زال:
   * قرصٌ امتلأ ليلةً، أو منفذٌ كان محجوباً. فيُفرَّغ العدّاد بطلبٍ صريح لا
   * تلقائياً، ويُعاد الالتقاط من جديد.
   */
  if (process.argv.includes('--retry-gone')) {
    const reset = await prisma.post.updateMany({
      where: {
        mediaKey: null,
        mediaAttempts: { gte: settings.maxAttempts },
        ...(since ? { publishedAt: { gte: since } } : {}),
      },
      data: { mediaAttempts: 0 },
    });
    console.log(`\n   أُعيد فتح ${reset.count} منشوراً كانت محاولاته قد استُنفدت`);
  }

  const scope = since ? { publishedAt: { gte: since } } : {};
  const [pending, exhausted, withMedia, alreadyStored] = await Promise.all([
    prisma.post.count({ where: { ...pendingMediaWhere(settings.maxAttempts), AND: [scope] } }),
    prisma.post.count({
      where: {
        mediaKey: null,
        mediaAttempts: { gte: settings.maxAttempts },
        ...scope,
        OR: [{ thumbnailUrl: { not: null } }, { imageUrl: { not: null } }],
      },
    }),
    prisma.post.count({
      where: { ...scope, OR: [{ thumbnailUrl: { not: null } }, { imageUrl: { not: null } }] },
    }),
    prisma.post.count({ where: { ...scope, mediaKey: { not: null } } }),
  ]);

  if (process.argv.includes('--status')) {
    const share = withMedia > 0 ? Math.round((alreadyStored / withMedia) * 100) : 0;
    console.log('\n>> حالة مخزن الصور');
    console.log(`   المخزن: ${mediaRoot()}`);
    console.log(`   منشورات لها صورة: ${withMedia}`);
    console.log(`   محفوظة عندنا:     ${alreadyStored} (${share}٪)`);
    console.log(`   تنتظر الحفظ:      ${pending}`);
    console.log(`   استُنفدت محاولاتها: ${exhausted} — روابط ميتة، تُفتح بـ--retry-gone`);
    console.log('');
    await prisma.$disconnect();
    return;
  }

  console.log('\n>> جلب مصغّرات المنشورات');
  console.log(`   المخزن: ${mediaRoot()}`);
  console.log(`   بلا مصغّرة: ${pending} منشوراً${since ? ` (آخر ${DAYS} يوماً)` : ''}`);
  console.log(`   استُنفدت محاولاتها: ${exhausted} — لا تدخل هذه الجولة`);
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
    const result = await cachePostThumbnails(scope, take, settings.maxAttempts);

    if (result.attempted === 0) break;

    attempted += result.attempted;
    stored += result.stored;
    failed += result.retry + result.gone;
    console.log(
      `   ${stored} محفوظة · ${result.gone} رابطاً ميتاً · ${result.retry} تُعاد لاحقاً (من ${attempted} محاولة)`,
    );

    // دفعةٌ كلها فشل تعني روابط منتهية لا تعثّراً عابراً — لا فائدة من المضيّ
    if (result.stored === 0 && result.gone + result.retry === result.attempted && attempted >= BATCH * 3) {
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

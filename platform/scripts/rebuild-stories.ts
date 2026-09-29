/**
 * إعادة تجميع الأحداث من الصفر.
 *
 * التشغيل:
 *   npm run stories:rebuild               # تجميع ما لم يُجمَّع بعد
 *   npm run stories:rebuild -- --all      # هدم ما جُمّع وإعادته
 *   npm run stories:rebuild -- --threshold 0.78 --window 5
 *
 * ★ لماذا يوجد هذا السكربت أصلاً؟
 *
 *   الإسناد نهائي: المنشور الذي دخل عنقوداً لا يُعاد النظر فيه. فتغييرُ
 *   العتبة أو النافذة من شاشة الإعدادات يؤثّر في التجميع القادم وحده،
 *   ويبقى ما جُمّع بالقيمة القديمة كما هو — فتجتمع في القاعدة عناقيدُ
 *   بمعيارين، وهو أسوأ من معيارٍ واحد خاطئ لأنه لا يُقرأ في أيّ رقم.
 *
 *   و`--all` هو الجواب: يُفكّ الإسناد كلّه ويُعاد البناء بالقيم الجديدة.
 *
 * ولا يُنادى المزوّد في هذا السكربت أبداً: التجميع يقرأ المتّجهات التي
 * بنتها الفهرسة ولا يُنشئ غيرها. فتشغيله لا يكلّف شيئاً غير الوقت.
 */
import 'dotenv/config';
import { prisma } from '../src/lib/db';
import { sweepStories, unclusteredCount } from '../src/lib/analysis/stories';
import { getStorySettings } from '../src/lib/settings';
import { MISSING_KEY_MESSAGE } from '../src/lib/assistant/config';

const BATCH = 500;

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.error(`\n✗ ${MISSING_KEY_MESSAGE}\n`);
    process.exit(1);
  }

  const settings = await getStorySettings();
  const threshold = Number(arg('threshold') ?? settings.threshold);
  const windowDays = Number(arg('window') ?? settings.windowDays);
  const all = process.argv.includes('--all');

  console.log('\n>> إعادة تجميع الأحداث');
  console.log(`   العتبة: ${threshold}`);
  console.log(`   النافذة: ${windowDays} يوماً`);
  console.log(`   الوضع: ${all ? 'هدم وإعادة بناء' : 'ما لم يُجمَّع بعد'}`);

  if (all) {
    /*
     * فكّ الإسناد قبل الحذف.
     *
     * المفتاح الأجنبي `SET NULL` يفعلها تلقائياً، لكنّ تركه يعني تحديث
     * كلّ منشورٍ صفّاً صفّاً أثناء الحذف. وجملةٌ واحدة أسرع، والنتيجة
     * واحدة.
     */
    const cleared = await prisma.post.updateMany({
      where: { storyId: { not: null } },
      data: { storyId: null },
    });
    const removed = await prisma.story.deleteMany({});
    console.log(`   فُكّ إسناد ${cleared.count} منشوراً وحُذف ${removed.count} حدثاً`);
  }

  let assigned = 0;
  let created = 0;
  let rounds = 0;

  /*
   * الحلقة تتوقّف على تقدّم لا على عدّاد.
   *
   * كلّ دورة تُخرج ما أسندته من المجموعة، فالمجموعة تنكمش حتماً. والدورة
   * التي لا تُسند شيئاً — منشورات بلا متّجهات صالحة — تُنهي الحلقة بدل
   * أن تدور عليها إلى الأبد.
   */
  for (;;) {
    const outcome = await sweepStories({ batch: BATCH, threshold, windowDays });
    if (!outcome.swept) {
      if (rounds === 0) console.log(`   لا عمل: ${outcome.reason}`);
      break;
    }

    rounds += 1;
    assigned += outcome.assigned;
    created += outcome.created;
    console.log(
      `   دورة ${rounds}: أُسند ${outcome.assigned} وفُتح ${outcome.created} حدثاً — بقي ${outcome.remaining}`,
    );

    if (outcome.remaining === 0) break;
  }

  const remaining = await unclusteredCount();
  const stories = await prisma.story.count();

  console.log(`\n✓ أُسند ${assigned} منشوراً في ${rounds} دورة`);
  console.log(`   أحداث مفتوحة: ${stories} (منها ${created} في هذا التشغيل)`);
  if (remaining > 0) console.log(`   بقي بلا تجميع: ${remaining}`);
  console.log('');
}

main()
  .catch((error) => {
    console.error('\n✗ فشل التجميع:', error instanceof Error ? error.message : error, '\n');
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

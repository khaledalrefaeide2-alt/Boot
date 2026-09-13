/**
 * تحليل المنشورات بالذكاء الاصطناعي — دفعةً واحدة.
 *
 *   npm run analyze:posts                 # غير المحلَّلة فقط
 *   npm run analyze:posts -- --days 7     # آخر 7 أيام
 *   npm run analyze:posts -- --limit 200  # سقف لهذه الجولة
 *   npm run analyze:posts -- --all        # إعادة تحليل الكلّ
 *
 * التنفيذ متسلسل لا متوازٍ: التوازي يضرب حدّ الطلبات لدى المزوّد فتفشل
 * الدفعة كلها بدل أن تبطؤ.
 */
import 'dotenv/config';
import { prisma } from '../src/lib/db';
import { analyzeAndSave } from '../src/lib/analysis/persist';
import { MISSING_KEY_MESSAGE, getAssistantConfig } from '../src/lib/assistant/config';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.error(`\n✗ ${MISSING_KEY_MESSAGE}\n`);
    process.exit(1);
  }

  const config = getAssistantConfig();
  const all = process.argv.includes('--all');
  const days = Number(arg('days') ?? '0');
  const limit = Number(arg('limit') ?? '0');
  const since = days > 0 ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : undefined;

  console.log('\n>> تحليل المنشورات');
  console.log(`   النموذج: ${config.chatModel}`);
  console.log(`   الوضع: ${all ? 'إعادة الكلّ' : 'غير المحلَّلة فقط'}`);

  let done = 0;
  let failed = 0;
  let flagged = 0;
  let review = 0;
  let cursor: string | undefined;

  for (;;) {
    if (limit > 0 && done + failed >= limit) break;

    const take = limit > 0 ? Math.min(25, limit - done - failed) : 25;
    const posts = await prisma.post.findMany({
      where: {
        text: { not: null },
        ...(since ? { publishedAt: { gte: since } } : {}),
        ...(all ? {} : { analysis: { is: null } }),
      },
      select: { id: true, text: true },
      orderBy: { id: 'asc' },
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    if (posts.length === 0) break;
    cursor = posts[posts.length - 1]!.id;

    for (const post of posts) {
      const text = (post.text ?? '').trim();
      if (text.length < 10) continue;

      try {
        const result = await analyzeAndSave(post.id, text);
        done += 1;
        if (result.riskFlags.length > 0) flagged += 1;
        if (result.needsReview) review += 1;
      } catch (error) {
        failed += 1;
        console.error(`   ✗ ${post.id}: ${error instanceof Error ? error.message : error}`);
        // فشلٌ متكرّر يعني عطباً عاماً (رصيد، مفتاح) لا منشوراً رديئاً
        if (failed >= 5 && done === 0) {
          console.error('\n✗ فشل متكرّر — يُرجَّح أن العطب في الإعدادات لا في المنشورات.\n');
          await prisma.$disconnect();
          process.exit(1);
        }
      }
    }

    console.log(`   ${done} محلَّلاً · ${flagged} بإشارة · ${review} بحاجة مراجعة`);
  }

  console.log(`\n✓ اكتمل: ${done} محلَّلاً، ${failed} فاشلاً`);
  console.log(`  ${review} منشوراً بحاجة مراجعة بشرية — راجعها من /admin/review\n`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('\n✗ فشل:', error instanceof Error ? error.message : error, '\n');
  await prisma.$disconnect();
  process.exit(1);
});

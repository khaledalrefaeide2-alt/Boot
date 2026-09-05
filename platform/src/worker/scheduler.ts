import 'server-only';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { createExtractionRun, ExtractionError } from '@/lib/extraction/service';

/**
 * تحرير العمليات العالقة.
 *
 * عملية تبقى «قيد الانتظار» أو «قيد التنفيذ» إلى الأبد تقفل حسابها كلياً:
 * التشغيل اليدوي يُرفض لوجود «عملية قائمة»، والجدولة تتخطّى الحساب للسبب
 * نفسه. يحدث ذلك إذا توقف العامل في منتصف تشغيل أو أُعيد تشغيل الحاوية.
 * لذلك تُنهى كل عملية تجاوزت ضعف مهلة Apify بحالة «فشل»، فيعود الحساب
 * قابلاً للاستخراج من تلقاء نفسه.
 */
export async function releaseStaleRuns(): Promise<number> {
  const cutoff = new Date(Date.now() - env.APIFY_RUN_TIMEOUT_SECONDS * 2 * 1000);
  const { count } = await prisma.extractionRun.updateMany({
    where: { status: { in: ['PENDING', 'RUNNING'] }, createdAt: { lt: cutoff } },
    data: {
      status: 'FAILED',
      finishedAt: new Date(),
      errorMessage: 'انتهت مهلة العملية دون نتيجة — رُبما توقف العامل الخلفي أثناء التنفيذ',
    },
  });
  if (count > 0) console.log(`[scheduler] حُرّرت ${count} عملية عالقة`);
  return count;
}

/**
 * الجدولة التلقائية للاستخراج.
 * الحساب يُجدول عندما يمرّ على آخر استخراج ناجح أكثر من مدة التكرار المحددة له.
 * تكرار = 0 يعني تشغيل يدوي فقط.
 */
export async function scheduleDueAccounts(): Promise<number> {
  const now = new Date();

  // قبل الجدولة نحرّر العالق، وإلا بقيت حساباته متخطّاة إلى الأبد
  await releaseStaleRuns();

  const accounts = await prisma.account.findMany({
    where: {
      isActive: true,
      status: 'ACTIVE',
      extractionIntervalMinutes: { gt: 0 },
      platform: { status: 'ACTIVE' },
      // لا نجدول حساباً له عملية قائمة
      runs: { none: { status: { in: ['PENDING', 'RUNNING'] } } },
    },
    select: {
      id: true,
      name: true,
      extractionIntervalMinutes: true,
      lastExtractedAt: true,
    },
    take: 50,
  });

  let queued = 0;

  for (const account of accounts) {
    const dueAt = account.lastExtractedAt
      ? new Date(account.lastExtractedAt.getTime() + account.extractionIntervalMinutes * 60_000)
      : new Date(0);

    if (dueAt > now) continue;

    try {
      await createExtractionRun({ accountId: account.id, trigger: 'SCHEDULED' });
      await prisma.account.update({
        where: { id: account.id },
        data: {
          nextRunAt: new Date(now.getTime() + account.extractionIntervalMinutes * 60_000),
        },
      });
      queued += 1;
    } catch (error) {
      // حساب واحد متعثر لا يوقف جدولة البقية
      if (!(error instanceof ExtractionError)) {
        console.error(`[scheduler] تعذّرت جدولة الحساب ${account.name}:`, error);
      }
    }
  }

  return queued;
}

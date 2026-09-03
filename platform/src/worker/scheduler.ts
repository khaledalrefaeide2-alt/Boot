import 'server-only';
import { prisma } from '@/lib/db';
import { createExtractionRun, ExtractionError } from '@/lib/extraction/service';

/**
 * الجدولة التلقائية للاستخراج.
 * الحساب يُجدول عندما يمرّ على آخر استخراج ناجح أكثر من مدة التكرار المحددة له.
 * تكرار = 0 يعني تشغيل يدوي فقط.
 */
export async function scheduleDueAccounts(): Promise<number> {
  const now = new Date();

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

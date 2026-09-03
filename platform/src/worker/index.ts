import 'dotenv/config';
import { Worker, type Job } from 'bullmq';
import { bullConnection } from '@/lib/redis';
import { QUEUE_NAMES, type ExtractionJobData, type MaintenanceJobData } from '@/lib/queue';
import { executeExtractionRun } from '@/lib/extraction/service';
import { purgeExpiredSessions } from '@/lib/auth/session';
import { rebuildAllDailyStats } from '@/lib/stats';
import { scheduleDueAccounts } from './scheduler';

/**
 * العامل الخلفي — عملية مستقلة عن تطبيق الويب.
 * التشغيل: npm run worker
 */

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 2);

const extractionWorker = new Worker<ExtractionJobData>(
  QUEUE_NAMES.EXTRACTION,
  async (job: Job<ExtractionJobData>) => {
    console.log(`[worker] تنفيذ عملية استخراج ${job.data.runId} (محاولة ${job.attemptsMade + 1})`);
    await executeExtractionRun(job.data.runId);
  },
  {
    connection: bullConnection,
    concurrency: CONCURRENCY,
    // التشغيل قد يطول — نمنع اعتبار المهمة معلّقة قبل أوانها
    lockDuration: 20 * 60 * 1000,
  },
);

const maintenanceWorker = new Worker<MaintenanceJobData>(
  QUEUE_NAMES.MAINTENANCE,
  async (job: Job<MaintenanceJobData>) => {
    switch (job.data.task) {
      case 'purge-sessions': {
        const count = await purgeExpiredSessions();
        console.log(`[worker] حُذفت ${count} جلسة منتهية`);
        break;
      }
      case 'rebuild-daily-stats': {
        const result = await rebuildAllDailyStats();
        console.log(
          `[worker] أُعيد بناء الإحصاءات: ${result.accounts} حساباً و${result.platforms} منصة`,
        );
        break;
      }
      case 'schedule-due-accounts': {
        const queued = await scheduleDueAccounts();
        if (queued > 0) console.log(`[worker] جُدولت ${queued} عملية استخراج تلقائية`);
        break;
      }
    }
  },
  { connection: bullConnection, concurrency: 1 },
);

extractionWorker.on('failed', (job, error) => {
  console.error(`[worker] فشلت المهمة ${job?.id}:`, error.message);
});

extractionWorker.on('completed', (job) => {
  console.log(`[worker] اكتملت المهمة ${job.id}`);
});

maintenanceWorker.on('failed', (job, error) => {
  console.error(`[worker] فشلت مهمة الصيانة ${job?.id}:`, error.message);
});

/** فحص دوري للحسابات المستحقة للاستخراج التلقائي وتنظيف الجلسات */
const SCHEDULER_INTERVAL_MS = 60_000;
const schedulerTimer = setInterval(() => {
  void scheduleDueAccounts().catch((error) => {
    console.error('[worker] فشل جدولة الحسابات المستحقة:', error);
  });
}, SCHEDULER_INTERVAL_MS);

const SESSION_PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000;
const purgeTimer = setInterval(() => {
  void purgeExpiredSessions().catch(() => undefined);
}, SESSION_PURGE_INTERVAL_MS);

console.log('');
console.log('  ⚙️  عامل المهام الخلفية يعمل');
console.log(`  📥 طابور الاستخراج — تزامن ${CONCURRENCY}`);
console.log('  🕒 فحص الجدولة كل دقيقة');
console.log('');

async function shutdown(signal: string): Promise<void> {
  console.log(`\n[worker] إيقاف بأمان بعد إشارة ${signal}…`);
  clearInterval(schedulerTimer);
  clearInterval(purgeTimer);
  await Promise.allSettled([extractionWorker.close(), maintenanceWorker.close()]);
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

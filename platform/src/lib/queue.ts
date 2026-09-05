import 'server-only';
import { Queue, type JobsOptions } from 'bullmq';
import { bullConnection, isRedisReady } from '@/lib/redis';

/** أسماء الطوابير */
export const QUEUE_NAMES = {
  EXTRACTION: 'extraction',
  MAINTENANCE: 'maintenance',
} as const;

export interface ExtractionJobData {
  runId: string;
}

export interface MaintenanceJobData {
  task: 'purge-sessions' | 'rebuild-daily-stats' | 'schedule-due-accounts';
}

const globalForQueues = globalThis as unknown as {
  extractionQueue: Queue<ExtractionJobData> | undefined;
  maintenanceQueue: Queue<MaintenanceJobData> | undefined;
};

const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 20_000 },
  removeOnComplete: { age: 7 * 24 * 3600, count: 500 },
  removeOnFail: { age: 30 * 24 * 3600, count: 500 },
};

export function getExtractionQueue(): Queue<ExtractionJobData> {
  if (!globalForQueues.extractionQueue) {
    globalForQueues.extractionQueue = new Queue<ExtractionJobData>(QUEUE_NAMES.EXTRACTION, {
      connection: bullConnection,
      defaultJobOptions,
    });
  }
  return globalForQueues.extractionQueue;
}

export function getMaintenanceQueue(): Queue<MaintenanceJobData> {
  if (!globalForQueues.maintenanceQueue) {
    globalForQueues.maintenanceQueue = new Queue<MaintenanceJobData>(QUEUE_NAMES.MAINTENANCE, {
      connection: bullConnection,
      defaultJobOptions: { ...defaultJobOptions, attempts: 1 },
    });
  }
  return globalForQueues.maintenanceQueue;
}

/**
 * إضافة عملية استخراج إلى الطابور.
 * إذا كان Redis غير متاح نُرجع false ليتولى المستدعي التشغيل المباشر،
 * فلا يتعطل النظام كله بسبب الطابور.
 */
/**
 * معرّف المهمة في الطابور.
 * BullMQ يرفض النقطتين في المعرّف المخصّص، ومعرّفنا cuid لا يحتويها،
 * فالفاصل شرطة. تثبيت المعرّف يمنع ازدواج المهمة للتشغيل الواحد.
 */
function extractionJobId(runId: string): string {
  return `run-${runId}`;
}

export async function enqueueExtraction(runId: string): Promise<string | null> {
  if (!(await isRedisReady())) return null;
  try {
    const job = await getExtractionQueue().add(
      'run',
      { runId },
      { jobId: extractionJobId(runId) },
    );
    return job.id ?? null;
  } catch (error) {
    console.error('[queue] تعذّرت إضافة المهمة إلى الطابور:', error);
    return null;
  }
}

/** إلغاء مهمة لم تبدأ بعد */
export async function removeExtractionJob(runId: string): Promise<void> {
  try {
    const job = await getExtractionQueue().getJob(extractionJobId(runId));
    if (job) await job.remove();
  } catch {
    // المهمة قد تكون قيد التنفيذ — الإلغاء الفعلي يتم عبر Apify
  }
}

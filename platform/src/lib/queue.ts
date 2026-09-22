import 'server-only';
import { Queue, type JobsOptions } from 'bullmq';
import { bullConnection, isRedisReady } from '@/lib/redis';

/** أسماء الطوابير */
export const QUEUE_NAMES = {
  EXTRACTION: 'extraction',
  MAINTENANCE: 'maintenance',
  ANALYSIS: 'analysis',
} as const;

export interface ExtractionJobData {
  runId: string;
}

export interface MaintenanceJobData {
  task: 'purge-sessions' | 'rebuild-daily-stats' | 'schedule-due-accounts';
}

export interface AnalysisJobData {
  runId: string;
}

const globalForQueues = globalThis as unknown as {
  extractionQueue: Queue<ExtractionJobData> | undefined;
  maintenanceQueue: Queue<MaintenanceJobData> | undefined;
  analysisQueue: Queue<AnalysisJobData> | undefined;
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

/*
 * طابور التحليل — محاولة واحدة لا ثلاث.
 *
 * إعادة المحاولة هنا ليست مجانية كما في الاستخراج: الجولة المعادة تستدعي
 * المزوّد من جديد لكلّ منشور حُلّل قبل الانقطاع، فتُدفع كلفته مرّتين ولا
 * يتغيّر الناتج. والجولة نفسها تحصي فشلها منشوراً منشوراً وتمضي، فالفشل
 * الذي يصل إلى هنا عطبٌ عامّ لا تصلحه محاولة ثانية.
 */
export function getAnalysisQueue(): Queue<AnalysisJobData> {
  if (!globalForQueues.analysisQueue) {
    globalForQueues.analysisQueue = new Queue<AnalysisJobData>(QUEUE_NAMES.ANALYSIS, {
      connection: bullConnection,
      defaultJobOptions: { ...defaultJobOptions, attempts: 1 },
    });
  }
  return globalForQueues.analysisQueue;
}

function analysisJobId(runId: string): string {
  return `analysis-${runId}`;
}

/** إضافة جولة تحليل إلى الطابور — تُرجع null إذا تعذّر ذلك */
export async function enqueueAnalysis(runId: string): Promise<string | null> {
  if (!(await isRedisReady())) return null;
  try {
    const job = await getAnalysisQueue().add('run', { runId }, { jobId: analysisJobId(runId) });
    return job.id ?? null;
  } catch (error) {
    console.error('[queue] تعذّرت إضافة جولة التحليل إلى الطابور:', error);
    return null;
  }
}

/** إزالة جولة تحليل لم تبدأ بعد */
export async function removeAnalysisJob(runId: string): Promise<void> {
  try {
    const job = await getAnalysisQueue().getJob(analysisJobId(runId));
    if (job) await job.remove();
  } catch {
    // الجولة قد تكون قيد التنفيذ — إيقافها يتم بتغيير حالتها في القاعدة
  }
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

export interface QueueHealth {
  redisReady: boolean;
  /** عدد العمال المتصلين بطابور الاستخراج الآن */
  workers: number;
  /**
   * هل عدد العمال معلوم أصلاً؟
   *
   * قياسه يمرّ بأمر CLIENT LIST، وبعض خدمات Redis المُدارة تمنعه. «تعذّر
   * القياس» ليس «لا يوجد عامل»، والخلط بينهما يرفع إنذاراً كاذباً يدفع
   * المستخدم لإعادة تشغيل عامل يعمل أصلاً.
   */
  workersKnown: boolean;
  waiting: number;
  active: number;
  failed: number;
}

/**
 * حال الطابور الفعلية، لا مجرد اتصال Redis.
 *
 * اتصال Redis يعني أن المهمة تُضاف، لا أن أحداً يسحبها. وبلا عامل خلفي
 * تبقى كل عملية «بانتظار التشغيل» إلى أن تنتهي مهلتها، والشاشة تقول
 * «الطابور يعمل» فيبحث المستخدم عن الخلل في Apify وفي الحسابات وهو في
 * نافذة لم تُفتح. فيُقاس عدد العمال صراحةً ويُعرض.
 */
export async function getQueueHealth(): Promise<QueueHealth> {
  if (!(await isRedisReady())) {
    return { redisReady: false, workers: 0, workersKnown: false, waiting: 0, active: 0, failed: 0 };
  }

  const queue = getExtractionQueue();

  const counts = await queue.getJobCounts().catch(() => null);
  const workers = await queue.getWorkersCount().catch(() => null);

  return {
    redisReady: true,
    workers: workers ?? 0,
    workersKnown: workers !== null,
    waiting: counts?.waiting ?? 0,
    active: counts?.active ?? 0,
    failed: counts?.failed ?? 0,
  };
}

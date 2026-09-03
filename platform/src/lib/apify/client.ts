import 'server-only';
import { env } from '@/lib/env';

/**
 * عميل Apify — خادمي بحت.
 * الرمز يُقرأ من متغيرات البيئة ويُرسل في ترويسة Authorization فقط،
 * فلا يظهر في الروابط ولا في السجلات ولا يصل إلى المتصفح إطلاقاً.
 */

export class ApifyError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApifyError';
  }
}

/** حالات تشغيل Apify كما ترجع من الواجهة */
export type ApifyRunStatus =
  | 'READY'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'ABORTING'
  | 'ABORTED'
  | 'TIMING-OUT'
  | 'TIMED-OUT';

export interface ApifyRun {
  id: string;
  actId: string;
  status: ApifyRunStatus;
  defaultDatasetId: string;
  startedAt: string | null;
  finishedAt: string | null;
  stats?: { runTimeSecs?: number };
  exitCode?: number | null;
}

/** هل الرمز مُعرَّف؟ تُستخدم لإظهار تحذير في الواجهة دون كشف قيمته */
export function isApifyConfigured(): boolean {
  return env.APIFY_TOKEN.trim().length > 0;
}

function requireToken(): string {
  const token = env.APIFY_TOKEN.trim();
  if (!token) {
    throw new ApifyError(
      'رمز Apify غير معرّف. أضف APIFY_TOKEN إلى ملف البيئة ثم أعد تشغيل الخدمة.',
    );
  }
  return token;
}

interface FetchOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  /** مهلة الطلب الواحد بالميلي ثانية */
  timeoutMs?: number;
  /** عدد محاولات إعادة الطلب عند أخطاء الشبكة أو الخادم */
  retries?: number;
}

async function apifyFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { method = 'GET', body, timeoutMs = 60_000, retries = 2 } = options;
  const token = requireToken();
  const url = `${env.APIFY_API_BASE}${path}`;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        cache: 'no-store',
      });

      clearTimeout(timer);

      if (response.status === 401 || response.status === 403) {
        throw new ApifyError('رمز Apify غير صالح أو لا يملك صلاحية هذه العملية', response.status);
      }
      if (response.status === 404) {
        throw new ApifyError('المورد المطلوب غير موجود في Apify — تحقق من معرّف الـ Actor', 404);
      }
      if (response.status === 429) {
        // تجاوز حد الطلبات — ننتظر تصاعدياً ثم نعيد المحاولة
        if (attempt < retries) {
          await sleep(2000 * (attempt + 1));
          continue;
        }
        throw new ApifyError('تجاوز حد الطلبات على Apify، حاول لاحقاً', 429);
      }
      if (response.status >= 500) {
        if (attempt < retries) {
          await sleep(1500 * (attempt + 1));
          continue;
        }
        throw new ApifyError('خطأ في خوادم Apify', response.status);
      }
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new ApifyError(
          `فشل الطلب إلى Apify (${response.status})`,
          response.status,
          text.slice(0, 500),
        );
      }

      // بعض المسارات ترجع مصفوفة مباشرة (عناصر مجموعة البيانات)
      const json = (await response.json()) as { data?: T } | T;
      if (json && typeof json === 'object' && 'data' in json && json.data !== undefined) {
        return json.data as T;
      }
      return json as T;
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof ApifyError) throw error;
      lastError = error;
      const isAbort = error instanceof Error && error.name === 'AbortError';
      if (attempt < retries && !isAbort) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      if (isAbort) throw new ApifyError('انتهت مهلة الاتصال بـ Apify');
      throw new ApifyError(
        `تعذّر الاتصال بـ Apify: ${error instanceof Error ? error.message : 'خطأ غير معروف'}`,
      );
    }
  }

  throw new ApifyError(
    `تعذّر الاتصال بـ Apify: ${lastError instanceof Error ? lastError.message : 'خطأ غير معروف'}`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * بدء تشغيل Actor.
 * maxItems يُمرَّر كسقف فوترة تفرضه منصة Apify نفسها، فلا تُحاسَب
 * على أكثر من العدد المطلوب مهما جمع الـ Actor.
 */
export async function startActorRun(
  actorId: string,
  input: Record<string, unknown>,
  options: { maxItems: number; timeoutSecs?: number },
): Promise<ApifyRun> {
  const params = new URLSearchParams({
    maxItems: String(options.maxItems),
    timeout: String(options.timeoutSecs ?? env.APIFY_RUN_TIMEOUT_SECONDS),
  });

  return apifyFetch<ApifyRun>(`/acts/${encodeURIComponent(actorId)}/runs?${params.toString()}`, {
    method: 'POST',
    body: input,
    timeoutMs: 45_000,
  });
}

/** حالة تشغيل قائم */
export async function getActorRun(runId: string): Promise<ApifyRun> {
  return apifyFetch<ApifyRun>(`/actor-runs/${encodeURIComponent(runId)}`, { timeoutMs: 30_000 });
}

/** إيقاف تشغيل قائم */
export async function abortActorRun(runId: string): Promise<ApifyRun> {
  return apifyFetch<ApifyRun>(`/actor-runs/${encodeURIComponent(runId)}/abort`, {
    method: 'POST',
    timeoutMs: 30_000,
  });
}

/** جلب عناصر مجموعة البيانات على دفعات */
export async function fetchDatasetItems(
  datasetId: string,
  options: { limit?: number; offset?: number } = {},
): Promise<unknown[]> {
  const params = new URLSearchParams({
    limit: String(options.limit ?? 1000),
    offset: String(options.offset ?? 0),
    clean: 'true',
  });

  const items = await apifyFetch<unknown[]>(
    `/datasets/${encodeURIComponent(datasetId)}/items?${params.toString()}`,
    { timeoutMs: 120_000 },
  );

  return Array.isArray(items) ? items : [];
}

/** جلب كل العناصر مع سقف صارم لعددها */
export async function fetchAllDatasetItems(
  datasetId: string,
  hardLimit: number,
): Promise<unknown[]> {
  const pageSize = 500;
  const collected: unknown[] = [];

  while (collected.length < hardLimit) {
    const remaining = hardLimit - collected.length;
    const batch = await fetchDatasetItems(datasetId, {
      limit: Math.min(pageSize, remaining),
      offset: collected.length,
    });
    if (batch.length === 0) break;
    collected.push(...batch);
    if (batch.length < pageSize) break;
  }

  return collected;
}

/** التحقق من صحة الرمز — يُستخدم في صفحة الإعدادات دون كشف قيمته */
export async function verifyApifyToken(): Promise<{ ok: boolean; username?: string; message: string }> {
  if (!isApifyConfigured()) {
    return { ok: false, message: 'رمز Apify غير معرّف في متغيرات البيئة' };
  }
  try {
    const user = await apifyFetch<{ username?: string }>('/users/me', { timeoutMs: 15_000, retries: 1 });
    return { ok: true, username: user.username, message: 'الاتصال بـ Apify سليم' };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof ApifyError ? error.message : 'تعذّر التحقق من الاتصال',
    };
  }
}

/** هل حالة التشغيل نهائية؟ */
export function isTerminalStatus(status: ApifyRunStatus): boolean {
  return ['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(status);
}

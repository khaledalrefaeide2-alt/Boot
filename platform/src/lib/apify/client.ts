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

/** ما يقوله Apify عن سبب الرفض — نوعٌ ثابت ورسالة */
export interface ApifyErrorDetail {
  type: string | null;
  message: string | null;
}

/** يمحو ما يشبه رمزاً من نصٍّ قبل حفظه أو عرضه — احتياطاً لا أكثر */
function scrubTokens(text: string): string {
  return text.replace(/apify_api_[A-Za-z0-9]+/g, '[token]');
}

async function readApifyError(response: Response): Promise<ApifyErrorDetail | null> {
  try {
    const json = (await response.json()) as { error?: { type?: unknown; message?: unknown } };
    const type = typeof json.error?.type === 'string' ? scrubTokens(json.error.type).slice(0, 80) : null;
    const message =
      typeof json.error?.message === 'string' ? scrubTokens(json.error.message).slice(0, 300) : null;
    return type || message ? { type, message } : null;
  } catch {
    return null;
  }
}

/**
 * سبب رفض النظام للطلب، بالعربية وبما يُفعل له.
 *
 * ★ كانت 401 و403 رسالةً واحدة: «رمز النظام غير صالح أو لا يملك صلاحية».
 *
 *   وهي ثلاث مشكلات لكلٍّ منها علاجٌ مختلف: رمزٌ خاطئ أو أُلغي (يُستبدل)،
 *   ورمزٌ صالح مقيَّد الصلاحيات (يُوسَّع أو يُستعمل غيره)، وحسابٌ نفد رصيده
 *   أو تجاوز حدّه الشهري (يُشحن — والرمز سليم). ورسالةٌ واحدة للثلاث
 *   تُرسل المشغّل إلى تبديل رمزٍ سليم بينما المشكلة في الفوترة.
 *
 *   والردّ من النظام يحمل نوع الخطأ (`error.type`) فيُقرأ ويُذكر: هو
 *   ما يُبحث عنه في وثائقه، ولا يحمل سرّاً.
 *
 * دالّة خالصة — تُفحص في `verify:hardening`.
 */
export function describeApifyRejection(status: number, detail: ApifyErrorDetail | null): string {
  const text = `${detail?.type ?? ''} ${detail?.message ?? ''}`.toLowerCase();
  const code = detail?.type ? ` (رمز الخطأ: ${detail.type})` : ` (HTTP ${status})`;

  const billing = /usage|limit|exceed|credit|payment|plan|subscription|billing|insufficient-funds|not-enough/.test(text);
  const permission = /permission|scope|forbidden|not-allowed|unauthori[sz]ed-actor/.test(text);
  const disabled = /disabled|suspend|blocked|banned/.test(text);

  if (status === 402 || (status === 403 && billing)) {
    return `حساب النظام لا يملك رصيداً كافياً أو تجاوز حدّ الاستخدام الشهري — الرمز سليم، والحلّ في الفوترة لدى مزوّد الاستخراج${code}`;
  }
  if (status === 401) {
    return `رمز النظام مرفوض: غير صحيح أو أُلغي أو انتهت صلاحيته. أنشئ رمزاً جديداً، وضعه في APIFY_TOKEN بملف البيئة، ثم أعد إنشاء حاويتي التطبيق والعامل${code}`;
  }
  if (disabled) {
    return `حساب النظام معطّل أو موقوف لدى المزوّد — راجع حالة الحساب${code}`;
  }
  if (permission) {
    return `رمز النظام صالح لكنه مقيَّد ولا يملك صلاحية هذه العملية — استعمل رمزاً بلا قيود، أو امنحه صلاحية تشغيل المشغّلات وقراءة مجموعات البيانات${code}`;
  }
  return `النظام رفض الطلب: الرمز غير صالح أو لا يملك صلاحية هذه العملية${code}`;
}

/** هل الرمز مُعرَّف؟ تُستخدم لإظهار تحذير في الواجهة دون كشف قيمته */
export function isApifyConfigured(): boolean {
  return env.APIFY_TOKEN.trim().length > 0;
}

function requireToken(): string {
  const token = env.APIFY_TOKEN.trim();
  if (!token) {
    throw new ApifyError(
      'رمز النظام غير معرّف. أضف APIFY_TOKEN إلى ملف البيئة ثم أعد تشغيل الخدمة.',
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

      if (response.status === 401 || response.status === 402 || response.status === 403) {
        const detail = await readApifyError(response);
        // السبب الكامل في سجلّ الخادم للمشغّل؛ والرمز نفسه لا يُطبع أبداً
        console.error(
          `[apify] رُفض الطلب ${method} ${path.split('?')[0]}: ${response.status}`,
          detail ? `${detail.type ?? '-'} — ${detail.message ?? '-'}` : '',
        );
        throw new ApifyError(describeApifyRejection(response.status, detail), response.status, detail);
      }
      if (response.status === 404) {
        throw new ApifyError('المورد المطلوب غير موجود في النظام — تحقق من معرّف المشغّل', 404);
      }
      if (response.status === 429) {
        // تجاوز حد الطلبات — ننتظر تصاعدياً ثم نعيد المحاولة
        if (attempt < retries) {
          await sleep(2000 * (attempt + 1));
          continue;
        }
        throw new ApifyError('تجاوز حد الطلبات في النظام، حاول لاحقاً', 429);
      }
      if (response.status >= 500) {
        if (attempt < retries) {
          await sleep(1500 * (attempt + 1));
          continue;
        }
        throw new ApifyError('خطأ في خوادم النظام', response.status);
      }
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new ApifyError(
          `فشل الطلب إلى النظام (${response.status})`,
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
      if (isAbort) throw new ApifyError('انتهت مهلة الاتصال بالنظام');
      throw new ApifyError(
        `تعذّر الاتصال بالنظام: ${error instanceof Error ? error.message : 'خطأ غير معروف'}`,
      );
    }
  }

  throw new ApifyError(
    `تعذّر الاتصال بالنظام: ${lastError instanceof Error ? lastError.message : 'خطأ غير معروف'}`,
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
    return { ok: false, message: 'رمز النظام غير معرّف في متغيرات البيئة' };
  }
  try {
    const user = await apifyFetch<{ username?: string }>('/users/me', { timeoutMs: 15_000, retries: 1 });
    return { ok: true, username: user.username, message: 'الاتصال بالنظام سليم' };
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

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import {
  errors,
  guardMutationRate,
  jsonError,
  jsonOk,
  parseBody,
  requireCsrf,
  requirePermission,
} from '@/lib/api';
import { PERMISSIONS } from '@/lib/auth/rbac';
import { getAccountScope, scopeAllows } from '@/lib/auth/account-scope';
import { checkRateLimit, rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { createExtractionRun, ExtractionError } from '@/lib/extraction/service';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';
import { getQueueHealth } from '@/lib/queue';

/** سقف الدفعة الواحدة — الحصة الساعية تحدّ قبله عادةً، وهذا يحمي الطلب نفسه */
const MAX_BATCH = 50;

const DATE = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'صيغة التاريخ يجب أن تكون YYYY-MM-DD');

/*
 * الفلاتر إلزامية هنا كما في التشغيل الفردي تماماً.
 * الدفعة تضاعف أثر الخطأ لا تخففه: نافذة زمنية مفترضة على حساب واحد هدر
 * محدود، وعلى عشرين حساباً هدر عشرين ضعفاً في حصة مدفوعة.
 */
const bulkSchema = z.object({
  accountIds: z
    .array(z.string().trim().min(1).max(64))
    .min(1, 'اختر حساباً واحداً على الأقل')
    .max(MAX_BATCH, `لا يمكن تشغيل أكثر من ${MAX_BATCH} حساباً في دفعة واحدة`),
  maxItems: z.coerce
    .number({ message: 'حدّد أقصى عدد للمنشورات' })
    .int('العدد يجب أن يكون صحيحاً')
    .min(1, 'أقل عدد منشور واحد')
    .max(1000, 'أقصى عدد 1000 منشور'),
  fromDate: DATE,
  toDate: DATE,
  sort: z.enum(['Latest', 'Top']).optional(),
  resultsType: z.enum(['posts', 'reels']).optional(),
});

interface BulkOutcome {
  accountId: string;
  name: string;
  platformName: string;
  runId: string | null;
  queued: boolean;
  reason: string | null;
}

/**
 * تشغيل الاستخراج على عدة حسابات دفعةً واحدة.
 *
 * الدفعة ليست معاملة: كل حساب عملية مستقلة على Apify، وفشل واحد لا يبطل
 * ما نجح قبله ولا يمنع ما بعده. فيُنفَّذ كلٌّ على حدة ويُرجع تقرير بحال كل
 * حساب — «تعذّر تشغيل ٣ من ٢٠» بأسبابها أنفع من رفض الدفعة كلها.
 *
 * والتنفيذ متسلسل لا متوازٍ: كل إنشاء يقرأ الحساب ويفحص وجود عملية قائمة
 * ثم يكتب، ودفعُها معاً يفتح سباقاً على الفحص نفسه ويتجاوز الحصة الساعية.
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await requirePermission(PERMISSIONS.EXTRACTION_RUN);
    await requireCsrf();
    await guardMutationRate(actor.id);

    const input = await parseBody(request, bulkSchema);
    const requested = [...new Set(input.accountIds)];

    // الحسابات خارج نطاق المستخدم تُسقط بصمت كأنها غير موجودة
    const scope = await getAccountScope();
    const allowed = requested.filter((id) => scopeAllows(scope, id));
    if (allowed.length === 0) throw errors.notFound('لا توجد حسابات متاحة في هذا الطلب');

    /*
     * الحصة تُفحص قبل البدء لا أثناءه: لو بدأنا ثم نفدت في المنتصف لخرجت
     * دفعة نصفها منفَّذ ونصفها لا، والمستخدم لا يعرف أين توقفت.
     */
    const quota = await checkRateLimit(`extraction:${actor.id}`, RATE_LIMITS.EXTRACTION_RUN.limit);
    if (quota.remaining < allowed.length) {
      throw errors.tooMany(
        quota.remaining === 0
          ? 'استنفدت حصة عمليات الاستخراج في هذه الساعة، حاول لاحقاً'
          : `الحصة المتبقية في هذه الساعة ${quota.remaining} عملية، وقد اخترت ${allowed.length}`,
      );
    }

    const accounts = await prisma.account.findMany({
      where: { id: { in: allowed } },
      select: { id: true, name: true, platform: { select: { code: true, name: true } } },
    });
    const byId = new Map(accounts.map((account) => [account.id, account]));

    const outcomes: BulkOutcome[] = [];

    for (const accountId of allowed) {
      const account = byId.get(accountId);
      if (!account) {
        outcomes.push({
          accountId, name: '—', platformName: '—', runId: null, queued: false,
          reason: 'الحساب غير موجود',
        });
        continue;
      }

      const base = { accountId, name: account.name, platformName: account.platform.name };
      const code = account.platform.code;

      try {
        const { run, queued } = await createExtractionRun({
          accountId,
          trigger: 'MANUAL',
          requestedById: actor.id,
          maxItems: input.maxItems,
          fromDate: input.fromDate,
          toDate: input.toDate,
          // الخيار الخاص بمنصة لا يُمرَّر إلى غيرها ولو أُرسل في الطلب
          sort: code === 'x' || code === 'twitter' ? (input.sort ?? null) : null,
          resultsType: code === 'instagram' ? (input.resultsType ?? null) : null,
        });

        // الحصة تُستهلك بما نُفِّذ فعلاً، فالفشل لا يُحسب على المستخدم
        await rateLimit(
          `extraction:${actor.id}`,
          RATE_LIMITS.EXTRACTION_RUN.limit,
          RATE_LIMITS.EXTRACTION_RUN.window,
        );

        outcomes.push({ ...base, runId: run.id, queued, reason: null });
      } catch (error) {
        outcomes.push({
          ...base, runId: null, queued: false,
          reason: error instanceof ExtractionError ? error.message : 'تعذّر إنشاء العملية',
        });
      }
    }

    const started = outcomes.filter((row) => row.runId !== null);
    const failed = outcomes.filter((row) => row.runId === null);
    const notQueued = started.filter((row) => !row.queued).length;

    /*
     * الإضافة إلى الطابور ليست تشغيلاً: بلا عامل خلفي تبقى المهمة في مكانها.
     * فيُقال ذلك في اللحظة التي ينظر فيها المستخدم إلى النتيجة، لا بعد
     * نصف ساعة حين يجد كل شيء «بانتظار التشغيل».
     */
    const queueHealth = started.length > 0 ? await getQueueHealth() : null;
    const noWorker =
      queueHealth !== null &&
      queueHealth.redisReady &&
      queueHealth.workersKnown &&
      queueHealth.workers === 0;

    if (started.length > 0) {
      await audit(actor, {
        action: AUDIT_ACTIONS.EXTRACTION_STARTED,
        entityType: 'extraction_run',
        summary: `تشغيل جماعي لـ ${started.length} حساباً من ${input.fromDate} إلى ${input.toDate}`,
        metadata: {
          requested: allowed.length,
          started: started.length,
          failed: failed.length,
          maxItems: input.maxItems,
          fromDate: input.fromDate,
          toDate: input.toDate,
          accounts: started.map((row) => row.name),
        },
      });
    }

    return jsonOk({
      started: started.length,
      failed: failed.length,
      outcomes,
      noWorker,
      message:
        notQueued > 0
          ? 'أُنشئت العمليات لكن الطابور غير متاح — تأكد من تشغيل Redis والعامل الخلفي'
          : started.length === 0
            ? 'لم تبدأ أي عملية — راجع أسباب كل حساب'
            : noWorker
              ? 'أُنشئت العمليات لكنها لن تبدأ: لا يوجد عامل خلفي يعمل. شغّل npm run worker في نافذة أوامر واتركها مفتوحة'
              : 'أُضيفت العمليات إلى الطابور وستبدأ تباعاً',
    });
  } catch (error) {
    return jsonError(error);
  }
}

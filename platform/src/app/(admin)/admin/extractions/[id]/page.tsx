import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { can, PERMISSIONS } from '@/lib/auth/rbac';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge, StatusDot } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { METRIC_ICONS, StatCard, StatGrid } from '@/components/ui/stat-card';
import { EmptyState } from '@/components/ui/states';
import {
  EXTRACTION_STATUS_LABELS,
  EXTRACTION_STATUS_TONE,
  EXTRACTION_TRIGGER_LABELS,
} from '@/lib/domain/constants';
import { formatDate, formatDateTime, formatDuration, formatNumber, truncate } from '@/lib/utils';

export const metadata: Metadata = { title: 'تفاصيل عملية الاستخراج' };

/** صف بيان في جدول التفاصيل */
function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border py-2.5 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{children}</span>
    </div>
  );
}

export default async function ExtractionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getSession();
  if (!can(user, PERMISSIONS.EXTRACTION_VIEW)) notFound();

  const run = await prisma.extractionRun.findUnique({
    where: { id },
    include: {
      account: { select: { id: true, name: true, url: true } },
      platform: { select: { id: true, name: true } },
      requestedBy: { select: { name: true, email: true } },
      backfill: { select: { id: true, totalChunks: true, fromDate: true, toDate: true } },
      _count: { select: { posts: true } },
    },
  });

  if (!run) notFound();

  const errorDetails = run.errorDetails as
    | { importFailures?: string[]; mappingFailures?: string[] }
    | null;

  return (
    <>
      <PageHeader
        title={`عملية استخراج — ${run.account?.name ?? 'حساب محذوف'}`}
        description={`أُنشئت في ${formatDateTime(run.createdAt)}`}
        action={
          <>
            <Link href="/admin/extractions">
              <Button variant="secondary">العودة إلى السجل</Button>
            </Link>
            {run.account && (
              <Link href={`/posts?accountId=${run.account.id}&range=all`}>
                <Button>عرض منشورات الحساب</Button>
              </Link>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={EXTRACTION_STATUS_TONE[run.status]} className="text-sm">
          <StatusDot tone={EXTRACTION_STATUS_TONE[run.status]} />
          {EXTRACTION_STATUS_LABELS[run.status]}
        </Badge>
        <Badge>{EXTRACTION_TRIGGER_LABELS[run.trigger]}</Badge>
      </div>

      {/* «لا نتائج» تحمل شرحاً كذلك الآن، فلا يُقصر عرضه على الفاشلة */}
      {(run.status === 'FAILED' || run.status === 'NO_RESULTS') && run.errorMessage && (
        <Alert
          tone={run.status === 'FAILED' ? 'danger' : 'warning'}
          title={run.status === 'FAILED' ? 'سبب الفشل' : 'لماذا لم يُحفظ شيء'}
          className="mb-4"
        >
          {run.errorMessage}
        </Alert>
      )}

      {run.status === 'NO_RESULTS' && (
        <Alert tone="warning" title="لم تُرجع العملية أي نتائج" className="mb-4">
          تحقق من صحة رابط الحساب، ومن أن الـ Actor المحدد يدعم هذا النوع من الصفحات، ومن أن نافذة
          الاستخراج الزمنية تشمل منشورات فعلية.
        </Alert>
      )}

      {/*
        البطاقات تُجمِّع ما جُلب: مجلوب = جديد + محدَّث + خارج النافذة +
        متجاهَل. وبلا بطاقة «خارج النافذة» كان الفارق يبقى بلا تفسير —
        «جُلب 855 · حُفظ 43» ولا شيء يقول أين ذهبت الثمانمئة.
      */}
      <StatGrid count={7} className="mb-4">
        <StatCard label="العناصر المجلوبة" value={run.itemsFetched} icon={METRIC_ICONS.posts} />
        <StatCard
          label="منشورات جديدة"
          value={run.itemsSaved}
          icon={METRIC_ICONS.posts}
          tone="success"
        />
        <StatCard label="منشورات محدّثة" value={run.itemsSkipped} icon={METRIC_ICONS.skipped} />
        <StatCard
          label="خارج النافذة الزمنية"
          icon={METRIC_ICONS.month}
          value={run.itemsOutOfWindow}
          tone={run.itemsOutOfWindow > run.itemsSaved ? 'warning' : 'default'}
        />
        <StatCard label="ردود مستبعَدة" value={run.itemsReplies} icon={METRIC_ICONS.comments} />
        <StatCard
          label="عناصر متجاهَلة"
          icon={METRIC_ICONS.failed}
          value={run.itemsFailed}
          tone={run.itemsFailed > 0 ? 'warning' : 'default'}
        />
        <StatCard
          label="المدة"
          value={formatDuration(run.durationMs)}
          icon={METRIC_ICONS.duration}
        />
      </StatGrid>

      {/*
        تنبيه الهدر: حين يسقط خارج النافذة أكثرُ ممّا حُفظ، فالمشغّل يدفع
        ثمن عناصر يرميها. والعلاج ليس في الشيفرة بل في ضبط التشغيل، فيُقال.
      */}
      {/*
        التنبيه يفرّق بين حالتين تتشابهان في الأرقام وتختلفان في العلاج:
        مشغّلٌ احترم المدى فجاء ما نُشر فيه فقط، ومشغّلٌ تجاهله فأعاد آخر N
        عنصراً. ومدى ما جُلب هو ما يفصل بينهما.
      */}
      {run.itemsOutOfWindow > run.itemsSaved && run.itemsOutOfWindow > 20 && (
        <Alert tone="warning" title="أغلب ما جُلب سقط خارج النافذة الزمنية" className="mb-4">
          جُلب {formatNumber(run.itemsFetched)} عنصراً وسقط منها{' '}
          {formatNumber(run.itemsOutOfWindow)} خارج المدى المطلوب.
          {run.fetchedFrom && run.fetchedTo && (
            <>
              {' '}
              وما جُلب يغطّي من {formatDate(run.fetchedFrom)} إلى {formatDate(run.fetchedTo)}،
              بينما المطلوب{' '}
              {run.windowFrom && run.windowTo
                ? `من ${formatDate(run.windowFrom)} إلى ${formatDate(run.windowTo)}`
                : 'مدى أضيق'}
              .
            </>
          )}{' '}
          فالمشغّل يتجاوز المدى المطلوب ويُعيد أحدث ما لديه. والأخطر من الهدر أن سقف
          العناصر يُنفَق على ما هو خارج المدى، فقد ينفد قبل بلوغ أوّل النطاق فتغيب
          منشورات داخله. شغّل العملية من جديد بعد هذا التحديث — النطاق صار يُمرَّر إلى
          محرّك بحث إكس نفسه فيُطبَّق قبل أن تصل النتائج.
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="بيانات التشغيل" />
          <CardBody className="py-1">
            <DetailRow label="الحساب">
              {run.account ? (
                <Link href={`/accounts/${run.account.id}`} className="text-primary hover:underline">
                  {run.account.name}
                </Link>
              ) : (
                '—'
              )}
            </DetailRow>
            <DetailRow label="المنصة">{run.platform?.name ?? '—'}</DetailRow>
            {/*
              المشغّل يُعرَّف بالمنصة التي شُغِّل عليها لا بمعرّفه الخام:
              المعرّف نصٌّ خارجيّ يحمل اسم المزوّد ولا يضيف للمراجع شيئاً
              يستطيع التصرّف به، والمراجعة هنا عن «ماذا استُخرج» لا عن
              «بأيّ أداة». وقيمة المعرّف تبقى في إعدادات المنصة لمن يضبطها.
            */}
            <DetailRow label="مشغّل النظام">
              <span className="text-xs">{run.platform?.name ?? '—'}</span>
            </DetailRow>
            <DetailRow label="معرّف التشغيل في النظام">
              <span className="ltr text-xs">{run.apifyRunId ?? '—'}</span>
            </DetailRow>
            <DetailRow label="سقف الفوترة">
              <span className="num">{run.maxItems ? formatNumber(run.maxItems) : '—'}</span>
            </DetailRow>
            {/* النافذة المطلوبة تُعرض ليعرف المراجع ما الذي غطّته العملية بالضبط */}
            {/*
              المدى الفعلي بجانب المطلوب لا بعيداً عنه: المقارنة بينهما هي
              المعلومة، وكلٌّ منهما وحده رقمٌ لا يقول شيئاً.
            */}
            <DetailRow label="مدى ما جُلب فعلاً">
              {run.fetchedFrom && run.fetchedTo ? (
                <span className="num">
                  {formatDate(run.fetchedFrom)} — {formatDate(run.fetchedTo)}
                </span>
              ) : (
                <span className="text-subtle-foreground">—</span>
              )}
            </DetailRow>
            <DetailRow label="النطاق الزمني المطلوب">
              {run.windowFrom && run.windowTo ? (
                <span className="num">
                  {formatDate(run.windowFrom)} — {formatDate(run.windowTo)}
                </span>
              ) : (
                <span className="text-subtle-foreground">حسب إعدادات الحساب (تشغيل مجدول)</span>
              )}
            </DetailRow>
            {/*
              المقطع يُعرض حين يوجد: النطاق الضيّق في تشغيلة من سلسلة ليس
              اختياراً ضيّقاً بل جزءاً من مدىً أوسع، وقراءته منفرداً تُوهم
              أن أحداً طلب شهراً واحداً من سبع سنوات.
            */}
            {run.backfill && run.backfillSeq !== null && (
              <DetailRow label="ضمن استخراج تاريخي">
                <span className="num">
                  المقطع {run.backfillSeq} من {run.backfill.totalChunks}
                </span>
                <span className="mr-2 text-xs text-muted-foreground">
                  (المدى الكامل {formatDate(run.backfill.fromDate)} —{' '}
                  {formatDate(run.backfill.toDate)})
                </span>
              </DetailRow>
            )}
            <DetailRow label="طلبها">{run.requestedBy?.name ?? 'النظام (مجدولة)'}</DetailRow>
            <DetailRow label="وقت البدء">{formatDateTime(run.startedAt)}</DetailRow>
            <DetailRow label="وقت الانتهاء">{formatDateTime(run.finishedAt)}</DetailRow>
            <DetailRow label="المنشورات المرتبطة">
              <span className="num">{formatNumber(run._count.posts)}</span>
            </DetailRow>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="المدخلات المرسلة إلى الـ Actor"
            description="لا تحتوي على أي أسرار — الرمز يبقى في الخادم"
          />
          <CardBody>
            <pre className="ltr max-h-72 overflow-auto rounded-md border border-border bg-surface-2 p-3 text-xs leading-relaxed">
              {JSON.stringify(run.input ?? {}, null, 2)}
            </pre>
          </CardBody>
        </Card>
      </div>

      {(errorDetails?.importFailures?.length || errorDetails?.mappingFailures?.length) && (
        <Card className="mt-4">
          <CardHeader
            title="العناصر المتجاهَلة"
            description="عناصر لم تُستورد — العملية استمرت ولم تتوقف بسببها"
          />
          <CardBody className="space-y-1.5">
            {errorDetails.mappingFailures?.map((failure, index) => (
              <p key={`map-${index}`} className="text-xs text-muted-foreground">
                • {failure}
              </p>
            ))}
            {errorDetails.importFailures?.map((failure, index) => (
              <p key={`imp-${index}`} className="text-xs text-muted-foreground">
                • {truncate(failure, 200)}
              </p>
            ))}
          </CardBody>
        </Card>
      )}

      {run.rawSample ? (
        <Card className="mt-4">
          <CardHeader
            title="عينة من البيانات الخام"
            description="أول ثلاثة عناصر كما وصلت من النظام — للتشخيص وضبط محوّل الحقول"
          />
          <CardBody>
            <pre className="ltr max-h-96 overflow-auto rounded-md border border-border bg-surface-2 p-3 text-xs leading-relaxed">
              {JSON.stringify(run.rawSample, null, 2)}
            </pre>
          </CardBody>
        </Card>
      ) : (
        run.status === 'SUCCEEDED' && (
          <Card className="mt-4">
            <EmptyState title="لا توجد عينة خام محفوظة لهذه العملية" />
          </Card>
        )
      )}
    </>
  );
}

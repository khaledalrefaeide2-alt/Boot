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
import { StatCard } from '@/components/ui/stat-card';
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

      {run.status === 'FAILED' && run.errorMessage && (
        <Alert tone="danger" title="سبب الفشل" className="mb-4">
          {run.errorMessage}
        </Alert>
      )}

      {run.status === 'NO_RESULTS' && (
        <Alert tone="warning" title="لم تُرجع العملية أي نتائج" className="mb-4">
          تحقق من صحة رابط الحساب، ومن أن الـ Actor المحدد يدعم هذا النوع من الصفحات، ومن أن نافذة
          الاستخراج الزمنية تشمل منشورات فعلية.
        </Alert>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="العناصر المجلوبة" value={run.itemsFetched} />
        <StatCard label="منشورات جديدة" value={run.itemsSaved} tone="success" />
        <StatCard label="منشورات محدّثة" value={run.itemsSkipped} />
        <StatCard
          label="عناصر متجاهَلة"
          value={run.itemsFailed}
          tone={run.itemsFailed > 0 ? 'warning' : 'default'}
        />
        <StatCard label="المدة" value={formatDuration(run.durationMs)} />
      </div>

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
            <DetailRow label="Apify Actor">
              <span className="ltr text-xs">{run.actorId}</span>
            </DetailRow>
            <DetailRow label="معرّف التشغيل على Apify">
              <span className="ltr text-xs">{run.apifyRunId ?? '—'}</span>
            </DetailRow>
            <DetailRow label="سقف الفوترة">
              <span className="num">{run.maxItems ? formatNumber(run.maxItems) : '—'}</span>
            </DetailRow>
            {/* النافذة المطلوبة تُعرض ليعرف المراجع ما الذي غطّته العملية بالضبط */}
            <DetailRow label="النطاق الزمني المطلوب">
              {run.windowFrom && run.windowTo ? (
                <span className="num">
                  {formatDate(run.windowFrom)} — {formatDate(run.windowTo)}
                </span>
              ) : (
                <span className="text-subtle-foreground">حسب إعدادات الحساب (تشغيل مجدول)</span>
              )}
            </DetailRow>
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
            description="أول ثلاثة عناصر كما وصلت من Apify — للتشخيص وضبط محوّل الحقول"
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

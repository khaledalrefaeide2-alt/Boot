'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Brain, CircleSlash, Play } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Checkbox, Input } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/states';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import {
  EMPTY_FILTERS,
  FilterBar,
  filtersToParams,
  type PostFilterState,
} from '@/components/filters/filter-bar';
import { useFilterOptions, EMPTY_OPTIONS } from '@/lib/hooks/use-filters';
import { api, ApiClientError } from '@/lib/api-client';
import { formatDateTime, formatNumber } from '@/lib/utils';

interface AnalysisRun {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  reanalyze: boolean;
  total: number;
  done: number;
  failed: number;
  review: number;
  flagged: number;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  requestedBy: { name: string } | null;
}

const STATUS_LABEL: Record<AnalysisRun['status'], string> = {
  PENDING: 'بانتظار التشغيل',
  RUNNING: 'جارية',
  SUCCEEDED: 'اكتملت',
  FAILED: 'فشلت',
  CANCELLED: 'أُلغيت',
};

const STATUS_TONE: Record<AnalysisRun['status'], BadgeTone> = {
  PENDING: 'neutral',
  RUNNING: 'info',
  SUCCEEDED: 'success',
  FAILED: 'danger',
  CANCELLED: 'warning',
};

function isLive(status: AnalysisRun['status']): boolean {
  return status === 'PENDING' || status === 'RUNNING';
}

/**
 * شريط التقدّم.
 *
 * `role="progressbar"` مع قيمه لا `div` ملوّن وحده: قارئ الشاشة لا يرى
 * العرض بالنسبة المئوية، ونصُّ «٤٠ من ٥٠٠» تحته يقرؤه — لكنه لا يُعلن
 * تغيّره وحده. والسمات هي ما يجعل التقدّم مسموعاً كما هو مرئي.
 */
function Progress({ done, total }: { done: number; total: number }) {
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-valuenow={done}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-label={`أُنجز ${done} من ${total}`}
      className="h-2 w-full overflow-hidden rounded-full bg-olive-100"
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-500"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function RunCounters({ run }: { run: AnalysisRun }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span>
        <span className="num font-semibold text-foreground">{formatNumber(run.done)}</span> من{' '}
        <span className="num">{formatNumber(run.total)}</span>
      </span>
      {run.review > 0 && (
        <span>
          بحاجة مراجعة: <span className="num font-semibold">{formatNumber(run.review)}</span>
        </span>
      )}
      {run.flagged > 0 && (
        <span className="text-danger">
          بإشارة خطر: <span className="num font-semibold">{formatNumber(run.flagged)}</span>
        </span>
      )}
      {run.failed > 0 && (
        <span>
          تعذّر: <span className="num font-semibold">{formatNumber(run.failed)}</span>
        </span>
      )}
    </div>
  );
}

export function RunsClient() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<PostFilterState>(EMPTY_FILTERS);
  const [reanalyze, setReanalyze] = useState(false);
  const [limit, setLimit] = useState('500');
  const [confirming, setConfirming] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<AnalysisRun | null>(null);

  const optionsQuery = useFilterOptions();
  const params = filtersToParams(filters);

  /*
   * التقدير يُطلب مع كل تغيّر في الفلاتر.
   *
   * وهو استعلام عدّ لا قراءة صفوف، ولا يستدعي المزوّد. والبديل — زرٌّ
   * «احسب» يُضغط — يجعل الرقم اختيارياً، والرقم هنا ليس اختيارياً: هو
   * الفاتورة قبل دفعها.
   */
  const previewQuery = useQuery({
    queryKey: ['analysis-preview', params],
    queryFn: () =>
      api.get<{ preview: { pending: number; matching: number } }>(
        `/api/admin/analysis/runs?preview=1&${new URLSearchParams(params).toString()}`,
      ),
    staleTime: 30_000,
  });

  const runsQuery = useQuery({
    queryKey: ['analysis-runs'],
    queryFn: () => api.get<{ runs: AnalysisRun[] }>('/api/admin/analysis/runs'),
    /*
     * الاستطلاع يعمل ما دامت هناك جولة حيّة، ويتوقّف بعدها.
     *
     * الجولة تكتب عدّاداتها بعد كل دفعة، فلا طريق آخر لمعرفة أين وصلت.
     * وإبقاؤه يعمل بعد انتهائها يستنزف طلباً كل ثلاث ثوانٍ على شاشة
     * ساكنة — وقد تُترك مفتوحة ساعات.
     */
    refetchInterval: (query) =>
      query.state.data?.runs?.some((run) => isLive(run.status)) ? 3_000 : false,
  });

  const runs = runsQuery.data?.runs ?? [];
  const active = runs.find((run) => isLive(run.status)) ?? null;
  const preview = previewQuery.data?.preview;
  const candidates = reanalyze ? preview?.matching : preview?.pending;
  const willAnalyze = Math.min(candidates ?? 0, Number(limit) || 0);

  const start = useMutation({
    mutationFn: () =>
      api.post('/api/admin/analysis/runs', {
        ...params,
        reanalyze,
        limit: Number(limit) || 500,
      }),
    onSuccess: () => {
      toast.success('بدأت الجولة', 'تعمل في الخلفية — يمكنك مغادرة الشاشة');
      setConfirming(false);
      void queryClient.invalidateQueries({ queryKey: ['analysis-runs'] });
    },
    onError: (error) => {
      setConfirming(false);
      toast.error(
        'تعذّر بدء الجولة',
        error instanceof ApiClientError ? error.message : undefined,
      );
    },
  });

  const cancel = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/analysis/runs/${id}`),
    onSuccess: () => {
      toast.success('أُلغيت الجولة', 'ما حُلّل قبل الإلغاء محفوظ');
      setCancelTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['analysis-runs'] });
      void queryClient.invalidateQueries({ queryKey: ['analysis-preview'] });
    },
    onError: (error) =>
      toast.error('تعذّر الإلغاء', error instanceof ApiClientError ? error.message : undefined),
  });

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="جولة تحليل جديدة"
          description="يُعيد الذكاء الاصطناعي قراءة المنشورات المحدَّدة ويكتب لها موقفاً ومشاعر وإشارات خطر."
        />
        <CardBody className="space-y-4">
          <FilterBar
            filters={filters}
            options={optionsQuery.data ?? EMPTY_OPTIONS}
            onChange={setFilters}
            onReset={() => setFilters(EMPTY_FILTERS)}
          />

          <div className="grid gap-4 sm:grid-cols-[1fr_12rem] sm:items-start">
            <div className="space-y-3">
              <Checkbox
                label="أعد تحليل المنشورات المحلَّلة سابقاً"
                description="بدونها تُحلَّل المنشورات التي لا تحليل لها وحدها — وهو الأوفر."
                checked={reanalyze}
                onChange={(event) => setReanalyze(event.target.checked)}
              />

              {preview && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  ضمن هذه الفلاتر:{' '}
                  <span className="num font-semibold text-foreground">
                    {formatNumber(preview.matching)}
                  </span>{' '}
                  منشوراً، منها{' '}
                  <span className="num font-semibold text-foreground">
                    {formatNumber(preview.pending)}
                  </span>{' '}
                  بلا تحليل.
                </p>
              )}
            </div>

            <Input
              label="سقف هذه الجولة"
              type="number"
              min={1}
              max={20000}
              value={limit}
              onChange={(event) => setLimit(event.target.value)}
              hint="حاجز كلفة — لا يتجاوزه عدد المنشورات مهما اتّسع الفلتر"
            />
          </div>

          {/*
            الكلفة تُقال بصراحة لا تُترك للحدس.

            كلّ منشور في الجولة استدعاءٌ مدفوع لمزوّد خارجي، والفلتر الأوسع
            ممّا قُصد يصير فاتورةً لا رسالة خطأ. والرقم يُعرض على الزرّ نفسه
            لا في تلميح بعيد.
          */}
          <Alert tone="warning" title="قبل البدء">
            سيُستدعى المزوّد مرّةً لكل منشور. الجولة تعمل في الخلفية ويمكن إلغاؤها في أي
            لحظة، وما حُلّل قبل الإلغاء يبقى محفوظاً.
          </Alert>

          <Button
            className="w-full sm:w-auto"
            onClick={() => setConfirming(true)}
            disabled={Boolean(active) || willAnalyze === 0 || previewQuery.isPending}
          >
            <Play aria-hidden />
            {active
              ? 'هناك جولة قائمة'
              : willAnalyze > 0
                ? `حلّل ${formatNumber(willAnalyze)} منشوراً`
                : 'لا منشورات مطابقة'}
          </Button>
        </CardBody>
      </Card>

      {active && (
        <Card>
          <CardBody className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Badge tone={STATUS_TONE[active.status]} size="sm">
                  {STATUS_LABEL[active.status]}
                </Badge>
                {active.reanalyze && (
                  <Badge tone="neutral" size="sm">
                    إعادة تحليل
                  </Badge>
                )}
              </div>
              <Button size="sm" variant="secondary" onClick={() => setCancelTarget(active)}>
                <CircleSlash aria-hidden />
                إلغاء
              </Button>
            </div>

            <Progress done={active.done} total={active.total} />
            <RunCounters run={active} />
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="الجولات السابقة" />
        {runsQuery.isPending ? (
          <SkeletonRows rows={4} />
        ) : runsQuery.isError ? (
          <ErrorState
            description={
              runsQuery.error instanceof ApiClientError ? runsQuery.error.message : undefined
            }
          />
        ) : runs.length === 0 ? (
          <EmptyState
            icon={Brain}
            title="لم تُشغَّل جولة بعد"
            description="ابدأ جولة من الأعلى، أو دع التحليل يعمل على المنشور الواحد من شاشة المنشور."
          />
        ) : (
          <ul className="divide-y divide-border">
            {runs.map((run) => (
              <li key={run.id} className="space-y-2 px-4 py-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={STATUS_TONE[run.status]} size="sm">
                      {STATUS_LABEL[run.status]}
                    </Badge>
                    {run.reanalyze && (
                      <Badge tone="neutral" size="sm">
                        إعادة تحليل
                      </Badge>
                    )}
                    <span className="text-2xs text-subtle-foreground">
                      {run.requestedBy?.name ?? 'النظام'} · {formatDateTime(run.createdAt)}
                    </span>
                  </div>
                  {isLive(run.status) && (
                    <Button size="sm" variant="ghost" onClick={() => setCancelTarget(run)}>
                      إلغاء
                    </Button>
                  )}
                </div>

                <RunCounters run={run} />

                {run.errorMessage && (
                  <p className="text-xs leading-relaxed text-danger">{run.errorMessage}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => start.mutate()}
        title="بدء جولة التحليل"
        message={`سيُحلَّل ${formatNumber(willAnalyze)} منشوراً، باستدعاءٍ مدفوع لكل منشور.${
          reanalyze ? ' وستُكتب النتائج فوق التحليلات السابقة.' : ''
        } التصنيفات التي عدّلها مراجعٌ بشريّ لا تُمَس.`}
        confirmLabel="ابدأ"
        loading={start.isPending}
      />

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => cancelTarget && cancel.mutate(cancelTarget.id)}
        title="إلغاء الجولة"
        message="يتوقّف ما لم يبدأ. المنشور الجاري تحليله الآن يكتمل، وما حُلّل قبله يبقى محفوظاً."
        confirmLabel="إلغاء الجولة"
        loading={cancel.isPending}
      />
    </div>
  );
}

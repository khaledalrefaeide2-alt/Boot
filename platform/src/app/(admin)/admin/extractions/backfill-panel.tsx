'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, X } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError, buildQuery } from '@/lib/api-client';
import { ChunkPlanError, inclusiveDays, planChunks } from '@/lib/extraction/chunks';
import { formatDate, formatNumber } from '@/lib/utils';

/*
 * الاستخراج التاريخي في الواجهة.
 *
 * فُصل عن شاشة العمليات لا لطول الملف وحده: التشغيل العادي قرارٌ صغير
 * يُتخذ في ثوانٍ، وهذا قرارٌ يفتح سلسلةً قد تمتدّ ساعات وتُنفق حصةً
 * بقدرها. فله نموذجه، وتقديرُ كلفته معروضٌ قبل زرّ البدء لا بعده.
 */

interface BackfillRow {
  id: string;
  fromDate: string;
  toDate: string;
  chunkDays: number;
  maxItemsPerChunk: number;
  totalChunks: number;
  doneChunks: number;
  failedChunks: number;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  itemsSaved: number;
  itemsFetched: number;
  stopReason: string | null;
  createdAt: string;
  finishedAt: string | null;
  account: { id: string; name: string } | null;
  platform: { name: string } | null;
}

const STATUS_LABELS: Record<BackfillRow['status'], string> = {
  RUNNING: 'قيد التنفيذ',
  COMPLETED: 'مكتمل',
  FAILED: 'متوقف بخطأ',
  CANCELLED: 'ملغى',
};

const STATUS_TONE: Record<BackfillRow['status'], 'info' | 'success' | 'danger' | 'neutral'> = {
  RUNNING: 'info',
  COMPLETED: 'success',
  FAILED: 'danger',
  CANCELLED: 'neutral',
};

const CHUNK_OPTIONS = [
  { value: 7, label: 'أسبوع' },
  { value: 14, label: 'أسبوعان' },
  { value: 30, label: 'شهر' },
  { value: 60, label: 'شهران' },
  { value: 90, label: 'ثلاثة أشهر' },
];

/** حين يتجاوز سقف العناصر هذا الحدّ يُنبَّه المشغّل قبل البدء */
const COST_WARNING_ITEMS = 20_000;

export function BackfillPanel({ canRun, canCancel }: { canRun: boolean; canCancel: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [chunkDays, setChunkDays] = useState('30');
  const [maxItemsPerChunk, setMaxItemsPerChunk] = useState('500');
  const [cancelTarget, setCancelTarget] = useState<BackfillRow | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  const listQuery = useQuery({
    queryKey: ['backfills'],
    queryFn: () => api.get<{ backfills: BackfillRow[] }>('/api/extractions/backfill'),
    // المقاطع تتوالى في العامل الخلفي، فالتقدّم يُتابَع ما دام أحدها يجري
    refetchInterval: (query) =>
      query.state.data?.backfills.some((row) => row.status === 'RUNNING') ? 10_000 : false,
  });

  const accountsQuery = useQuery({
    queryKey: ['accounts-for-backfill'],
    queryFn: () =>
      api.get<{ accounts: { id: string; name: string; platform: { name: string } }[] }>(
        buildQuery('/api/accounts', { pageSize: 200, status: 'ACTIVE' }),
      ),
    enabled: open,
  });

  useEffect(() => {
    if (open) return;
    setAccountId('');
    setFromDate('');
    setToDate('');
    setChunkDays('30');
    setMaxItemsPerChunk('500');
  }, [open]);

  const parsedChunkDays = Number.parseInt(chunkDays, 10);
  const parsedMaxItems = Number.parseInt(maxItemsPerChunk, 10);
  const maxItemsValid =
    Number.isInteger(parsedMaxItems) && parsedMaxItems >= 1 && parsedMaxItems <= 1000;

  /*
   * الخطة تُحسب في المتصفّح بالدالّة نفسها التي يستعملها الخادم.
   * والغرض ليس التحقّق — ذاك في الخادم — بل أن يرى المشغّل عدد النوافذ
   * وسقف عناصرها قبل أن يضغط، لا في فاتورة آخر الشهر.
   */
  const plan = useMemo(() => {
    if (!fromDate || !toDate || !Number.isInteger(parsedChunkDays)) return null;
    try {
      const chunks = planChunks(fromDate, toDate, parsedChunkDays);
      return {
        chunks: chunks.length,
        days: inclusiveDays(fromDate, toDate),
        first: chunks[0] ?? null,
        last: chunks[chunks.length - 1] ?? null,
        error: null as string | null,
      };
    } catch (error) {
      return {
        chunks: 0,
        days: 0,
        first: null,
        last: null,
        error: error instanceof ChunkPlanError ? error.message : 'نطاق غير صالح',
      };
    }
  }, [fromDate, toDate, parsedChunkDays]);

  const ceiling = plan && maxItemsValid ? plan.chunks * parsedMaxItems : 0;
  const canSubmit =
    Boolean(accountId) && Boolean(plan) && !plan?.error && plan!.chunks > 0 && maxItemsValid;

  const startMutation = useMutation({
    mutationFn: () =>
      api.post<{ backfillId: string; chunks: number }>('/api/extractions/backfill', {
        accountId,
        fromDate,
        toDate,
        chunkDays: parsedChunkDays,
        maxItemsPerChunk: parsedMaxItems,
      }),
    onSuccess: (data) => {
      toast.success('بدأ الاستخراج التاريخي', `${data.chunks} نافذة — تُنفَّذ واحدةً بعد أخرى`);
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['backfills'] });
      void queryClient.invalidateQueries({ queryKey: ['extractions'] });
    },
    onError: (error) =>
      toast.error('تعذّر البدء', error instanceof ApiClientError ? error.message : undefined),
  });

  const cancelMutation = useMutation({
    mutationFn: (row: BackfillRow) => api.delete(`/api/extractions/backfill/${row.id}`),
    onSuccess: () => {
      toast.success('أُلغي الاستخراج التاريخي');
      setCancelTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['backfills'] });
      void queryClient.invalidateQueries({ queryKey: ['extractions'] });
    },
    onError: (error) => {
      toast.error('تعذّر الإلغاء', error instanceof ApiClientError ? error.message : undefined);
      setCancelTarget(null);
    },
  });

  const rows = listQuery.data?.backfills ?? [];
  const visible = rows.slice(0, 5);

  /*
   * البطاقة تظهر دائماً لمن يملك التشغيل، لا عند وجود سلسلة فحسب.
   *
   * القدرة التي لا تُرى لا تُستعمل: من لم يشغّل استخراجاً تاريخياً قطّ هو
   * أحوج الناس إلى أن يعرف أنه ممكن، وإخفاء الزرّ حتى تُنشأ أولُ سلسلة
   * يجعل الباب مغلقاً على من لم يفتحه من قبل.
   */
  if (!canRun && visible.length === 0) return null;

  return (
    <>
      <Card className="mb-4">
        <CardHeader
          title="الاستخراج التاريخي"
          description="مدىً يمتدّ سنوات يُنفَّذ نافذةً بعد نافذة — كل نافذة عملية مستقلة في السجل أدناه"
          action={
            canRun ? (
              <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
                <History className="h-4 w-4" aria-hidden />
                بدء استخراج تاريخي
              </Button>
            ) : null
          }
        />
        {visible.length === 0 ? (
          <CardBody>
            <p className="text-xs text-muted-foreground">
              لا توجد سلاسل بعد. التشغيل العادي يغطّي نافذةً واحدة بسقف ألف عنصر؛ وهذا يغطّي
              المدى الطويل بتقسيمه نوافذ متتابعة.
            </p>
          </CardBody>
        ) : (
          <CardBody className="space-y-3">
            {visible.map((row) => {
              const percent =
                row.totalChunks > 0
                  ? Math.min(100, Math.round((row.doneChunks / row.totalChunks) * 100))
                  : 0;

              return (
                <div key={row.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{row.account?.name ?? 'حساب محذوف'}</span>
                      <Badge tone={STATUS_TONE[row.status]} size="sm">
                        {STATUS_LABELS[row.status]}
                      </Badge>
                      <span className="num text-xs text-muted-foreground">
                        {formatDate(row.fromDate)} — {formatDate(row.toDate)}
                      </span>
                    </div>

                    {canCancel && row.status === 'RUNNING' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-danger"
                        onClick={() => setCancelTarget(row)}
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                        إيقاف
                      </Button>
                    )}
                  </div>

                  {/*
                    شريط التقدّم يقيس النوافذ لا المنشورات: عدد المنشورات
                    لا يُعرف قبل جلبه، والنوافذ معلومة من أول لحظة.
                  */}
                  <div
                    className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2"
                    role="progressbar"
                    aria-valuenow={percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="تقدّم الاستخراج التاريخي"
                  >
                    <div
                      className={`h-full rounded-full transition-[width] duration-500 ${
                        row.status === 'FAILED' ? 'bg-danger' : 'bg-primary'
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>

                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      النوافذ <span className="num">{formatNumber(row.doneChunks)}</span> من{' '}
                      <span className="num">{formatNumber(row.totalChunks)}</span>
                    </span>
                    <span>
                      حُفظ <span className="num">{formatNumber(row.itemsSaved)}</span> منشوراً
                    </span>
                    {row.failedChunks > 0 && (
                      <span className="text-warning">
                        فشلت <span className="num">{formatNumber(row.failedChunks)}</span> نافذة
                      </span>
                    )}
                    <span>نافذة كل {row.chunkDays} يوماً</span>
                  </div>

                  {row.stopReason && (
                    <p className="mt-2 text-xs text-danger">{row.stopReason}</p>
                  )}
                </div>
              );
            })}
          </CardBody>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="استخراج تاريخي"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button
              onClick={() => startMutation.mutate()}
              loading={startMutation.isPending}
              disabled={!canSubmit}
            >
              بدء الاستخراج
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert tone="info">
            تشغيلة واحدة لا تغطّي سنوات: سقفها ألف عنصر، والمشغّل يُرجع الأحدث فالأحدث. فيُقسَّم
            المدى نوافذَ قصيرة، ولكل نافذة تشغيلة كاملة تُنفَّذ بعد سابقتها.
          </Alert>

          <Select
            label="الحساب"
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            required
          >
            <option value="">— اختر حساباً —</option>
            {(accountsQuery.data?.accounts ?? []).map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} — {account.platform.name}
              </option>
            ))}
          </Select>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="من تاريخ"
              type="date"
              value={fromDate}
              max={toDate || today}
              onChange={(event) => setFromDate(event.target.value)}
              required
            />
            <Input
              label="إلى تاريخ"
              type="date"
              value={toDate}
              min={fromDate || undefined}
              max={today}
              onChange={(event) => setToDate(event.target.value)}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="طول النافذة"
              value={chunkDays}
              onChange={(event) => setChunkDays(event.target.value)}
              hint="النافذة الأقصر أدقّ وأكثر تشغيلات"
            >
              {CHUNK_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} ({option.value} يوماً)
                </option>
              ))}
            </Select>

            <Input
              label="أقصى عدد للمنشورات في النافذة"
              type="number"
              min={1}
              max={1000}
              value={maxItemsPerChunk}
              onChange={(event) => setMaxItemsPerChunk(event.target.value)}
              error={maxItemsPerChunk !== '' && !maxItemsValid ? 'العدد بين 1 و1000' : undefined}
              hint="سقف الفوترة لكل نافذة على حدة"
            />
          </div>

          {plan?.error && <Alert tone="danger">{plan.error}</Alert>}

          {plan && !plan.error && maxItemsValid && (
            <div className="rounded-lg border border-border bg-surface-2 p-3 text-sm">
              <p className="mb-2 font-medium">ما الذي سيجري</p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>
                  المدى <span className="num">{formatNumber(plan.days)}</span> يوماً، يُقسَّم{' '}
                  <span className="num font-semibold text-foreground">
                    {formatNumber(plan.chunks)}
                  </span>{' '}
                  نافذة.
                </li>
                <li>
                  سقف العناصر لكل المدى{' '}
                  <span className="num font-semibold text-foreground">
                    {formatNumber(ceiling)}
                  </span>{' '}
                  عنصراً — وهو أعلى تقدير لا توقّعاً؛ النافذة التي لا تحوي هذا العدد تُرجع ما
                  فيها فقط.
                </li>
                {plan.first && plan.last && (
                  <li>
                    يبدأ من الأحدث ({plan.first.from} — {plan.first.to}) وينتهي عند الأقدم (
                    {plan.last.from} — {plan.last.to}).
                  </li>
                )}
              </ul>
            </div>
          )}

          {ceiling > COST_WARNING_ITEMS && (
            <Alert tone="warning" title="مدى كبير">
              سقف <span className="num">{formatNumber(ceiling)}</span> عنصر يُنفق من الحصة
              المدفوعة بقدره. جرّب سنةً واحدة أولاً لتقيس ما يُرجعه المشغّل فعلاً قبل أن تفتح
              المدى كاملاً.
            </Alert>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => cancelTarget && cancelMutation.mutate(cancelTarget)}
        title="إيقاف الاستخراج التاريخي"
        message={`سيتوقّف عند النافذة ${cancelTarget?.doneChunks ?? 0} من ${
          cancelTarget?.totalChunks ?? 0
        }. ما حُفظ حتى الآن يبقى، وما بقي من المدى لا يُستخرج.`}
        confirmLabel="إيقاف"
        loading={cancelMutation.isPending}
      />
    </>
  );
}

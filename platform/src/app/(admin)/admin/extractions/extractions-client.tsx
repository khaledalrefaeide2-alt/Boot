'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, CircleStop, Play, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { Badge, StatusDot } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Table, TBody, TD, TH, THead, TR, TableWrapper } from '@/components/ui/table';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/states';
import { Pagination } from '@/components/ui/pagination';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError, buildQuery } from '@/lib/api-client';
import {
  EXTRACTION_STATUS_LABELS,
  EXTRACTION_STATUS_TONE,
  EXTRACTION_TRIGGER_LABELS,
} from '@/lib/domain/constants';
import { formatDateTime, formatDuration, formatNumber, formatRelativeTime } from '@/lib/utils';
import type { ExtractionStatus, ExtractionTrigger } from '@/generated/prisma';

interface RunRow {
  id: string;
  status: ExtractionStatus;
  trigger: ExtractionTrigger;
  actorId: string;
  apifyRunId: string | null;
  maxItems: number | null;
  itemsFetched: number;
  itemsSaved: number;
  itemsSkipped: number;
  itemsFailed: number;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  createdAt: string;
  account: { id: string; name: string } | null;
  platform: { id: string; name: string } | null;
  requestedBy: { name: string } | null;
}

interface RunsResponse {
  runs: RunRow[];
  total: number;
  page: number;
  pageSize: number;
  activeCount: number;
}

interface IntegrationStatus {
  apify: { configured: boolean; ok: boolean; message: string; username?: string };
  queue: { ready: boolean; message: string };
  activeRuns: number;
}

export function ExtractionsClient({ canRun, canCancel }: { canRun: boolean; canCancel: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [runModalOpen, setRunModalOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [cancelTarget, setCancelTarget] = useState<RunRow | null>(null);

  const statusQuery = useQuery({
    queryKey: ['apify-status'],
    queryFn: () => api.get<IntegrationStatus>('/api/apify/status'),
    refetchInterval: 60_000,
  });

  const accountsQuery = useQuery({
    queryKey: ['accounts-for-run'],
    queryFn: () =>
      api.get<{ accounts: { id: string; name: string; platform: { name: string } }[] }>(
        buildQuery('/api/accounts', { pageSize: 200, status: 'ACTIVE' }),
      ),
    enabled: runModalOpen,
  });

  const query = useQuery({
    queryKey: ['extractions', page, statusFilter],
    queryFn: () =>
      api.get<RunsResponse>(buildQuery('/api/extractions', { page, pageSize: 25, status: statusFilter })),
    // تحديث تلقائي ما دامت هناك عملية قائمة
    refetchInterval: (query) =>
      (query.state.data?.activeCount ?? 0) > 0 ? 5000 : false,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['extractions'] });
    void queryClient.invalidateQueries({ queryKey: ['apify-status'] });
  };

  const runMutation = useMutation({
    mutationFn: () => api.post<{ message: string }>('/api/extractions', { accountId: selectedAccount }),
    onSuccess: (data) => {
      toast.success('بدأت العملية', data.message);
      setRunModalOpen(false);
      setSelectedAccount('');
      invalidate();
    },
    onError: (error) =>
      toast.error('تعذّر التشغيل', error instanceof ApiClientError ? error.message : undefined),
  });

  const cancelMutation = useMutation({
    mutationFn: (run: RunRow) => api.post(`/api/extractions/${run.id}/cancel`),
    onSuccess: () => {
      toast.success('أُلغيت العملية');
      setCancelTarget(null);
      invalidate();
    },
    onError: (error) => {
      toast.error('تعذّر الإلغاء', error instanceof ApiClientError ? error.message : undefined);
      setCancelTarget(null);
    },
  });

  const data = query.data;
  const integration = statusQuery.data;

  return (
    <>
      <PageHeader
        title="عمليات الاستخراج"
        description="سجل عمليات جلب المنشورات من Apify وحالة كل عملية"
        action={
          <>
            <Button variant="secondary" onClick={() => query.refetch()} aria-label="تحديث">
              <RefreshCw className="h-4 w-4" aria-hidden />
              تحديث
            </Button>
            {canRun && (
              <Button onClick={() => setRunModalOpen(true)}>
                <Play className="h-4 w-4" aria-hidden />
                تشغيل استخراج
              </Button>
            )}
          </>
        }
      />

      {integration && (!integration.apify.ok || !integration.queue.ready) && (
        <div className="mb-4 space-y-2">
          {!integration.apify.ok && (
            <Alert tone="danger" title="تكامل Apify غير جاهز">
              {integration.apify.message}
              {!integration.apify.configured &&
                ' — أضف APIFY_TOKEN إلى ملف البيئة ثم أعد تشغيل الخدمة.'}
            </Alert>
          )}
          {!integration.queue.ready && (
            <Alert tone="warning" title="الطابور غير متاح">
              {integration.queue.message} — شغّل Redis والعامل الخلفي (npm run worker).
            </Alert>
          )}
        </div>
      )}

      {integration?.apify.ok && integration.queue.ready && (
        <Alert tone="success" className="mb-4">
          Apify متصل{integration.apify.username ? ` باسم ${integration.apify.username}` : ''} والطابور
          يعمل.
          {integration.activeRuns > 0 && (
            <>
              {' '}
              يوجد <span className="num font-semibold">{integration.activeRuns}</span> عملية قائمة الآن.
            </>
          )}
        </Alert>
      )}

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-border px-4 py-3">
          <Select
            wrapperClassName="w-48"
            label="الحالة"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="">كل الحالات</option>
            {Object.entries(EXTRACTION_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>

        {query.isPending ? (
          <SkeletonRows rows={6} />
        ) : query.isError ? (
          <ErrorState
            description={query.error instanceof ApiClientError ? query.error.message : undefined}
            action={
              <Button variant="secondary" onClick={() => query.refetch()}>
                إعادة المحاولة
              </Button>
            }
          />
        ) : !data || data.runs.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="لا توجد عمليات استخراج"
            description="شغّل أول عملية لجلب المنشورات من المنصات المرصودة"
            action={
              canRun && (
                <Button variant="secondary" onClick={() => setRunModalOpen(true)}>
                  تشغيل استخراج
                </Button>
              )
            }
          />
        ) : (
          <>
            <TableWrapper>
              <Table>
                <THead>
                  <TR>
                    <TH>الحالة</TH>
                    <TH>الحساب</TH>
                    <TH>المنصة</TH>
                    <TH>المصدر</TH>
                    <TH>جُلب</TH>
                    <TH>حُفظ</TH>
                    <TH>حُدّث</TH>
                    <TH>فشل</TH>
                    <TH>المدة</TH>
                    <TH>البدء</TH>
                    <TH className="text-end">إجراءات</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.runs.map((run) => (
                    <TR key={run.id}>
                      <TD>
                        <Badge tone={EXTRACTION_STATUS_TONE[run.status]}>
                          <StatusDot tone={EXTRACTION_STATUS_TONE[run.status]} />
                          {EXTRACTION_STATUS_LABELS[run.status]}
                        </Badge>
                      </TD>
                      <TD className="max-w-48 truncate text-sm">
                        <Link
                          href={`/admin/extractions/${run.id}`}
                          className="hover:text-primary hover:underline"
                        >
                          {run.account?.name ?? 'حساب محذوف'}
                        </Link>
                      </TD>
                      <TD className="text-xs text-muted-foreground">{run.platform?.name ?? '—'}</TD>
                      <TD className="text-xs text-muted-foreground">
                        {EXTRACTION_TRIGGER_LABELS[run.trigger]}
                      </TD>
                      <TD className="num">{formatNumber(run.itemsFetched)}</TD>
                      <TD className="num text-success">{formatNumber(run.itemsSaved)}</TD>
                      <TD className="num">{formatNumber(run.itemsSkipped)}</TD>
                      <TD className="num">
                        {run.itemsFailed > 0 ? (
                          <span className="text-warning">{formatNumber(run.itemsFailed)}</span>
                        ) : (
                          '0'
                        )}
                      </TD>
                      <TD className="text-xs text-muted-foreground">
                        {formatDuration(run.durationMs)}
                      </TD>
                      <TD className="whitespace-nowrap text-xs text-muted-foreground">
                        {run.startedAt ? formatRelativeTime(run.startedAt) : formatRelativeTime(run.createdAt)}
                      </TD>
                      <TD>
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/admin/extractions/${run.id}`}>
                            <Button size="sm" variant="secondary">
                              تفاصيل
                            </Button>
                          </Link>
                          {canCancel && ['PENDING', 'RUNNING'].includes(run.status) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-danger"
                              onClick={() => setCancelTarget(run)}
                              aria-label="إلغاء العملية"
                            >
                              <CircleStop className="h-3.5 w-3.5" aria-hidden />
                            </Button>
                          )}
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
            <Pagination
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>

      <Modal
        open={runModalOpen}
        onClose={() => setRunModalOpen(false)}
        title="تشغيل عملية استخراج"
        description="اختر الحساب المراد جلب منشوراته الآن"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRunModalOpen(false)}>
              إلغاء
            </Button>
            <Button
              onClick={() => runMutation.mutate()}
              loading={runMutation.isPending}
              disabled={!selectedAccount}
            >
              تشغيل الآن
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="الحساب"
            value={selectedAccount}
            onChange={(event) => setSelectedAccount(event.target.value)}
            hint="تُستخدم إعدادات الاستخراج المحفوظة للحساب (المدة والعدد الأقصى)"
          >
            <option value="">— اختر الحساب —</option>
            {accountsQuery.data?.accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} — {account.platform.name}
              </option>
            ))}
          </Select>

          <Alert tone="info">
            يُمرَّر العدد الأقصى المحدد للحساب إلى Apify كسقف فوترة إلزامي، فلن تُحاسَب على أكثر منه.
          </Alert>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => cancelTarget && cancelMutation.mutate(cancelTarget)}
        title="إلغاء عملية الاستخراج"
        message={`سيتم إيقاف العملية الجارية للحساب «${cancelTarget?.account?.name ?? ''}» وإيقاف التشغيل على Apify أيضاً.`}
        confirmLabel="إلغاء العملية"
        loading={cancelMutation.isPending}
      />
    </>
  );
}

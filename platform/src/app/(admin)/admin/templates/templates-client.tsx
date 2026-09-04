'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileText, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Table, TBody, TD, TH, THead, TR, TableWrapper } from '@/components/ui/table';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/states';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { FilterBar, EMPTY_FILTERS, filtersToParams, type PostFilterState } from '@/components/filters/filter-bar';
import { useFilterOptions, EMPTY_OPTIONS } from '@/lib/hooks/use-filters';
import { api, ApiClientError, buildQuery } from '@/lib/api-client';
import {
  REPORT_FORMAT_LABELS,
  REPORT_PERIOD_LABELS,
  REPORT_STATUS_LABELS,
} from '@/lib/domain/constants';
import { formatDateTime, formatNumber } from '@/lib/utils';
import type { ReportFormat, ReportPeriod, ReportStatus } from '@/generated/prisma';

interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  period: ReportPeriod;
  format: ReportFormat;
  filters: Record<string, string>;
  status: 'ACTIVE' | 'INACTIVE';
  isScheduled: boolean;
  createdBy: { name: string } | null;
  _count: { runs: number };
}

interface RunRow {
  id: string;
  format: ReportFormat;
  status: ReportStatus;
  rowCount: number | null;
  createdAt: string;
  requestedBy: { name: string } | null;
  template: { name: string } | null;
}

export function TemplatesClient({ canManage }: { canManage: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TemplateRow | null>(null);
  const [filters, setFilters] = useState<PostFilterState>(EMPTY_FILTERS);
  const [form, setForm] = useState({
    name: '',
    description: '',
    period: 'MONTHLY' as ReportPeriod,
    format: 'EXCEL' as ReportFormat,
  });
  const [error, setError] = useState<string | null>(null);

  const optionsQuery = useFilterOptions();

  const query = useQuery({
    queryKey: ['templates'],
    queryFn: () => api.get<{ templates: TemplateRow[]; recentRuns: RunRow[] }>('/api/templates'),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['templates'] });

  const saveMutation = useMutation({
    mutationFn: () =>
      api.post('/api/templates', {
        name: form.name,
        description: form.description || null,
        period: form.period,
        format: form.format,
        filters: filtersToParams(filters),
      }),
    onSuccess: () => {
      toast.success('أُنشئ القالب');
      setFormOpen(false);
      setForm({ name: '', description: '', period: 'MONTHLY', format: 'EXCEL' });
      void invalidate();
    },
    onError: (err) => setError(err instanceof ApiClientError ? err.message : 'تعذّر الحفظ'),
  });

  const deleteMutation = useMutation({
    mutationFn: (template: TemplateRow) => api.delete(`/api/templates/${template.id}`),
    onSuccess: () => {
      toast.success('حُذف القالب');
      setDeleteTarget(null);
      void invalidate();
    },
    onError: (err) => {
      toast.error('تعذّر الحذف', err instanceof ApiClientError ? err.message : undefined);
      setDeleteTarget(null);
    },
  });

  const data = query.data;

  return (
    <>
      <PageHeader
        title="القوالب والتقارير"
        description="قوالب جاهزة بفلاتر محفوظة، وسجل عمليات التصدير"
        action={
          canManage && (
            <Button
              onClick={() => {
                setError(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" aria-hidden />
              قالب جديد
            </Button>
          )
        }
      />

      <Alert tone="info" className="mb-4">
        التقارير المجدولة مؤجَّلة إلى مرحلة لاحقة — البنية جاهزة في القاعدة، والتصدير الآن يدوي
        بضغطة زر من القالب.
      </Alert>

      <Card className="mb-4">
        <CardHeader title="القوالب" />
        {query.isPending ? (
          <SkeletonRows rows={4} />
        ) : query.isError ? (
          <ErrorState description={query.error instanceof ApiClientError ? query.error.message : undefined} />
        ) : !data || data.templates.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="لا توجد قوالب"
            description="احفظ مجموعة فلاتر كقالب لتصدير التقرير نفسه بسرعة في كل مرة"
          />
        ) : (
          <TableWrapper>
            <Table>
              <THead>
                <TR>
                  <TH>القالب</TH>
                  <TH>الدورية</TH>
                  <TH>الصيغة</TH>
                  <TH>الفلاتر</TH>
                  <TH>مرات التشغيل</TH>
                  <TH>أنشأه</TH>
                  <TH className="text-end">إجراءات</TH>
                </TR>
              </THead>
              <TBody>
                {data.templates.map((template) => (
                  <TR key={template.id}>
                    <TD>
                      <p className="font-medium">{template.name}</p>
                      {template.description && (
                        <p className="text-xs text-muted-foreground">{template.description}</p>
                      )}
                    </TD>
                    <TD className="text-xs">{REPORT_PERIOD_LABELS[template.period]}</TD>
                    <TD>
                      <Badge tone="neutral">{REPORT_FORMAT_LABELS[template.format]}</Badge>
                    </TD>
                    <TD className="max-w-56">
                      <span className="flex flex-wrap gap-1">
                        {Object.entries(template.filters)
                          .slice(0, 3)
                          .map(([key, value]) => (
                            <Badge key={key} size="sm">
                              {key}: {String(value)}
                            </Badge>
                          ))}
                      </span>
                    </TD>
                    <TD className="num">{formatNumber(template._count.runs)}</TD>
                    <TD className="text-xs text-muted-foreground">
                      {template.createdBy?.name ?? '—'}
                    </TD>
                    <TD>
                      <div className="flex items-center justify-end gap-1">
                        <a
                          href={buildQuery('/api/reports/export', {
                            ...template.filters,
                            format: 'excel',
                          })}
                        >
                          <Button size="sm" variant="soft">
                            <Download className="h-3.5 w-3.5" aria-hidden />
                            تصدير
                          </Button>
                        </a>
                        {canManage && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-danger"
                            onClick={() => setDeleteTarget(template)}
                            aria-label="حذف القالب"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                        )}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrapper>
        )}
      </Card>

      <Card>
        <CardHeader title="سجل عمليات التصدير" description="آخر عشرين عملية تصدير" />
        {!data || data.recentRuns.length === 0 ? (
          <EmptyState title="لم تُصدَّر أي تقارير بعد" />
        ) : (
          <TableWrapper>
            <Table>
              <THead>
                <TR>
                  <TH>الصيغة</TH>
                  <TH>الحالة</TH>
                  <TH>عدد الصفوف</TH>
                  <TH>القالب</TH>
                  <TH>طلبها</TH>
                  <TH>التاريخ</TH>
                </TR>
              </THead>
              <TBody>
                {data.recentRuns.map((run) => (
                  <TR key={run.id}>
                    <TD>
                      <Badge>{REPORT_FORMAT_LABELS[run.format]}</Badge>
                    </TD>
                    <TD>
                      <Badge tone={run.status === 'SUCCEEDED' ? 'success' : 'neutral'}>
                        {REPORT_STATUS_LABELS[run.status]}
                      </Badge>
                    </TD>
                    <TD className="num">{run.rowCount !== null ? formatNumber(run.rowCount) : '—'}</TD>
                    <TD className="text-xs text-muted-foreground">
                      {run.template?.name ?? 'تصدير مباشر'}
                    </TD>
                    <TD className="text-xs text-muted-foreground">{run.requestedBy?.name ?? '—'}</TD>
                    <TD className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDateTime(run.createdAt)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrapper>
        )}
      </Card>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        size="lg"
        title="قالب تقرير جديد"
        description="اضبط الفلاتر التي يعتمدها القالب ثم سمّه"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
              حفظ القالب
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error && <Alert tone="danger">{error}</Alert>}

          <Input
            label="اسم القالب"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="مثال: التقرير الشهري لفيسبوك"
            required
          />

          <Textarea
            label="الوصف"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            rows={2}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="الدورية"
              value={form.period}
              onChange={(event) => setForm({ ...form, period: event.target.value as ReportPeriod })}
            >
              {Object.entries(REPORT_PERIOD_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Select
              label="الصيغة"
              value={form.format}
              onChange={(event) => setForm({ ...form, format: event.target.value as ReportFormat })}
            >
              {Object.entries(REPORT_FORMAT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>

          <div className="rounded-md border border-border p-1">
            <FilterBar
              filters={filters}
              options={optionsQuery.data ?? EMPTY_OPTIONS}
              onChange={setFilters}
              onReset={() => setFilters(EMPTY_FILTERS)}
              className="border-0 shadow-none"
            />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
        title="حذف القالب"
        message={`سيتم حذف «${deleteTarget?.name ?? ''}». سجل عمليات التصدير السابقة يبقى محفوظاً.`}
        confirmLabel="حذف"
        loading={deleteMutation.isPending}
      />
    </>
  );
}

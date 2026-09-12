'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListChecks, Plus, Star, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Checkbox } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/states';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { FilterBar, EMPTY_FILTERS, filtersToParams, type PostFilterState } from '@/components/filters/filter-bar';
import { useFilterOptions, EMPTY_OPTIONS } from '@/lib/hooks/use-filters';
import { api, ApiClientError, buildQuery } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';

interface SavedDashboard {
  id: string;
  name: string;
  description: string | null;
  filters: Record<string, string>;
  isDefault: boolean;
  updatedAt: string;
}

export function DashboardsClient() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SavedDashboard | null>(null);
  const [filters, setFilters] = useState<PostFilterState>(EMPTY_FILTERS);
  const [form, setForm] = useState({ name: '', description: '', isDefault: false });
  const [error, setError] = useState<string | null>(null);

  const optionsQuery = useFilterOptions();

  const query = useQuery({
    queryKey: ['dashboards'],
    queryFn: () => api.get<{ dashboards: SavedDashboard[] }>('/api/dashboards'),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['dashboards'] });

  const saveMutation = useMutation({
    mutationFn: () =>
      api.post('/api/dashboards', {
        name: form.name,
        description: form.description || null,
        filters: filtersToParams(filters),
        isDefault: form.isDefault,
      }),
    onSuccess: () => {
      toast.success('حُفظت اللوحة');
      setFormOpen(false);
      setForm({ name: '', description: '', isDefault: false });
      void invalidate();
    },
    onError: (err) => setError(err instanceof ApiClientError ? err.message : 'تعذّر الحفظ'),
  });

  const deleteMutation = useMutation({
    mutationFn: (dashboard: SavedDashboard) => api.delete(`/api/dashboards/${dashboard.id}`),
    onSuccess: () => {
      toast.success('حُذفت اللوحة');
      setDeleteTarget(null);
      void invalidate();
    },
    onError: (err) => {
      toast.error('تعذّر الحذف', err instanceof ApiClientError ? err.message : undefined);
      setDeleteTarget(null);
    },
  });

  const dashboards = query.data?.dashboards ?? [];

  return (
    <>
      <PageHeader
        title="اللوحات المحفوظة"
        description="احفظ مجموعة فلاتر تستخدمها كثيراً وارجع إليها بنقرة واحدة"
        action={
          <Button
            onClick={() => {
              setError(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden />
            حفظ لوحة جديدة
          </Button>
        }
      />

      <Alert tone="info" className="mb-4">
        اللوحات المحفوظة خاصة بك وحدك ولا يراها المستخدمون الآخرون.
      </Alert>

      {query.isPending ? (
        <Card>
          <SkeletonRows rows={4} />
        </Card>
      ) : query.isError ? (
        <Card>
          <ErrorState description={query.error instanceof ApiClientError ? query.error.message : undefined} />
        </Card>
      ) : dashboards.length === 0 ? (
        <Card>
          <EmptyState
            icon={ListChecks}
            title="لا توجد لوحات محفوظة"
            description="اضبط الفلاتر التي تريدها ثم احفظها للرجوع إليها لاحقاً"
            action={
              <Button variant="secondary" onClick={() => setFormOpen(true)}>
                حفظ أول لوحة
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {dashboards.map((dashboard) => (
            <Card key={dashboard.id} className="flex h-full flex-col">
              <CardBody className="flex flex-1 flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{dashboard.name}</p>
                    {dashboard.description && (
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {dashboard.description}
                      </p>
                    )}
                  </div>
                  {dashboard.isDefault && (
                    <Badge tone="primary" size="sm">
                      <Star className="h-3 w-3" aria-hidden />
                      افتراضية
                    </Badge>
                  )}
                </div>

                <div className="flex flex-wrap gap-1">
                  {Object.entries(dashboard.filters)
                    .slice(0, 5)
                    .map(([key, value]) => (
                      <Badge key={key} size="sm">
                        {key}: {String(value)}
                      </Badge>
                    ))}
                </div>

                <p className="mt-auto text-xs text-subtle-foreground">
                  آخر تحديث: {formatDateTime(dashboard.updatedAt)}
                </p>

                <div className="flex items-center gap-2 border-t border-border pt-3">
                  <Link href={buildQuery('/posts', dashboard.filters)} className="flex-1">
                    <Button variant="secondary" size="sm" className="w-full">
                      فتح المنشورات
                    </Button>
                  </Link>
                  <Link href={buildQuery('/analytics', dashboard.filters)} className="flex-1">
                    <Button variant="secondary" size="sm" className="w-full">
                      الإحصائيات
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger"
                    onClick={() => setDeleteTarget(dashboard)}
                    aria-label="حذف اللوحة"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        size="lg"
        title="حفظ لوحة جديدة"
        description="اضبط الفلاتر التي تريد حفظها ثم سمّ اللوحة"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
              حفظ اللوحة
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error && <Alert tone="danger">{error}</Alert>}

          <Input
            label="اسم اللوحة"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="مثال: منشورات فيسبوك السلبية"
            required
          />

          <Textarea
            label="وصف مختصر"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            rows={2}
          />

          <div className="rounded-md border border-border p-1">
            <FilterBar
              filters={filters}
              options={optionsQuery.data ?? EMPTY_OPTIONS}
              onChange={setFilters}
              onReset={() => setFilters(EMPTY_FILTERS)}
              className="border-0 shadow-elev-0"
            />
          </div>

          <Checkbox
            label="اجعلها اللوحة الافتراضية"
            description="تُفتح تلقائياً عند الدخول إلى شاشة المنشورات"
            checked={form.isDefault}
            onChange={(event) => setForm({ ...form, isDefault: event.target.checked })}
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
        title="حذف اللوحة المحفوظة"
        message={`سيتم حذف «${deleteTarget?.name ?? ''}». لن تتأثر أي بيانات أخرى.`}
        confirmLabel="حذف"
        loading={deleteMutation.isPending}
      />
    </>
  );
}

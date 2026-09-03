'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Table, TBody, TD, TH, THead, TR, TableWrapper } from '@/components/ui/table';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/states';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { Alert } from '@/components/ui/alert';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError } from '@/lib/api-client';
import { ENTITY_STATUS_LABELS } from '@/lib/domain/constants';
import { formatNumber, formatDate } from '@/lib/utils';

interface PlatformRow {
  id: string;
  code: string;
  name: string;
  icon: string | null;
  color: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  sortOrder: number;
  defaultActorId: string | null;
  createdAt: string;
  _count: { accounts: number; posts: number };
}

const EMPTY_FORM = {
  code: '',
  name: '',
  status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
  sortOrder: 0,
  defaultActorId: '',
  color: '',
};

export function PlatformsAdminClient() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PlatformRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PlatformRow | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const query = useQuery({
    queryKey: ['admin-platforms'],
    queryFn: () => api.get<{ platforms: PlatformRow[] }>('/api/platforms'),
  });

  useEffect(() => {
    if (!formOpen) return;
    setError(null);
    setFieldErrors({});
    setForm(
      editing
        ? {
            code: editing.code,
            name: editing.name,
            status: editing.status,
            sortOrder: editing.sortOrder,
            defaultActorId: editing.defaultActorId ?? '',
            color: editing.color ?? '',
          }
        : EMPTY_FORM,
    );
  }, [formOpen, editing]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-platforms'] });

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name,
        status: form.status,
        sortOrder: form.sortOrder,
        defaultActorId: form.defaultActorId,
        color: form.color,
      };
      return editing
        ? api.patch(`/api/platforms/${editing.id}`, payload)
        : api.post('/api/platforms', { ...payload, code: form.code });
    },
    onSuccess: () => {
      toast.success(editing ? 'حُدّثت المنصة' : 'أُضيفت المنصة');
      setFormOpen(false);
      void invalidate();
    },
    onError: (err) => {
      if (err instanceof ApiClientError) {
        setError(err.message);
        if (err.details) setFieldErrors(err.details);
      } else setError('تعذّر الحفظ');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (platform: PlatformRow) => api.delete(`/api/platforms/${platform.id}`),
    onSuccess: () => {
      toast.success('حُذفت المنصة');
      setDeleteTarget(null);
      void invalidate();
    },
    onError: (err) => {
      toast.error('تعذّر الحذف', err instanceof ApiClientError ? err.message : undefined);
      setDeleteTarget(null);
    },
  });

  const platforms = query.data?.platforms ?? [];

  return (
    <>
      <PageHeader
        title="إدارة المنصات"
        description="المنصات المرصودة وإعدادات الـ Actor الافتراضي لكل منها"
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden />
            منصة جديدة
          </Button>
        }
      />

      <Card>
        {query.isPending ? (
          <SkeletonRows rows={4} />
        ) : query.isError ? (
          <ErrorState
            description={query.error instanceof ApiClientError ? query.error.message : undefined}
            action={
              <Button variant="secondary" onClick={() => query.refetch()}>
                إعادة المحاولة
              </Button>
            }
          />
        ) : platforms.length === 0 ? (
          <EmptyState icon={Building2} title="لا توجد منصات" description="أضف أول منصة للبدء" />
        ) : (
          <TableWrapper>
            <Table>
              <THead>
                <TR>
                  <TH>المنصة</TH>
                  <TH>الرمز</TH>
                  <TH>الحالة</TH>
                  <TH>Apify Actor</TH>
                  <TH>الحسابات</TH>
                  <TH>المنشورات</TH>
                  <TH>أُضيفت</TH>
                  <TH className="text-end">إجراءات</TH>
                </TR>
              </THead>
              <TBody>
                {platforms.map((platform) => (
                  <TR key={platform.id}>
                    <TD className="font-medium">{platform.name}</TD>
                    <TD className="ltr text-xs text-muted-foreground">{platform.code}</TD>
                    <TD>
                      <Badge tone={platform.status === 'ACTIVE' ? 'success' : 'neutral'}>
                        {ENTITY_STATUS_LABELS[platform.status]}
                      </Badge>
                    </TD>
                    <TD className="ltr max-w-56 truncate text-xs text-muted-foreground">
                      {platform.defaultActorId ?? '— غير محدد —'}
                    </TD>
                    <TD className="num">{formatNumber(platform._count.accounts)}</TD>
                    <TD className="num">{formatNumber(platform._count.posts)}</TD>
                    <TD className="text-xs text-muted-foreground">{formatDate(platform.createdAt)}</TD>
                    <TD>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setEditing(platform);
                            setFormOpen(true);
                          }}
                        >
                          تعديل
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-danger"
                          onClick={() => setDeleteTarget(platform)}
                          aria-label="حذف المنصة"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      </div>
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
        title={editing ? `تعديل ${editing.name}` : 'منصة جديدة'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
              حفظ
            </Button>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            saveMutation.mutate();
          }}
        >
          {error && <Alert tone="danger">{error}</Alert>}

          <Input
            label="اسم المنصة"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            error={fieldErrors.name}
            required
          />

          {!editing && (
            <Input
              label="الرمز"
              value={form.code}
              onChange={(event) => setForm({ ...form, code: event.target.value })}
              error={fieldErrors.code}
              hint="أحرف لاتينية صغيرة وأرقام وشرطات فقط — مثل facebook"
              dir="ltr"
              className="ltr"
              required
            />
          )}

          <Input
            label="Apify Actor الافتراضي"
            value={form.defaultActorId}
            onChange={(event) => setForm({ ...form, defaultActorId: event.target.value })}
            error={fieldErrors.defaultActorId}
            hint="مثال: apify~facebook-posts-scraper — يمكن تجاوزه لكل حساب"
            dir="ltr"
            className="ltr"
            placeholder="username~actor-name"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="الحالة"
              value={form.status}
              onChange={(event) =>
                setForm({ ...form, status: event.target.value as 'ACTIVE' | 'INACTIVE' })
              }
            >
              {Object.entries(ENTITY_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>

            <Input
              label="ترتيب العرض"
              type="number"
              min={0}
              value={form.sortOrder}
              onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })}
            />
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
        title="حذف المنصة"
        message={`سيتم حذف «${deleteTarget?.name ?? ''}» نهائياً. لا يمكن حذف منصة مرتبطة بحسابات — عطّلها بدل ذلك.`}
        confirmLabel="حذف"
        loading={deleteMutation.isPending}
      />
    </>
  );
}

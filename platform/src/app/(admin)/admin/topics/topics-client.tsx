'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Shapes, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Table, TBody, TD, TH, THead, TR, TableWrapper } from '@/components/ui/table';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/states';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError } from '@/lib/api-client';
import { ENTITY_STATUS_LABELS } from '@/lib/domain/constants';
import { formatNumber } from '@/lib/utils';
import type { EntityStatus } from '@/generated/prisma';

interface TopicRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: EntityStatus;
  sortOrder: number;
  rules: unknown;
  _count: { posts: number };
}

function rulesToText(rules: unknown): string {
  if (rules && typeof rules === 'object' && 'terms' in rules) {
    const terms = (rules as { terms?: unknown }).terms;
    if (Array.isArray(terms)) return terms.join('\n');
  }
  return '';
}

const EMPTY = {
  code: '',
  name: '',
  description: '',
  status: 'ACTIVE' as EntityStatus,
  sortOrder: 0,
  termsText: '',
};

export function TopicsClient() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TopicRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TopicRow | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['topics'],
    queryFn: () => api.get<{ topics: TopicRow[] }>('/api/taxonomy/topics'),
  });

  useEffect(() => {
    if (!formOpen) return;
    setError(null);
    setForm(
      editing
        ? {
            code: editing.code,
            name: editing.name,
            description: editing.description ?? '',
            status: editing.status,
            sortOrder: editing.sortOrder,
            termsText: rulesToText(editing.rules),
          }
        : EMPTY,
    );
  }, [formOpen, editing]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['topics'] });

  const saveMutation = useMutation({
    mutationFn: () => {
      const terms = form.termsText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length >= 2);
      const payload = {
        name: form.name,
        description: form.description,
        status: form.status,
        sortOrder: form.sortOrder,
        terms,
      };
      return editing
        ? api.patch(`/api/taxonomy/topics/${editing.id}`, payload)
        : api.post('/api/taxonomy/topics', { ...payload, code: form.code });
    },
    onSuccess: () => {
      toast.success(editing ? 'حُدّث التصنيف' : 'أُضيف التصنيف');
      setFormOpen(false);
      void invalidate();
    },
    onError: (err) => setError(err instanceof ApiClientError ? err.message : 'تعذّر الحفظ'),
  });

  const deleteMutation = useMutation({
    mutationFn: (topic: TopicRow) => api.delete(`/api/taxonomy/topics/${topic.id}`),
    onSuccess: () => {
      toast.success('حُذف التصنيف');
      setDeleteTarget(null);
      void invalidate();
    },
    onError: (err) => {
      toast.error('تعذّر الحذف', err instanceof ApiClientError ? err.message : undefined);
      setDeleteTarget(null);
    },
  });

  const topics = query.data?.topics ?? [];

  return (
    <>
      <PageHeader
        title="التصنيفات"
        description="تصنيف مواضيع المنشورات — تلقائي بقواعد كلمات، ويدوي من شاشة مراجعة البيانات"
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden />
            تصنيف جديد
          </Button>
        }
      />

      <Card>
        {query.isPending ? (
          <SkeletonRows rows={5} />
        ) : query.isError ? (
          <ErrorState description={query.error instanceof ApiClientError ? query.error.message : undefined} />
        ) : topics.length === 0 ? (
          <EmptyState icon={Shapes} title="لا توجد تصنيفات" />
        ) : (
          <TableWrapper>
            <Table>
              <THead>
                <TR>
                  <TH>التصنيف</TH>
                  <TH>الرمز</TH>
                  <TH>قواعد التصنيف</TH>
                  <TH>الحالة</TH>
                  <TH>المنشورات</TH>
                  <TH className="text-end">إجراءات</TH>
                </TR>
              </THead>
              <TBody>
                {topics.map((topic) => {
                  const terms = rulesToText(topic.rules).split('\n').filter(Boolean);
                  return (
                    <TR key={topic.id}>
                      <TD>
                        <p className="font-medium">{topic.name}</p>
                        {topic.description && (
                          <p className="truncate text-xs text-muted-foreground">{topic.description}</p>
                        )}
                      </TD>
                      <TD className="ltr text-xs text-muted-foreground">{topic.code}</TD>
                      <TD className="max-w-64">
                        {terms.length > 0 ? (
                          <span className="text-xs text-muted-foreground">
                            {terms.slice(0, 4).join('، ')}
                            {terms.length > 4 ? ` +${terms.length - 4}` : ''}
                          </span>
                        ) : (
                          <span className="text-xs text-subtle-foreground">بلا قواعد — تصنيف يدوي</span>
                        )}
                      </TD>
                      <TD>
                        <Badge tone={topic.status === 'ACTIVE' ? 'success' : 'neutral'}>
                          {ENTITY_STATUS_LABELS[topic.status]}
                        </Badge>
                      </TD>
                      <TD className="num">
                        <Link
                          href={`/posts?topicId=${topic.id}&range=all`}
                          className="hover:text-primary hover:underline"
                        >
                          {formatNumber(topic._count.posts)}
                        </Link>
                      </TD>
                      <TD>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setEditing(topic);
                              setFormOpen(true);
                            }}
                          >
                            تعديل
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-danger"
                            onClick={() => setDeleteTarget(topic)}
                            aria-label="حذف"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableWrapper>
        )}
      </Card>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `تعديل ${editing.name}` : 'تصنيف جديد'}
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

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="اسم التصنيف"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              required
            />
            {!editing && (
              <Input
                label="الرمز"
                value={form.code}
                onChange={(event) => setForm({ ...form, code: event.target.value })}
                dir="ltr"
                className="ltr"
                hint="أحرف لاتينية صغيرة"
                required
              />
            )}
          </div>

          <Textarea
            label="الوصف"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            rows={2}
          />

          <Textarea
            label="قواعد التصنيف التلقائي"
            value={form.termsText}
            onChange={(event) => setForm({ ...form, termsText: event.target.value })}
            rows={6}
            hint="كلمة في كل سطر — يُصنَّف المنشور تلقائياً على التصنيف صاحب أكبر عدد مطابقات. اتركها فارغة للتصنيف اليدوي فقط."
            placeholder={'افتتاح\nمشروع\nخدمة'}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="الحالة"
              value={form.status}
              onChange={(event) => setForm({ ...form, status: event.target.value as EntityStatus })}
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
        title="حذف التصنيف"
        message={`سيُحذف «${deleteTarget?.name ?? ''}» وتصبح ${formatNumber(deleteTarget?._count.posts ?? 0)} منشوراً بلا تصنيف. المنشورات نفسها لن تُحذف.`}
        confirmLabel="حذف"
        loading={deleteMutation.isPending}
      />
    </>
  );
}

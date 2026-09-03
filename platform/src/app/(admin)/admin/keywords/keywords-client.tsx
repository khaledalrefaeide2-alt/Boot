'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Plus, Search, Tags, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select, Checkbox } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Table, TBody, TD, TH, THead, TR, TableWrapper } from '@/components/ui/table';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/states';
import { Pagination } from '@/components/ui/pagination';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError, buildQuery } from '@/lib/api-client';
import { ENTITY_STATUS_LABELS } from '@/lib/domain/constants';
import { formatNumber } from '@/lib/utils';
import type { EntityStatus } from '@/generated/prisma';

interface KeywordRow {
  id: string;
  term: string;
  category: string | null;
  weight: number;
  status: EntityStatus;
  isAlerting: boolean;
  matchCount: number;
  _count: { posts: number; accounts: number };
}

const EMPTY = {
  term: '',
  category: '',
  weight: 1,
  status: 'ACTIVE' as EntityStatus,
  isAlerting: false,
};

export function KeywordsClient() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<KeywordRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<KeywordRow | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['keywords', page, search],
    queryFn: () =>
      api.get<{ keywords: KeywordRow[]; total: number; page: number; pageSize: number }>(
        buildQuery('/api/taxonomy/keywords', { page, pageSize: 25, q: search }),
      ),
  });

  useEffect(() => {
    if (!formOpen) return;
    setError(null);
    setForm(
      editing
        ? {
            term: editing.term,
            category: editing.category ?? '',
            weight: editing.weight,
            status: editing.status,
            isAlerting: editing.isAlerting,
          }
        : EMPTY,
    );
  }, [formOpen, editing]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['keywords'] });

  const saveMutation = useMutation({
    mutationFn: () =>
      editing
        ? api.patch(`/api/taxonomy/keywords/${editing.id}`, form)
        : api.post('/api/taxonomy/keywords', form),
    onSuccess: () => {
      toast.success(editing ? 'حُدّثت الكلمة' : 'أُضيفت الكلمة');
      setFormOpen(false);
      void invalidate();
    },
    onError: (err) => setError(err instanceof ApiClientError ? err.message : 'تعذّر الحفظ'),
  });

  const deleteMutation = useMutation({
    mutationFn: (keyword: KeywordRow) => api.delete(`/api/taxonomy/keywords/${keyword.id}`),
    onSuccess: () => {
      toast.success('حُذفت الكلمة');
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
        title="الكلمات المفتاحية"
        description="تُستخدم للبحث والتصنيف داخل المنشورات المخزّنة، ويمكن جعلها كلمات تنبيه"
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden />
            كلمة جديدة
          </Button>
        }
      />

      <Alert tone="info" className="mb-4">
        الرصد في النسخة الأولى يتم بمتابعة حسابات محددة، والكلمات المفتاحية أداة بحث وتصنيف داخل
        البيانات المستخرجة — لا أداة رصد عام على المنصات.
      </Alert>

      <Card>
        <form
          className="flex flex-wrap items-end gap-3 border-b border-border px-4 py-3"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(searchInput.trim());
            setPage(1);
          }}
        >
          <Input
            wrapperClassName="min-w-52 flex-1"
            label="بحث"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          <Button type="submit" variant="secondary">
            <Search className="h-4 w-4" aria-hidden />
            بحث
          </Button>
        </form>

        {query.isPending ? (
          <SkeletonRows rows={6} />
        ) : query.isError ? (
          <ErrorState description={query.error instanceof ApiClientError ? query.error.message : undefined} />
        ) : !data || data.keywords.length === 0 ? (
          <EmptyState icon={Tags} title="لا توجد كلمات مفتاحية" description="أضف الكلمات التي تهمك لرصدها داخل المنشورات" />
        ) : (
          <>
            <TableWrapper>
              <Table>
                <THead>
                  <TR>
                    <TH>الكلمة</TH>
                    <TH>التصنيف</TH>
                    <TH>الوزن</TH>
                    <TH>الحالة</TH>
                    <TH>تنبيه</TH>
                    <TH>المنشورات</TH>
                    <TH className="text-end">إجراءات</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.keywords.map((keyword) => (
                    <TR key={keyword.id}>
                      <TD className="font-medium">{keyword.term}</TD>
                      <TD className="text-xs text-muted-foreground">{keyword.category ?? '—'}</TD>
                      <TD className="num">{keyword.weight}</TD>
                      <TD>
                        <Badge tone={keyword.status === 'ACTIVE' ? 'success' : 'neutral'}>
                          {ENTITY_STATUS_LABELS[keyword.status]}
                        </Badge>
                      </TD>
                      <TD>
                        {keyword.isAlerting ? (
                          <Badge tone="warning">
                            <Bell className="h-3 w-3" aria-hidden />
                            مفعّل
                          </Badge>
                        ) : (
                          <span className="text-xs text-subtle-foreground">—</span>
                        )}
                      </TD>
                      <TD className="num">
                        <Link
                          href={`/posts?keywordId=${keyword.id}&range=all`}
                          className="hover:text-primary hover:underline"
                        >
                          {formatNumber(keyword._count.posts)}
                        </Link>
                      </TD>
                      <TD>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setEditing(keyword);
                              setFormOpen(true);
                            }}
                          >
                            تعديل
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-danger"
                            onClick={() => setDeleteTarget(keyword)}
                            aria-label="حذف"
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
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
          </>
        )}
      </Card>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'تعديل الكلمة' : 'كلمة مفتاحية جديدة'}
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
            label="الكلمة"
            value={form.term}
            onChange={(event) => setForm({ ...form, term: event.target.value })}
            hint="تُطابَق بعد تطبيع النص العربي (تجاهل التشكيل وتوحيد الألف والياء)"
            required
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label="التصنيف"
              value={form.category}
              onChange={(event) => setForm({ ...form, category: event.target.value })}
            />
            <Input
              label="الوزن"
              type="number"
              min={1}
              max={10}
              value={form.weight}
              onChange={(event) => setForm({ ...form, weight: Number(event.target.value) })}
            />
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
          </div>

          <Checkbox
            label="كلمة تنبيه"
            description="يُطلق تنبيهاً داخلياً للمشرفين عند ظهورها في أي منشور مستخرج"
            checked={form.isAlerting}
            onChange={(event) => setForm({ ...form, isAlerting: event.target.checked })}
          />
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
        title="حذف الكلمة المفتاحية"
        message={`سيتم حذف «${deleteTarget?.term ?? ''}» وفكّ ارتباطها بالمنشورات. المنشورات نفسها لن تُحذف.`}
        confirmLabel="حذف"
        loading={deleteMutation.isPending}
      />
    </>
  );
}

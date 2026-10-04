'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Trash2 } from 'lucide-react';
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
import {
  countTerms,
  describeGroup,
  MAX_SEARCH_GROUPS,
  MAX_SEARCH_TERMS,
  parseSearchTerms,
} from '@/lib/domain/search-terms';
import type { EntityStatus } from '@/generated/prisma';

interface SearchTopicRow {
  id: string;
  name: string;
  query: string;
  description: string | null;
  status: EntityStatus;
  sortOrder: number;
  createdBy: { id: string; name: string } | null;
}

const EMPTY = {
  name: '',
  query: '',
  description: '',
  status: 'ACTIVE' as EntityStatus,
  sortOrder: 0,
};

/**
 * شاشة مواضيع البحث.
 *
 * ★ وجوهرُها المعاينة لا الحقول.
 *
 *   سطرُ البحث لغةٌ صغيرة لها قواعد: مرادفاتٌ بـ`|`، وعبارةٌ بين
 *   علامتين، واستبعادٌ بـ`-`. ومن كتبه في مربّع نصٍّ أصمّ لا يعرف ما
 *   فُهم منه إلا بعد أن يحفظه ويجرّبه ويشكّ. والمعاينة تحت الحقل تقول
 *   ما فُهم قبل الحفظ — بالقارئ نفسه الذي يقرأه الخادم، لا بنسخةٍ ثانية
 *   منه تختلف عنه يوماً.
 */
export function SearchTopicsClient() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SearchTopicRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SearchTopicRow | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['search-topics'],
    queryFn: () => api.get<{ topics: SearchTopicRow[] }>('/api/taxonomy/search-topics'),
  });

  useEffect(() => {
    if (!formOpen) return;
    setError(null);
    setForm(
      editing
        ? {
            name: editing.name,
            query: editing.query,
            description: editing.description ?? '',
            status: editing.status,
            sortOrder: editing.sortOrder,
          }
        : EMPTY,
    );
  }, [formOpen, editing]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['search-topics'] });
    // شريط الفلاتر يحمل القائمة نفسها، فلا يبقى على نسخةٍ قديمة بعد التعديل
    void queryClient.invalidateQueries({ queryKey: ['filter-options'] });
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name,
        query: form.query,
        description: form.description,
        status: form.status,
        sortOrder: form.sortOrder,
      };
      return editing
        ? api.patch(`/api/taxonomy/search-topics/${editing.id}`, payload)
        : api.post('/api/taxonomy/search-topics', payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'حُدّث الموضوع' : 'أُضيف الموضوع');
      setFormOpen(false);
      invalidate();
    },
    onError: (err) => setError(err instanceof ApiClientError ? err.message : 'تعذّر الحفظ'),
  });

  const deleteMutation = useMutation({
    mutationFn: (topic: SearchTopicRow) => api.delete(`/api/taxonomy/search-topics/${topic.id}`),
    onSuccess: () => {
      toast.success('حُذف الموضوع');
      setDeleteTarget(null);
      invalidate();
    },
    onError: (err) => {
      toast.error('تعذّر الحذف', err instanceof ApiClientError ? err.message : undefined);
      setDeleteTarget(null);
    },
  });

  const topics = query.data?.topics ?? [];
  const preview = parseSearchTerms(form.query);

  return (
    <>
      <PageHeader
        title="مواضيع البحث"
        description="سطرُ بحثٍ محفوظ باسم — يُنفَّذ على التاريخ كلّه، فتعديلُه يسري فوراً على ما مضى وما يأتي"
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden />
            موضوع جديد
          </Button>
        }
      />

      <Card>
        {query.isPending ? (
          <SkeletonRows rows={5} />
        ) : query.isError ? (
          <ErrorState
            description={query.error instanceof ApiClientError ? query.error.message : undefined}
          />
        ) : topics.length === 0 ? (
          <EmptyState
            icon={Search}
            title="لا توجد مواضيع محفوظة"
            description="الموضوع يجمع مرادفات الكلمة الواحدة في شرط: كهرباء|تيار|كهربا مع انقطاع|تقنين"
          />
        ) : (
          <TableWrapper>
            <Table>
              <THead>
                <TR>
                  <TH>الموضوع</TH>
                  <TH>الشروط</TH>
                  <TH>الحالة</TH>
                  <TH>أضافه</TH>
                  <TH className="text-end">إجراءات</TH>
                </TR>
              </THead>
              <TBody>
                {topics.map((topic) => {
                  const parsed = parseSearchTerms(topic.query);
                  return (
                    <TR key={topic.id}>
                      <TD>
                        <p className="font-medium">{topic.name}</p>
                        {topic.description && (
                          <p className="truncate text-xs text-muted-foreground">
                            {topic.description}
                          </p>
                        )}
                      </TD>
                      <TD className="max-w-80">
                        {/*
                          الشروط تُعرض مقروءةً لا كسطرٍ خام.

                          السطر «كهرباء|تيار انقطاع» يُقرأ في عمودٍ ضيّق
                          كلمةً واحدة غريبة. والشرائح تقول ما يعنيه:
                          شريحةٌ لكل شرط، و«أو» بين مرادفاته.
                        */}
                        <div className="flex flex-wrap gap-1">
                          {parsed.include.map((group) => (
                            <Badge key={group.join('|')} tone="primary" size="sm">
                              {describeGroup(group)}
                            </Badge>
                          ))}
                          {parsed.exclude.map((term) => (
                            <Badge key={`x-${term}`} tone="danger" size="sm">
                              −{term}
                            </Badge>
                          ))}
                        </div>
                      </TD>
                      <TD>
                        <Badge tone={topic.status === 'ACTIVE' ? 'success' : 'neutral'}>
                          {ENTITY_STATUS_LABELS[topic.status]}
                        </Badge>
                      </TD>
                      <TD className="text-xs text-muted-foreground">
                        {topic.createdBy?.name ?? '—'}
                      </TD>
                      <TD>
                        <div className="flex items-center justify-end gap-1">
                          {/* «جرّبه» يفتح شاشة المنشورات بسطر الموضوع نفسه — فالنتيجة تُرى لا تُوصف */}
                          <Link
                            href={`/posts?q=${encodeURIComponent(topic.query)}&range=all`}
                            className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:underline"
                          >
                            جرّبه
                          </Link>
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
                            size="icon-sm"
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
        title={editing ? `تعديل ${editing.name}` : 'موضوع جديد'}
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
            label="اسم الموضوع"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            required
          />

          <Textarea
            label="سطر البحث"
            value={form.query}
            onChange={(event) => setForm({ ...form, query: event.target.value })}
            rows={3}
            hint="المرادفات بـ | والشروط بمسافة بينها · «عبارة» بعلامتَي تنصيص · -كلمة للاستبعاد"
            placeholder="كهرباء|تيار|كهربا انقطاع|تقنين|قطع -مزحة"
            required
          />

          {/*
            المعاينة تحت الحقل مباشرةً.

            وهي القارئ نفسه الذي يبني الاستعلام في الخادم، لا نسخةً ثانية
            منه: ما يُعرض هنا هو ما سيُبحث عنه حرفاً بحرف.
          */}
          {form.query.trim().length > 0 && (
            <div className="rounded-lg border border-border bg-surface-2 p-3">
              <p className="mb-2 text-2xs text-muted-foreground">
                يُطابَق المنشور الذي يحقّق هذه الشروط كلّها:
              </p>
              {preview.include.length === 0 ? (
                <p className="text-xs text-danger">
                  لا شرط صالح في السطر — سيُرجع الموضوع كلّ المنشورات
                </p>
              ) : (
                <ul className="flex flex-wrap items-center gap-1.5">
                  {preview.include.map((group) => (
                    <li key={group.join('|')}>
                      <Badge tone="primary" size="sm">
                        {describeGroup(group)}
                      </Badge>
                    </li>
                  ))}
                  {preview.exclude.map((term) => (
                    <li key={`x-${term}`}>
                      <Badge tone="danger" size="sm">
                        −{term}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
              {preview.dropped.length > 0 && (
                <p className="mt-2 text-2xs text-warning">
                  أُسقط: {preview.dropped.join('، ')} — حرفٌ واحد أو مكرَّر أو أطول من الحدّ
                </p>
              )}
              {(preview.include.length >= MAX_SEARCH_GROUPS ||
                countTerms(preview) >= MAX_SEARCH_TERMS) && (
                <p className="num mt-2 text-2xs text-warning">
                  بلغ الحدّ: {MAX_SEARCH_GROUPS} شروط و{MAX_SEARCH_TERMS} كلمة
                </p>
              )}
            </div>
          )}

          <Textarea
            label="الوصف"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            rows={2}
            hint="لمن يقرأ القائمة بعد شهر — ما الذي يرصده هذا الموضوع بالضبط"
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
        title="حذف موضوع البحث"
        message={`سيُحذف «${deleteTarget?.name ?? ''}» من قائمة المواضيع. ولا يُمسّ منشور واحد — الموضوع سطرُ بحثٍ لا رابطة.`}
        confirmLabel="حذف"
        loading={deleteMutation.isPending}
      />
    </>
  );
}

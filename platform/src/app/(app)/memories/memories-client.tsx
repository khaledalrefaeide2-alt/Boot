'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookMarked, Pencil, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Modal } from '@/components/ui/modal';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';

/*
 * تعليمات المساعد — شاشة صاحبها.
 *
 * التعليمة تُغيّر أسلوب الجواب لا حقيقته، فإدارتها بيد صاحبها بلا إذن
 * إضافي. والعامّة وحدها ترجع إلى `taxonomy.manage` — الإذن نفسه الذي
 * يحرس توجيهات التصنيف، لأنها كذلك تسري على الجميع.
 */

const KINDS = [
  { value: 'GENERAL', label: 'تعليمة عامة' },
  { value: 'WORK', label: 'تعليمة عمل' },
  { value: 'REPORTING', label: 'تفضيل في التقارير' },
  { value: 'CLASSIFICATION', label: 'ملاحظة على التصنيف' },
  { value: 'GLOSSARY', label: 'مصطلح أو مرادف' },
] as const;

const KIND_LABEL = new Map<string, string>(KINDS.map((kind) => [kind.value, kind.label]));

interface MemoryRow {
  id: string;
  userId: string;
  title: string;
  content: string;
  kind: string;
  scope: string;
  status: string;
  priority: number;
  createdAt: string;
  updatedAt: string;
  sourceConversationId: string | null;
  user: { name: string } | null;
}

interface MemoriesResponse {
  memories: MemoryRow[];
  canManageGlobal: boolean;
  limits: { perUser: number; titleChars: number; contentChars: number; maxPriority: number };
}

const EMPTY = { title: '', content: '', kind: 'GENERAL', scope: 'USER', priority: 0 };

export function MemoriesClient() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<MemoryRow | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);

  const query = useQuery({
    queryKey: ['memories'],
    queryFn: () => api.get<MemoriesResponse>('/api/assistant/memories'),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['memories'] });
  const fail = (title: string) => (error: unknown) =>
    toast.error(title, error instanceof ApiClientError ? error.message : undefined);

  const saveMutation = useMutation({
    mutationFn: () =>
      editing
        ? api.patch(`/api/assistant/memories/${editing.id}`, form)
        : api.post('/api/assistant/memories', form),
    onSuccess: () => {
      toast.success(editing ? 'حُفظ التعديل' : 'حُفظت التعليمة');
      setOpen(false);
      setEditing(null);
      setForm(EMPTY);
      void invalidate();
    },
    onError: fail('تعذّر الحفظ'),
  });

  const toggleMutation = useMutation({
    mutationFn: (row: MemoryRow) =>
      api.patch(`/api/assistant/memories/${row.id}`, {
        status: row.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE',
      }),
    onSuccess: () => void invalidate(),
    onError: fail('تعذّر التغيير'),
  });

  const deleteMutation = useMutation({
    mutationFn: (row: MemoryRow) => api.delete(`/api/assistant/memories/${row.id}`),
    onSuccess: () => {
      toast.success('حُذفت التعليمة');
      void invalidate();
    },
    onError: fail('تعذّر الحذف'),
  });

  const data = query.data;
  const memories = data?.memories ?? [];

  function startNew() {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  }

  function startEdit(row: MemoryRow) {
    setEditing(row);
    setForm({
      title: row.title,
      content: row.content,
      kind: row.kind,
      scope: row.scope,
      priority: row.priority,
    });
    setOpen(true);
  }

  return (
    <>
      <PageHeader
        title="تعليمات المساعد"
        description="تعليمات يحفظها لك المساعد فيعمل بها — في الأسلوب والأولويات، لا في الأرقام"
        action={
          <Button onClick={startNew}>
            <Plus className="h-4 w-4" aria-hidden />
            تعليمة جديدة
          </Button>
        }
      />

      {/*
        الحدّ يُقال قبل أن يُصطدم به، والسقف يُشرح لا يُفرض صامتاً.
      */}
      <Alert tone="info" className="mb-4">
        تُحقن في كل رسالة التعليماتُ المرتبطة بسؤالك وحدها — لا كلّها. وما ترفع أولويّته يدخل
        دائماً ولو لم يطابق السؤال. والتعليمة تضبط <strong>كيف يُجاب</strong>، ولا تُغيّر رقماً
        ولا تصنيفاً: الأرقام من بيانات المنصة وحدها.
      </Alert>

      {query.isPending ? (
        <Card>
          <SkeletonRows rows={5} />
        </Card>
      ) : query.isError ? (
        <Card>
          <ErrorState
            description={query.error instanceof ApiClientError ? query.error.message : undefined}
          />
        </Card>
      ) : memories.length === 0 ? (
        <Card>
          <EmptyState
            icon={BookMarked}
            title="لا تعليمات محفوظة"
            description="احفظ تعليمة مثل «اجعل تقاريري مختصرة» أو «ركّز على قطاع المحروقات»، فيعمل بها المساعد في كل محادثة."
          />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {memories.map((row) => {
            const mine = row.userId === undefined || row.scope !== 'GLOBAL' || data?.canManageGlobal;
            return (
              <Card key={row.id}>
                <CardHeader
                  title={row.title}
                  description={KIND_LABEL.get(row.kind) ?? 'تعليمة'}
                  action={
                    <div className="flex items-center gap-1.5">
                      {row.scope === 'GLOBAL' && (
                        <Badge tone="info" size="sm">
                          مؤسسية
                        </Badge>
                      )}
                      {row.status === 'DISABLED' && (
                        <Badge tone="warning" size="sm">
                          معطّلة
                        </Badge>
                      )}
                      {row.status === 'PENDING' && (
                        <Badge tone="warning" size="sm">
                          بانتظار الإقرار
                        </Badge>
                      )}
                      {row.priority > 0 && (
                        <Badge tone="success" size="sm">
                          أولوية {row.priority}
                        </Badge>
                      )}
                    </div>
                  }
                />
                <CardBody className="space-y-3">
                  <p className="whitespace-pre-wrap text-sm leading-[1.9] text-foreground">
                    {row.content}
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                    <p className="text-xs text-muted-foreground">
                      {row.scope === 'GLOBAL' && row.user ? `${row.user.name} · ` : ''}
                      {formatDateTime(row.updatedAt)}
                    </p>
                    {mine && (
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => toggleMutation.mutate(row)}
                          loading={toggleMutation.isPending}
                        >
                          {row.status === 'ACTIVE' ? 'تعطيل' : 'تفعيل'}
                        </Button>
                        <Button size="icon-sm" variant="secondary" onClick={() => startEdit(row)} aria-label={`تعديل ${row.title}`}>
                          <Pencil aria-hidden />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="secondary"
                          className="text-danger"
                          aria-label={`حذف ${row.title}`}
                          onClick={() => deleteMutation.mutate(row)}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'تعديل تعليمة' : 'تعليمة جديدة'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              loading={saveMutation.isPending}
              disabled={form.title.trim().length < 2 || form.content.trim().length < 2}
            >
              حفظ
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="العنوان"
            hint="يُعرض في القائمة، ويُبحث فيه عند الانتقاء"
            value={form.title}
            maxLength={data?.limits.titleChars}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
          />
          <Textarea
            label="التعليمة"
            hint="اكتبها كما تقولها للمساعد: «اجعل تقاريري مختصرة»، «ركّز على قطاع المحروقات»."
            rows={5}
            value={form.content}
            maxLength={data?.limits.contentChars}
            onChange={(event) => setForm({ ...form, content: event.target.value })}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="النوع"
              value={form.kind}
              onChange={(event) => setForm({ ...form, kind: event.target.value })}
            >
              {KINDS.map((kind) => (
                <option key={kind.value} value={kind.value}>
                  {kind.label}
                </option>
              ))}
            </Select>
            <Input
              label="الأولوية"
              type="number"
              min={0}
              max={data?.limits.maxPriority ?? 10}
              hint="فوق الصفر تدخل في كل رسالة ولو لم تطابق السؤال"
              value={String(form.priority)}
              onChange={(event) => setForm({ ...form, priority: Number(event.target.value) })}
            />
          </div>
          {data?.canManageGlobal && (
            <Select
              label="المدى"
              hint="المؤسسية تسري على كل من يستعمل المساعد في المنصة"
              value={form.scope}
              onChange={(event) => setForm({ ...form, scope: event.target.value })}
            >
              <option value="USER">لي وحدي</option>
              <option value="GLOBAL">مؤسسية — للجميع</option>
            </Select>
          )}
        </div>
      </Modal>
    </>
  );
}

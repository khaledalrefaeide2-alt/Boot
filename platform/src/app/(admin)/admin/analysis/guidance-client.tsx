'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GraduationCap, MessageSquareQuote, Plus, Trash2 } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, Textarea, Input } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/states';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';

interface Guidance {
  id: string;
  scope: 'STANCE' | 'SENTIMENT' | 'RISK' | 'GENERAL';
  instruction: string;
  isActive: boolean;
  sortOrder: number;
  /** MANUAL كتبه مدير هنا · ASSISTANT التقطه المساعد من محادثة */
  source: 'MANUAL' | 'ASSISTANT';
  /** نصّ المستخدم كما كتبه — لمن يراجع ما استُخلص منه */
  sourceMessage: string | null;
  createdAt: string;
  createdBy: { name: string };
}

const SCOPES = [
  { value: 'GENERAL', label: 'عام' },
  { value: 'STANCE', label: 'الموقف' },
  { value: 'SENTIMENT', label: 'الموقف من الجهات والخدمات' },
  { value: 'RISK', label: 'إشارات المحتوى الضارّ' },
];

const SCOPE_LABEL: Record<string, string> = {
  GENERAL: 'عام',
  STANCE: 'الموقف',
  SENTIMENT: 'الموقف من الجهات والخدمات',
  RISK: 'إشارات المحتوى الضارّ',
};

export function GuidanceClient() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [scope, setScope] = useState('GENERAL');
  const [instruction, setInstruction] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [deleteTarget, setDeleteTarget] = useState<Guidance | null>(null);

  const query = useQuery({
    queryKey: ['analysis-guidance'],
    queryFn: () => api.get<{ guidance: Guidance[] }>('/api/admin/analysis/guidance'),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['analysis-guidance'] });

  const create = useMutation({
    mutationFn: () =>
      api.post('/api/admin/analysis/guidance', {
        scope,
        instruction: instruction.trim(),
        sortOrder: Number(sortOrder) || 0,
      }),
    onSuccess: () => {
      toast.success('أُضيف التوجيه', 'يسري على كل تحليل بعده');
      setInstruction('');
      void invalidate();
    },
    onError: (error) =>
      toast.error('تعذّرت الإضافة', error instanceof ApiClientError ? error.message : undefined),
  });

  const toggle = useMutation({
    mutationFn: (item: Guidance) =>
      api.patch(`/api/admin/analysis/guidance/${item.id}`, { isActive: !item.isActive }),
    onSuccess: () => void invalidate(),
    onError: () => toast.error('تعذّر التعديل'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/analysis/guidance/${id}`),
    onSuccess: () => {
      toast.success('حُذف التوجيه');
      setDeleteTarget(null);
      void invalidate();
    },
    onError: () => toast.error('تعذّر الحذف'),
  });

  const guidance = query.data?.guidance ?? [];

  const awaiting = guidance.filter((item) => item.source === 'ASSISTANT' && !item.isActive);

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
        <Card>
          <CardBody className="space-y-4">
            <Alert tone="info" title="كيف يتعلّم التحليل؟">
              بطريقتين: <strong>توجيه</strong> تكتبه هنا فيسري على كل ما بعده،
              و<strong>تصحيح</strong> يسجّله المراجع على منشور بعينه فيُستعمل مثالاً في
              الحالات المشابهة.
            </Alert>

            <Select
              label="النطاق"
              value={scope}
              onChange={(event) => setScope(event.target.value)}
              hint="يُحقن التوجيه في القسم المناسب من الدليل"
            >
              {SCOPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>

            <Textarea
              label="نصّ التوجيه"
              required
              rows={4}
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              placeholder="مثال: اعتبر المطالبة بتحسين الخدمات نقداً لا معارضة للدولة."
              hint="قاعدة واحدة مختصرة وواضحة. القواعد الطويلة المركّبة تُطبَّق جزئياً."
            />

            <Input
              label="الترتيب"
              type="number"
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
              hint="الأصغر أولاً"
            />

            <Button
              className="w-full"
              onClick={() => create.mutate()}
              disabled={instruction.trim().length < 10}
              loading={create.isPending}
            >
              <Plus className="h-4 w-4" aria-hidden />
              أضف التوجيه
            </Button>

            {/*
              حدّ لا يُتجاوز، ويُقال للمدير صراحةً لا يُترك في الشيفرة.
            */}
            <p className="border-t border-border pt-3 text-2xs leading-relaxed text-subtle-foreground">
              لا يستطيع أي توجيه إلغاء القواعد الأساسية في الدليل. النقد السياسي يبقى
              موقفاً معارضاً ولا يُصنَّف محتوى ضارّاً مهما كُتب هنا.
            </p>
          </CardBody>
        </Card>

        <div className="space-y-4">
          {/*
            ما التقطه المساعد يُعلَن لا يُدسّ في القائمة.

            التوجيه الملتقَط لا أثر له حتى يُفعَّل، فلو مرّ صامتاً لبقي
            معطَّلاً لأن أحداً لم يره — والمستخدم الذي أملاه على المساعد
            يحسبه سارياً. الرقم هنا يقول إن هناك قراراً لم يُتَّخذ بعد.
          */}
          {awaiting.length > 0 && (
            <Alert tone="warning" title={`${awaiting.length} توجيهاً بانتظار قرارك`}>
              التقطها المساعد من محادثات المستخدمين وحفظها معطَّلة. لا يدخل أيٌّ منها
              التحليل حتى تُفعّله أنت.
            </Alert>
          )}

          <Card>
          {query.isPending ? (
            <SkeletonRows rows={5} />
          ) : query.isError ? (
            <ErrorState
              description={
                query.error instanceof ApiClientError ? query.error.message : undefined
              }
            />
          ) : guidance.length === 0 ? (
            <EmptyState
              icon={GraduationCap}
              title="لا توجد توجيهات"
              description="التحليل يعمل بالدليل الأساسي وحده حتى تُضاف توجيهات."
            />
          ) : (
            <ul className="divide-y divide-border">
              {guidance.map((item) => (
                <li key={item.id} className="flex items-start gap-3 px-4 py-3.5">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="neutral" size="sm">
                        {SCOPE_LABEL[item.scope] ?? item.scope}
                      </Badge>
                      <Badge tone={item.isActive ? 'success' : 'neutral'} size="sm">
                        {item.isActive ? 'مفعّل' : 'معطّل'}
                      </Badge>
                      {item.source === 'ASSISTANT' && (
                        <Badge tone="info" size="sm">
                          <MessageSquareQuote className="h-3 w-3" aria-hidden />
                          من المساعد
                        </Badge>
                      )}
                      <span className="num text-2xs text-subtle-foreground">
                        #{item.sortOrder}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed text-foreground">
                      {item.instruction}
                    </p>

                    {/*
                      نصّ المستخدم الأصلي يُعرض مع ما استُخلص منه.

                      التوجيه المعروض صياغةُ نموذجٍ لجملةِ إنسان، والنموذج
                      يخطئ في الصياغة كما يخطئ في غيرها. ومن يُفعّل قاعدة
                      تحكم تصنيف كل منشور بعدها يحتاج أن يرى ما قيل فعلاً
                      لا ما فهمه النموذج وحده.
                    */}
                    {item.sourceMessage && (
                      <details className="group">
                        <summary className="cursor-pointer text-2xs text-muted-foreground hover:text-foreground">
                          اعرض نصّ المستخدم الأصلي
                        </summary>
                        <blockquote className="mt-1.5 border-s-2 border-border ps-2.5 text-2xs leading-relaxed text-subtle-foreground">
                          {item.sourceMessage}
                        </blockquote>
                      </details>
                    )}

                    <p className="text-2xs text-subtle-foreground">
                      {item.createdBy.name} · {formatDate(item.createdAt)}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => toggle.mutate(item)}>
                      {item.isActive ? 'تعطيل' : 'تفعيل'}
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="text-danger"
                      onClick={() => setDeleteTarget(item)}
                      aria-label="حذف التوجيه"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && remove.mutate(deleteTarget.id)}
        title="حذف التوجيه"
        message="لن يدخل هذا التوجيه في التحليلات اللاحقة. التحليلات السابقة تبقى كما هي."
        confirmLabel="حذف"
        loading={remove.isPending}
      />
    </>
  );
}

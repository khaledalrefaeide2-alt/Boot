'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox, Input } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { ErrorState, SkeletonRows } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';

interface SettingRow {
  key: string;
  value: unknown;
  category: string;
  label: string | null;
  description: string | null;
  updatedAt: string;
  updatedBy: { name: string } | null;
}

interface IntegrationStatus {
  apify: { configured: boolean; ok: boolean; message: string; username?: string };
  queue: { ready: boolean; message: string };
}

/*
 * تسميات الأقسام.
 *
 * ★ القسم الذي لا تسمية له يُعرض بمفتاحه الإنجليزي عنواناً لبطاقة في شاشة
 *   عربية: «analysis» و«assistant» كانا كذلك فعلاً منذ أُضيفت إعداداتهما.
 *   والسقوط إلى المفتاح لا يُعطب شيئاً، فلا ينتبه إليه أحد — ولهذا يحرسه
 *   `verify:settings`: كل قسم في البذور والترحيلات له سطرٌ هنا.
 */
const CATEGORY_LABELS: Record<string, string> = {
  general: 'إعدادات عامة',
  data: 'البيانات والاحتفاظ',
  extraction: 'الاستخراج',
  analysis: 'التصنيف بالذكاء الاصطناعي',
  assistant: 'المساعد الذكي',
  alerts: 'التنبيهات',
};

/** ما يُعرض في الحقل — القيمة بنوعها لا بنصّها */
type Draft = string | number | boolean;

/**
 * نوع الحقل يُشتقّ من نوع القيمة المخزَّنة لا من اسم المفتاح.
 *
 * والعمود `value` من نوع JSON، فالنوع محفوظ فيه أصلاً: `true` تُقرأ
 * boolean و`200` تُقرأ number. ولا حاجة إلى جدول مفاتيح يُنسى تحديثه.
 */
function fieldKind(value: unknown): 'boolean' | 'number' | 'text' {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  return 'text';
}

/**
 * الرقم المكتوب — أو رسالة سبب رفضه.
 *
 * والحقل الفارغ خطأٌ لا صفر. `Number('')` صفرٌ في جافاسكربت، فمسحُ
 * «سقف المنشورات في التشغيل» يُحفظ صفراً ويوقف كل استخراج بعده — بلا
 * رسالة واحدة تقول ما جرى.
 */
function numberError(raw: Draft): string | null {
  const text = String(raw).trim();
  if (text === '') return 'الحقل فارغ — اكتب رقماً';
  if (!Number.isFinite(Number(text))) return 'ليس رقماً';
  return null;
}

export function SettingsClient() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, Draft>>({});

  const query = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<{ settings: SettingRow[] }>('/api/settings'),
  });

  const statusQuery = useQuery({
    queryKey: ['apify-status'],
    queryFn: () => api.get<IntegrationStatus>('/api/apify/status'),
  });

  /*
   * القيمة تُنسخ بنوعها إلى الحالة لا مُحوَّلةً إلى نصّ.
   *
   * ★ كانت `String(setting.value ?? '')`، فيصير `true` نصَّ «true» في
   *   صندوق كتابة — ومن أراد إطفاء ميزة كان عليه أن يمحو الكلمة ويكتب
   *   `false` بيده. ثم يُحفظ نصّاً، فينزلق نوع العمود من boolean إلى
   *   string عند أوّل حفظ.
   *
   *   ولم يُكتشف لأن كل قارئ في الخادم يحمل حرزاً: `!== false && !==
   *   'false' && !== 0`. الحرز صمد، والواجهة كانت مكسورة طول الوقت.
   *
   * والأرقام تبقى نصّاً في الحالة وحدها: من يمحو الحقل ليكتب رقماً جديداً
   * يمرّ بحالة «فارغ» و«1.» و«-»، وتحويلها لحظةَ الكتابة يقاومه في يده.
   * فتُحوَّل عند الحفظ، ويُفحص ما كُتب قبله.
   */
  useEffect(() => {
    if (!query.data) return;
    const next: Record<string, Draft> = {};
    for (const setting of query.data.settings) {
      next[setting.key] =
        typeof setting.value === 'boolean' ? setting.value : String(setting.value ?? '');
    }
    setValues(next);
  }, [query.data]);

  const settings = query.data?.settings ?? [];

  /*
   * ما تغيّر وحده يُرسَل.
   *
   * ★ كان الحفظ يُرسل الإعدادات كلها في كل ضغطة. وأثره ليس في الأداء:
   *   كلّ صفّ يُعاد كتابته بـ`updatedById` الضاغط و`updatedAt` الآن،
   *   فيُقرأ في الشاشة أنّ واحداً وعشرين إعداداً «عدّلها فلان قبل دقيقة»
   *   وهو لم يمسّ إلا واحداً. ويُكتب في سجلّ التدقيق «تعديل ٢١ إعداداً»
   *   بمفاتيحها كلها — فيصير السجلّ عاجزاً عن جواب السؤال الذي وُضع له:
   *   «من غيّر السقف اليومي؟».
   *
   *   وفوق ذلك كان يُعيد كتابة قيمٍ لم يفتحها أحد، فيُحوّلها إلى نصّ.
   */
  const changed = settings.filter((setting) => {
    const draft = values[setting.key];
    if (draft === undefined) return false;
    if (typeof setting.value === 'boolean') return draft !== setting.value;
    if (typeof setting.value === 'number') {
      return !numberError(draft) && Number(String(draft).trim()) !== setting.value;
    }
    return String(draft) !== String(setting.value ?? '');
  });

  /** الأرقام المرفوضة — تمنع الحفظ ولا تُحفظ صفراً */
  const errors = new Map<string, string>();
  for (const setting of settings) {
    if (typeof setting.value !== 'number') continue;
    const draft = values[setting.key];
    if (draft === undefined) continue;
    const message = numberError(draft);
    if (message) errors.set(setting.key, message);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = changed.map((setting) => ({
        key: setting.key,
        value:
          typeof setting.value === 'boolean'
            ? Boolean(values[setting.key])
            : typeof setting.value === 'number'
              ? Number(String(values[setting.key]).trim())
              : String(values[setting.key] ?? ''),
      }));
      return api.patch('/api/settings', { settings: payload });
    },
    onSuccess: () => {
      toast.success('حُفظت الإعدادات');
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (error) =>
      toast.error('تعذّر الحفظ', error instanceof ApiClientError ? error.message : undefined),
  });

  const categories = Array.from(new Set(settings.map((setting) => setting.category)));
  const status = statusQuery.data;

  return (
    <>
      <PageHeader
        title="الإعدادات"
        description="الإعدادات العامة للمنصة — الأسرار تبقى في ملف البيئة ولا تُعرض هنا"
        /*
          الزرّ يقول عدد ما سيُحفظ، ويُعطَّل بلا تغيير.

          «حفظ التغييرات» وهو لا يحفظ شيئاً يُعلّم المستخدم أن يضغطه
          احتياطاً بعد كل نظرة، وتلك كانت إحدى وعشرين كتابةً في كل ضغطة.
        */
        action={
          <Button
            onClick={() => saveMutation.mutate()}
            loading={saveMutation.isPending}
            disabled={changed.length === 0 || errors.size > 0}
          >
            <Save className="h-4 w-4" aria-hidden />
            {changed.length > 0 ? `حفظ ${changed.length} تغييراً` : 'حفظ التغييرات'}
          </Button>
        }
      />

      <Card className="mb-4">
        <CardHeader
          title="حالة التكاملات"
          description="تُقرأ من متغيرات البيئة — لا يمكن تعديلها من الواجهة"
        />
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
            <div className="flex items-center gap-2.5">
              <ShieldCheck
                className={status?.apify.ok ? 'h-5 w-5 text-success' : 'h-5 w-5 text-danger'}
                aria-hidden
              />
              <div>
                <p className="text-sm font-medium">رمز النظام</p>
                <p className="text-xs text-muted-foreground">
                  {status?.apify.message ?? 'جارٍ الفحص…'}
                </p>
              </div>
            </div>
            <Badge tone={status?.apify.ok ? 'success' : 'danger'}>
              {status?.apify.ok ? 'متصل' : 'غير متصل'}
            </Badge>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
            <div className="flex items-center gap-2.5">
              <ShieldCheck
                className={status?.queue.ready ? 'h-5 w-5 text-success' : 'h-5 w-5 text-warning'}
                aria-hidden
              />
              <div>
                <p className="text-sm font-medium">طابور المهام (Redis)</p>
                <p className="text-xs text-muted-foreground">
                  {status?.queue.message ?? 'جارٍ الفحص…'}
                </p>
              </div>
            </div>
            <Badge tone={status?.queue.ready ? 'success' : 'warning'}>
              {status?.queue.ready ? 'يعمل' : 'متوقف'}
            </Badge>
          </div>

          <Alert tone="info">
            رمز النظام لا يُخزَّن في قاعدة البيانات ولا يصل إلى المتصفح إطلاقاً — يُقرأ من متغير
            البيئة APIFY_TOKEN في الخادم فقط. لتغييره عدّل ملف البيئة وأعد تشغيل الخدمة.
          </Alert>
        </CardBody>
      </Card>

      {query.isPending ? (
        <Card>
          <SkeletonRows rows={8} />
        </Card>
      ) : query.isError ? (
        <Card>
          <ErrorState description={query.error instanceof ApiClientError ? query.error.message : undefined} />
        </Card>
      ) : (
        <div className="space-y-4">
          {categories.map((category) => (
            <Card key={category}>
              <CardHeader title={CATEGORY_LABELS[category] ?? category} />
              <CardBody className="space-y-4">
                {settings
                  .filter((setting) => setting.category === category)
                  .map((setting) =>
                    fieldKind(setting.value) === 'boolean' ? (
                      <Checkbox
                        key={setting.key}
                        label={setting.label ?? setting.key}
                        description={setting.description ?? undefined}
                        checked={Boolean(values[setting.key])}
                        onChange={(event) =>
                          setValues({ ...values, [setting.key]: event.target.checked })
                        }
                      />
                    ) : (
                      <Input
                        key={setting.key}
                        label={setting.label ?? setting.key}
                        hint={setting.description ?? undefined}
                        type={fieldKind(setting.value) === 'number' ? 'number' : 'text'}
                        error={errors.get(setting.key) ?? null}
                        value={String(values[setting.key] ?? '')}
                        onChange={(event) =>
                          setValues({ ...values, [setting.key]: event.target.value })
                        }
                      />
                    ),
                  )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

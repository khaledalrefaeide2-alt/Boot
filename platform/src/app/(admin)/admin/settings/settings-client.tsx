'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
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

const CATEGORY_LABELS: Record<string, string> = {
  general: 'إعدادات عامة',
  data: 'البيانات والاحتفاظ',
  extraction: 'الاستخراج',
  alerts: 'التنبيهات',
};

export function SettingsClient() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});

  const query = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<{ settings: SettingRow[] }>('/api/settings'),
  });

  const statusQuery = useQuery({
    queryKey: ['apify-status'],
    queryFn: () => api.get<IntegrationStatus>('/api/apify/status'),
  });

  useEffect(() => {
    if (!query.data) return;
    const next: Record<string, string> = {};
    for (const setting of query.data.settings) {
      next[setting.key] = String(setting.value ?? '');
    }
    setValues(next);
  }, [query.data]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const settings = (query.data?.settings ?? []).map((setting) => {
        const raw = values[setting.key] ?? '';
        // نحافظ على نوع القيمة الأصلي: رقم يبقى رقماً ونص يبقى نصاً
        const value = typeof setting.value === 'number' ? Number(raw) : raw;
        return { key: setting.key, value };
      });
      return api.patch('/api/settings', { settings });
    },
    onSuccess: () => {
      toast.success('حُفظت الإعدادات');
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (error) =>
      toast.error('تعذّر الحفظ', error instanceof ApiClientError ? error.message : undefined),
  });

  const settings = query.data?.settings ?? [];
  const categories = Array.from(new Set(settings.map((setting) => setting.category)));
  const status = statusQuery.data;

  return (
    <>
      <PageHeader
        title="الإعدادات"
        description="الإعدادات العامة للمنصة — الأسرار تبقى في ملف البيئة ولا تُعرض هنا"
        action={
          <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
            <Save className="h-4 w-4" aria-hidden />
            حفظ التغييرات
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
                <p className="text-sm font-medium">رمز Apify</p>
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
            رمز Apify لا يُخزَّن في قاعدة البيانات ولا يصل إلى المتصفح إطلاقاً — يُقرأ من متغير
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
                  .map((setting) => (
                    <Input
                      key={setting.key}
                      label={setting.label ?? setting.key}
                      hint={setting.description ?? undefined}
                      type={typeof setting.value === 'number' ? 'number' : 'text'}
                      value={values[setting.key] ?? ''}
                      onChange={(event) =>
                        setValues({ ...values, [setting.key]: event.target.value })
                      }
                    />
                  ))}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

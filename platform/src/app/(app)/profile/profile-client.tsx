'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Save, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { SkeletonRows } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';

interface Profile {
  id: string;
  email: string;
  name: string;
  jobTitle: string | null;
  phone: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export function ProfileClient({
  roleLabel,
  roleDescription,
  permissions,
  mustChangePassword,
}: {
  roleLabel: string;
  roleDescription: string;
  permissions: string[];
  mustChangePassword: boolean;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  const [form, setForm] = useState({ name: '', jobTitle: '', phone: '' });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    password: '',
    confirmPassword: '',
  });
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordFieldErrors, setPasswordFieldErrors] = useState<Record<string, string>>({});

  const query = useQuery({
    queryKey: ['profile'],
    queryFn: () => api.get<{ profile: Profile }>('/api/profile'),
  });

  useEffect(() => {
    if (!query.data?.profile) return;
    setForm({
      name: query.data.profile.name,
      jobTitle: query.data.profile.jobTitle ?? '',
      phone: query.data.profile.phone ?? '',
    });
  }, [query.data]);

  const saveMutation = useMutation({
    mutationFn: () => api.patch('/api/profile', form),
    onSuccess: () => {
      toast.success('حُفظت بياناتك');
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: (error) =>
      toast.error('تعذّر الحفظ', error instanceof ApiClientError ? error.message : undefined),
  });

  const passwordMutation = useMutation({
    mutationFn: () => api.post<{ message: string }>('/api/profile/password', passwordForm),
    onSuccess: (data) => {
      toast.success('تم', data.message);
      setPasswordForm({ currentPassword: '', password: '', confirmPassword: '' });
      setPasswordError(null);
      setPasswordFieldErrors({});
    },
    onError: (error) => {
      if (error instanceof ApiClientError) {
        setPasswordError(error.message);
        if (error.details) setPasswordFieldErrors(error.details);
      } else setPasswordError('تعذّر تغيير كلمة المرور');
    },
  });

  const profile = query.data?.profile;
  const forceChange = mustChangePassword || searchParams.get('change-password') === '1';

  return (
    <>
      <PageHeader title="الملف الشخصي" description="بياناتك وصلاحياتك وكلمة المرور" />

      {forceChange && (
        <Alert tone="warning" title="مطلوب تغيير كلمة المرور" className="mb-4">
          كلمة المرور الحالية مبدئية سُلّمت لك من الإدارة. غيّرها الآن من القسم أدناه.
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="البيانات الشخصية" />
          {query.isPending ? (
            <SkeletonRows rows={4} />
          ) : (
            <CardBody>
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  saveMutation.mutate();
                }}
              >
                <Input label="البريد الإلكتروني" value={profile?.email ?? ''} disabled dir="ltr" className="ltr" hint="لا يمكن تغيير البريد — تواصل مع مدير النظام" />
                <Input
                  label="الاسم الكامل"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  required
                />
                <Input
                  label="المسمى الوظيفي"
                  value={form.jobTitle}
                  onChange={(event) => setForm({ ...form, jobTitle: event.target.value })}
                />
                <Input
                  label="رقم التواصل"
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                  dir="ltr"
                  className="ltr"
                />
                <Button type="submit" loading={saveMutation.isPending}>
                  <Save className="h-4 w-4" aria-hidden />
                  حفظ البيانات
                </Button>
              </form>
            </CardBody>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="الدور والصلاحيات" />
            <CardBody className="space-y-3">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
                <div>
                  <p className="text-sm font-medium">{roleLabel}</p>
                  <p className="text-xs text-muted-foreground">{roleDescription}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 border-t border-border pt-3">
                {permissions.map((permission) => (
                  <Badge key={permission} size="sm" className="ltr">
                    {permission}
                  </Badge>
                ))}
              </div>

              {profile && (
                <div className="space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
                  <p>آخر دخول: {formatDateTime(profile.lastLoginAt)}</p>
                  <p>تاريخ إنشاء الحساب: {formatDateTime(profile.createdAt)}</p>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="تغيير كلمة المرور"
              description="سيتم إنهاء جلساتك على الأجهزة الأخرى"
            />
            <CardBody>
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  passwordMutation.mutate();
                }}
              >
                {passwordError && <Alert tone="danger">{passwordError}</Alert>}

                <Input
                  label="كلمة المرور الحالية"
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(event) =>
                    setPasswordForm({ ...passwordForm, currentPassword: event.target.value })
                  }
                  error={passwordFieldErrors.currentPassword}
                  autoComplete="current-password"
                  dir="ltr"
                  className="ltr"
                  required
                />
                <Input
                  label="كلمة المرور الجديدة"
                  type="password"
                  value={passwordForm.password}
                  onChange={(event) =>
                    setPasswordForm({ ...passwordForm, password: event.target.value })
                  }
                  error={passwordFieldErrors.password}
                  hint="10 محارف على الأقل وتحتوي على حروف ورقم"
                  autoComplete="new-password"
                  dir="ltr"
                  className="ltr"
                  required
                />
                <Input
                  label="تأكيد كلمة المرور"
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(event) =>
                    setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })
                  }
                  error={passwordFieldErrors.confirmPassword}
                  autoComplete="new-password"
                  dir="ltr"
                  className="ltr"
                  required
                />
                <Button type="submit" loading={passwordMutation.isPending}>
                  <KeyRound className="h-4 w-4" aria-hidden />
                  تغيير كلمة المرور
                </Button>
              </form>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

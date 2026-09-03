'use client';

import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input, Select, Checkbox } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError } from '@/lib/api-client';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/auth/rbac';
import { USER_STATUS_LABELS } from '@/lib/domain/constants';
import type { Role, UserStatus } from '@/generated/prisma';

interface EditingUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  jobTitle: string | null;
  phone: string | null;
}

const EMPTY = {
  email: '',
  name: '',
  password: '',
  role: 'VIEWER' as Role,
  status: 'ACTIVE' as UserStatus,
  jobTitle: '',
  phone: '',
  mustChangePassword: true,
};

export function UserFormModal({
  open,
  onClose,
  editing,
  assignable,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editing: EditingUser | null;
  assignable: Role[];
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setFieldErrors({});
    setForm(
      editing
        ? {
            ...EMPTY,
            email: editing.email,
            name: editing.name,
            role: editing.role,
            status: editing.status,
            jobTitle: editing.jobTitle ?? '',
            phone: editing.phone ?? '',
          }
        : EMPTY,
    );
  }, [open, editing]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (editing) {
        return api.patch(`/api/admin/users/${editing.id}`, {
          name: form.name,
          role: form.role,
          status: form.status,
          jobTitle: form.jobTitle,
          phone: form.phone,
        });
      }
      return api.post('/api/admin/users', {
        email: form.email,
        name: form.name,
        password: form.password,
        role: form.role,
        status: form.status,
        jobTitle: form.jobTitle,
        phone: form.phone,
        mustChangePassword: form.mustChangePassword,
      });
    },
    onSuccess: () => {
      toast.success(editing ? 'حُدّثت بيانات المستخدم' : 'أُنشئ المستخدم بنجاح');
      onSaved();
    },
    onError: (err) => {
      if (err instanceof ApiClientError) {
        setError(err.message);
        if (err.details) setFieldErrors(err.details);
      } else {
        setError('تعذّر حفظ البيانات');
      }
    },
  });

  function update<K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'تعديل مستخدم' : 'مستخدم جديد'}
      description={
        editing ? editing.email : 'يُنشأ الحساب يدوياً ويمكن تفعيله مباشرة أو تركه بانتظار الموافقة'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            إلغاء
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending}>
            {editing ? 'حفظ التعديلات' : 'إنشاء المستخدم'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        {error && <Alert tone="danger">{error}</Alert>}

        {!editing && (
          <Input
            label="البريد الإلكتروني"
            type="email"
            value={form.email}
            onChange={(event) => update('email', event.target.value)}
            error={fieldErrors.email}
            dir="ltr"
            className="ltr"
            required
          />
        )}

        <Input
          label="الاسم الكامل"
          value={form.name}
          onChange={(event) => update('name', event.target.value)}
          error={fieldErrors.name}
          required
        />

        {!editing && (
          <Input
            label="كلمة المرور المبدئية"
            type="text"
            value={form.password}
            onChange={(event) => update('password', event.target.value)}
            error={fieldErrors.password}
            hint="10 محارف على الأقل وتحتوي على حروف ورقم — سلّمها للمستخدم بقناة موثوقة"
            dir="ltr"
            className="ltr"
            required
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="الدور"
            value={form.role}
            onChange={(event) => update('role', event.target.value as Role)}
            error={fieldErrors.role}
            hint={ROLE_DESCRIPTIONS[form.role]}
          >
            {assignable.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </Select>

          <Select
            label="الحالة"
            value={form.status}
            onChange={(event) => update('status', event.target.value as UserStatus)}
            error={fieldErrors.status}
          >
            {(Object.keys(USER_STATUS_LABELS) as UserStatus[]).map((status) => (
              <option key={status} value={status}>
                {USER_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="المسمى الوظيفي"
            value={form.jobTitle}
            onChange={(event) => update('jobTitle', event.target.value)}
            error={fieldErrors.jobTitle}
          />
          <Input
            label="رقم التواصل"
            value={form.phone}
            onChange={(event) => update('phone', event.target.value)}
            error={fieldErrors.phone}
            dir="ltr"
            className="ltr"
          />
        </div>

        {!editing && (
          <Checkbox
            label="إلزام المستخدم بتغيير كلمة المرور عند أول دخول"
            description="خيار موصى به عند تسليم كلمة مرور مبدئية"
            checked={form.mustChangePassword}
            onChange={(event) => update('mustChangePassword', event.target.checked)}
          />
        )}
      </form>
    </Modal>
  );
}

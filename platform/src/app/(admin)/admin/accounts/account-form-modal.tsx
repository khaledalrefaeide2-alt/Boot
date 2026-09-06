'use client';

import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input, Select, Checkbox } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError } from '@/lib/api-client';
import {
  ACCOUNT_OWNERSHIP_LABELS,
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_VISIBILITY_LABELS,
  ENTITY_STATUS_LABELS,
  LANGUAGE_LABELS,
} from '@/lib/domain/constants';
import type {
  AccountOwnership,
  AccountType,
  AccountVisibility,
  EntityStatus,
} from '@/generated/prisma';

export interface AccountRow {
  id: string;
  name: string;
  username: string | null;
  url: string;
  externalId: string | null;
  notes: string | null;
  type: AccountType;
  ownership: AccountOwnership;
  visibility: AccountVisibility;
  language: string | null;
  country: string | null;
  status: EntityStatus;
  isActive: boolean;
  followersCount: number | null;
  extractionWindowDays: number;
  extractionIntervalMinutes: number;
  maxItemsPerRun: number;
  actorIdOverride: string | null;
  lastExtractedAt: string | null;
  platform: { id: string; name: string; code: string; defaultActorId: string | null };
  _count: { posts: number; runs: number };
}

/** فترات التكرار الجاهزة — 0 يعني تشغيل يدوي فقط */
const INTERVALS = [
  { value: 0, label: 'يدوي فقط' },
  { value: 30, label: 'كل 30 دقيقة' },
  { value: 60, label: 'كل ساعة' },
  { value: 180, label: 'كل 3 ساعات' },
  { value: 360, label: 'كل 6 ساعات' },
  { value: 720, label: 'كل 12 ساعة' },
  { value: 1440, label: 'يومياً' },
];

const EMPTY = {
  platformId: '',
  name: '',
  username: '',
  url: '',
  externalId: '',
  type: 'PAGE' as AccountType,
  ownership: 'EXTERNAL' as AccountOwnership,
  visibility: 'PUBLIC' as AccountVisibility,
  language: 'ar',
  country: '',
  status: 'ACTIVE' as EntityStatus,
  isActive: true,
  extractionWindowDays: 30,
  extractionIntervalMinutes: 0,
  maxItemsPerRun: 100,
  actorIdOverride: '',
  notes: '',
};

export function AccountFormModal({
  open,
  onClose,
  editing,
  platforms,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editing: AccountRow | null;
  platforms: { id: string; name: string; defaultActorId: string | null }[];
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setError(null);
    setFieldErrors({});
    setForm(
      editing
        ? {
            ...EMPTY,
            platformId: editing.platform.id,
            name: editing.name,
            username: editing.username ?? '',
            url: editing.url,
            externalId: editing.externalId ?? '',
            notes: editing.notes ?? '',
            type: editing.type,
            ownership: editing.ownership,
            visibility: editing.visibility,
            language: editing.language ?? '',
            country: editing.country ?? '',
            status: editing.status,
            isActive: editing.isActive,
            extractionWindowDays: editing.extractionWindowDays,
            extractionIntervalMinutes: editing.extractionIntervalMinutes,
            maxItemsPerRun: editing.maxItemsPerRun,
            actorIdOverride: editing.actorIdOverride ?? '',
          }
        : { ...EMPTY, platformId: platforms[0]?.id ?? '' },
    );
  }, [open, editing, platforms]);

  const mutation = useMutation({
    mutationFn: () =>
      editing
        ? api.patch(`/api/accounts/${editing.id}`, form)
        : api.post('/api/accounts', form),
    onSuccess: () => {
      toast.success(editing ? 'حُدّث الحساب' : 'أُضيف الحساب');
      onSaved();
    },
    onError: (err) => {
      if (err instanceof ApiClientError) {
        setError(err.message);
        if (err.details) setFieldErrors(err.details);
      } else setError('تعذّر حفظ الحساب');
    },
  });

  function update<K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const selectedPlatform = platforms.find((platform) => platform.id === form.platformId);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? `تعديل ${editing.name}` : 'حساب جديد'}
      description="أضف صفحة أو حساباً لرصده — تأكد من أن الرصد متوافق مع السياسات والصلاحيات المتاحة لك"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            إلغاء
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending}>
            {editing ? 'حفظ التعديلات' : 'إضافة الحساب'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        {error && <Alert tone="danger">{error}</Alert>}

        <section className="space-y-4">
          <h3 className="text-xs font-semibold text-subtle-foreground">بيانات الحساب</h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="المنصة"
              value={form.platformId}
              onChange={(event) => update('platformId', event.target.value)}
              error={fieldErrors.platformId}
              required
            >
              {platforms.map((platform) => (
                <option key={platform.id} value={platform.id}>
                  {platform.name}
                </option>
              ))}
            </Select>

            <Input
              label="اسم الحساب"
              value={form.name}
              onChange={(event) => update('name', event.target.value)}
              error={fieldErrors.name}
              required
            />
          </div>

          <Input
            label="رابط الحساب"
            value={form.url}
            onChange={(event) => update('url', event.target.value)}
            error={fieldErrors.url}
            dir="ltr"
            className="ltr"
            placeholder="https://www.facebook.com/example"
            required
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="اسم المستخدم"
              value={form.username}
              onChange={(event) => update('username', event.target.value)}
              error={fieldErrors.username}
              hint="بدون @ — يُستخدم مع بعض الـ Actors"
              dir="ltr"
              className="ltr"
            />
            <Input
              label="المعرّف الخارجي"
              value={form.externalId}
              onChange={(event) => update('externalId', event.target.value)}
              hint="اختياري إن توفر من المنصة"
              dir="ltr"
              className="ltr"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Select
              label="نوع الحساب"
              value={form.type}
              onChange={(event) => update('type', event.target.value as AccountType)}
            >
              {Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Select
              label="الملكية"
              value={form.ownership}
              onChange={(event) => update('ownership', event.target.value as AccountOwnership)}
            >
              {Object.entries(ACCOUNT_OWNERSHIP_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Select
              label="الظهور"
              value={form.visibility}
              onChange={(event) => update('visibility', event.target.value as AccountVisibility)}
            >
              {Object.entries(ACCOUNT_VISIBILITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Select
              label="اللغة"
              value={form.language}
              onChange={(event) => update('language', event.target.value)}
            >
              <option value="">غير محددة</option>
              {Object.entries(LANGUAGE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Input
              label="الدولة"
              value={form.country}
              onChange={(event) => update('country', event.target.value)}
            />
            <Select
              label="الحالة"
              value={form.status}
              onChange={(event) => update('status', event.target.value as EntityStatus)}
            >
              {Object.entries(ENTITY_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
        </section>

        <section className="space-y-4 border-t border-border pt-4">
          <h3 className="text-xs font-semibold text-subtle-foreground">إعدادات الاستخراج</h3>

          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label="مدة الاستخراج (أيام)"
              type="number"
              min={1}
              max={365}
              value={form.extractionWindowDays}
              onChange={(event) => update('extractionWindowDays', Number(event.target.value))}
              error={fieldErrors.extractionWindowDays}
              hint="أقدم تاريخ منشور يُطلب"
            />
            <Select
              label="تكرار الاستخراج"
              value={form.extractionIntervalMinutes}
              onChange={(event) =>
                update('extractionIntervalMinutes', Number(event.target.value))
              }
            >
              {INTERVALS.map((interval) => (
                <option key={interval.value} value={interval.value}>
                  {interval.label}
                </option>
              ))}
            </Select>
            <Input
              label="أقصى عدد منشورات"
              type="number"
              min={1}
              max={1000}
              value={form.maxItemsPerRun}
              onChange={(event) => update('maxItemsPerRun', Number(event.target.value))}
              error={fieldErrors.maxItemsPerRun}
              hint="سقف فوترة إلزامي على Apify"
            />
          </div>

          <Input
            label="تجاوز Apify Actor"
            value={form.actorIdOverride}
            onChange={(event) => update('actorIdOverride', event.target.value)}
            error={fieldErrors.actorIdOverride}
            hint={
              selectedPlatform?.defaultActorId
                ? `اتركه فارغاً لاستخدام الافتراضي: ${selectedPlatform.defaultActorId}`
                : 'لم يُحدَّد Actor افتراضي لهذه المنصة — حدّده هنا أو من إدارة المنصات'
            }
            dir="ltr"
            className="ltr"
            placeholder="username~actor-name"
          />

          <Checkbox
            label="الحساب مفعّل"
            description="الحسابات المعطّلة لا تدخل في الجدولة ولا يمكن تشغيل استخراج لها"
            checked={form.isActive}
            onChange={(event) => update('isActive', event.target.checked)}
          />
        </section>
      </form>
    </Modal>
  );
}

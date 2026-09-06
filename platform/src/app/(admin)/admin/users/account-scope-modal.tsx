'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { ErrorState, SkeletonRows } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError } from '@/lib/api-client';
import type { AccountAccess, EntityStatus } from '@/generated/prisma';

interface ScopeAccount {
  id: string;
  name: string;
  status: EntityStatus;
  platform: { id: string; name: string };
}

interface ScopeResponse {
  accountAccess: AccountAccess;
  accountIds: string[];
  accounts: ScopeAccount[];
}

/**
 * نافذة تحديد الحسابات التي يصل المستخدم إلى بياناتها.
 *
 * وضعان لا ثالث لهما: «كل الحسابات» وهو الافتراضي، أو حصر في مجموعة
 * مختارة. الاختيار مجموعة كاملة تُستبدل دفعةً واحدة عند الحفظ، لا تعديلات
 * متفرقة تُرسل مع كل نقرة — فلو أُغلقت النافذة في منتصف العمل بقي النطاق
 * القديم كما هو بدل أن يُترك المستخدم في وضع نصفي.
 *
 * الحسابات مجمّعة بمنصاتها لأن المشرف يفكّر بها هكذا: «كل حسابات فيسبوك
 * لهذا الموظف»، لا كقائمة واحدة طويلة يبحث فيها اسماً اسماً.
 */
export function AccountScopeModal({
  user,
  onClose,
  onSaved,
}: {
  user: { id: string; name: string } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [access, setAccess] = useState<AccountAccess>('ALL');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const query = useQuery({
    queryKey: ['user-scope', user?.id],
    queryFn: () => api.get<ScopeResponse>(`/api/admin/users/${user!.id}/accounts`),
    enabled: Boolean(user),
  });

  // الحالة المحلية تُبنى من المحفوظ عند كل فتح، فلا يتسرّب اختيار مستخدم إلى آخر
  useEffect(() => {
    if (!query.data) return;
    setAccess(query.data.accountAccess);
    setSelected(new Set(query.data.accountIds));
    setSearch('');
  }, [query.data]);

  const groups = useMemo(() => {
    const accounts = query.data?.accounts ?? [];
    const term = search.trim().toLowerCase();
    const matching = term
      ? accounts.filter(
          (account) =>
            account.name.toLowerCase().includes(term) ||
            account.platform.name.toLowerCase().includes(term),
        )
      : accounts;

    const byPlatform = new Map<string, { name: string; accounts: ScopeAccount[] }>();
    for (const account of matching) {
      const group = byPlatform.get(account.platform.id) ?? {
        name: account.platform.name,
        accounts: [],
      };
      group.accounts.push(account);
      byPlatform.set(account.platform.id, group);
    }
    return Array.from(byPlatform.entries()).map(([id, group]) => ({ id, ...group }));
  }, [query.data, search]);

  const mutation = useMutation({
    mutationFn: () =>
      api.put(`/api/admin/users/${user!.id}/accounts`, {
        accountAccess: access,
        accountIds: Array.from(selected),
      }),
    onSuccess: () => {
      toast.success(
        access === 'ALL' ? 'يصل المستخدم الآن إلى كل الحسابات' : 'حُدّثت حسابات المستخدم',
      );
      onSaved();
    },
    onError: (error) =>
      toast.error('تعذّر حفظ النطاق', error instanceof ApiClientError ? error.message : undefined),
  });

  function toggle(accountId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  }

  function toggleGroup(accounts: ScopeAccount[]) {
    const allSelected = accounts.every((account) => selected.has(account.id));
    setSelected((current) => {
      const next = new Set(current);
      for (const account of accounts) {
        if (allSelected) next.delete(account.id);
        else next.add(account.id);
      }
      return next;
    });
  }

  const restricted = access === 'ASSIGNED';

  return (
    <Modal
      open={Boolean(user)}
      onClose={onClose}
      size="lg"
      title="حسابات المستخدم"
      description={`تحديد البيانات التي يصل إليها ${user?.name ?? ''}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={query.isPending || (restricted && selected.size === 0)}
          >
            حفظ النطاق
          </Button>
        </>
      }
    >
      {query.isPending ? (
        <SkeletonRows rows={5} />
      ) : query.isError ? (
        <ErrorState
          description={
            query.error instanceof ApiClientError ? query.error.message : 'تعذّر جلب الحسابات'
          }
          action={
            <Button variant="secondary" onClick={() => query.refetch()}>
              إعادة المحاولة
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium text-foreground">نطاق البيانات</legend>

            {(
              [
                {
                  value: 'ALL' as const,
                  title: 'كل الحسابات',
                  hint: 'يرى بيانات كل حساب مرصود على المنصة',
                },
                {
                  value: 'ASSIGNED' as const,
                  title: 'حسابات محددة',
                  hint: 'لا يرى إلا بيانات الحسابات المختارة أدناه',
                },
              ]
            ).map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-start gap-2.5 rounded-md border p-3 transition-colors ${
                  access === option.value
                    ? 'border-primary bg-primary-soft'
                    : 'border-border hover:border-border-strong'
                }`}
              >
                <input
                  type="radio"
                  name="accountAccess"
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[var(--primary)]"
                  checked={access === option.value}
                  onChange={() => setAccess(option.value)}
                />
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium text-foreground">{option.title}</span>
                  <span className="block text-xs text-muted-foreground">{option.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {restricted && (
            <>
              <Alert tone="info">
                الحصر يشمل كل الشاشات: المنشورات والإحصاءات والتقارير والتصدير وقوائم الفلاتر. كما
                يتوقف عن المستخدم بثّ تنبيهات النظام لأنها تذكر حسابات خارج نطاقه.
              </Alert>

              <div className="flex items-end justify-between gap-3">
                <Input
                  wrapperClassName="flex-1"
                  label="بحث في الحسابات"
                  placeholder="اسم الحساب أو المنصة"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <p className="pb-2 text-xs text-muted-foreground">
                  المختار <span className="num font-semibold text-foreground">{selected.size}</span>
                </p>
              </div>

              {groups.length === 0 ? (
                <p className="rounded-md border border-border bg-surface-2 p-4 text-center text-sm text-muted-foreground">
                  لا توجد حسابات مطابقة
                </p>
              ) : (
                <div className="max-h-72 space-y-3 overflow-y-auto rounded-md border border-border p-3">
                  {groups.map((group) => {
                    const allSelected = group.accounts.every((account) => selected.has(account.id));
                    return (
                      <div key={group.id} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-subtle-foreground">
                            {group.name}
                          </p>
                          <button
                            type="button"
                            className="text-xs font-medium text-primary underline underline-offset-2"
                            onClick={() => toggleGroup(group.accounts)}
                          >
                            {allSelected ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
                          </button>
                        </div>
                        {group.accounts.map((account) => (
                          <label
                            key={account.id}
                            className="flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 hover:bg-surface-2"
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--primary)]"
                              checked={selected.has(account.id)}
                              onChange={() => toggle(account.id)}
                            />
                            <span className="flex-1 truncate text-sm text-foreground">
                              {account.name}
                            </span>
                            {account.status !== 'ACTIVE' && (
                              <Badge tone="neutral">موقوف</Badge>
                            )}
                          </label>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

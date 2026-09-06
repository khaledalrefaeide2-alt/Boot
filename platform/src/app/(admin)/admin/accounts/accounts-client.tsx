'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Play, Plus, Search, Trash2, UsersRound, X } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Table, TBody, TD, TH, THead, TR, TableWrapper } from '@/components/ui/table';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/states';
import { Pagination } from '@/components/ui/pagination';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { api, ApiClientError, buildQuery } from '@/lib/api-client';
import {
  ACCOUNT_OWNERSHIP_LABELS,
  ACCOUNT_TYPE_LABELS,
  ENTITY_STATUS_LABELS,
} from '@/lib/domain/constants';
import { arabicPlural, formatNumber, formatRelativeTime } from '@/lib/utils';
import { AccountFormModal, type AccountRow } from './account-form-modal';
import { AccountsImportModal } from './import-modal';
import { BulkRunModal, type RunTarget } from './bulk-run-modal';

interface AccountsResponse {
  accounts: AccountRow[];
  total: number;
  page: number;
  pageSize: number;
}

export function AccountsAdminClient({ canRunExtraction }: { canRunExtraction: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AccountRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AccountRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [selected, setSelected] = useState<Map<string, RunTarget>>(new Map());
  const [runTargets, setRunTargets] = useState<RunTarget[]>([]);

  const platformsQuery = useQuery({
    queryKey: ['admin-platforms'],
    queryFn: () =>
      api.get<{ platforms: { id: string; name: string; defaultActorId: string | null }[] }>(
        '/api/platforms',
      ),
  });

  const query = useQuery({
    queryKey: ['admin-accounts', page, search, platformFilter, statusFilter],
    queryFn: () =>
      api.get<AccountsResponse>(
        buildQuery('/api/accounts', {
          page,
          pageSize: 25,
          q: search,
          platformId: platformFilter,
          status: statusFilter,
        }),
      ),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-accounts'] });

  /*
   * التشغيل — فردياً كان أو جماعياً — يمرّ بنافذة الفلاتر نفسها.
   * كان هذا الزر يرسل معرّف الحساب وحده بلا نطاق زمني ولا عدد، فيرفضه
   * الخادم لأن التشغيل اليدوي يشترطهما. توحيد المسارين يمنع تكرار ذلك.
   */
  const toTarget = (account: AccountRow): RunTarget => ({
    id: account.id,
    name: account.name,
    platformCode: account.platform.code,
    platformName: account.platform.name,
  });

  const deleteMutation = useMutation({
    mutationFn: (account: AccountRow) =>
      api.delete<{ postsDeleted: number }>(`/api/accounts/${account.id}`),
    onSuccess: (data) => {
      toast.success('حُذف الحساب', `حُذف معه ${formatNumber(data.postsDeleted)} منشوراً`);
      setDeleteTarget(null);
      void invalidate();
    },
    onError: (error) => {
      toast.error('تعذّر الحذف', error instanceof ApiClientError ? error.message : undefined);
      setDeleteTarget(null);
    },
  });

  const data = query.data;
  const pageAccounts = data?.accounts ?? [];
  const someOnPageSelected = pageAccounts.some((account) => selected.has(account.id));
  const allOnPageSelected =
    pageAccounts.length > 0 && pageAccounts.every((account) => selected.has(account.id));

  /*
   * المحدَّد يُخزَّن كاملاً لا كمعرّفات: التحديد يبقى عبر الصفحات، ولو حفظنا
   * المعرّفات وحدها لما وجدنا بيانات حساب اختير في صفحة سابقة حين نبني
   * قائمة التشغيل، فيقول الشريط «حُدِّد ٥» ويُشغَّل اثنان بلا أن يظهر الفرق.
   */
  function toggleOne(account: AccountRow) {
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(account.id)) next.delete(account.id);
      else next.set(account.id, toTarget(account));
      return next;
    });
  }

  function togglePage() {
    setSelected((current) => {
      const next = new Map(current);
      for (const account of pageAccounts) {
        if (allOnPageSelected) next.delete(account.id);
        else next.set(account.id, toTarget(account));
      }
      return next;
    });
  }

  return (
    <>
      <PageHeader
        title="إدارة الحسابات"
        description="الحسابات والصفحات المرصودة وإعدادات استخراجها"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              <FileSpreadsheet className="h-4 w-4" aria-hidden />
              استيراد من Excel
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" aria-hidden />
              حساب جديد
            </Button>
          </div>
        }
      />

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
            placeholder="اسم الحساب أو الرابط"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          <Select
            wrapperClassName="w-44"
            label="المنصة"
            value={platformFilter}
            onChange={(event) => {
              setPlatformFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="">كل المنصات</option>
            {platformsQuery.data?.platforms.map((platform) => (
              <option key={platform.id} value={platform.id}>
                {platform.name}
              </option>
            ))}
          </Select>
          <Select
            wrapperClassName="w-36"
            label="الحالة"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="">كل الحالات</option>
            {Object.entries(ENTITY_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">
            <Search className="h-4 w-4" aria-hidden />
            بحث
          </Button>
        </form>

        {canRunExtraction && selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-b border-border bg-primary-soft px-4 py-2.5">
            <p className="flex-1 text-sm font-medium text-primary-soft-foreground">
              حُدِّد <span className="num font-bold">{selected.size}</span>{' '}
              {arabicPlural(selected.size, {
                one: 'حساب',
                two: 'حساب',
                few: 'حسابات',
                many: 'حساباً',
              })}
            </p>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Map())}>
              <X className="h-3.5 w-3.5" aria-hidden />
              إلغاء التحديد
            </Button>
            <Button size="sm" onClick={() => setRunTargets(Array.from(selected.values()))}>
              <Play className="h-3.5 w-3.5" aria-hidden />
              استخراج جماعي
            </Button>
          </div>
        )}

        {query.isPending ? (
          <SkeletonRows rows={6} />
        ) : query.isError ? (
          <ErrorState
            description={query.error instanceof ApiClientError ? query.error.message : undefined}
            action={
              <Button variant="secondary" onClick={() => query.refetch()}>
                إعادة المحاولة
              </Button>
            }
          />
        ) : !data || data.accounts.length === 0 ? (
          <EmptyState
            icon={UsersRound}
            title="لا توجد حسابات"
            description="أضف الحسابات والصفحات التي تريد رصدها"
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                إضافة حساب
              </Button>
            }
          />
        ) : (
          <>
            <TableWrapper>
              <Table>
                <THead>
                  <TR>
                    {canRunExtraction && (
                      <TH className="w-10">
                        <input
                          type="checkbox"
                          className="h-4 w-4 cursor-pointer accent-[var(--primary)]"
                          checked={allOnPageSelected}
                          ref={(node) => {
                            // حالة ثالثة بين المحدَّد والفارغ: بعض الصفحة لا كلها
                            if (node) node.indeterminate = someOnPageSelected && !allOnPageSelected;
                          }}
                          onChange={togglePage}
                          aria-label="تحديد كل الحسابات في هذه الصفحة"
                        />
                      </TH>
                    )}
                    <TH>الحساب</TH>
                    <TH>المنصة</TH>
                    <TH>النوع</TH>
                    <TH>الملكية</TH>
                    <TH>الحالة</TH>
                    <TH>التكرار</TH>
                    <TH>المنشورات</TH>
                    <TH>آخر استخراج</TH>
                    <TH className="text-end">إجراءات</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.accounts.map((account) => (
                    <TR key={account.id}>
                      {canRunExtraction && (
                        <TD>
                          <input
                            type="checkbox"
                            className="h-4 w-4 cursor-pointer accent-[var(--primary)]"
                            checked={selected.has(account.id)}
                            onChange={() => toggleOne(account)}
                            aria-label={`تحديد ${account.name}`}
                          />
                        </TD>
                      )}
                      <TD>
                        <Link
                          href={`/accounts/${account.id}`}
                          className="block min-w-0 max-w-64"
                        >
                          <span className="block truncate font-medium hover:text-primary">
                            {account.name}
                          </span>
                          <span className="ltr block truncate text-xs text-muted-foreground">
                            {account.url}
                          </span>
                        </Link>
                      </TD>
                      <TD className="text-xs">{account.platform.name}</TD>
                      <TD className="text-xs text-muted-foreground">
                        {ACCOUNT_TYPE_LABELS[account.type]}
                      </TD>
                      <TD className="text-xs text-muted-foreground">
                        {ACCOUNT_OWNERSHIP_LABELS[account.ownership]}
                      </TD>
                      <TD>
                        <Badge tone={account.isActive && account.status === 'ACTIVE' ? 'success' : 'neutral'}>
                          {account.isActive ? ENTITY_STATUS_LABELS[account.status] : 'معطّل'}
                        </Badge>
                      </TD>
                      <TD className="text-xs text-muted-foreground">
                        {account.extractionIntervalMinutes > 0
                          ? `كل ${formatNumber(account.extractionIntervalMinutes)} دقيقة`
                          : 'يدوي فقط'}
                      </TD>
                      <TD className="num">{formatNumber(account._count.posts)}</TD>
                      <TD className="text-xs text-muted-foreground">
                        {account.lastExtractedAt ? formatRelativeTime(account.lastExtractedAt) : '—'}
                      </TD>
                      <TD>
                        <div className="flex items-center justify-end gap-1">
                          {canRunExtraction && (
                            <Button
                              size="sm"
                              variant="soft"
                              onClick={() => setRunTargets([toTarget(account)])}
                              title="تشغيل استخراج يدوي"
                            >
                              <Play className="h-3.5 w-3.5" aria-hidden />
                              استخراج
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setEditing(account);
                              setFormOpen(true);
                            }}
                          >
                            تعديل
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-danger"
                            onClick={() => setDeleteTarget(account)}
                            aria-label="حذف الحساب"
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
            <Pagination
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>

      <AccountFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editing={editing}
        platforms={platformsQuery.data?.platforms ?? []}
        onSaved={() => {
          setFormOpen(false);
          void invalidate();
        }}
      />

      <BulkRunModal
        targets={runTargets}
        onClose={() => setRunTargets([])}
        onStarted={() => {
          setSelected(new Map());
          void invalidate();
        }}
      />

      <AccountsImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          setImportOpen(false);
          void invalidate();
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
        title="حذف الحساب"
        message={`سيُحذف «${deleteTarget?.name ?? ''}» ومعه كل منشوراته المخزّنة (${formatNumber(deleteTarget?._count.posts ?? 0)} منشوراً). هذه العملية لا رجعة فيها — يمكنك تعطيل الحساب بدل حذفه.`}
        confirmLabel="حذف نهائي"
        loading={deleteMutation.isPending}
      />
    </>
  );
}

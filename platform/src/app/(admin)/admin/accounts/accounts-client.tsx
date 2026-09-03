'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Play, Plus, Search, Trash2, UsersRound } from 'lucide-react';
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
import { formatNumber, formatRelativeTime } from '@/lib/utils';
import { AccountFormModal, type AccountRow } from './account-form-modal';

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

  const runMutation = useMutation({
    mutationFn: (account: AccountRow) =>
      api.post<{ message: string }>('/api/extractions', { accountId: account.id }),
    onSuccess: (data, account) => {
      toast.success(`بدأ استخراج ${account.name}`, data.message);
      void invalidate();
    },
    onError: (error) =>
      toast.error('تعذّر بدء الاستخراج', error instanceof ApiClientError ? error.message : undefined),
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

  return (
    <>
      <PageHeader
        title="إدارة الحسابات"
        description="الحسابات والصفحات المرصودة وإعدادات استخراجها"
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden />
            حساب جديد
          </Button>
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
                              onClick={() => runMutation.mutate(account)}
                              loading={runMutation.isPending && runMutation.variables?.id === account.id}
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

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Search, UsersRound } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Table, TBody, TD, TH, THead, TR, TableWrapper } from '@/components/ui/table';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/states';
import { Pagination } from '@/components/ui/pagination';
import { api, ApiClientError, buildQuery } from '@/lib/api-client';
import { useFilterOptions } from '@/lib/hooks/use-filters';
import {
  ACCOUNT_OWNERSHIP_LABELS,
  ACCOUNT_TYPE_LABELS,
} from '@/lib/domain/constants';
import { formatCompactNumber, formatNumber, formatRelativeTime } from '@/lib/utils';
import type { AccountOwnership, AccountType } from '@/generated/prisma';

interface AccountRow {
  id: string;
  name: string;
  url: string;
  type: AccountType;
  ownership: AccountOwnership;
  isActive: boolean;
  followersCount: number | null;
  lastExtractedAt: string | null;
  platform: { id: string; name: string };
  _count: { posts: number };
}

export function AccountsViewClient({ canManage }: { canManage: boolean }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');

  const optionsQuery = useFilterOptions();

  const query = useQuery({
    queryKey: ['accounts-view', page, search, platformFilter],
    queryFn: () =>
      api.get<{ accounts: AccountRow[]; total: number; page: number; pageSize: number }>(
        buildQuery('/api/accounts', {
          page,
          pageSize: 25,
          q: search,
          platformId: platformFilter,
          status: 'ACTIVE',
        }),
      ),
  });

  const data = query.data;

  return (
    <>
      <PageHeader
        title="الحسابات"
        description="الحسابات والصفحات المرصودة على المنصات"
        action={
          <>
            <Link href="/compare">
              <Button variant="secondary">مقارنة الحسابات</Button>
            </Link>
            {canManage && (
              <Link href="/admin/accounts">
                <Button>إدارة الحسابات</Button>
              </Link>
            )}
          </>
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
            placeholder="اسم الحساب"
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
            {optionsQuery.data?.platforms.map((platform) => (
              <option key={platform.id} value={platform.id}>
                {platform.name}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">
            <Search className="h-4 w-4" aria-hidden />
            بحث
          </Button>
        </form>

        {query.isPending ? (
          <SkeletonRows rows={8} />
        ) : query.isError ? (
          <ErrorState description={query.error instanceof ApiClientError ? query.error.message : undefined} />
        ) : !data || data.accounts.length === 0 ? (
          <EmptyState icon={UsersRound} title="لا توجد حسابات" />
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
                    <TH>المتابعون</TH>
                    <TH>المنشورات</TH>
                    <TH>آخر تحديث</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.accounts.map((account) => (
                    <TR key={account.id}>
                      <TD>
                        <Link
                          href={`/accounts/${account.id}`}
                          className="block max-w-64 truncate font-medium hover:text-primary hover:underline"
                        >
                          {account.name}
                        </Link>
                      </TD>
                      <TD className="text-xs">{account.platform.name}</TD>
                      <TD className="text-xs text-muted-foreground">
                        {ACCOUNT_TYPE_LABELS[account.type]}
                      </TD>
                      <TD>
                        <Badge tone={account.ownership === 'OWNED' ? 'primary' : 'neutral'} size="sm">
                          {ACCOUNT_OWNERSHIP_LABELS[account.ownership]}
                        </Badge>
                      </TD>
                      <TD className="num">
                        {account.followersCount ? formatCompactNumber(account.followersCount) : '—'}
                      </TD>
                      <TD className="num">{formatNumber(account._count.posts)}</TD>
                      <TD className="text-xs text-muted-foreground">
                        {account.lastExtractedAt ? formatRelativeTime(account.lastExtractedAt) : '—'}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
          </>
        )}
      </Card>
    </>
  );
}

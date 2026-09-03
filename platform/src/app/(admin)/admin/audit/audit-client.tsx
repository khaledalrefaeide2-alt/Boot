'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScrollText, Search } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Table, TBody, TD, TH, THead, TR, TableWrapper } from '@/components/ui/table';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/states';
import { Pagination } from '@/components/ui/pagination';
import { api, ApiClientError, buildQuery } from '@/lib/api-client';
import { AUDIT_ACTION_LABELS } from '@/lib/audit-labels';
import { ROLE_LABELS } from '@/lib/auth/rbac';
import { formatDateTime, formatNumber } from '@/lib/utils';
import type { Role } from '@/generated/prisma';

interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string | null;
  actorEmail: string | null;
  actorRole: Role | null;
  ipAddress: string | null;
  createdAt: string;
  user: { id: string; name: string } | null;
}

/** الأفعال التي تُعرض بلون تحذيري لأنها حساسة */
const CRITICAL_ACTIONS = new Set([
  'auth.login.failed',
  'auth.login.blocked',
  'user.disabled',
  'user.role_changed',
  'account.deleted',
  'platform.deleted',
  'post.deleted',
  'extraction.failed',
  'user.password_reset_by_admin',
]);

export function AuditClient() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  const query = useQuery({
    queryKey: ['audit', page, search, actionFilter],
    queryFn: () =>
      api.get<{
        logs: AuditRow[];
        total: number;
        page: number;
        pageSize: number;
        actions: { action: string; count: number }[];
      }>(buildQuery('/api/audit', { page, pageSize: 40, q: search, action: actionFilter })),
  });

  const data = query.data;

  return (
    <>
      <PageHeader
        title="السجلات والنشاطات"
        description="سجل كل العمليات الحساسة في النظام — من نفّذها ومتى ومن أي عنوان"
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
            placeholder="الوصف أو البريد أو معرّف العنصر"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          <Select
            wrapperClassName="w-56"
            label="نوع العملية"
            value={actionFilter}
            onChange={(event) => {
              setActionFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="">كل العمليات</option>
            {data?.actions.map((item) => (
              <option key={item.action} value={item.action}>
                {AUDIT_ACTION_LABELS[item.action] ?? item.action} ({item.count})
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">
            <Search className="h-4 w-4" aria-hidden />
            بحث
          </Button>
        </form>

        {query.isPending ? (
          <SkeletonRows rows={10} />
        ) : query.isError ? (
          <ErrorState description={query.error instanceof ApiClientError ? query.error.message : undefined} />
        ) : !data || data.logs.length === 0 ? (
          <EmptyState icon={ScrollText} title="لا توجد سجلات مطابقة" />
        ) : (
          <>
            <TableWrapper>
              <Table>
                <THead>
                  <TR>
                    <TH>العملية</TH>
                    <TH>الوصف</TH>
                    <TH>المنفّذ</TH>
                    <TH>الدور</TH>
                    <TH>العنصر</TH>
                    <TH>العنوان</TH>
                    <TH>التاريخ</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.logs.map((log) => (
                    <TR key={log.id}>
                      <TD>
                        <Badge tone={CRITICAL_ACTIONS.has(log.action) ? 'warning' : 'neutral'}>
                          {AUDIT_ACTION_LABELS[log.action] ?? log.action}
                        </Badge>
                      </TD>
                      <TD className="max-w-80 text-sm">{log.summary ?? '—'}</TD>
                      <TD className="text-xs">
                        <p>{log.user?.name ?? 'النظام'}</p>
                        <p className="ltr text-muted-foreground">{log.actorEmail ?? ''}</p>
                      </TD>
                      <TD className="text-xs text-muted-foreground">
                        {log.actorRole ? ROLE_LABELS[log.actorRole] : '—'}
                      </TD>
                      <TD className="text-xs text-muted-foreground">{log.entityType}</TD>
                      <TD className="ltr text-xs text-muted-foreground">{log.ipAddress ?? '—'}</TD>
                      <TD className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDateTime(log.createdAt)}
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

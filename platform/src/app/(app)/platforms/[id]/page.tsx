import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { can, PERMISSIONS } from '@/lib/auth/rbac';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState } from '@/components/ui/states';
import { Table, TBody, TD, TH, THead, TR, TableWrapper } from '@/components/ui/table';
import { getOverviewStats } from '@/lib/queries/stats';
import { formatCompactNumber, formatNumber, formatRelativeTime } from '@/lib/utils';
import { getAccountScope } from '@/lib/auth/account-scope';

export const metadata: Metadata = { title: 'تفاصيل المنصة' };

export default async function PlatformDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getSession();
  if (!can(user, PERMISSIONS.PLATFORMS_VIEW)) notFound();

  const platform = await prisma.platform.findUnique({
    where: { id },
    select: { id: true, name: true, code: true, defaultActorId: true },
  });
  if (!platform) notFound();

  const scope = await getAccountScope();

  const [stats, accounts] = await Promise.all([
    getOverviewStats({ platformId: id, range: 'all', includeHidden: 'false' }, scope),
    prisma.account.findMany({
      where: { platformId: id },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        isActive: true,
        followersCount: true,
        lastExtractedAt: true,
        _count: { select: { posts: true } },
      },
    }),
  ]);

  return (
    <>
      <PageHeader
        title={platform.name}
        description={`لوحة المنصة — ${formatNumber(accounts.length)} حساباً مرصوداً`}
        action={
          <Link href={`/posts?platformId=${platform.id}&range=all`}>
            <Button>عرض منشورات المنصة</Button>
          </Link>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="إجمالي المنشورات" value={stats.totalPosts} />
        <StatCard label="إجمالي التفاعل" value={stats.totalEngagement} compact tone="primary" />
        <StatCard label="الإعجابات" value={stats.totalLikes} compact />
        <StatCard label="التعليقات" value={stats.totalComments} compact />
        <StatCard label="المشاهدات" value={stats.totalViews} compact />
      </div>

      <Card>
        <CardHeader title="حسابات المنصة" />
        {accounts.length === 0 ? (
          <EmptyState
            title="لا توجد حسابات على هذه المنصة"
            description="أضف حسابات من لوحة الإدارة لبدء الرصد"
          />
        ) : (
          <TableWrapper>
            <Table>
              <THead>
                <TR>
                  <TH>الحساب</TH>
                  <TH>الحالة</TH>
                  <TH>المتابعون</TH>
                  <TH>المنشورات</TH>
                  <TH>آخر استخراج</TH>
                </TR>
              </THead>
              <TBody>
                {accounts.map((account) => (
                  <TR key={account.id}>
                    <TD>
                      <Link
                        href={`/accounts/${account.id}`}
                        className="font-medium hover:text-primary hover:underline"
                      >
                        {account.name}
                      </Link>
                    </TD>
                    <TD className="text-xs text-muted-foreground">
                      {account.isActive ? 'مفعّل' : 'معطّل'}
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
        )}
      </Card>
    </>
  );
}

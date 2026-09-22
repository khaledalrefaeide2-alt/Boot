import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { can, PERMISSIONS } from '@/lib/auth/rbac';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { METRIC_ICONS, StatCard, StatGrid } from '@/components/ui/stat-card';
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

  const canBrowseAccounts = can(user, PERMISSIONS.ACCOUNTS_VIEW);

  const platform = await prisma.platform.findUnique({
    where: { id },
    select: { id: true, name: true, code: true, defaultActorId: true },
  });
  if (!platform) notFound();

  const scope = await getAccountScope();

  const [stats, accounts] = await Promise.all([
    getOverviewStats({ platformId: id, range: 'all', includeHidden: 'false' }, scope),
    prisma.account.findMany({
      // جدول الحسابات لا يتبع البطاقات تلقائياً: البطاقات تمرّ بـ buildPostWhere
      // وهذا استعلام مباشر على الحسابات، فيُحصر بالنطاق صراحةً
      where: { platformId: id, ...(scope === null ? {} : { id: { in: scope } }) },
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

      <StatGrid count={5} className="mb-4">
        <StatCard label="إجمالي المنشورات" value={stats.totalPosts} icon={METRIC_ICONS.posts} />
        <StatCard
          label="إجمالي التفاعل"
          value={stats.totalEngagement}
          icon={METRIC_ICONS.engagement}
          compact
          tone="primary"
        />
        <StatCard
          label="الإعجابات"
          value={stats.totalLikes}
          icon={METRIC_ICONS.likes}
          compact
        />
        <StatCard
          label="التعليقات"
          value={stats.totalComments}
          icon={METRIC_ICONS.comments}
          compact
        />
        <StatCard
          label="المشاهدات"
          value={stats.totalViews}
          icon={METRIC_ICONS.views}
          compact
        />
      </StatGrid>

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
                      {/* الرابط لمن يملك تصفّح الدليل — ولغيره الاسم وحده */}
                      {canBrowseAccounts ? (
                        <Link
                          href={`/accounts/${account.id}`}
                          className="font-medium hover:text-primary hover:underline"
                        >
                          {account.name}
                        </Link>
                      ) : (
                        <span className="font-medium">{account.name}</span>
                      )}
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

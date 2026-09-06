import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { can, PERMISSIONS } from '@/lib/auth/rbac';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState } from '@/components/ui/states';
import { AccountTimeline } from './account-timeline';
import { getOverviewStats, getTimeseries } from '@/lib/queries/stats';
import {
  ACCOUNT_OWNERSHIP_LABELS,
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_VISIBILITY_LABELS,
  EXTRACTION_STATUS_LABELS,
  EXTRACTION_STATUS_TONE,
  languageLabel,
} from '@/lib/domain/constants';
import { formatCompactNumber, formatDateTime, formatNumber, truncate } from '@/lib/utils';
import { getAccountScope, scopeAllows } from '@/lib/auth/account-scope';

export const metadata: Metadata = { title: 'تفاصيل الحساب' };

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border py-2.5 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{children}</span>
    </div>
  );
}

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSession();
  if (!can(user, PERMISSIONS.ACCOUNTS_VIEW)) notFound();

  const account = await prisma.account.findUnique({
    where: { id },
    include: {
      platform: { select: { id: true, name: true } },
      keywords: { include: { keyword: { select: { id: true, term: true } } } },
      _count: { select: { posts: true, runs: true } },
    },
  });
  if (!account) notFound();

  const scope = await getAccountScope();
  // الحساب خارج النطاق يُعامل كغير موجود
  if (!scopeAllows(scope, account.id)) notFound();
  const filters = { accountId: id, range: 'all' as const, includeHidden: 'false' as const };

  const [stats, series, recentPosts, recentRuns] = await Promise.all([
    getOverviewStats(filters, scope),
    getTimeseries(filters, scope),
    prisma.post.findMany({
      where: { accountId: id, isHidden: false },
      orderBy: { publishedAt: 'desc' },
      take: 8,
      select: {
        id: true,
        text: true,
        publishedAt: true,
        engagementTotal: true,
      },
    }),
    can(user, PERMISSIONS.EXTRACTION_VIEW)
      ? prisma.extractionRun.findMany({
          where: { accountId: id },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            status: true,
            itemsSaved: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title={account.name}
        description={`${account.platform.name} — ${ACCOUNT_TYPE_LABELS[account.type]}`}
        action={
          <>
            <a href={account.url} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary">
                <ExternalLink className="h-4 w-4" aria-hidden />
                فتح الحساب
              </Button>
            </a>
            <Link href={`/posts?accountId=${account.id}&range=all`}>
              <Button>كل المنشورات</Button>
            </Link>
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="المنشورات" value={stats.totalPosts} />
        <StatCard label="إجمالي التفاعل" value={stats.totalEngagement} compact tone="primary" />
        <StatCard label="معدل التفاعل" value={formatNumber(stats.engagementRate)} />
        <StatCard
          label="المتابعون"
          value={account.followersCount ? formatCompactNumber(account.followersCount) : '—'}
        />
        <StatCard label="عمليات الاستخراج" value={account._count.runs} />
      </div>

      <div className="mb-4">
        <AccountTimeline data={series} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="بيانات الحساب" />
          <CardBody className="py-1">
            <DetailRow label="المنصة">
              <Link href={`/platforms/${account.platform.id}`} className="text-primary hover:underline">
                {account.platform.name}
              </Link>
            </DetailRow>
            <DetailRow label="نوع الحساب">{ACCOUNT_TYPE_LABELS[account.type]}</DetailRow>
            <DetailRow label="الملكية">{ACCOUNT_OWNERSHIP_LABELS[account.ownership]}</DetailRow>
            <DetailRow label="الظهور">{ACCOUNT_VISIBILITY_LABELS[account.visibility]}</DetailRow>
            <DetailRow label="اللغة">{languageLabel(account.language)}</DetailRow>
            <DetailRow label="الدولة">{account.country ?? '—'}</DetailRow>
            <DetailRow label="الحالة">
              <Badge tone={account.isActive ? 'success' : 'neutral'}>
                {account.isActive ? 'مفعّل' : 'معطّل'}
              </Badge>
            </DetailRow>
            <DetailRow label="تكرار الاستخراج">
              {account.extractionIntervalMinutes > 0
                ? `كل ${formatNumber(account.extractionIntervalMinutes)} دقيقة`
                : 'يدوي فقط'}
            </DetailRow>
            <DetailRow label="نافذة الاستخراج">
              <span className="num">{account.extractionWindowDays}</span> يوماً
            </DetailRow>
            <DetailRow label="آخر استخراج">{formatDateTime(account.lastExtractedAt)}</DetailRow>
            {account.keywords.length > 0 && (
              <DetailRow label="الكلمات المرتبطة">
                <span className="flex flex-wrap justify-end gap-1">
                  {account.keywords.map((link) => (
                    <Badge key={link.keyword.id} size="sm">
                      {link.keyword.term}
                    </Badge>
                  ))}
                </span>
              </DetailRow>
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="أحدث المنشورات"
            action={
              <Link href={`/posts?accountId=${account.id}&range=all`}>
                <Button variant="ghost" size="sm">
                  عرض الكل
                </Button>
              </Link>
            }
          />
          {recentPosts.length === 0 ? (
            <EmptyState
              title="لا توجد منشورات لهذا الحساب"
              description="شغّل عملية استخراج من لوحة الإدارة"
            />
          ) : (
            <CardBody className="space-y-2">
              {recentPosts.map((post) => (
                <Link
                  key={post.id}
                  href={`/posts/${post.id}`}
                  className="flex items-start gap-3 rounded-md border border-border p-2.5 transition-colors hover:bg-surface-2/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm leading-relaxed">
                      {truncate(post.text, 150) || 'منشور بلا نص'}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(post.publishedAt)}</p>
                  </div>
                  <Badge tone="primary" className="shrink-0">
                    <span className="num">{formatCompactNumber(post.engagementTotal)}</span>
                  </Badge>
                </Link>
              ))}
            </CardBody>
          )}
        </Card>
      </div>

      {recentRuns.length > 0 && (
        <Card className="mt-4">
          <CardHeader
            title="آخر عمليات الاستخراج"
            action={
              <Link href={`/admin/extractions?accountId=${account.id}`}>
                <Button variant="ghost" size="sm">
                  السجل الكامل
                </Button>
              </Link>
            }
          />
          <CardBody className="space-y-2">
            {recentRuns.map((run) => (
              <Link
                key={run.id}
                href={`/admin/extractions/${run.id}`}
                className="flex items-center justify-between gap-3 rounded-md border border-border p-2.5 transition-colors hover:bg-surface-2/50"
              >
                <Badge tone={EXTRACTION_STATUS_TONE[run.status]}>
                  {EXTRACTION_STATUS_LABELS[run.status]}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  حُفظ <span className="num">{formatNumber(run.itemsSaved)}</span> منشوراً
                </span>
                <span className="text-xs text-muted-foreground">{formatDateTime(run.createdAt)}</span>
              </Link>
            ))}
          </CardBody>
        </Card>
      )}
    </>
  );
}

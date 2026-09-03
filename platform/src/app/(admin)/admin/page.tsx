import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Newspaper,
  UserPlus,
  Users,
  UsersRound,
} from 'lucide-react';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { can, PERMISSIONS } from '@/lib/auth/rbac';
import { isApifyConfigured } from '@/lib/apify/client';
import { isRedisReady } from '@/lib/redis';
import { PageHeader } from '@/components/layout/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, StatusDot } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { EmptyState } from '@/components/ui/states';
import { Table, TBody, TD, TH, THead, TR, TableWrapper } from '@/components/ui/table';
import {
  EXTRACTION_STATUS_LABELS,
  EXTRACTION_STATUS_TONE,
} from '@/lib/domain/constants';
import { formatDuration, formatNumber, formatRelativeTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'لوحة تحكم الإدارة' };

export default async function AdminHomePage() {
  const user = await getSession();

  const [
    postsCount,
    accountsCount,
    platformsCount,
    usersCount,
    pendingUsers,
    activeRuns,
    failedRuns24h,
    recentRuns,
    redisReady,
  ] = await Promise.all([
    prisma.post.count({ where: { isHidden: false } }),
    prisma.account.count({ where: { status: 'ACTIVE' } }),
    prisma.platform.count({ where: { status: 'ACTIVE' } }),
    prisma.user.count(),
    prisma.user.count({ where: { status: 'PENDING' } }),
    prisma.extractionRun.count({ where: { status: { in: ['PENDING', 'RUNNING'] } } }),
    prisma.extractionRun.count({
      where: {
        status: 'FAILED',
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.extractionRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true,
        status: true,
        itemsSaved: true,
        itemsFetched: true,
        durationMs: true,
        createdAt: true,
        errorMessage: true,
        account: { select: { name: true } },
        platform: { select: { name: true } },
      },
    }),
    isRedisReady(),
  ]);

  const apifyConfigured = isApifyConfigured();

  return (
    <>
      <PageHeader
        title="لوحة تحكم الإدارة"
        description="حالة النظام والعمليات الجارية"
        action={
          <Link href="/">
            <Button variant="secondary">لوحة العرض</Button>
          </Link>
        }
      />

      <div className="mb-4 space-y-2">
        {!apifyConfigured && (
          <Alert tone="danger" title="رمز Apify غير معرّف">
            لن تعمل عمليات الاستخراج. أضف APIFY_TOKEN إلى ملف البيئة ثم أعد تشغيل الخدمة.
          </Alert>
        )}
        {!redisReady && (
          <Alert tone="warning" title="Redis غير متاح">
            الطابور والجدولة التلقائية معطّلان. شغّل Redis والعامل الخلفي عبر npm run worker.
          </Alert>
        )}
        {pendingUsers > 0 && can(user, PERMISSIONS.USERS_APPROVE) && (
          <Alert tone="warning" title="مستخدمون بانتظار الموافقة">
            يوجد <span className="num font-semibold">{formatNumber(pendingUsers)}</span> حساباً ينتظر
            الموافقة.{' '}
            <Link href="/admin/users" className="font-medium underline underline-offset-2">
              مراجعتهم الآن
            </Link>
          </Alert>
        )}
        {failedRuns24h > 0 && (
          <Alert tone="danger" title="عمليات استخراج فاشلة">
            فشلت <span className="num font-semibold">{formatNumber(failedRuns24h)}</span> عملية خلال
            آخر 24 ساعة.{' '}
            <Link
              href="/admin/extractions?status=FAILED"
              className="font-medium underline underline-offset-2"
            >
              عرض التفاصيل
            </Link>
          </Alert>
        )}
        {apifyConfigured && redisReady && pendingUsers === 0 && failedRuns24h === 0 && (
          <Alert tone="success" title="النظام يعمل بشكل سليم">
            كل التكاملات متصلة ولا توجد تنبيهات تشغيلية.
          </Alert>
        )}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="المنشورات" value={postsCount} icon={Newspaper} href="/posts" compact />
        <StatCard label="الحسابات" value={accountsCount} icon={UsersRound} href="/admin/accounts" />
        <StatCard label="المنصات" value={platformsCount} icon={Building2} href="/admin/platforms" />
        <StatCard label="المستخدمون" value={usersCount} icon={Users} href="/admin/users" />
        <StatCard
          label="بانتظار الموافقة"
          value={pendingUsers}
          icon={UserPlus}
          href="/admin/users"
          tone={pendingUsers > 0 ? 'warning' : 'default'}
        />
        <StatCard
          label="عمليات قائمة"
          value={activeRuns}
          icon={Activity}
          href="/admin/extractions"
          tone={activeRuns > 0 ? 'primary' : 'default'}
        />
      </div>

      <Card>
        <CardHeader
          title="آخر عمليات الاستخراج"
          action={
            <Link href="/admin/extractions">
              <Button variant="ghost" size="sm">
                السجل الكامل
              </Button>
            </Link>
          }
        />
        {recentRuns.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="لم تُشغَّل أي عملية استخراج بعد"
            description="أضف حساباً ثم شغّل أول عملية"
            action={
              <Link href="/admin/accounts">
                <Button variant="secondary">إدارة الحسابات</Button>
              </Link>
            }
          />
        ) : (
          <TableWrapper>
            <Table>
              <THead>
                <TR>
                  <TH>الحالة</TH>
                  <TH>الحساب</TH>
                  <TH>المنصة</TH>
                  <TH>جُلب</TH>
                  <TH>حُفظ</TH>
                  <TH>المدة</TH>
                  <TH>منذ</TH>
                </TR>
              </THead>
              <TBody>
                {recentRuns.map((run) => (
                  <TR key={run.id}>
                    <TD>
                      <Link href={`/admin/extractions/${run.id}`}>
                        <Badge tone={EXTRACTION_STATUS_TONE[run.status]}>
                          <StatusDot tone={EXTRACTION_STATUS_TONE[run.status]} />
                          {EXTRACTION_STATUS_LABELS[run.status]}
                        </Badge>
                      </Link>
                    </TD>
                    <TD className="max-w-48 truncate text-sm">{run.account?.name ?? '—'}</TD>
                    <TD className="text-xs text-muted-foreground">{run.platform?.name ?? '—'}</TD>
                    <TD className="num">{formatNumber(run.itemsFetched)}</TD>
                    <TD className="num text-success">{formatNumber(run.itemsSaved)}</TD>
                    <TD className="text-xs text-muted-foreground">{formatDuration(run.durationMs)}</TD>
                    <TD className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatRelativeTime(run.createdAt)}
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

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Download, ExternalLink, Info } from 'lucide-react';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { can, PERMISSIONS } from '@/lib/auth/rbac';
import { getAccountScope, scopeAllows } from '@/lib/auth/account-scope';
import { PageHeader } from '@/components/layout/page-header';
import { AccountAvatar } from '@/components/ui/avatar';
import { LinkButton } from '@/components/ui/link-button';
import { METRIC_ICONS, StatCard, StatGrid } from '@/components/ui/stat-card';
import { formatCompactNumber, formatDate } from '@/lib/utils';
import { AccountPostsClient } from './account-posts-client';

export const metadata: Metadata = { title: 'منشورات الحساب' };

/** شكل المعرّف — يُفحص قبل أن يصل إلى القاعدة */
const ID_SHAPE = /^[A-Za-z0-9_-]{1,64}$/;

/*
 * منشورات حسابٍ واحد — ما يُفتح بالضغط على بطاقته في «المنصات».
 *
 * ★ الحارس ثلاثة أبواب لا باب.
 *
 *   رؤية المنصات، ورؤية المنشورات، ونطاق الحسابات المُسندة. والحساب خارج
 *   النطاق يُعامل كغير موجود (404 لا 403): «ممنوع» تقول إنّ الحساب موجود،
 *   وهي معلومةٌ بذاتها لمن لا يحقّ له أن يعرفها.
 *
 *   والقائمة نفسها تمرّ بـ`/api/posts`، وهي محصورةٌ بالنطاق هناك أيضاً —
 *   فالحارس هنا يحمي الترويسة والأرقام، والمسار يحمي المنشورات.
 */
export default async function PlatformAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSession();
  if (!can(user, PERMISSIONS.PLATFORMS_VIEW) || !can(user, PERMISSIONS.POSTS_VIEW)) notFound();
  if (!ID_SHAPE.test(id)) notFound();

  const scope = await getAccountScope();
  if (!scopeAllows(scope, id)) notFound();

  const account = await prisma.account.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      username: true,
      url: true,
      followersCount: true,
      avatarUrl: true,
      avatarKey: true,
      platform: { select: { id: true, name: true } },
      group: { select: { id: true, name: true } },
    },
  });
  if (!account) notFound();

  // الأرقام كلّها من المنشورات الظاهرة — كما في كلّ شاشات العرض
  const stats = await prisma.post.aggregate({
    where: { accountId: id, isHidden: false },
    _count: { _all: true },
    _sum: { engagementTotal: true, likes: true, comments: true, shares: true, views: true },
    _min: { publishedAt: true },
    _max: { publishedAt: true },
  });

  const username = account.username?.replace(/^@/, '');
  const subtitle = [
    account.platform.name,
    account.group?.name,
    account.followersCount !== null ? `${formatCompactNumber(account.followersCount)} متابع` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const span =
    stats._min.publishedAt && stats._max.publishedAt
      ? `من ${formatDate(stats._min.publishedAt)} إلى ${formatDate(stats._max.publishedAt)}`
      : undefined;

  return (
    <>
      {/*
        مسار الرجوع يحمل التصنيف: من جاء من «الوزارات» يعود إليها لا إلى
        الدليل كلّه. والرجوع بزرّ المتصفّح يحفظ البحث أيضاً — الفلاتر في الرابط.
      */}
      <nav aria-label="مسار التنقل" className="mb-3 no-print">
        <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          <li>
            <Link href="/platforms" className="hover:text-primary-text hover:underline">
              المنصات
            </Link>
          </li>
          {account.group && (
            <>
              <li aria-hidden>
                <ChevronLeft className="h-4 w-4" />
              </li>
              <li>
                <Link
                  href={`/platforms?group=${account.group.id}`}
                  className="hover:text-primary-text hover:underline"
                >
                  {account.group.name}
                </Link>
              </li>
            </>
          )}
          <li aria-hidden>
            <ChevronLeft className="h-4 w-4" />
          </li>
          <li aria-current="page" className="max-w-[16rem] truncate font-medium text-foreground">
            {account.name}
          </li>
        </ol>
      </nav>

      <PageHeader
        leading={
          <AccountAvatar name={account.name} src={account.avatarUrl} mediaKey={account.avatarKey} size="lg" />
        }
        title={account.name}
        description={username ? `${subtitle} · @${username}` : subtitle}
        action={
          <>
            {/* الرابط يُفحص عند الإدخال، ويُفحص هنا ثانيةً: `href` لا يُرسم إلا لـhttp(s) */}
            {/^https?:\/\//i.test(account.url) && (
              <LinkButton href={account.url} as="a" target="_blank" rel="noopener noreferrer" variant="secondary">
                <ExternalLink aria-hidden />
                فتح الحساب الأصلي
              </LinkButton>
            )}
            {can(user, PERMISSIONS.ACCOUNTS_VIEW) && (
              <LinkButton href={`/accounts/${account.id}`} variant="secondary">
                <Info aria-hidden />
                تفاصيل الحساب
              </LinkButton>
            )}
            {can(user, PERMISSIONS.REPORTS_EXPORT) && (
              <LinkButton
                href={`/api/reports/export?accountId=${account.id}&range=all&format=excel`}
                as="a"
                variant="secondary"
              >
                <Download aria-hidden />
                تصدير Excel
              </LinkButton>
            )}
          </>
        }
      />

      <StatGrid count={6} className="mb-5">
        <StatCard
          label="المنشورات المستخرجة"
          value={stats._count._all}
          icon={METRIC_ICONS.posts}
          hint={span}
        />
        <StatCard
          label="إجمالي التفاعل"
          value={stats._sum.engagementTotal ?? 0}
          icon={METRIC_ICONS.engagement}
          compact
        />
        <StatCard label="الإعجابات" value={stats._sum.likes ?? 0} icon={METRIC_ICONS.likes} compact />
        <StatCard label="التعليقات" value={stats._sum.comments ?? 0} icon={METRIC_ICONS.comments} compact />
        <StatCard label="المشاركات" value={stats._sum.shares ?? 0} icon={METRIC_ICONS.shares} compact />
        <StatCard label="المشاهدات" value={stats._sum.views ?? 0} icon={METRIC_ICONS.views} compact />
      </StatGrid>

      <AccountPostsClient
        accountId={account.id}
        canReview={can(user, PERMISSIONS.POSTS_REVIEW)}
      />
    </>
  );
}

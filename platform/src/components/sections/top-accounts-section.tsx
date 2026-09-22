'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Segmented } from '@/components/ui/button-group';
import { AccountAvatar } from '@/components/ui/avatar';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/states';
import { METRIC_ICONS } from '@/components/ui/stat-card';
import { SectionHeader } from '@/components/sections/section-header';
import { EMPTY_SCOPE, ScopeTabs, scopeParams, type SectionScope } from '@/components/sections/scope-tabs';
import { api, ApiClientError, buildQuery } from '@/lib/api-client';
import { useCan } from '@/lib/auth/permissions-client';
import { PERMISSIONS } from '@/lib/auth/rbac';
import { formatCompactNumber } from '@/lib/utils';

/*
 * أبرز الحسابات بمقياسٍ يختاره القارئ.
 *
 * «الأكثر نشراً» و«الأعلى تفاعلاً» سؤالان مختلفان لا صياغتان لسؤال: حسابٌ
 * ينشر مئة منشور باهت يتصدّر الأوّل ويغيب عن الثاني، وحسابٌ ينشر خمسةً
 * تنتشر يفعل العكس. وعرضُ أحدهما وحده يُخفي نصف الصورة.
 */

const METRICS = [
  { value: 'posts', label: 'الأكثر نشراً' },
  { value: 'engagement', label: 'الأعلى تفاعلاً' },
  { value: 'likes', label: 'الإعجابات' },
  { value: 'comments', label: 'التعليقات' },
  { value: 'shares', label: 'المشاركات' },
  { value: 'views', label: 'المشاهدات' },
] as const;

type Metric = (typeof METRICS)[number]['value'];

interface TopAccount {
  id: string;
  name: string;
  platformName: string;
  platformCode: string;
  followersCount: number | null;
  avatarUrl: string | null;
  posts: number;
  engagement: number;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  engagementRate: number;
}

/** مقياس مصغّر في تذييل بطاقة الحساب — مطابق لتذييل بطاقة المنشور */
function Stat({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Users;
  value: number;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground" title={label}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span className="num">{formatCompactNumber(value)}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function TopAccountsSection({
  title = 'أبرز الحسابات',
  description = 'اختر المنصة أو المجموعة والمقياس، لعرض الحسابات الأولى بحسبها وأرقامها.',
  params = {},
  limit = 4,
  href = '/accounts',
  className,
}: {
  title?: string;
  description?: string;
  params?: Record<string, string | number | undefined>;
  limit?: number;
  href?: string;
  className?: string;
}) {
  const [metric, setMetric] = useState<Metric>('posts');
  const [scope, setScope] = useState<SectionScope>(EMPTY_SCOPE);
  const canBrowse = useCan(PERMISSIONS.ACCOUNTS_VIEW);

  const effective = scopeParams(params, scope);

  const query = useQuery({
    queryKey: ['top-accounts', metric, limit, effective],
    queryFn: () =>
      api.get<{ accounts: TopAccount[] }>(
        buildQuery('/api/stats/top-accounts', { ...effective, metric, limit }),
      ),
  });

  const accounts = query.data?.accounts ?? [];

  return (
    <section className={className}>
      {/*
        «عرض جميع الحسابات» يُحذف لمن لا يملك الدليل — والقسم يبقى: أبرزُ
        الحسابات قراءةُ نتيجة لا تصفّحُ مصدر.
      */}
      <SectionHeader
        title={title}
        description={description}
        href={canBrowse ? href : undefined}
        hrefLabel="عرض جميع الحسابات"
      >
        <div className="space-y-2">
          <ScopeTabs value={scope} onChange={setScope} />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="eyebrow shrink-0">المقياس</span>
            <Segmented
              variant="pills"
              size="sm"
              label="مقياس الترتيب"
              value={metric}
              onChange={setMetric}
              options={METRICS.map((item) => ({ value: item.value, label: item.label }))}
            />
          </div>
        </div>
      </SectionHeader>

      {query.isPending ? (
        <Card>
          <SkeletonRows rows={3} />
        </Card>
      ) : query.isError ? (
        <Card>
          <ErrorState
            description={query.error instanceof ApiClientError ? query.error.message : undefined}
          />
        </Card>
      ) : accounts.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title="لا توجد حسابات في هذا النطاق"
            description="غيّر الفترة أو الفلاتر لعرض نتائج"
          />
        </Card>
      ) : (
        <div
          className={
            limit % 3 === 0
              ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3'
              : 'grid gap-4 sm:grid-cols-2 xl:grid-cols-4'
          }
        >
          {accounts.map((account, index) => (
            <article
              key={account.id}
              className="@container card-interactive flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-elev-2 print-avoid-break"
            >
              <header className="flex items-center gap-3">
                <AccountAvatar name={account.name} src={account.avatarUrl} />
                <div className="min-w-0 flex-1">
                  {canBrowse ? (
                    <Link
                      href={`/accounts/${account.id}`}
                      className="block truncate text-sm font-semibold text-foreground hover:text-primary @[15rem]:text-[0.95rem]"
                    >
                      {account.name}
                    </Link>
                  ) : (
                    <span className="block truncate text-sm font-semibold text-foreground @[15rem]:text-[0.95rem]">
                      {account.name}
                    </span>
                  )}
                  <p className="truncate text-xs text-muted-foreground">{account.platformName}</p>
                </div>
                {/*
                  الرتبة رقمٌ لا وسام: القسم مرتَّب أصلاً، لكن البطاقات
                  تُقرأ متفرّقةً على سطرين فيضيع الترتيب بينها.
                */}
                <span className="num flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-olive-100 text-sm font-bold text-olive-800">
                  {index + 1}
                </span>
              </header>

              {/*
                الرقم الكبير هو المقياس المختار نفسه لا رقمٌ ثابت: من اختار
                «الأعلى تفاعلاً» يريد أن يرى التفاعل، لا عدد المنشورات.
              */}
              <div className="flex-1">
                <p className="eyebrow">
                  {METRICS.find((item) => item.value === metric)?.label ?? ''}
                </p>
                <p className="num whitespace-nowrap text-2xl font-extrabold tracking-[-0.02em] tabular-nums text-primary">
                  {formatCompactNumber(account[metric])}
                </p>
                {account.followersCount !== null && (
                  <p className="mt-1 text-xs text-subtle-foreground">
                    <span className="num">{formatCompactNumber(account.followersCount)}</span> متابع
                  </p>
                )}
              </div>

              <Link
                href={`/posts?accountId=${account.id}&range=all`}
                className="w-fit text-xs font-medium text-primary hover:underline @[15rem]:text-sm"
              >
                عرض منشورات الحساب
              </Link>

              <footer className="flex items-center justify-between border-t border-border pt-3">
                <Stat icon={METRIC_ICONS.posts} value={account.posts} label="منشورات" />
                <Stat icon={METRIC_ICONS.likes} value={account.likes} label="إعجابات" />
                <Stat icon={METRIC_ICONS.comments} value={account.comments} label="تعليقات" />
                <Stat icon={METRIC_ICONS.views} value={account.views} label="مشاهدات" />
              </footer>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

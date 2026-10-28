'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, FolderTree, Layers, Search, UsersRound } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { Segmented } from '@/components/ui/button-group';
import { EmptyState } from '@/components/ui/states';
import { LinkButton } from '@/components/ui/link-button';
import { AccountAvatar } from '@/components/ui/avatar';
import { METRIC_ICONS, StatCard, StatGrid, splitUnit } from '@/components/ui/stat-card';
import { PlatformMark } from '@/components/charts/platform-share';
import {
  ACCOUNT_FORMS,
  ALL,
  buildSections,
  countNoun,
  DEFAULT_DIRECTORY_FILTERS,
  DIRECTORY_SORTS,
  directorySearchParams,
  directorySummary,
  formatCount,
  groupCounts,
  parseDirectoryFilters,
  platformTotals,
  POST_FORMS,
  UNGROUPED,
  visibleAccounts,
  type DirectoryAccount,
  type DirectoryFilters,
  type DirectorySort,
  type PlatformDirectory,
} from '@/lib/domain/platform-directory';
import { arabicPlural, cn, formatCompactNumber, formatDateTime, formatNumber, formatPublishedAt } from '@/lib/utils';

const counted = countNoun;

export function PlatformsClient({
  directory,
  canOpenPosts,
  canManagePlatforms,
  canManageAccounts,
}: {
  directory: PlatformDirectory;
  canOpenPosts: boolean;
  canManagePlatforms: boolean;
  canManageAccounts: boolean;
}) {
  /*
   * ★ الفلاتر الأولى من الرابط الحيّ لا من الخادم.
   *
   *   الرابط يُحدَّث بـ`replaceState` بلا طلبٍ إلى الخادم، فما يحمله Next
   *   في ذاكرته للصفحة هو رسمها الأوّل بلا فلاتر. والرجوع من منشورات حساب
   *   يُعيد ذلك الرسم — فلو قُرئت الفلاتر منه لعادت الشاشة إلى الدليل كلّه،
   *   ثمّ كتبت ذلك في الرابط فمحت التصنيف الذي اختاره القارئ قبل لحظة.
   *   و`useSearchParams` يقرأ الرابط كما هو في شريط العنوان.
   */
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<DirectoryFilters>(() =>
    parseDirectoryFilters(Object.fromEntries(searchParams.entries())),
  );
  const update = (patch: Partial<DirectoryFilters>) => setFilters((current) => ({ ...current, ...patch }));

  /*
   * البحث يُؤجَّل لا يُبطَّأ.
   *
   * الحقل يتبع الأصابع فوراً، والتصفية تلحق حين يفرغ المتصفّح — فلا يتلعثم
   * الحرف الثالث وهو ينتظر إعادة رسم مئتي بطاقة.
   */
  const deferredQuery = useDeferredValue(filters.q);
  const effective = useMemo(() => ({ ...filters, q: deferredQuery }), [filters, deferredQuery]);

  /*
   * الفلاتر في الرابط — بلا ذهابٍ إلى الخادم.
   *
   * `replaceState` يكتب الرابط ولا يُعيد رسم الصفحة من الخادم (Next يدمجه
   * في موجّهه). فمن فتح حساباً ثمّ رجع وجد التصنيف والبحث كما تركهما، ومن
   * نسخ الرابط أرسل ما يراه لا الدليل كلّه.
   */
  useEffect(() => {
    const url = `${window.location.pathname}${directorySearchParams(effective)}`;
    if (url !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, '', url);
    }
  }, [effective]);

  const totals = useMemo(() => platformTotals(directory), [directory]);
  const sections = useMemo(() => buildSections(directory, effective), [directory, effective]);
  const counts = useMemo(() => groupCounts(directory, effective), [directory, effective]);
  const summary = useMemo(
    () => directorySummary(visibleAccounts(directory, { platform: effective.platform, q: '' })),
    [directory, effective.platform],
  );
  const shown = sections.reduce((sum, section) => sum + section.accounts.length, 0);
  const platformById = useMemo(
    () => new Map(directory.platforms.map((platform) => [platform.id, platform])),
    [directory.platforms],
  );
  const selectedPlatform = platformById.get(filters.platform);
  const filtered =
    filters.platform !== ALL || filters.group !== ALL || filters.q.trim() !== '';

  const groupOptions = [
    { value: ALL, name: 'كلّ التصنيفات', count: [...counts.values()].reduce((a, b) => a + b, 0) },
    ...directory.groups.map((group) => ({ value: group.id, name: group.name, count: counts.get(group.id) ?? 0 })),
    ...(directory.groups.length > 0
      ? [{ value: UNGROUPED, name: 'بلا تصنيف', count: counts.get(UNGROUPED) ?? 0 }]
      : []),
  ].filter((option) => option.value === ALL || option.count > 0 || option.value === filters.group);

  return (
    <>
      <PageHeader
        title="المنصات"
        description="الحسابات المرصودة مصنّفةً حسب مجموعاتها — اضغط أيّ حساب لعرض كلّ منشوراته المستخرجة."
        action={
          (canManageAccounts || canManagePlatforms) && (
            <>
              {canManageAccounts && (
                <LinkButton href="/admin/accounts" variant="secondary">إدارة الحسابات</LinkButton>
              )}
              {canManagePlatforms && (
                <LinkButton href="/admin/platforms" variant="secondary">إدارة المنصات</LinkButton>
              )}
            </>
          )
        }
      />

      {directory.accounts.length === 0 ? (
        <Card>
          <EmptyState
            icon={UsersRound}
            title="لا توجد حسابات مرصودة بعد"
            description={
              canManageAccounts
                ? 'أضف الحسابات من لوحة الإدارة، وستظهر هنا مصنّفةً حسب مجموعاتها.'
                : 'لم تُسند إليك حسابات بعد، أو لم تُضف حسابات إلى المنصة.'
            }
            action={
              canManageAccounts && <LinkButton href="/admin/accounts">إضافة حسابات</LinkButton>
            }
          />
        </Card>
      ) : (
        <>
          {/* المنصات شريطٌ يصفّي — والبطاقة الأولى «كلّ المنصات» */}
          <div
            role="radiogroup"
            aria-label="المنصة"
            className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
          >
            <PlatformTile
              active={filters.platform === ALL}
              onSelect={() => update({ platform: ALL })}
              mark={
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-primary-soft text-primary-soft-foreground">
                  <Layers className="h-[18px] w-[18px]" aria-hidden />
                </span>
              }
              name="كلّ المنصات"
              accounts={directory.accounts.length}
              posts={directory.accounts.reduce((sum, account) => sum + account.posts, 0)}
            />
            {directory.platforms.map((platform) => (
              <PlatformTile
                key={platform.id}
                active={filters.platform === platform.id}
                onSelect={() => update({ platform: platform.id })}
                mark={<PlatformMark code={platform.code} className="h-9 w-9" />}
                name={platform.name}
                accounts={totals.get(platform.id)?.accounts ?? 0}
                posts={totals.get(platform.id)?.posts ?? 0}
              />
            ))}
          </div>

          <StatGrid count={4} className="mb-4">
            <StatCard label="الحسابات المرصودة" value={summary.accounts} icon={METRIC_ICONS.accounts} />
            <StatCard label="المنشورات المستخرجة" value={summary.posts} icon={METRIC_ICONS.posts} />
            <StatCard label="إجمالي التفاعل" value={summary.engagement} icon={METRIC_ICONS.engagement} compact />
            <StatCard
              label="نشطة هذا الأسبوع"
              value={summary.activeThisWeek}
              icon={METRIC_ICONS.week}
              hint="نشرت في آخر 7 أيام"
              progress={summary.accounts > 0 ? (summary.activeThisWeek / summary.accounts) * 100 : undefined}
            />
          </StatGrid>

          <Card className="mb-5 no-print">
            <CardBody className="space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <Input
                  type="search"
                  icon={Search}
                  value={filters.q}
                  onChange={(event) => update({ q: event.target.value })}
                  placeholder="ابحث باسم الحساب أو معرّفه…"
                  aria-label="البحث في الحسابات"
                  wrapperClassName="min-w-[min(100%,14rem)] flex-1"
                  maxLength={100}
                />
                <Select
                  aria-label="ترتيب الحسابات"
                  wrapperClassName="w-full sm:w-52"
                  value={filters.sort}
                  onChange={(event) => update({ sort: event.target.value as DirectorySort })}
                >
                  {DIRECTORY_SORTS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>

              {directory.groups.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="eyebrow shrink-0">التصنيف</span>
                  <Segmented
                    variant="pills"
                    size="sm"
                    label="التصنيف"
                    value={filters.group}
                    onChange={(group) => update({ group })}
                    options={groupOptions.map((option) => ({
                      value: option.value,
                      label: (
                        <>
                          {option.name}
                          <span className="num text-xs font-medium opacity-75">{formatNumber(option.count)}</span>
                        </>
                      ),
                    }))}
                  />
                </div>
              )}
            </CardBody>
          </Card>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <p aria-live="polite">
              {filtered ? (
                <>
                  <span className="num font-semibold text-foreground">{formatNumber(shown)}</span>{' '}
                  {counted(shown, ACCOUNT_FORMS)} من{' '}
                  <span className="num">{formatNumber(directory.accounts.length)}</span>
                </>
              ) : (
                <>
                  <span className="num font-semibold text-foreground">{formatNumber(shown)}</span>{' '}
                  {counted(shown, ACCOUNT_FORMS)} في{' '}
                  <span className="num">{formatNumber(sections.length)}</span>{' '}
                  {sections.length === 1 ? 'قسم' : arabicPlural(sections.length, { one: 'قسم', two: 'قسمين', few: 'أقسام', many: 'قسماً' })}
                </>
              )}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {selectedPlatform && (
                <LinkButton href={`/platforms/${selectedPlatform.id}`} variant="ghost" size="sm">
                  تفاصيل منصة {selectedPlatform.name}
                  <ArrowLeft aria-hidden />
                </LinkButton>
              )}
              {filtered && (
                <Button variant="ghost" size="sm" onClick={() => setFilters({ ...DEFAULT_DIRECTORY_FILTERS, sort: filters.sort })}>
                  مسح الفلاتر
                </Button>
              )}
            </div>
          </div>

          {sections.length === 0 ? (
            <Card>
              <EmptyState
                icon={Search}
                title="لا حسابات تطابق ما اخترت"
                description="جرّب كلمةً أخرى، أو اختر منصةً أو تصنيفاً آخر."
                action={
                  <Button
                    variant="secondary"
                    onClick={() => setFilters({ ...DEFAULT_DIRECTORY_FILTERS, sort: filters.sort })}
                  >
                    عرض كلّ الحسابات
                  </Button>
                }
              />
            </Card>
          ) : (
            <div className="space-y-8">
              {sections.map((section) => (
                <section key={section.key} aria-labelledby={`group-${section.key}`}>
                  <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b border-border pb-2.5">
                    <div className="min-w-0">
                      <h2
                        id={`group-${section.key}`}
                        className="flex flex-wrap items-center gap-2 text-base font-bold tracking-[-0.01em] text-heading sm:text-lg"
                      >
                        <FolderTree className="h-[18px] w-[18px] shrink-0 text-primary-text" aria-hidden />
                        {section.title}
                        <Badge tone="primary" size="sm">
                          <span className="num">{formatNumber(section.accounts.length)}</span>{' '}
                          {counted(section.accounts.length, ACCOUNT_FORMS)}
                        </Badge>
                      </h2>
                      {section.description && (
                        <p className="mt-1 max-w-prose text-xs text-muted-foreground sm:text-sm">
                          {section.description}
                        </p>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <span className="num font-medium text-foreground">{formatCount(section.posts)}</span>{' '}
                      {counted(section.posts, POST_FORMS)} ·{' '}
                      <span className="num font-medium text-foreground">{formatCompactNumber(section.engagement)}</span>{' '}
                      تفاعل
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {section.accounts.map((account) => (
                      <AccountTile
                        key={account.id}
                        account={account}
                        platform={platformById.get(account.platformId)}
                        href={canOpenPosts ? `/platforms/accounts/${account.id}` : undefined}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

/** بطاقة منصة في الشريط — خيارٌ من مجموعة لا رابط */
function PlatformTile({
  active,
  onSelect,
  mark,
  name,
  accounts,
  posts,
}: {
  active: boolean;
  onSelect: () => void;
  mark: React.ReactNode;
  name: string;
  accounts: number;
  posts: number;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={cn(
        'flex min-h-[4.25rem] items-center gap-3 rounded-card border bg-surface p-3 text-start shadow-elev-1',
        'transition-[border-color,box-shadow,background-color] duration-150 ease-out',
        'focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--ring)]',
        active
          ? 'border-primary bg-primary-soft/60 shadow-[inset_0_0_0_1px_var(--primary)]'
          : 'border-border hover:border-border-strong hover:shadow-elev-2',
      )}
    >
      {mark}
      <span className="min-w-0">
        <span className={cn('block truncate text-sm font-semibold', active ? 'text-primary-text' : 'text-foreground')}>
          {name}
        </span>
        <span className="block text-xs text-muted-foreground">
          <span className="num">{formatNumber(accounts)}</span> {counted(accounts, ACCOUNT_FORMS)} ·{' '}
          <span className="num">{formatCount(posts)}</span> {counted(posts, POST_FORMS)}
        </span>
      </span>
    </button>
  );
}

/** مقياس في تذييل البطاقة — الرقم ووحدته منفصلان فلا يلتفّ «ألف» وحدها */
function TileStat({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof UsersRound;
  value: number;
  label: string;
}) {
  const { amount, unit } = splitUnit(formatCompactNumber(value));
  return (
    <span className="flex min-w-0 items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="num font-medium text-foreground">{amount}</span>
      {unit && <span>{unit}</span>}
      <span className="sr-only">{label}</span>
    </span>
  );
}

/**
 * بطاقة حساب.
 *
 * ★ البطاقة كلّها تُضغط، والرابط واحد.
 *
 *   الرابط هو اسم الحساب، وطبقته تمتدّ على البطاقة (`after:inset-0`). فالضغط
 *   في أيّ موضع يفتح المنشورات، وقارئ الشاشة يسمع رابطاً واحداً باسم الحساب
 *   — لا ستّة روابط متجاورة إلى الوجهة نفسها يمرّ عليها بالمفتاح واحداً واحداً.
 */
function AccountTile({
  account,
  platform,
  href,
}: {
  account: DirectoryAccount;
  platform: { code: string; name: string } | undefined;
  href?: string;
}) {
  /*
   * بلا حركة دخول: `enter-stagger` يملأ `transform` بعد انتهائه، فيغلب
   * ارتفاعَ البطاقة عند التحويم (`card-interactive`) — والحركة التي
   * تقول «هذه تُفتح» أنفع من حركةٍ تقول «وصلتُ للتوّ».
   */
  return (
    <article
      className={cn(
        '@container group/tile relative flex flex-col rounded-card border border-border bg-surface shadow-elev-1',
        href && 'card-interactive',
      )}
    >
      <div className="flex flex-1 flex-col gap-3.5 p-4">
        <header className="flex items-start gap-3">
          <AccountAvatar name={account.name} src={account.avatarUrl} mediaKey={account.avatarKey} />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[0.95rem] font-semibold leading-snug text-foreground">
              {href ? (
                <Link
                  href={href}
                  className="outline-none after:absolute after:inset-0 after:rounded-card after:content-[''] focus-visible:after:shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--ring)] group-hover/tile:text-primary-text"
                >
                  {account.name}
                  <span className="sr-only"> — عرض منشورات الحساب</span>
                </Link>
              ) : (
                account.name
              )}
            </h3>
            <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              {platform && <PlatformMark code={platform.code} className="h-4 w-4 rounded-sm" />}
              <span className="shrink-0">{platform?.name}</span>
              {account.username && (
                <>
                  <span aria-hidden>·</span>
                  <span className="ltr truncate">@{account.username.replace(/^@/, '')}</span>
                </>
              )}
            </p>
          </div>
          {account.postsThisWeek > 0 ? (
            <Badge tone="success" size="sm" className="shrink-0">
              <span className="num">+{formatNumber(account.postsThisWeek)}</span> هذا الأسبوع
            </Badge>
          ) : !account.isActive ? (
            <Badge size="sm" className="shrink-0">الاستخراج متوقف</Badge>
          ) : null}
        </header>

        <div className="flex flex-1 items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow">المنشورات المستخرجة</p>
            <p className="num whitespace-nowrap text-[1.75rem] font-extrabold leading-tight tracking-[-0.02em] tabular-nums text-primary-text">
              {formatCount(account.posts)}
            </p>
          </div>
          <div className="min-w-0 space-y-0.5 text-end text-xs text-subtle-foreground">
            {account.followersCount !== null && (
              <p>
                <span className="num font-medium text-muted-foreground">
                  {formatCompactNumber(account.followersCount)}
                </span>{' '}
                متابع
              </p>
            )}
            <p>
              {account.lastPostAt ? (
                <>
                  آخر منشور{' '}
                  {/*
                    الوقت يُكتب في الخادم ثمّ في متصفّح القارئ بمنطقته الزمنية،
                    فقد يختلفان بدقيقة أو بساعة — والمتصفّح هو الصادق هنا.
                  */}
                  <time dateTime={account.lastPostAt} title={formatDateTime(account.lastPostAt)} suppressHydrationWarning>
                    {formatPublishedAt(account.lastPostAt)}
                  </time>
                </>
              ) : (
                'لم يُستخرج منشور بعد'
              )}
            </p>
          </div>
        </div>

        {href && (
          <p className="flex items-center gap-1 text-sm font-medium text-primary-text" aria-hidden>
            عرض المنشورات
            <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover/tile:-translate-x-1" />
          </p>
        )}
      </div>

      {/*
        أربعة مقاييس في صفٍّ واحد تحتاج نحو ٣٥٠ بكسل: «١٢١٫١ ألف» بأيقونتها
        سبعون بكسلاً وأكثر. فتحت ذلك صفّان من اثنين — لا أربعةٌ متلاصقة
        يخرج آخرها من البطاقة كما كان على شاشة 1280.
      */}
      <footer className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border px-4 py-3 @[22rem]:grid-cols-4">
        <TileStat icon={METRIC_ICONS.likes} value={account.likes} label="إعجابات" />
        <TileStat icon={METRIC_ICONS.comments} value={account.comments} label="تعليقات" />
        <TileStat icon={METRIC_ICONS.shares} value={account.shares} label="مشاركات" />
        <TileStat icon={METRIC_ICONS.views} value={account.views} label="مشاهدات" />
      </footer>
    </article>
  );
}

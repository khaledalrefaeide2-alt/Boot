import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  FileText,
  Flag,
  HeartHandshake,
  Inbox,
  RefreshCw,
  Siren,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import type { ModerationStatus, Post, Story } from '../../shared/types';
import { api, errorMessage } from '../lib/api';
import { useStatus } from '../lib/status';
import { cx } from '../lib/utils';
import { useToast } from '../components/Toast';
import { PostCard } from '../components/PostCard';
import { StoryCard } from '../components/StoryCard';
import {
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonCards,
  Spinner,
  Toggle,
} from '../components/ui';

type Tab = 'posts' | 'stories';
type PostFilter = 'all' | ModerationStatus;

function StatCard({
  icon,
  label,
  value,
  tone = 'teal',
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone?: 'teal' | 'amber' | 'emerald' | 'slate';
}) {
  const tones = {
    teal: 'bg-teal-50 text-teal-700',
    amber: 'bg-amber-50 text-amber-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    slate: 'bg-slate-100 text-slate-600',
  } as const;

  return (
    <div className="card flex items-center gap-3 p-4">
      <span className={cx('flex h-11 w-11 items-center justify-center rounded-2xl', tones[tone])}>{icon}</span>
      <span>
        <span className="nums block text-xl font-extrabold text-slate-900">{value}</span>
        <span className="block text-xs font-semibold text-slate-500">{label}</span>
      </span>
    </div>
  );
}

export default function DashboardPage() {
  const toast = useToast();
  const { status, refresh: refreshStatus, setCrisisMode } = useStatus();

  const [tab, setTab] = useState<Tab>('posts');
  const [posts, setPosts] = useState<Post[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [crisisBusy, setCrisisBusy] = useState(false);
  const [postFilter, setPostFilter] = useState<PostFilter>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [postsData, storiesData] = await Promise.all([api.getPosts({ status: 'all' }), api.getStories('all')]);
      setPosts(postsData.posts);
      setStories(storiesData.stories);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const generate = async () => {
    setGenerating(true);
    try {
      const { posts: created } = await api.generatePosts(3);
      setPosts((current) => [...created, ...current]);
      await refreshStatus();
      toast.success(`تم توليد ${created.length} منشورات جاهزة للمراجعة.`);
      setTab('posts');
      setPostFilter('pending');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setGenerating(false);
    }
  };

  const moderatePost = async (id: string, next: ModerationStatus) => {
    setBusyId(id);
    try {
      const { post } = await api.setPostStatus(id, next);
      setPosts((current) => current.map((item) => (item.id === id ? post : item)));
      await refreshStatus();
      toast.success(next === 'approved' ? 'تم اعتماد المنشور ونشره' : 'تم رفض المنشور');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const moderateStory = async (id: string, next: ModerationStatus) => {
    setBusyId(id);
    try {
      const { story } = await api.setStoryStatus(id, next);
      setStories((current) => current.map((item) => (item.id === id ? story : item)));
      await refreshStatus();
      toast.success(next === 'approved' ? 'تم نشر القصة' : 'تم رفض القصة');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const toggleCrisis = async (value: boolean) => {
    setCrisisBusy(true);
    try {
      await setCrisisMode(value);
      toast[value ? 'warning' : 'success'](
        value ? 'تم تفعيل وضع الأزمة — سيُوجَّه المحتوى نحو التهدئة.' : 'عاد التطبيق إلى الوضع الاعتيادي.',
      );
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setCrisisBusy(false);
    }
  };

  const visiblePosts = postFilter === 'all' ? posts : posts.filter((post) => post.status === postFilter);
  const pendingStories = stories.filter((story) => story.status === 'pending');
  const reviewedStories = stories.filter((story) => story.status !== 'pending');

  const postFilters: Array<{ value: PostFilter; label: string; count: number }> = [
    { value: 'all', label: 'الكل', count: posts.length },
    { value: 'pending', label: 'بانتظار المراجعة', count: posts.filter((p) => p.status === 'pending').length },
    { value: 'approved', label: 'معتمدة', count: posts.filter((p) => p.status === 'approved').length },
    { value: 'rejected', label: 'مرفوضة', count: posts.filter((p) => p.status === 'rejected').length },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="إدارة"
        title="لوحة التحكم"
        description="راجع المحتوى المولَّد بالذكاء الاصطناعي والقصص الواردة من المجتمع قبل نشرها."
        actions={
          <>
            <button type="button" onClick={load} disabled={loading} className="btn-secondary">
              <RefreshCw className={cx('h-4 w-4', loading && 'animate-spin')} aria-hidden />
              تحديث
            </button>
            <button type="button" onClick={generate} disabled={generating} className="btn-primary">
              {generating ? <Spinner /> : <Sparkles className="h-4 w-4" aria-hidden />}
              {generating ? 'جارٍ التوليد…' : 'توليد منشورات'}
            </button>
          </>
        }
      />

      {/* Crisis mode */}
      <section
        className={cx(
          'rounded-3xl border p-6 transition',
          status?.crisisMode ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white',
        )}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span
              className={cx(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl',
                status?.crisisMode ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500',
              )}
            >
              <Siren className="h-5 w-5" aria-hidden />
            </span>
            <Toggle
              checked={Boolean(status?.crisisMode)}
              onChange={(value) => void toggleCrisis(value)}
              tone="red"
              label="وضع الأزمة"
              description="عند تفعيله يوجَّه توليد المحتوى نحو التهدئة الفورية والتحقق، ويظهر تنبيه للمستخدمين في كل الصفحات."
            />
          </div>
          {crisisBusy ? <Spinner className="h-5 w-5 text-red-500" /> : null}
        </div>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<FileText className="h-5 w-5" />} label="منشورات معتمدة" value={status?.counts.approvedPosts ?? 0} tone="emerald" />
        <StatCard icon={<Clock className="h-5 w-5" />} label="بانتظار المراجعة" value={(status?.counts.pendingPosts ?? 0) + (status?.counts.pendingStories ?? 0)} tone="amber" />
        <StatCard icon={<Inbox className="h-5 w-5" />} label="شائعات واردة" value={status?.counts.pendingRumors ?? 0} tone="teal" />
        <StatCard icon={<Flag className="h-5 w-5" />} label="بلاغات كراهية" value={status?.counts.reports ?? 0} tone="slate" />
      </section>

      {/* Tabs */}
      <div className="flex gap-2 rounded-2xl border border-slate-200 bg-white p-1.5">
        {(
          [
            { value: 'posts' as Tab, label: 'منشورات الذكاء الاصطناعي', icon: Sparkles, badge: status?.counts.pendingPosts ?? 0 },
            { value: 'stories' as Tab, label: 'قصص المجتمع', icon: HeartHandshake, badge: status?.counts.pendingStories ?? 0 },
          ]
        ).map(({ value, label, icon: Icon, badge }) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            aria-pressed={tab === value}
            className={cx(
              'flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition',
              tab === value ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden">{value === 'posts' ? 'المنشورات' : 'القصص'}</span>
            {badge ? (
              <span
                className={cx(
                  'nums rounded-full px-2 py-0.5 text-[11px] font-extrabold',
                  tab === value ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800',
                )}
              >
                {badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonCards count={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : tab === 'posts' ? (
        <section className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {postFilters.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setPostFilter(filter.value)}
                className={cx(
                  'chip border transition',
                  postFilter === filter.value
                    ? 'border-teal-600 bg-teal-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-teal-200 hover:text-teal-700',
                )}
              >
                {filter.label}
                <span className="nums opacity-70">({filter.count})</span>
              </button>
            ))}
          </div>

          {visiblePosts.length === 0 ? (
            <EmptyState
              icon={<Sparkles className="h-6 w-6" />}
              title="لا توجد منشورات في هذه الحالة"
              description="ولّد دفعة جديدة من المنشورات ليراجعها الفريق ثم تُنشر في صفحة منشورات اليوم."
              action={
                <button type="button" onClick={generate} disabled={generating} className="btn-primary">
                  {generating ? <Spinner /> : <Sparkles className="h-4 w-4" aria-hidden />}
                  توليد منشورات
                </button>
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visiblePosts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  showStatus
                  adminActions={
                    <>
                      <button
                        type="button"
                        onClick={() => moderatePost(post.id, 'approved')}
                        disabled={busyId === post.id || post.status === 'approved'}
                        className="btn flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
                      >
                        {busyId === post.id ? <Spinner /> : <ThumbsUp className="h-4 w-4" aria-hidden />}
                        اعتماد
                      </button>
                      <button
                        type="button"
                        onClick={() => moderatePost(post.id, 'rejected')}
                        disabled={busyId === post.id || post.status === 'rejected'}
                        className="btn flex-1 border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                      >
                        <ThumbsDown className="h-4 w-4" aria-hidden />
                        رفض
                      </button>
                    </>
                  }
                />
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="space-y-6">
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 text-base font-extrabold text-slate-900">
              <Clock className="h-4 w-4 text-amber-500" aria-hidden />
              بانتظار المراجعة
              <span className="nums rounded-full bg-amber-100 px-2 py-0.5 text-xs font-extrabold text-amber-800">
                {pendingStories.length}
              </span>
            </h2>

            {pendingStories.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 className="h-6 w-6" />}
                title="لا توجد قصص بانتظار المراجعة"
                description="ستظهر هنا القصص التي يرسلها المستخدمون من صفحة القصص الإيجابية."
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {pendingStories.map((story) => (
                  <StoryCard
                    key={story.id}
                    story={story}
                    showStatus
                    adminActions={
                      <>
                        <button
                          type="button"
                          onClick={() => moderateStory(story.id, 'approved')}
                          disabled={busyId === story.id}
                          className="btn flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
                        >
                          {busyId === story.id ? <Spinner /> : <ThumbsUp className="h-4 w-4" aria-hidden />}
                          نشر
                        </button>
                        <button
                          type="button"
                          onClick={() => moderateStory(story.id, 'rejected')}
                          disabled={busyId === story.id}
                          className="btn flex-1 border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                        >
                          <ThumbsDown className="h-4 w-4" aria-hidden />
                          رفض
                        </button>
                      </>
                    }
                  />
                ))}
              </div>
            )}
          </div>

          {reviewedStories.length ? (
            <div className="space-y-4">
              <h2 className="text-base font-extrabold text-slate-900">قصص تمت مراجعتها</h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {reviewedStories.map((story) => (
                  <StoryCard
                    key={story.id}
                    story={story}
                    showStatus
                    adminActions={
                      story.status === 'approved' ? (
                        <button
                          type="button"
                          onClick={() => moderateStory(story.id, 'rejected')}
                          disabled={busyId === story.id}
                          className="btn-secondary flex-1"
                        >
                          <ThumbsDown className="h-4 w-4" aria-hidden />
                          سحب من النشر
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => moderateStory(story.id, 'approved')}
                          disabled={busyId === story.id}
                          className="btn-secondary flex-1"
                        >
                          <ThumbsUp className="h-4 w-4" aria-hidden />
                          إعادة النشر
                        </button>
                      )
                    }
                  />
                ))}
              </div>
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}

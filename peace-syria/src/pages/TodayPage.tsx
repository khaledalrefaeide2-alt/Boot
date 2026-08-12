import { useCallback, useEffect, useMemo, useState } from 'react';
import { AArrowDown, Bookmark, CalendarDays, Newspaper, Search, Siren, Sparkles, X } from 'lucide-react';
import type { Post } from '../../shared/types';
import { api, errorMessage } from '../lib/api';
import { useStatus } from '../lib/status';
import {
  cx,
  formatDate,
  fontSizeLabel,
  useBookmarks,
  useDebounced,
  useLocalStorage,
  type FontSize,
} from '../lib/utils';
import { useToast } from '../components/Toast';
import { PostCard } from '../components/PostCard';
import { ShareModal } from '../components/ShareModal';
import { EmptyState, ErrorState, SkeletonCards, Spinner } from '../components/ui';

export default function TodayPage() {
  const toast = useToast();
  const { status, refresh: refreshStatus } = useStatus();
  const bookmarks = useBookmarks();

  const [posts, setPosts] = useState<Post[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);
  const [category, setCategory] = useState('all');
  const [onlyBookmarked, setOnlyBookmarked] = useState(false);
  const [fontSize, setFontSize] = useLocalStorage<FontSize>('salam:font-size', 'md');
  const [sharing, setSharing] = useState<Post | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getPosts({ status: 'approved', category, q: debouncedSearch.trim() || undefined });
      setPosts(data.posts);
      setCategories(data.categories);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [category, debouncedSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  const generate = async () => {
    setGenerating(true);
    try {
      const { posts: created } = await api.generatePosts(3);
      toast.success(`تم توليد ${created.length} منشورات — بانتظار الاعتماد في لوحة التحكم.`);
      await refreshStatus();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setGenerating(false);
    }
  };

  const visiblePosts = useMemo(
    () => (onlyBookmarked ? posts.filter((post) => bookmarks.has(post.id)) : posts),
    [posts, onlyBookmarked, bookmarks],
  );

  const filtersActive = Boolean(search.trim()) || category !== 'all' || onlyBookmarked;

  const resetFilters = () => {
    setSearch('');
    setCategory('all');
    setOnlyBookmarked(false);
  };

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-bl from-teal-600 via-teal-700 to-emerald-700 p-6 text-white shadow-xl sm:p-9">
        <div className="pointer-events-none absolute -left-16 -top-20 h-64 w-64 rounded-full bg-white/10 blur-2xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-24 right-10 h-56 w-56 rounded-full bg-emerald-300/20 blur-3xl" aria-hidden />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <span className="chip gap-1.5 bg-white/15 text-white backdrop-blur">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden />
              {formatDate(new Date())}
            </span>
            <h1 className="text-2xl font-extrabold leading-tight sm:text-4xl">منشورات اليوم</h1>
            <p className="max-w-xl text-sm leading-7 text-teal-50/90">
              محتوى يومي قصير جاهز للنشر، يعزّز التهدئة والتعايش والوعي الرقمي. انسخه أو شاركه كما هو.
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {status?.crisisMode ? (
                <span className="chip gap-1.5 bg-red-500/90 text-white">
                  <Siren className="h-3.5 w-3.5" aria-hidden />
                  وضع الأزمة مُفعّل — أولوية للتهدئة والتحقق
                </span>
              ) : (
                <span className="chip gap-1.5 bg-white/15 text-white backdrop-blur">
                  <span className="h-2 w-2 rounded-full bg-emerald-300" aria-hidden />
                  الوضع الاعتيادي
                </span>
              )}
              <span className="chip nums gap-1.5 bg-white/15 text-white backdrop-blur">
                {status?.counts.approvedPosts ?? posts.length} منشور معتمد
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={generate}
            disabled={generating}
            className="btn w-full bg-white text-teal-800 shadow-lg hover:bg-teal-50 active:scale-[0.98] lg:w-auto"
          >
            {generating ? <Spinner /> : <Sparkles className="h-4 w-4" aria-hidden />}
            {generating ? 'جارٍ التوليد…' : 'توليد منشورات جديدة بالذكاء الاصطناعي'}
          </button>
        </div>
      </section>

      {/* Controls */}
      <section className="card space-y-4 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ابحث في المنشورات…"
              className="input pr-11"
              aria-label="بحث في المنشورات"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOnlyBookmarked((value) => !value)}
              className={cx(
                'btn border',
                onlyBookmarked
                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
              )}
              aria-pressed={onlyBookmarked}
            >
              <Bookmark className={cx('h-4 w-4', onlyBookmarked && 'fill-current')} aria-hidden />
              المحفوظة
              {bookmarks.ids.length ? <span className="nums text-xs">({bookmarks.ids.length})</span> : null}
            </button>

            <div className="flex items-center gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1">
              <AArrowDown className="mr-1.5 h-4 w-4 text-slate-400" aria-hidden />
              {(['sm', 'md', 'lg'] as FontSize[]).map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setFontSize(size)}
                  aria-pressed={fontSize === size}
                  className={cx(
                    'rounded-xl px-3 py-1.5 text-xs font-bold transition',
                    fontSize === size ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700',
                  )}
                >
                  {fontSizeLabel[size]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCategory('all')}
            className={cx(
              'chip border transition',
              category === 'all'
                ? 'border-teal-600 bg-teal-600 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-teal-200 hover:text-teal-700',
            )}
          >
            كل التصنيفات
          </button>
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              className={cx(
                'chip border transition',
                category === item
                  ? 'border-teal-600 bg-teal-600 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-teal-200 hover:text-teal-700',
              )}
            >
              {item}
            </button>
          ))}

          {filtersActive ? (
            <button type="button" onClick={resetFilters} className="chip gap-1 text-slate-500 hover:text-red-600">
              <X className="h-3.5 w-3.5" aria-hidden />
              إزالة عوامل التصفية
            </button>
          ) : null}
        </div>
      </section>

      {/* Feed */}
      {loading ? (
        <SkeletonCards count={6} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : visiblePosts.length === 0 ? (
        <EmptyState
          icon={onlyBookmarked ? <Bookmark className="h-6 w-6" /> : <Newspaper className="h-6 w-6" />}
          title={onlyBookmarked ? 'لا توجد منشورات محفوظة بعد' : 'لا توجد منشورات مطابقة'}
          description={
            onlyBookmarked
              ? 'اضغط أيقونة الحفظ على أي منشور ليظهر هنا لاحقاً، حتى بعد إغلاق المتصفح.'
              : filtersActive
                ? 'جرّب كلمة بحث أخرى أو أزل عوامل التصفية.'
                : 'لم يُعتمد أي منشور بعد. يمكنك توليد منشورات جديدة ثم اعتمادها من لوحة التحكم.'
          }
          action={
            filtersActive ? (
              <button type="button" onClick={resetFilters} className="btn-secondary">
                إزالة عوامل التصفية
              </button>
            ) : (
              <button type="button" onClick={generate} disabled={generating} className="btn-primary">
                {generating ? <Spinner /> : <Sparkles className="h-4 w-4" aria-hidden />}
                توليد منشورات
              </button>
            )
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visiblePosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              fontSize={fontSize}
              bookmarked={bookmarks.has(post.id)}
              onToggleBookmark={(item) => {
                const added = bookmarks.toggle(item.id);
                toast.success(added ? 'تم حفظ المنشور' : 'أُزيل من المحفوظات');
              }}
              onShare={setSharing}
            />
          ))}
        </div>
      )}

      <ShareModal
        open={Boolean(sharing)}
        onClose={() => setSharing(null)}
        title={sharing?.title ?? ''}
        text={sharing?.content ?? ''}
      />
    </div>
  );
}

import type { ReactNode } from 'react';
import { Bookmark, Copy, Share2, ShieldCheck, Sparkles } from 'lucide-react';
import type { Post } from '../../shared/types';
import { Badge } from './ui';
import { useToast } from './Toast';
import { copyToClipboard, cx, fontSizeClass, scoreTone, timeAgo, type FontSize } from '../lib/utils';

interface PostCardProps {
  post: Post;
  fontSize?: FontSize;
  bookmarked?: boolean;
  onToggleBookmark?: (post: Post) => void;
  onShare?: (post: Post) => void;
  adminActions?: ReactNode;
  showStatus?: boolean;
}

const statusMeta = {
  approved: { label: 'معتمد', tone: 'emerald' as const },
  pending: { label: 'بانتظار المراجعة', tone: 'amber' as const },
  rejected: { label: 'مرفوض', tone: 'red' as const },
};

export function PostCard({
  post,
  fontSize = 'md',
  bookmarked = false,
  onToggleBookmark,
  onShare,
  adminActions,
  showStatus = false,
}: PostCardProps) {
  const toast = useToast();
  const tone = scoreTone(post.safetyScore);

  const handleCopy = async () => {
    const hashtags = post.hashtags.map((tag) => `#${tag}`).join(' ');
    const ok = await copyToClipboard(`${post.title}\n\n${post.content}${hashtags ? `\n\n${hashtags}` : ''}`);
    ok ? toast.success('تم نسخ المنشور') : toast.error('تعذّر النسخ، انسخ النص يدوياً.');
  };

  return (
    <article className="card group flex h-full flex-col gap-4 p-6 transition duration-200 hover:-translate-y-0.5 hover:shadow-lift">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="teal">{post.category}</Badge>
        <span className={cx('chip gap-1', tone.bg, tone.text)}>
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          <span className="nums">{post.safetyScore}</span>
          <span>سلامة اللغة</span>
        </span>
        {post.source === 'ai' ? (
          <span className="chip gap-1 bg-slate-100 text-slate-600">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            ذكاء اصطناعي
          </span>
        ) : null}
        {showStatus ? <Badge tone={statusMeta[post.status].tone}>{statusMeta[post.status].label}</Badge> : null}
      </div>

      <div className="flex-1 space-y-2">
        <h3 className="text-lg font-extrabold leading-8 text-slate-900">{post.title}</h3>
        <p className={cx('whitespace-pre-line text-slate-600', fontSizeClass[fontSize])}>{post.content}</p>
      </div>

      {post.hashtags.length ? (
        <div className="flex flex-wrap gap-1.5">
          {post.hashtags.map((tag) => (
            <span key={tag} className="text-xs font-semibold text-teal-600">
              #{tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-4">
        <span className="text-xs font-medium text-slate-400">{timeAgo(post.createdAt)}</span>

        <div className="flex items-center gap-1">
          {onToggleBookmark ? (
            <button
              type="button"
              onClick={() => onToggleBookmark(post)}
              className={cx(
                'rounded-xl p-2 transition',
                bookmarked ? 'bg-amber-50 text-amber-600' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700',
              )}
              aria-label={bookmarked ? 'إزالة من المحفوظات' : 'حفظ المنشور'}
              aria-pressed={bookmarked}
            >
              <Bookmark className={cx('h-4 w-4', bookmarked && 'fill-current')} aria-hidden />
            </button>
          ) : null}

          <button
            type="button"
            onClick={handleCopy}
            className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="نسخ المنشور"
          >
            <Copy className="h-4 w-4" aria-hidden />
          </button>

          {onShare ? (
            <button
              type="button"
              onClick={() => onShare(post)}
              className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label="مشاركة المنشور"
            >
              <Share2 className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>

      {adminActions ? <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">{adminActions}</div> : null}
    </article>
  );
}

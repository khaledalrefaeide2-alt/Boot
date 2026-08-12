import type { ReactNode } from 'react';
import { Heart, MapPin, Quote, Share2 } from 'lucide-react';
import type { Story } from '../../shared/types';
import { Badge } from './ui';
import { timeAgo } from '../lib/utils';

interface StoryCardProps {
  story: Story;
  onShare?: (story: Story) => void;
  adminActions?: ReactNode;
  showStatus?: boolean;
}

const statusMeta = {
  approved: { label: 'منشورة', tone: 'emerald' as const },
  pending: { label: 'بانتظار المراجعة', tone: 'amber' as const },
  rejected: { label: 'مرفوضة', tone: 'red' as const },
};

export function StoryCard({ story, onShare, adminActions, showStatus = false }: StoryCardProps) {
  return (
    <article className="card flex h-full flex-col gap-4 p-6 transition duration-200 hover:-translate-y-0.5 hover:shadow-lift">
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-500 text-white">
          <Quote className="h-5 w-5" aria-hidden />
        </div>
        {showStatus ? <Badge tone={statusMeta[story.status].tone}>{statusMeta[story.status].label}</Badge> : null}
      </div>

      <div className="flex-1 space-y-2">
        <h3 className="text-lg font-extrabold leading-8 text-slate-900">{story.title}</h3>
        <p className="whitespace-pre-line text-sm leading-8 text-slate-600">{story.content}</p>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-800">{story.name}</p>
          <p className="flex items-center gap-1 text-xs text-slate-500">
            <MapPin className="h-3.5 w-3.5" aria-hidden />
            {story.location}
            <span className="text-slate-300">•</span>
            {timeAgo(story.createdAt)}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <span className="flex items-center gap-1 rounded-xl bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-600">
            <Heart className="h-3.5 w-3.5 fill-current" aria-hidden />
            قصة أمل
          </span>
          {onShare ? (
            <button
              type="button"
              onClick={() => onShare(story)}
              className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label="مشاركة القصة"
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

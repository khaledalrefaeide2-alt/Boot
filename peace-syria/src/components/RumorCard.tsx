import { AlertTriangle, BadgeCheck, Copy, Share2 } from 'lucide-react';
import type { Rumor } from '../../shared/types';
import { Badge, ScoreBar } from './ui';
import { useToast } from './Toast';
import { copyToClipboard, cx, timeAgo } from '../lib/utils';

/** Maps the Arabic verdict to a colour family. */
export function verdictTone(status: string) {
  if (status.includes('صحيحة') && !status.includes('جزئ')) {
    return { chip: 'bg-emerald-100 text-emerald-800', bar: 'bg-emerald-500', border: 'border-emerald-200' };
  }
  if (status.includes('جزئ') || status.includes('مضللة')) {
    return { chip: 'bg-amber-100 text-amber-900', bar: 'bg-amber-500', border: 'border-amber-200' };
  }
  if (status.includes('كاذبة')) {
    return { chip: 'bg-red-100 text-red-800', bar: 'bg-red-500', border: 'border-red-200' };
  }
  return { chip: 'bg-slate-200 text-slate-700', bar: 'bg-slate-400', border: 'border-slate-200' };
}

interface RumorCardProps {
  rumor: Rumor;
  onShare?: (rumor: Rumor) => void;
}

export function RumorCard({ rumor, onShare }: RumorCardProps) {
  const toast = useToast();
  const tone = verdictTone(rumor.status);

  const handleCopy = async () => {
    const ok = await copyToClipboard(`الادعاء: ${rumor.claim}\n\nالتصحيح: ${rumor.correction}\n\n— سلام في سوريا`);
    ok ? toast.success('تم نسخ التصحيح') : toast.error('تعذّر النسخ، انسخ النص يدوياً.');
  };

  return (
    <article className="card flex h-full flex-col gap-4 overflow-hidden p-0">
      {/* Claim — always in the warning palette */}
      <div className={cx('border-b bg-red-50/70 p-5', tone.border)}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className={cx('chip gap-1', tone.chip)}>
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            {rumor.status}
          </span>
          <Badge tone="slate">{rumor.category}</Badge>
        </div>
        <p className="text-base font-bold leading-8 text-red-900">{rumor.claim}</p>
      </div>

      {/* Correction — the calm, verified half */}
      <div className="flex flex-1 flex-col gap-4 px-5 pb-5">
        <div className="rounded-2xl border border-teal-200 bg-teal-50/70 p-4">
          <div className="mb-2 flex items-center gap-2 text-teal-800">
            <BadgeCheck className="h-4 w-4" aria-hidden />
            <span className="text-xs font-extrabold">التصحيح الموثّق</span>
          </div>
          <p className="text-sm leading-7 text-teal-900">{rumor.correction}</p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>مؤشر المصداقية</span>
            <span className="nums">{rumor.credibilityScore}%</span>
          </div>
          <ScoreBar value={rumor.credibilityScore} tone={tone.bar} />
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-slate-500">المصدر: {rumor.source}</p>
            <p className="text-xs text-slate-400">{timeAgo(rumor.verifiedAt)}</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label="نسخ التصحيح"
            >
              <Copy className="h-4 w-4" aria-hidden />
            </button>
            {onShare ? (
              <button
                type="button"
                onClick={() => onShare(rumor)}
                className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="مشاركة التصحيح"
              >
                <Share2 className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

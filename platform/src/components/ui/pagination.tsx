'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button';
import { formatNumber } from '@/lib/utils';

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 ${className ?? ''}`}
    >
      <p className="text-xs text-muted-foreground">
        عرض <span className="num">{formatNumber(from)}</span> إلى{' '}
        <span className="num">{formatNumber(to)}</span> من أصل{' '}
        <span className="num font-medium text-foreground">{formatNumber(total)}</span>
      </p>
      <div className="flex items-center gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          السابق
        </Button>
        <span className="px-2 text-xs text-muted-foreground">
          <span className="num">{formatNumber(page)}</span> / <span className="num">{formatNumber(totalPages)}</span>
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          التالي
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

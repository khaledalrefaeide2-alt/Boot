'use client';

import { Globe, ChartPie } from 'lucide-react';
import { ChartFrame } from './chart-kit';
import { formatNumber, formatPercent } from '@/lib/utils';

/*
 * علامات المنصّات — مرسومةٌ بأشكالٍ بسيطة لا منسوخةٌ من شعاراتها.
 *
 * مكتبة الأيقونات أسقطت شعارات العلامات التجارية، ونسخُ مسارات الشعارات
 * من الذاكرة يُنتج شكلاً مشوّهاً يُقرأ خطأً. والعلامة هنا تُعرف بلونها
 * وشكلها العامّ (حرف f، كاميرا، X) — وهو ما يكفي للتعرّف بجانب الاسم
 * المكتوب، فالاسم هو البيان والعلامة تسريع.
 */
const MARKS: Record<string, { color: string; glyph: React.ReactNode }> = {
  facebook: {
    color: '#1877f2',
    glyph: (
      <text
        x="12"
        y="17.5"
        textAnchor="middle"
        fontSize="16"
        fontWeight="700"
        fontFamily="Arial, Helvetica, sans-serif"
        fill="#ffffff"
      >
        f
      </text>
    ),
  },
  instagram: {
    color: '#d6246e',
    glyph: (
      <g fill="none" stroke="#ffffff" strokeWidth="1.8">
        <rect x="6" y="6" width="12" height="12" rx="3.5" />
        <circle cx="12" cy="12" r="2.9" />
        <circle cx="15.6" cy="8.4" r="0.6" fill="#ffffff" stroke="none" />
      </g>
    ),
  },
  x: {
    color: '#0f1419',
    glyph: (
      <g stroke="#ffffff" strokeWidth="1.9" strokeLinecap="round">
        <path d="M7.5 7l9 10M16.5 7l-9 10" />
      </g>
    ),
  },
};

/** لون الشريط — لون المنصّة، وللمجهولة لونُ الهوية */
const BAR_COLORS: Record<string, string> = {
  facebook: '#1877f2',
  instagram: '#d6246e',
  x: '#334155',
};

export function PlatformMark({ code, className }: { code: string; className?: string }) {
  const mark = MARKS[code];
  if (!mark) {
    return (
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-surface-2 ${className ?? ''}`}
        aria-hidden
      >
        <Globe className="h-4 w-4 text-subtle-foreground" />
      </span>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={`h-8 w-8 shrink-0 ${className ?? ''}`} aria-hidden>
      <rect width="24" height="24" rx="6" fill={mark.color} />
      {mark.glyph}
    </svg>
  );
}

/**
 * توزيع المنشورات حسب المنصة — أشرطةٌ أفقية بأسمائها وأرقامها.
 *
 * ★ أشرطةٌ لا قرص — كما في المرجع، ولسببٍ أبعد من الشكل.
 *
 *   القرص يطلب من العين مقارنة زوايا، وهي أضعف ما تقدّره. والشريط يطلب
 *   مقارنة أطوالٍ على خطٍّ واحد، وهي أدقّ ما تقدّره. ومع ثلاث منصّات أو
 *   أربع يُقرأ الترتيب من الأطوال قبل الأرقام.
 *
 * ★ والشريط يمتلئ من البداية (يمين) لا من اليسار.
 *
 *   الواجهة من اليمين إلى اليسار، والقراءة تبدأ من اليمين، فالمقدار
 *   يُقاس من حيث تبدأ العين. والرقم والنسبة مكتوبان بجانبه — فلا يقع
 *   المعنى على الطول وحده.
 */
export function PlatformShareBars({
  data,
  title = 'توزيع المنشورات حسب المنصة',
  description,
  action,
}: {
  data: { id: string; name: string; code: string; posts: number }[];
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  const total = data.reduce((sum, row) => sum + row.posts, 0);

  return (
    <ChartFrame
      title={title}
      description={description}
      action={action}
      icon={ChartPie}
      isEmpty={total === 0}
      height={data.length > 0 ? Math.max(180, data.length * 64) : 180}
    >
      <ul className="flex h-full flex-col justify-center gap-5 px-2" aria-label={title}>
        {data.map((row) => {
          const share = total > 0 ? (row.posts / total) * 100 : 0;
          return (
            <li key={row.id} className="flex items-center gap-3">
              <span className="w-20 shrink-0 truncate text-sm font-medium text-foreground sm:w-24">
                {row.name}
              </span>
              <PlatformMark code={row.code} />
              <div
                className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2"
                role="img"
                aria-label={`${row.name}: ${formatNumber(row.posts)} منشور، ${formatPercent(share, 0)}`}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${share}%`,
                    backgroundColor: BAR_COLORS[row.code] ?? 'var(--chart-1)',
                  }}
                />
              </div>
              <span className="w-16 shrink-0 text-end leading-tight">
                <span className="num block text-sm font-bold text-heading">{formatNumber(row.posts)}</span>
                <span className="num block text-xs text-muted-foreground">{formatPercent(share, 0)}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </ChartFrame>
  );
}

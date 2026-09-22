import Link from 'next/link';
import { cn, formatCompactNumber, formatNumber } from '@/lib/utils';
import {
  BellRing,
  Bookmark,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Eye,
  EyeOff,
  FileBarChart,
  Filter,
  Flame,
  FolderTree,
  Gauge,
  Layers,
  MessageSquare,
  Newspaper,
  PlayCircle,
  Shapes,
  Share2,
  Tags,
  ThumbsUp,
  Timer,
  TriangleAlert,
  Users,
  type LucideIcon,
} from 'lucide-react';

/*
 * أيقونة لكل مقياس، معرّفة مرة واحدة.
 *
 * الغرض ثباتُ المعنى لا التزيين: «الإعجابات» يجب أن تحمل الأيقونة نفسها في
 * التحليلات وفي صفحة الحساب وفي صفحة المنشور. وحين تُختار في كل شاشة على
 * حدة تختلف بينها، فيضيع أسرعُ ما في اللوحة — التعرّف على المقياس بشكله
 * قبل قراءة اسمه.
 */
export const METRIC_ICONS = {
  posts: Newspaper,
  today: CalendarDays,
  week: CalendarRange,
  month: CalendarClock,
  likes: ThumbsUp,
  comments: MessageSquare,
  shares: Share2,
  views: Eye,
  saves: Bookmark,
  engagement: Flame,
  rate: Gauge,
  followers: Users,
  accounts: Users,
  platforms: Layers,
  groups: FolderTree,
  keywords: Tags,
  topics: Shapes,
  runs: PlayCircle,
  alerts: BellRing,
  reports: FileBarChart,
  hidden: EyeOff,
  duration: Timer,
  skipped: Filter,
  failed: TriangleAlert,
} as const satisfies Record<string, LucideIcon>;

const TONES = {
  default: { chip: 'bg-olive-100 text-olive-800', value: 'text-foreground' },
  primary: { chip: 'bg-olive-100 text-olive-800', value: 'text-primary' },
  success: { chip: 'bg-success-soft text-success', value: 'text-success' },
  warning: { chip: 'bg-warning-soft text-warning', value: 'text-warning' },
  danger: { chip: 'bg-danger-soft text-danger', value: 'text-danger' },
} as const;

/**
 * بطاقة إحصاء — رقم واحد مع سياقه.
 *
 * أفقيّة ومضغوطة: أيقونةٌ ثم الاسم فوق الرقم. وكانت رأسيّةً برقمٍ بحجم
 * 30px وحشوة 16px، فبلغ ارتفاعها مئة بكسل — وعشرةُ مقاييس بهذا الارتفاع
 * تحتلّ ثلاثة سطور وتملأ الشاشة قبل أن يظهر أوّل رسم بياني. والمقياس
 * الواحد لا يستحقّ ذلك: قيمةٌ تُقرأ في جزء من ثانية ثم تُترك.
 *
 * والرقم بقي أبرزَ ما في البطاقة وإن صغر — الوزن والتباين يفعلان ما كان
 * يفعله الحجم، بلا أن يأكلا الشاشة.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  href,
  compact = false,
  tone = 'default',
  className,
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon?: LucideIcon;
  href?: string;
  compact?: boolean;
  tone?: keyof typeof TONES;
  className?: string;
}) {
  const styles = TONES[tone];

  const display =
    typeof value === 'number' ? (compact ? formatCompactNumber(value) : formatNumber(value)) : value;

  const content = (
    <div
      className={cn(
        'flex h-full items-center gap-2.5 rounded-xl border border-border bg-surface px-3.5 py-3 shadow-elev-1 print-avoid-break',
        href && 'card-interactive hover:bg-surface-2/40',
        className,
      )}
    >
      {Icon && (
        <span
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
            styles.chip,
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      )}
      <div className="min-w-0 flex-1">
        {/*
          الاسم يلتفّ سطرين ولا يُقصّ.

          «معدل التف…» ليست تسميةً بل لغزاً: العربية لا تُقرأ ببدايتها كما
          تُقرأ اللاتينية، والقصُّ فيها يُتلف الكلمة. والالتفاف لا يُغيّر
          ارتفاع البطاقة لأن الشبكة تُسوّي صفّها كلَّه على أطولها.
        */}
        <p className="eyebrow line-clamp-2" title={label}>
          {label}
        </p>
        {/*
          الرقم لا يُقصّ أبداً.

          كان يُقصّ مع الاسم، فصارت «4.3 مليون» تُعرض «4.3 ن…» — والرقم هو
          كلّ ما في البطاقة. فإن ضاق المكان فليضِق الاسمُ لا هو.

          والتتبّع السالب آمن عليه بلا تحفّظ — الأرقام لاتينية منفصلة لا
          حروفاً عربية متصلة. و tabular-nums يُبقي الخانات على عرض واحد،
          فلا يرقص الرقم بين تحديثين.
        */}
        <p
          className={cn(
            'num whitespace-nowrap text-lg font-bold leading-tight tracking-[-0.02em] tabular-nums',
            styles.value,
          )}
        >
          {display}
        </p>
        {hint && <p className="truncate text-2xs text-subtle-foreground">{hint}</p>}
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className="block h-full">
      {content}
    </Link>
  ) : (
    content
  );
}

/*
 * شبكة المقاييس.
 *
 * قاعدتان تحكمانها:
 *
 * ١) خمسةُ أعمدة سقفاً. عشرُ بطاقات في صفٍّ واحد تُعطي كلَّ بطاقة نحو
 *    190 بكسل، وهو عرضٌ يقصّ الاسم العربي والرقم معاً — «معدل التف…» و
 *    «4.3 ن…». والصفّ الواحد ليس غايةً في نفسه: غايته أن يُقرأ، وصفّان
 *    يُقرآن خيرٌ من صفٍّ لا يُقرأ.
 *
 * ٢) لا فجوة في آخر صفّ. الأعمدة تقسم العدد بلا باقٍ، وحين يتعذّر —
 *    والسبعةُ لا تنقسم على شيء — تمتدّ البطاقة الأخيرة لتملأ ما بقي.
 */
const COLUMNS: Record<number, string> = {
  4: 'grid-cols-2 lg:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 [&>*:last-child]:col-span-2 lg:[&>*:last-child]:col-span-1',
  6: 'grid-cols-2 lg:grid-cols-3',
  7: 'grid-cols-2 sm:grid-cols-4 [&>*:last-child]:col-span-2',
  8: 'grid-cols-2 lg:grid-cols-4',
  10: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 sm:[&>*:last-child]:col-span-3 lg:[&>*:last-child]:col-span-1',
};

export function StatGrid({
  count,
  children,
  className,
}: {
  /** عدد البطاقات — تُختار به الأعمدة التي تقسمه بلا باقٍ */
  count: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid gap-2.5', COLUMNS[count] ?? 'grid-cols-2 lg:grid-cols-4', className)}>
      {children}
    </div>
  );
}

/** بطاقة نصية لعرض عنصر بارز مثل أكثر منشور تفاعلاً */
export function HighlightCard({
  label,
  title,
  meta,
  value,
  valueLabel,
  href,
  className,
}: {
  label: string;
  title: string;
  meta?: string;
  value?: number;
  valueLabel?: string;
  href?: string;
  className?: string;
}) {
  const content = (
    <div
      className={cn(
        'flex h-full flex-col justify-between gap-2 rounded-lg border border-border bg-surface p-4 shadow-elev-1 print-avoid-break',
        href && 'card-interactive hover:bg-surface-2/40',
        className,
      )}
    >
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="line-clamp-2 text-sm font-medium leading-relaxed text-foreground">{title}</p>
      </div>
      <div className="flex items-end justify-between gap-2">
        {meta && <p className="truncate text-xs text-subtle-foreground">{meta}</p>}
        {value !== undefined && (
          <p className="shrink-0 text-end">
            <span className="num text-lg font-bold text-primary">{formatCompactNumber(value)}</span>
            {valueLabel && <span className="ms-1 text-xs text-muted-foreground">{valueLabel}</span>}
          </p>
        )}
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className="block h-full">
      {content}
    </Link>
  ) : (
    content
  );
}

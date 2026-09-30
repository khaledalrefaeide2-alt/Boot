import Link from 'next/link';
import { cn, formatCompactNumber, formatNumber, formatPercent } from '@/lib/utils';
import {
  ArrowDownRight,
  ArrowUpRight,
  BellRing,
  ChevronLeft,
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

/*
 * الأسطح الملوّنة.
 *
 * ★ اللون تسريعٌ للتعرّف لا حاملٌ للمعنى.
 *
 *   «لا تنقل المعلومة باللون وحده» قاعدةٌ تُخالَف في كلّ لوحة مقاييس
 *   ملوّنة. وهي محفوظة هنا لأنّ البطاقة تحمل أيقونتها واسمها ورقمها
 *   كاملةً: من لا يميّز الأزرق من الأخضر يقرأ «عدد الحسابات ٣٧٢» كما
 *   يقرأها غيره، ويخسر التسريعَ وحده.
 *
 * والدرجات كلّها مقيسة في `verify:contrast` — الحبر على سطحه وعلى
 * رقاقته، ونصُّ البطاقة العادي على السطح الملوّن.
 */
const TINTS = {
  sky: 'bg-tint-sky-surface text-tint-sky-ink',
  mint: 'bg-tint-mint-surface text-tint-mint-ink',
  amber: 'bg-tint-amber-surface text-tint-amber-ink',
  rose: 'bg-tint-rose-surface text-tint-rose-ink',
  violet: 'bg-tint-violet-surface text-tint-violet-ink',
  teal: 'bg-tint-teal-surface text-tint-teal-ink',
  olive: 'bg-tint-olive-surface text-tint-olive-ink',
} as const;

const CHIPS = {
  sky: 'bg-tint-sky-chip text-tint-sky-ink',
  mint: 'bg-tint-mint-chip text-tint-mint-ink',
  amber: 'bg-tint-amber-chip text-tint-amber-ink',
  rose: 'bg-tint-rose-chip text-tint-rose-ink',
  violet: 'bg-tint-violet-chip text-tint-violet-ink',
  teal: 'bg-tint-teal-chip text-tint-teal-ink',
  olive: 'bg-tint-olive-chip text-tint-olive-ink',
} as const;

export type StatTint = keyof typeof TINTS;

/**
 * لون كلّ مقياس، معرّفاً مرّة واحدة — كالأيقونات تماماً.
 *
 * الغرض ثباتُ الارتباط لا التنويع: «الإعجابات» تحمل اللون نفسه في كل
 * شاشة، فتُعرف البطاقة بلونها قبل قراءة اسمها. ولو اختير اللون في كل
 * شاشة على حدة لضاع أسرعُ ما في اللوحة.
 */
export const METRIC_TINTS: Partial<Record<keyof typeof METRIC_ICONS, StatTint>> = {
  posts: 'amber',
  today: 'amber',
  week: 'amber',
  month: 'amber',
  likes: 'mint',
  comments: 'violet',
  shares: 'sky',
  views: 'rose',
  saves: 'teal',
  engagement: 'mint',
  rate: 'teal',
  followers: 'sky',
  accounts: 'mint',
  platforms: 'sky',
  groups: 'violet',
  keywords: 'teal',
  topics: 'violet',
  runs: 'sky',
  alerts: 'amber',
  reports: 'violet',
  hidden: 'rose',
  duration: 'teal',
  skipped: 'amber',
  failed: 'rose',
};

/*
 * الأسماء القديمة تبقى تعمل.
 *
 * عشرات المواضع في الواجهة تكتب `tone="danger"`، وتغييرها كلّها في دفعة
 * واحدة تغييرٌ لا يراه المستخدم ويكسر ما لم يُنتبه له. فتُترجَم الأسماء
 * إلى الأسطح الجديدة هنا، ويُكتب `tint` صراحةً فيما يُنشأ بعد اليوم.
 */
const TONES = {
  default: 'olive',
  primary: 'olive',
  success: 'mint',
  warning: 'amber',
  danger: 'rose',
} as const satisfies Record<string, StatTint>;

/**
 * خطّ اتجاهٍ مصغَّر — أعمدةٌ لا خطّ.
 *
 * الأعمدة تُقرأ على عرض أربعين بكسلاً حيث يصير الخطّ خربشة. وهو مخفيٌّ عن
 * قارئ الشاشة عمداً: البيانات كلّها في الرقم فوقه وفي نسبة التغيّر
 * بجانبه، ورسمٌ بلا محور ولا مقياس لا يُقرأ صوتاً بشيء نافع.
 */
function Spark({ values }: { values: number[] }) {
  const series = values.slice(-16);
  if (series.length < 2) return null;
  const max = Math.max(...series, 1);

  return (
    <svg
      viewBox={`0 0 ${series.length * 3 - 1} 20`}
      preserveAspectRatio="none"
      className="h-6 w-14 shrink-0 opacity-70"
      aria-hidden
    >
      {series.map((value, index) => {
        // أدنى ارتفاع 1.5 ليبقى العمود الصفري مرئياً عموداً لا فراغاً
        const height = Math.max(1.5, (Math.max(0, value) / max) * 20);
        return (
          <rect
            key={index}
            x={index * 3}
            y={20 - height}
            width={2}
            height={height}
            rx={0.75}
            fill="currentColor"
          />
        );
      })}
    </svg>
  );
}

/**
 * شارة التغيّر.
 *
 * السهم والإشارة معاً لا اللون وحده: الأخضر والأحمر لا يفترقان عند عمى
 * الأحمر والأخضر، وهو أشيع أنواعه. فالسهم يقول الاتجاه، والنسبة تقول
 * المقدار، واللون يُسرّع القراءة لمن يراه.
 */
function Trend({ value }: { value: number }) {
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-2xs font-semibold',
        up ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger',
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      <span className="num">{formatPercent(Math.abs(value), 0)}</span>
      {/*
        ما تقارنه الشارة مكتوبٌ لقارئ الشاشة.

        «+٢٨٪» وحدها تُقرأ «مقارنةً بالفترة السابقة» — وهي هنا تقارن
        نصفَي الفترة المعروضة. والفرق ليس تفصيلاً: من يبني عليه قراراً
        يحتاج أن يعرف بمَ قُورن.
      */}
      <span className="sr-only">
        {up ? 'ارتفاع' : 'انخفاض'} في النصف الثاني من الفترة مقارنةً بنصفها الأول
      </span>
    </span>
  );
}

/**
 * بطاقة إحصاء — رقم واحد مع سياقه.
 *
 * ★ سطحٌ ملوّن لكلّ مقياس بدل بطاقةٍ بيضاء برقاقة ملوّنة.
 *
 *   لوحةٌ من ثماني بطاقات بيضاء متطابقة تُقرأ كتلةً واحدة: العين تمسح
 *   الصفّ كلّه بحثاً عن «عدد المنشورات» فتقرأ الأسماء واحداً واحداً.
 *   والسطح الملوّن يجعل كلّ بطاقة معلَماً — يُعرف موضعه قبل قراءته.
 *
 *   واللون لا يحمل المعنى وحده: الأيقونة والاسم والرقم كاملةٌ في كلّ
 *   بطاقة، فمن لا يميّز الألوان لا يفقد شيئاً غير التسريع.
 *
 * أفقيّة ومضغوطة: أيقونةٌ ثم الاسم فوق الرقم. وكانت رأسيّةً برقمٍ بحجم
 * 30px وحشوة 16px، فبلغ ارتفاعها مئة بكسل — وعشرةُ مقاييس بهذا الارتفاع
 * تحتلّ ثلاثة سطور وتملأ الشاشة قبل أن يظهر أوّل رسم بياني.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  href,
  compact = false,
  tone = 'default',
  tint,
  trend,
  spark,
  className,
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon?: LucideIcon;
  href?: string;
  compact?: boolean;
  /** الأسماء القديمة — تُترجَم إلى سطحٍ ملوّن */
  tone?: keyof typeof TONES;
  /** السطح الملوّن صراحةً — يتقدّم على `tone` */
  tint?: StatTint;
  /** نسبة التغيّر عن الفترة السابقة، موجبةً أو سالبة */
  trend?: number;
  /** سلسلة صغيرة تُرسم أعمدةً — زينةٌ مساعدة، والرقم هو البيان */
  spark?: number[];
  className?: string;
}) {
  const key: StatTint = tint ?? TONES[tone];

  const display =
    typeof value === 'number' ? (compact ? formatCompactNumber(value) : formatNumber(value)) : value;

  const content = (
    <div
      className={cn(
        /*
         * نصف قطر أوسع (١٦px) وبلا حدّ.
         *
         * السطح الملوّن يفصل البطاقة عن أرضية الصفحة بنفسه، والحدّ فوقه
         * خطٌّ ثالث بلا وظيفة. وفي السمة الداكنة يبقى الحدّ شعرةً خفيفة
         * تفصل السطحين المتقاربَي العتمة.
         */
        'group relative flex h-full items-center gap-2.5 rounded-2xl px-3.5 py-3 shadow-elev-1 print-avoid-break dark:border dark:border-border',
        TINTS[key],
        href && 'card-interactive',
        className,
      )}
    >
      {Icon && (
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
            CHIPS[key],
          )}
        >
          <Icon className="h-4.5 w-4.5" aria-hidden />
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1.5">
          {/*
            الاسم يلتفّ سطرين ولا يُقصّ.

            «معدل التف…» ليست تسميةً بل لغزاً: العربية لا تُقرأ ببدايتها كما
            تُقرأ اللاتينية، والقصُّ فيها يُتلف الكلمة. والالتفاف لا يُغيّر
            ارتفاع البطاقة لأن الشبكة تُسوّي صفّها كلَّه على أطولها.
          */}
          <p className="eyebrow line-clamp-2 flex-1" title={label}>
            {label}
          </p>
          {trend !== undefined && Number.isFinite(trend) && <Trend value={trend} />}
        </div>

        <div className="flex items-end justify-between gap-2">
          {/*
            الرقم لا يُقصّ أبداً.

            كان يُقصّ مع الاسم، فصارت «4.3 مليون» تُعرض «4.3 ن…» — والرقم هو
            كلّ ما في البطاقة. فإن ضاق المكان فليضِق الاسمُ لا هو.

            والتتبّع السالب آمن عليه بلا تحفّظ — الأرقام لاتينية منفصلة لا
            حروفاً عربية متصلة. و tabular-nums يُبقي الخانات على عرض واحد،
            فلا يرقص الرقم بين تحديثين.
          */}
          <p className="num whitespace-nowrap text-lg font-bold leading-tight tracking-[-0.02em] tabular-nums text-foreground">
            {display}
          </p>
          {spark && spark.length > 1 && <Spark values={spark} />}
        </div>

        {hint && <p className="truncate text-2xs text-muted-foreground">{hint}</p>}
      </div>

      {/*
        سهمٌ يقول إنّ البطاقة تُفتح.

        البطاقة القابلة للنقر لا تفترق عن غيرها بشيء إلا عند التحويم —
        ومن يعمل بلوحة المفاتيح أو على شاشة لمس لا يحوّم. والسهم علامةٌ
        ثابتة، ويخفت لونه حتى لا يزاحم الرقم.
      */}
      {href && (
        <ChevronLeft
          className="h-4 w-4 shrink-0 opacity-40 transition-opacity group-hover:opacity-80 rtl:rotate-0"
          aria-hidden
        />
      )}
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

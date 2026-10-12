import Link from 'next/link';
import { RemoteMedia } from '@/components/posts/remote-media';
import { cn, formatCompactNumber, formatNumber, formatPercent } from '@/lib/utils';
import {
  ArrowDownRight,
  ArrowUpRight,
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

/*
 * ألوان الرقاقات والأعمدة.
 *
 * ★ اللون تسريعٌ للتعرّف لا حاملٌ للمعنى.
 *
 *   البطاقة تحمل أيقونتها واسمها ورقمها كاملةً: من لا يميّز الأزرق من
 *   الأخضر يقرأ «عدد الحسابات ٤٠٢» كما يقرأها غيره، ويخسر التسريعَ وحده.
 *
 * والدرجات كلّها مقيسة في `verify:contrast` — الحبر على رقاقته.
 */
const INKS = {
  sky: 'text-tint-sky-ink',
  mint: 'text-tint-mint-ink',
  amber: 'text-tint-amber-ink',
  rose: 'text-tint-rose-ink',
  violet: 'text-tint-violet-ink',
  teal: 'text-tint-teal-ink',
  brand: 'text-tint-brand-ink',
} as const;

const CHIPS = {
  sky: 'bg-tint-sky-chip text-tint-sky-ink',
  mint: 'bg-tint-mint-chip text-tint-mint-ink',
  amber: 'bg-tint-amber-chip text-tint-amber-ink',
  rose: 'bg-tint-rose-chip text-tint-rose-ink',
  violet: 'bg-tint-violet-chip text-tint-violet-ink',
  teal: 'bg-tint-teal-chip text-tint-teal-ink',
  brand: 'bg-tint-brand-chip text-tint-brand-ink',
} as const;

export type StatTint = keyof typeof INKS;

/**
 * لون كلّ أيقونة — تُبنى مرّةً عند التحميل من خريطتَي الأيقونات والألوان.
 *
 * ★ هذه هي التي جعلت الألوان تصل إلى الشاشات كلّها.
 *
 *   كان اللون يُمرَّر في موضع الاستدعاء، فلوّنت النظرة العامة وحدها —
 *   لأنها الشاشة التي كُتبت فيها الألوان — وبقيت ثلاث وستّون بطاقة في
 *   بقيّة الشاشات على اللون الافتراضي وحده. وهو عيبٌ لا يُصلَح بالمرور
 *   على المواضع: من يضيف بطاقةً غداً سينساه كما نُسي أمس.
 *
 *   والأيقونة تعرف مقياسها أصلاً، فتُشتقّ منها. ومن أراد غير ذلك مرّر
 *   `tint` صراحةً.
 */
const ICON_TINT = new Map<LucideIcon, StatTint>();

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

for (const [metric, icon] of Object.entries(METRIC_ICONS) as [
  keyof typeof METRIC_ICONS,
  LucideIcon,
][]) {
  const assigned = METRIC_TINTS[metric];
  // أوّل مقياس يفوز بأيقونته: `Users` مشتركة بين المتابعين والحسابات
  if (assigned && !ICON_TINT.has(icon)) ICON_TINT.set(icon, assigned);
}

/*
 * الأسماء القديمة تبقى تعمل.
 *
 * عشرات المواضع في الواجهة تكتب `tone="danger"`، وتغييرها كلّها في دفعة
 * واحدة تغييرٌ لا يراه المستخدم ويكسر ما لم يُنتبه له. فتُترجَم الأسماء
 * إلى الأسطح الجديدة هنا، ويُكتب `tint` صراحةً فيما يُنشأ بعد اليوم.
 */
const TONES = {
  default: 'brand',
  primary: 'brand',
  success: 'mint',
  warning: 'amber',
  danger: 'rose',
} as const satisfies Record<string, StatTint>;

/**
 * خطّ اتجاهٍ مصغَّر — أعمدةٌ لا خطّ.
 *
 * الأعمدة تُقرأ على عرض ستّين بكسلاً حيث يصير الخطّ خربشة. وهو مخفيٌّ عن
 * قارئ الشاشة عمداً: البيانات كلّها في الرقم فوقه وفي نسبة التغيّر
 * بجانبه، ورسمٌ بلا محور ولا مقياس لا يُقرأ صوتاً بشيء نافع.
 *
 * ★ والأعمدة تتدرّج شفافيةً من الأقدم إلى الأحدث.
 *
 *   فيُقرأ اتجاه الزمن من الشكل نفسه بلا محور: الباهت ماضٍ والصريح
 *   حاضر. ولولاه لبدت الأعمدة صفّاً بلا أوّل ولا آخر — وهو ما يجعل
 *   القارئ يخمّن أيّ الطرفين اليوم.
 */
function Spark({ values }: { values: number[] }) {
  const series = values.slice(-24);
  if (series.length < 2) return null;
  const max = Math.max(...series, 1);
  const step = 5;

  return (
    <svg
      viewBox={`0 0 ${series.length * step - 2} 28`}
      preserveAspectRatio="none"
      className="h-7 w-full max-w-[9.5rem] shrink-0"
      aria-hidden
    >
      {series.map((value, index) => {
        // أدنى ارتفاع 3 ليبقى العمود الصفري مرئياً عموداً لا فراغاً
        const height = Math.max(3, (Math.max(0, value) / max) * 28);
        return (
          <rect
            key={index}
            x={index * step}
            y={28 - height}
            width={3.2}
            height={height}
            rx={1}
            fill="currentColor"
            opacity={0.35 + (index / (series.length - 1)) * 0.65}
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
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-2xs font-semibold',
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
 * فصل الرقم عن وحدته.
 *
 * `formatCompactNumber` تعيد «11.7 مليون» سلسلةً واحدة، والتصميم يطلب
 * الرقم ضخماً والوحدة أصغر بجانبه. والفصل على آخر مسافة لا على أوّلها:
 * «60,470» بلا وحدة تبقى كما هي، و«11.7 مليون» تنقسم اثنتين.
 *
 * دالّة خالصة — تُفحص وحدها.
 */
export function splitUnit(display: string): { amount: string; unit: string | null } {
  const at = display.lastIndexOf(' ');
  if (at < 0) return { amount: display, unit: null };
  const unit = display.slice(at + 1);
  // ما بعد المسافة وحدةٌ إن كان حروفاً — لا جزءاً من رقم مفصول بمسافة
  if (!/^\p{L}+$/u.test(unit)) return { amount: display, unit: null };
  return { amount: display.slice(0, at), unit };
}

/**
 * قشرة البطاقة — مكتوبةٌ مرّةً وتستعملها البطاقتان.
 *
 * بطاقة المقياس وبطاقة العنصر البارز تقفان في صفٍّ واحد، فأيّ فرقٍ في
 * الزاوية أو الحشوة أو الظلّ يُقرأ خطأً لا تنويعاً.
 *
 * ★ بيضاء بحدٍّ خفيف — واللون في الرقاقة وحدها.
 *
 *   كانت كلّ بطاقة بسطحٍ ملوّن. والمرجع يجعل البطاقات بيضاء ويضع اللون
 *   في رقاقة الأيقونة وفي الأعمدة الصغيرة. واثنتا عشرة بطاقة بيضاء
 *   تُقرأ لوحةً هادئة، أمّا اثنتا عشرة سطحاً ملوّناً فتتنافس على العين؛
 *   والرقاقةُ الملوّنة تكفي لتسريع التعرّف.
 */
const TILE_SHELL =
  '@container group relative flex h-full flex-col justify-between gap-4 rounded-card border border-border bg-surface p-5 shadow-elev-1 print-avoid-break';

/**
 * بطاقة إحصاء — رقمٌ واحد مع سياقه.
 *
 * ★ الرقم هو البطاقة، وكلّ ما عداه يخدمه.
 *
 *   الاسم في البداية (يمين) صغيراً، والرقم تحته كبيراً، والرقاقة في
 *   النهاية (يسار)، والأعمدة أسفلها. العين تقع على الرقم لأنه أكبر ما
 *   في البطاقة، ثم تصعد للاسم لتعرف ما يعني، ثم تنزل للأعمدة لتعرف إلى
 *   أين يمضي. ثلاث وقفات لا تحتاج قراءةً متتابعة.
 *
 * ★ والرقم لا يُقصّ أبداً، ويصغر قبل أن يُقصّ.
 *
 *   «281.5 مليون» على بطاقةٍ ضيّقة تخرج عن حدّها. فالبطاقة حاويةٌ
 *   (`@container`) والرقم يكبر حين تتّسع لا حين تتّسع الشاشة: بطاقةٌ في
 *   شبكة أربعة أعمدة على 1280px أضيق منها في عمودين على 768px.
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
  progress,
  className,
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon?: LucideIcon;
  href?: string;
  compact?: boolean;
  /** الأسماء القديمة — تُترجَم إلى لونٍ للرقاقة */
  tone?: keyof typeof TONES;
  /** لون الرقاقة صراحةً — يتقدّم على `tone` */
  tint?: StatTint;
  /** نسبة التغيّر بين نصفَي الفترة، موجبةً أو سالبة */
  trend?: number;
  /** سلسلة صغيرة تُرسم أعمدةً — زينةٌ مساعدة، والرقم هو البيان */
  spark?: number[];
  /** حصّة بين صفر ومئة تُرسم شريطاً — بديلُ الأعمدة حين لا سلسلة زمنية */
  progress?: number;
  className?: string;
}) {
  /*
   * الأولوية: ما كُتب صراحةً، ثمّ ما تقوله الأيقونة، ثمّ الافتراضي.
   *
   * و`tone` يتقدّم على الأيقونة حين يُكتب غيرَ الافتراضي: من كتب
   * `tone="danger"` على بطاقة «متعثّرة» قصد الأحمر ولم يقصد لون أيقونتها.
   */
  const key: StatTint =
    tint ?? (tone !== 'default' ? TONES[tone] : undefined) ?? (Icon && ICON_TINT.get(Icon)) ??
    TONES.default;

  const display =
    typeof value === 'number' ? (compact ? formatCompactNumber(value) : formatNumber(value)) : value;
  const { amount, unit } = splitUnit(display);

  const hasSpark = Boolean(spark && spark.length > 1);
  const hasTrend = trend !== undefined && Number.isFinite(trend);
  const hasProgress = progress !== undefined && Number.isFinite(progress);
  const ink = INKS[key];

  const content = (
    <div className={cn(TILE_SHELL, href && 'card-interactive', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/*
            الاسم يلتفّ سطرين ولا يُقصّ.

            «معدل التف…» ليست تسميةً بل لغزاً: العربية لا تُقرأ ببدايتها
            كما تُقرأ اللاتينية، والقصُّ فيها يُتلف الكلمة.
          */}
          <p className="line-clamp-2 text-sm font-medium text-muted-foreground" title={label}>
            {label}
          </p>
          {/*
            الرقم معزولُ الاتجاه وحده، والوحدة خارجه في سياق العربية.

            لو عُزل السطر كلّه لصار من اليسار إلى اليمين فانتقل إلى يسار
            البطاقة، ووقعت «ألف» يمين الرقم — أي قبله في القراءة العربية.
            والعزل على الرقم وحده يُبقيه في البداية (يمين)، والوحدةُ بعده.
          */}
          <p className="mt-2 whitespace-nowrap text-2xl font-bold leading-none tracking-[-0.01em] text-heading @[13rem]:text-[1.875rem]">
            <span className="num">{amount}</span>
            {unit && <span className="ms-1.5 text-lg font-semibold @[13rem]:text-xl">{unit}</span>}
          </p>
        </div>

        {Icon && (
          <span
            className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-control', CHIPS[key])}
          >
            <Icon className="h-5 w-5" aria-hidden />
          </span>
        )}
      </div>

      {/*
        الصفّ الأسفل: التلميح أو الاتجاه في البداية، والأعمدة في النهاية
        — تحت الرقاقة، فيقرآن عموداً واحداً من اللون نفسه.
      */}
      {(hasSpark || hasTrend || hasProgress || hint) && (
        <div className="flex min-h-7 items-end justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {hasTrend && <Trend value={trend} />}
            {hint && !hasTrend && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
          </div>
          {hasSpark ? (
            <span className={cn('flex min-w-0 flex-1 justify-end', ink)}>
              <Spark values={spark!} />
            </span>
          ) : (
            hasProgress && (
              <div className={cn('h-2 w-24 shrink-0 overflow-hidden rounded-full bg-surface-2', ink)} aria-hidden>
                <div
                  className="h-full rounded-full bg-current"
                  style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                />
              </div>
            )
          )}
        </div>
      )}
    </div>
  );

  return href ? (
    <Link
      href={href}
      className="block h-full rounded-card focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--background),0_0_0_4px_var(--ring)]"
    >
      {content}
    </Link>
  ) : (
    content
  );
}

/*
 * شبكة المقاييس.
 *
 * ★ أعمدةٌ متساوية العرض، ولا بطاقة تُمدّ لتملأ فراغاً.
 *
 *   كانت البطاقة الأخيرة تُمدّ حين لا ينقسم العدد على الأعمدة، فلا يبقى
 *   في آخر الصفّ فراغ. والثمن أنّ بطاقةً واحدة تصير ضعف جاراتها بلا سبب
 *   في بياناتها — فتُقرأ أهمَّ منها، وهي ليست كذلك. والصفّ الأخير الناقص
 *   شكلٌ مألوف في كلّ لوحة، أمّا البطاقة الشاذّة العرض فتُربك الترتيب
 *   كلّه.
 *
 *   والأعمدة كما في المواصفة: أربعة على سطح المكتب، واثنان على اللوحي،
 *   وواحد على الجوال. والأربعة تبدأ عند 1280px لا 1024: مع القائمة
 *   الجانبية يبقى للمحتوى عند 1024 نحو 730px، وأربعةُ أعمدةٍ فيها تعطي
 *   البطاقة 170px — عرضٌ يقصّ الاسم العربي والرقم معاً.
 */
const COLUMNS: Record<number, string> = {
  3: 'grid-cols-1 sm:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4',
  5: 'grid-cols-1 sm:grid-cols-3 xl:grid-cols-5',
  6: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3',
  7: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4',
  8: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4',
  9: 'grid-cols-1 sm:grid-cols-3',
  10: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-5',
  12: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4',
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
    <div className={cn('grid gap-4', COLUMNS[count] ?? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4', className)}>
      {children}
    </div>
  );
}

/**
 * بطاقة العنصر البارز — منشورٌ أو منصةٌ تتصدّر الفترة.
 *
 * ★ من عائلة بطاقات المقاييس نفسها، بالقشرة ذاتها.
 *
 *   كانت بيضاء بين الملوّنات بحجّة أنّ نصّاً عربياً طويلاً على سطحٍ ملوّن
 *   يُنقص تباينه. والتباين مقيسٌ فعلاً: `verify:contrast` تقيس نصّ
 *   البطاقة على كلّ سطحٍ ملوّن ولا تمرّ تحت 4.5:1. فبقي من الحجّة الذوقُ
 *   وحده، وهو لا يقوم أمام صفٍّ فيه بطاقتان شاذّتان عن جاراتهما.
 *
 *   والقشرة مشتركة (`TILE_SHELL`) لا منسوخة، فلا تنحرف إحداهما عن الأخرى
 *   عند أوّل تعديل.
 */
export function HighlightCard({
  label,
  title,
  meta,
  value,
  valueLabel,
  href,
  icon: Icon,
  tint = 'brand',
  /** صورة المنشور — تُقرأ من مخزننا أوّلاً ثم من المصدر */
  thumbnail,
  thumbnailKey,
  /**
   * حصّة العنصر من المجموع، بين صفر ومئة.
   *
   * الرقم وحده («٣٧ ألف منشور») لا يقول أكثيرٌ هو أم قليل. والشريط يقوله
   * في لمحة، ومعه النسبة نصّاً — فلا يقع المعنى على طول شريطٍ وحده.
   */
  share,
  className,
}: {
  label: string;
  title: string;
  meta?: string;
  value?: number;
  valueLabel?: string;
  href?: string;
  icon?: LucideIcon;
  tint?: StatTint;
  thumbnail?: string | null;
  thumbnailKey?: string | null;
  share?: number;
  className?: string;
}) {
  const percent = share === undefined ? null : Math.min(100, Math.max(0, share));
  const { amount, unit } = splitUnit(value === undefined ? '' : formatCompactNumber(value));

  const content = (
    <div className={cn(TILE_SHELL, href && 'card-interactive', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          {/*
            العنوان يلتفّ سطرين ولا يُقصّ بنقاط في منتصف كلمة.
            نصُّ المنشور مقصوصٌ أصلاً في الخادم إلى طولٍ معقول.
          */}
          <p className="mt-1.5 line-clamp-2 text-base font-semibold leading-snug text-heading">{title}</p>
        </div>

        {thumbnail || thumbnailKey ? (
          <RemoteMedia
            src={thumbnail ?? ''}
            mediaKey={thumbnailKey}
            className="h-11 w-11 shrink-0 rounded-control"
            fallback="hide"
          />
        ) : (
          Icon && (
            <span
              className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-control', CHIPS[tint])}
            >
              <Icon className="h-5 w-5" aria-hidden />
            </span>
          )
        )}
      </div>

      <div className="flex items-end justify-between gap-3">
        {value !== undefined && (
          <p className="shrink-0 whitespace-nowrap">
            {/*
              الرقم بالمقاس نفسه الذي في بطاقة المقياس — هو ما يجعل الصفّ
              يُقرأ صفّاً واحداً لا صفّين متجاورين.
            */}
            <span className="num text-2xl font-bold leading-none tracking-[-0.01em] text-heading">
              {amount}
            </span>
            {unit && <span className="ms-1.5 text-base font-semibold text-heading">{unit}</span>}
            {valueLabel && <span className="ms-1.5 text-xs text-muted-foreground">{valueLabel}</span>}
          </p>
        )}

        {meta && <p className="min-w-0 flex-1 truncate text-end text-xs text-muted-foreground">{meta}</p>}

        {percent !== null && (
          <div className={cn('h-2 w-20 shrink-0 overflow-hidden rounded-full bg-surface-2', INKS[tint])} aria-hidden>
            <div className="h-full rounded-full bg-current" style={{ width: `${percent}%` }} />
          </div>
        )}
      </div>
    </div>
  );

  return href ? (
    <Link
      href={href}
      className="block h-full rounded-card focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--background),0_0_0_4px_var(--ring)]"
    >
      {content}
    </Link>
  ) : (
    content
  );
}

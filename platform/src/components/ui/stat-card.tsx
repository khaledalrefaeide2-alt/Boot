import Link from 'next/link';
import { RemoteMedia } from '@/components/posts/remote-media';
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
  default: 'olive',
  primary: 'olive',
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
  const series = values.slice(-14);
  if (series.length < 2) return null;
  const max = Math.max(...series, 1);

  return (
    <svg
      viewBox={`0 0 ${series.length * 4 - 1} 24`}
      preserveAspectRatio="none"
      className="h-6 w-[4.5rem] shrink-0"
      aria-hidden
    >
      {series.map((value, index) => {
        // أدنى ارتفاع 2 ليبقى العمود الصفري مرئياً عموداً لا فراغاً
        const height = Math.max(2, (Math.max(0, value) / max) * 24);
        return (
          <rect
            key={index}
            x={index * 4}
            y={24 - height}
            width={2.6}
            height={height}
            rx={1.3}
            fill="currentColor"
            opacity={0.45 + (index / (series.length - 1)) * 0.55}
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
 * موجةٌ زخرفية أسفل البطاقة.
 *
 * تكسر استواء السطح الملوّن فلا يبدو مستطيلاً مصمتاً. وهي `aria-hidden`
 * بلا استثناء ولا تحمل معنى: من أطفأ الألوان أو قرأ بالصوت لا يفقد شيئاً.
 */
/**
 * قشرة البطاقة — مكتوبةٌ مرّةً وتستعملها البطاقتان.
 *
 * بطاقة المقياس وبطاقة العنصر البارز تقفان جنباً إلى جنب في الصفّ نفسه،
 * فأيّ فرق في نصف القطر أو الحشوة أو الظلّ يُقرأ خطأً لا تنويعاً. وكتابةُ
 * الأصناف مرّتين تعني أن ينحرف أحدهما عن الآخر عند أوّل تعديل.
 */
const TILE_SHELL =
  'group relative flex h-full flex-col justify-between gap-3 overflow-hidden rounded-[1.25rem] p-4 shadow-elev-1 print-avoid-break dark:border dark:border-border';

/** السهم في دائرة — علامةٌ ثابتة تقول إنّ البطاقة تُفتح */
function OpenChevron({ tint }: { tint: StatTint }) {
  return (
    <span
      className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-current/25 opacity-50 transition-opacity group-hover:opacity-90',
        TINTS[tint].split(' ')[1],
      )}
    >
      <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
    </span>
  );
}

function TileWave() {
  return (
    <svg
      className="pointer-events-none absolute inset-x-0 bottom-0 h-16 w-full opacity-[0.07]"
      viewBox="0 0 400 64"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d="M0 34c58-26 104 14 168 8s96-34 160-22c30 6 54 18 72 24v20H0z"
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * بطاقة إحصاء — رقم واحد مع سياقه.
 *
 * ★ الرقم هو البطاقة، وكلّ ما عداه يخدمه.
 *
 *   الاسم فوقه صغيراً، والأيقونة بجانبه رقاقةً ملوّنة، والاتجاه تحته
 *   أعمدةً وحبّة نسبة. وهذا ترتيبٌ مقصود: العين تقع على الرقم أوّلاً لأنه
 *   أكبر ما في البطاقة، ثم تصعد للاسم لتعرف ماذا يعني، ثم تنزل للاتجاه
 *   لتعرف إلى أين يمضي. ثلاث وقفات لا تحتاج قراءةً متتابعة.
 *
 * ★ والسطح ملوّن لكلّ مقياس.
 *
 *   ثماني بطاقات بيضاء متطابقة تُقرأ كتلةً واحدة، فتُمسح الأسماء واحداً
 *   واحداً بحثاً عن المطلوب. واللون يجعل كلّ بطاقة معلَماً يُعرف موضعه
 *   قبل قراءته — ولا يحمل معنىً وحده: الأيقونة والاسم والرقم كاملةٌ فيها.
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
  /** الأسماء القديمة — تُترجَم إلى سطحٍ ملوّن */
  tone?: keyof typeof TONES;
  /** السطح الملوّن صراحةً — يتقدّم على `tone` */
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

  const content = (
    <div
      className={cn(
        /*
         * نصف قطر ٢٠px وبلا حدّ في الفاتح.
         *
         * السطح الملوّن يفصل البطاقة عن أرضية الصفحة بنفسه، والحدّ فوقه
         * خطٌّ ثالث بلا وظيفة. وفي الداكن يبقى شعرةً تفصل سطحين متقاربَي
         * العتمة.
         */
        TILE_SHELL,
        TINTS[key],
        href && 'card-interactive',
        className,
      )}
    >
      <TileWave />

      {/*
        الصفّ الأعلى: الأيقونة في حافّة البداية، والنصّ يليها، والسهم في
        حافّة النهاية. والترتيب منطقيّ لا فيزيائي — يصحّ في الاتجاهين.
      */}
      <div className="relative flex items-start gap-3">
        {Icon && (
          <span
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl',
              CHIPS[key],
            )}
          >
            <Icon className="h-5 w-5" aria-hidden />
          </span>
        )}

        <div className="min-w-0 flex-1 text-end">
          {/*
            الاسم يلتفّ سطرين ولا يُقصّ.

            «معدل التف…» ليست تسميةً بل لغزاً: العربية لا تُقرأ ببدايتها
            كما تُقرأ اللاتينية، والقصُّ فيها يُتلف الكلمة.
          */}
          <p className="eyebrow line-clamp-2" title={label}>
            {label}
          </p>
          {/*
            الرقم لا يُقصّ أبداً.

            كان يُقصّ مع الاسم فصارت «4.3 مليون» تُعرض «4.3 ن…» — والرقم
            هو كلّ ما في البطاقة. فإن ضاق المكان فليضِق الاسمُ لا هو.
            والوحدة أصغر منه: «مليون» كلمةٌ تُعرف بشكلها ولا تحتاج حجمه.
          */}
          <p className="num whitespace-nowrap text-2xl font-bold leading-tight tracking-[-0.02em] tabular-nums text-foreground">
            {amount}
            {unit && <span className="ms-1 text-base font-semibold">{unit}</span>}
          </p>
        </div>

        {/*
          السهم في دائرة لا عارياً.

          البطاقة القابلة للنقر لا تفترق عن غيرها إلا عند التحويم — ومن
          يعمل بلوحة المفاتيح أو على شاشة لمس لا يحوّم. والدائرة علامةٌ
          ثابتة تُقرأ زرّاً، وتخفت حتى لا تزاحم الرقم.
        */}
        {href && <OpenChevron tint={key} />}
      </div>

      {/*
        الصفّ الأسفل: الاتجاه ثم الأعمدة، مدفوعةً إلى حافّة النهاية.
        الترتيب في الشيفرة يعكس ما يُرى: الأعمدة في الطرف والحبّة تليها.
      */}
      {(hasSpark || hasTrend || hasProgress || hint) && (
        <div className="relative flex items-center justify-end gap-2">
          {hint && <p className="me-auto truncate text-2xs text-muted-foreground">{hint}</p>}
          {hasProgress && !hasSpark && (
            <div className="me-auto h-1.5 w-20 overflow-hidden rounded-full bg-current/15" aria-hidden>
              <div
                className="h-full rounded-full bg-current"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
          )}
          {hasTrend && <Trend value={trend} />}
          {hasSpark && <Spark values={spark!} />}
        </div>
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
 * ★ أعمدةٌ متساوية العرض، ولا بطاقة تُمدّ لتملأ فراغاً.
 *
 *   كانت البطاقة الأخيرة تُمدّ حين لا ينقسم العدد على الأعمدة، فلا يبقى
 *   في آخر الصفّ فراغ. والثمن أنّ بطاقةً واحدة تصير ضعف جاراتها بلا سبب
 *   في بياناتها — فتُقرأ أهمَّ منها، وهي ليست كذلك. والصفّ الأخير الناقص
 *   شكلٌ مألوف في كلّ لوحة، أمّا البطاقة الشاذّة العرض فتُربك الترتيب
 *   كلّه.
 *
 *   والسقف خمسة أعمدة: ما فوقها يُعطي البطاقة نحو 190 بكسل، وهو عرضٌ
 *   يقصّ الاسم العربي والرقم معاً.
 */
const COLUMNS: Record<number, string> = {
  3: 'grid-cols-1 sm:grid-cols-3',
  4: 'grid-cols-2 lg:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
  6: 'grid-cols-2 sm:grid-cols-3',
  7: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
  8: 'grid-cols-2 lg:grid-cols-4',
  9: 'grid-cols-2 sm:grid-cols-3',
  10: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
  12: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
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
  tint = 'olive',
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
    <div className={cn(TILE_SHELL, TINTS[tint], href && 'card-interactive', className)}>
      <TileWave />

      <div className="relative flex items-start gap-3">
        {thumbnail || thumbnailKey ? (
          <RemoteMedia
            src={thumbnail ?? ''}
            mediaKey={thumbnailKey}
            className="h-11 w-11 shrink-0 rounded-2xl"
            fallback="hide"
          />
        ) : (
          Icon && (
            <span
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl',
                CHIPS[tint],
              )}
            >
              <Icon className="h-5 w-5" aria-hidden />
            </span>
          )
        )}

        <div className="min-w-0 flex-1 text-end">
          <p className="eyebrow">{label}</p>
          {/*
            العنوان يلتفّ سطرين ولا يُقصّ بنقاط في منتصف كلمة.
            نصُّ المنشور مقصوصٌ أصلاً في الخادم إلى طولٍ معقول.
          */}
          <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground">{title}</p>
        </div>

        {href && <OpenChevron tint={tint} />}
      </div>

      <div className="relative flex items-end justify-between gap-2">
        {meta && <p className="min-w-0 flex-1 truncate text-2xs text-muted-foreground">{meta}</p>}

        {percent !== null && (
          <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-current/15" aria-hidden>
            <div className="h-full rounded-full bg-current" style={{ width: `${percent}%` }} />
          </div>
        )}

        {value !== undefined && (
          <p className="shrink-0 whitespace-nowrap text-end">
            {/*
              الرقم بالمقاس نفسه الذي في بطاقة المقياس — هو ما يجعل الصفّ
              يُقرأ صفّاً واحداً لا صفّين متجاورين.
            */}
            <span className="num text-2xl font-bold leading-tight tracking-[-0.02em] tabular-nums text-foreground">
              {amount}
            </span>
            {unit && <span className="num ms-1 text-base font-semibold">{unit}</span>}
            {valueLabel && <span className="ms-1 text-2xs text-muted-foreground">{valueLabel}</span>}
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

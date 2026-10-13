'use client';

import { useState } from 'react';

import Link from 'next/link';
import {
  ChevronDown,
  Clock,
  Eye,
  ExternalLink,
  EyeOff,
  MessageSquare,
  Share2,
  ThumbsUp,
  Trash2,
} from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AccountAvatar } from '@/components/ui/avatar';
import { useCan } from '@/lib/auth/permissions-client';
import { PERMISSIONS } from '@/lib/auth/rbac';
import { PostThumb } from '@/components/posts/post-thumb';
import { TD, TH, THead, TR } from '@/components/ui/table';
import {
  CONTENT_LABELS,
  POST_TYPE_LABELS,
  SENTIMENT_LABELS,
  SENTIMENT_TONE,
  STANCE_METRIC,
  languageLabel,
  SEVERITY_LEVELS,
  SEVERITY_VISIBLE_FROM,
  RUMOR_STATUS,
  AUTHOR_STANCE,
  sortLabels,
} from '@/lib/domain/constants';
import {
  cn,
  formatCompactNumber,
  formatDateTime,
  formatNumber,
  formatPublishedAt,
  truncate,
} from '@/lib/utils';
import { splitUnit } from '@/components/ui/stat-card';
import { parseSearchTerms } from '@/lib/domain/search-terms';
import { highlightSegments } from '@/lib/domain/search-highlight';

export interface PostListItemView {
  id: string;
  url: string | null;
  text: string | null;
  publishedAt: string | null;
  postType: string;
  language: string | null;
  country: string | null;
  authorName: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  mediaUrls?: string[] | null;
  mediaKey?: string | null;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  saves: number;
  engagementTotal: number;
  sentiment: string;
  hashtags: string[];
  detectedKeywords: string[];
  isHidden: boolean;
  account: { id: string; name: string; avatarUrl: string | null; avatarKey?: string | null };
  platform: { id: string; name: string; code: string };
  topic: { id: string; name: string } | null;
  /**
   * خلاصة التصنيف الآلي — والباقي في صفحة المنشور.
   *
   * ★ وإلزاميّ لا اختياريّ، و`null` لا غياب.
   *
   *   البطاقة تقرأ من هذا الحقل الفرقَ بين «لم يُصنَّف بعد» و«صُنِّف ولم
   *   يُحسم». ولو كان اختيارياً لصار نسيانُه في أيّ موضعِ بناءٍ جديد
   *   إعلاناً صامتاً بأنّ المنشور بلا تصنيف — خطأٌ لا يكشفه شيء.
   *   فإلزامُه يجعل النسيان خطأ تصريف.
   *
   * ★ والحكم يُقرأ من هنا لا من `post.sentiment`.
   *
   *   ذاك نسخةٌ مكرَّرة على المنشور تخدم الفلترة والإحصاءات، وهذا هو
   *   الصفّ الذي كتبه التصنيف. وقراءةُ البطاقة من المكرَّر جعلتها تقول
   *   «غير محسوم» بينما تقول صفحةُ المنشور «محايد» عن المنشور نفسه.
   */
  analysis: {
    sentiment: string;
    confidence: number;
    severityLevel: number;
    labels: string[];
    rumorStatus: string;
    authorStance: string;
    needsReview: boolean;
  } | null;
}

function sentimentTone(sentiment: string): BadgeTone {
  return (SENTIMENT_TONE[sentiment as keyof typeof SENTIMENT_TONE] ?? 'neutral') as BadgeTone;
}

/*
 * شارةُ حال التصنيف — ثلاثُ حالاتٍ لا حالتان.
 *
 * ★ هذه هي العلّة التي كانت تُقرأ «الموقع لا يصنّف».
 *
 *   كانت البطاقة تعرض حقل `sentiment` وحده. والحقل افتراضُه في القاعدة
 *   `UNKNOWN`، فالمنشور الذي لم تبلغه المكنسة بعد يُعرض بالكلمة نفسها
 *   التي تُعرض على منشورٍ صُنِّف وعجز النموذج عن حسمه: «غير محسوم».
 *
 *   والحالتان مختلفتان اختلافاً كاملاً. الأولى تقول «انتظر»، والثانية
 *   تقول «نُظر فيه وأُحيل إلى المراجعة». ولوحةٌ تخلط بينهما تُقرأ عطلاً
 *   في المنصة كلّها: من يرى أربعاً وعشرين بطاقة تقول «غير محسوم» يستنتج
 *   أن التصنيف متوقّف، ولا شيء في الشاشة ينفي استنتاجه.
 *
 * والتفريق من وجود صفّ التحليل لا من قيمة الحقل: الصفّ يُكتب لكلّ منشور
 * مرّ على التصنيف مهما كانت نتيجته — حتى المنشور الذي لا مادّة فيه تُسجَّل
 * إحالته. فوجودُه جوابٌ قاطع عن «هل نُظر فيه؟».
 */
export function ClassificationBadge({
  analysis,
  size = 'sm',
  onClick,
  expanded,
}: {
  analysis: PostListItemView['analysis'];
  /** `sm` في الشبكة والجدول، و`md` في صفحة المنشور حيث السطر أوسع */
  size?: 'sm' | 'md';
  /** يجعل الشارة زرّاً يفتح التفاصيل — وبلا زرٍّ تبقى شارةً ساكنة */
  onClick?: () => void;
  expanded?: boolean;
}) {
  const sentiment = analysis?.sentiment ?? 'UNKNOWN';

  const content = !analysis ? (
    <Badge
      tone="neutral"
      size={size}
      title="لم يُصنَّف بعد — المكنسة تصنّف الأحدث أوّلاً، وتبلغه في دورتها القادمة"
    >
      {/*
        الأيقونة ليست زينة.

        «بانتظار التصنيف» و«غير محسوم» كلتاهما بلون محايد — وهو الصحيح،
        فليست إحداهما خطراً — فلو تجاورتا في شبكةٍ من أربع وعشرين بطاقة
        لفُرِّق بينهما بالقراءة وحدها. والساعةُ تُفرّقهما بلمحة.
      */}
      <Clock className="h-3 w-3" aria-hidden />
      بانتظار التصنيف
    </Badge>
  ) : (
    <Badge
      tone={sentimentTone(sentiment)}
      size={size}
      title={
        sentiment === 'UNKNOWN'
          ? 'صُنِّف وأُحيل إلى المراجعة — لم يتبيّن موقفه من الجهات والخدمات، إمّا لأن معناه يتوقّف على صورة أو فيديو غير متاح، وإمّا لأنه لا يتناول هذه الجهات أصلاً'
          : `${STANCE_METRIC.compact}: ${SENTIMENT_LABELS[sentiment as keyof typeof SENTIMENT_LABELS] ?? sentiment}`
      }
    >
      <span className="sr-only">{STANCE_METRIC.compact}: </span>
      {SENTIMENT_LABELS[sentiment as keyof typeof SENTIMENT_LABELS] ?? sentiment}
      {onClick && (
        <ChevronDown
          className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')}
          aria-hidden
        />
      )}
    </Badge>
  );

  if (!onClick) return content;

  /*
   * زرٌّ يلفّ الشارة لا شارةٌ عليها مستمع نقر.
   *
   * الفرق لمن لا يستعمل الفأرة: الزرّ يبلغه مفتاح Tab، ويُقرأ له
   * «موسَّع/مطويّ»، ويُفتح بالمسافة. و`<span onClick>` لا شيء من ذلك —
   * يراه المبصر زرّاً ولا يجده غيره.
   */
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded ?? false}
      /*
       * منطقة النقر أوسع من الشارة: الشارة 24px، والإصبع يحتاج نحو 44.
       * والتوسيع بطبقةٍ شفّافة حولها (`after`) لا بحشوةٍ تكبّر شكلها —
       * فتبقى الشارة بحجمها بين جاراتها، ويصيبها الإصبع.
       */
      className="relative rounded-full after:absolute after:-inset-x-1 after:-inset-y-2.5 after:content-[''] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {content}
    </button>
  );
}

/**
 * تفاصيل التصنيف الآلي داخل البطاقة.
 *
 * ★ تُفتح في موضعها ولا تنقل القارئ إلى صفحة أخرى.
 *
 *   من يمسح لوحةً من أربعٍ وعشرين بطاقة ويسأل «لماذا وُسم هذا؟» لا يريد
 *   أن يغادر اللوحة ويفقد موضعه ليقرأ ثلاثة أسطر. فالخلاصة تُفتح تحت
 *   الشارة، ويبقى الرابط إلى الصفحة لمن أراد التعليل والدليل والألفاظ.
 */
function AnalysisSummary({ post }: { post: PostListItemView }) {
  const analysis = post.analysis;
  if (!analysis) return null;

  const level = SEVERITY_LEVELS[analysis.severityLevel] ?? SEVERITY_LEVELS[0]!;
  const labels = sortLabels(analysis.labels);
  const rumor = RUMOR_STATUS[analysis.rumorStatus];
  const stance = AUTHOR_STANCE[analysis.authorStance];

  return (
    <dl className="space-y-2 rounded-control border border-border bg-surface-2 p-3 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        <dt className="sr-only">درجة الخطورة</dt>
        <dd>
          <Badge tone={level.tone} size="sm">
            خطورة {level.short} — {level.label}
          </Badge>
        </dd>
        {labels.map((key) => {
          const meta = CONTENT_LABELS[key];
          if (!meta) return null;
          return (
            <dd key={key}>
              <Badge tone={meta.tone} size="sm">
                {meta.label}
              </Badge>
            </dd>
          );
        })}
      </div>

      {rumor && analysis.rumorStatus !== 'NONE' && (
        <div className="flex gap-2">
          <dt className="shrink-0 text-muted-foreground">حال الادعاء:</dt>
          <dd>{rumor.label}</dd>
        </div>
      )}
      {stance && (
        <div className="flex gap-2">
          <dt className="shrink-0 text-muted-foreground">موقف الكاتب:</dt>
          <dd>{stance}</dd>
        </div>
      )}
      <div className="flex gap-2">
        <dt className="shrink-0 text-muted-foreground">الثقة:</dt>
        <dd className="num">{Math.round(analysis.confidence * 100)}%</dd>
      </div>

      {analysis.needsReview && (
        <p className="text-warning">أُحيل إلى المراجعة البشرية</p>
      )}

      <Link
        href={`/posts/${post.id}`}
        className="inline-flex items-center gap-1 font-medium text-primary-text hover:underline"
      >
        التعليل والدليل الكامل
        <ExternalLink className="h-3 w-3" aria-hidden />
      </Link>
    </dl>
  );
}

/**
 * مقتطفُ المنشور — حول موضع المطابقة لا من أوّله.
 *
 * ★ البطاقة كانت تعرض أوّل مئتي حرفٍ دائماً.
 *
 *   فمن بحث عن كلمةٍ وردت في السطر العاشر يرى بطاقةً لا أثر فيها لما
 *   بحث عنه، فيسأل: لماذا ظهر هذا؟ ويفتح المنشور ليعرف، ثمّ يعود،
 *   ثمّ يفتح الذي بعده. وقائمةٌ لا تُجيب عن نفسها تُفتح بطاقةً بطاقة.
 *
 *   والمقتطف حول المطابقة، والكلمة فيه مُبرَزة، يُجيب قبل أن يُسأل.
 *
 * ★ والإبراز على الكلمة المجذَّرة كما في القاعدة.
 *
 *   فحدّ «وزارة» يُبرز «الوزارة» في النصّ — وهي المطابقة التي جرت
 *   فعلاً. ولو أُبرز بالمقارنة الحرفية لظهرت بطاقةٌ مطابِقةٌ بلا إبراز،
 *   فيُظنّ الإبراز معطّلاً أو المطابقة خاطئة.
 */
function PostSnippet({
  text,
  query,
  limit = 220,
}: {
  text: string;
  query?: string;
  /** حدُّ المعروض — البطاقة أربعة أسطر والجدول سطران */
  limit?: number;
}) {
  const parsed = parseSearchTerms(query);
  const { segments, clippedStart, clippedEnd } = highlightSegments(text, parsed, limit);

  if (segments.length === 0) return <>{truncate(text, limit)}</>;

  return (
    <>
      {clippedStart && '… '}
      {segments.map((segment, index) =>
        segment.match ? (
          <mark
            // eslint-disable-next-line react/no-array-index-key -- المقاطع مشتقّة من نصٍّ ثابت وترتيبها هو هويّتها
            key={index}
            className="rounded bg-warning-soft px-0.5 font-semibold text-warning"
          >
            {segment.text}
          </mark>
        ) : (
          // eslint-disable-next-line react/no-array-index-key -- كما أعلاه
          <span key={index}>{segment.text}</span>
        ),
      )}
      {clippedEnd && ' …'}
    </>
  );
}

/**
 * مقياس تفاعل مصغّر يظهر في البطاقة والجدول.
 *
 * ★ الرقم ووحدته سطرٌ واحد، والوحدة بعد الرقم في القراءة العربية.
 *
 *   كان «1.8 مليون» كلّه داخل عزلٍ لاتيني (`.num`)، فأمران وقعا معاً:
 *   الوحدة تظهر يمين الرقم — أي قبله في القراءة — والسطر يلتفّ في
 *   البطاقة الضيّقة فتسقط «مليون» تحت «1.8». فالعزل على الرقم وحده،
 *   والوحدة خارجه، والسطر لا يلتفّ.
 */
function EngagementStat({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof ThumbsUp;
  value: number;
  label: string;
}) {
  const { amount, unit } = splitUnit(formatCompactNumber(value));
  return (
    <span
      className="flex min-w-0 items-center gap-1 whitespace-nowrap text-xs text-muted-foreground"
      title={`${label}: ${formatNumber(value)}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="num font-medium text-foreground">{amount}</span>
      {unit && <span>{unit}</span>}
      <span className="sr-only">{label}</span>
    </span>
  );
}

/*
 * اسم المنصة كما يُعرض: «فيسبوك (Facebook)».
 *
 * الاسمان معاً لا أحدهما: العربي وحده يكفي القارئ العربي، واللاتيني هو ما
 * يطابق ما يراه في المنصة نفسها حين يفتح الرابط. والرمز يُكتب بحرف أوّل
 * كبير لأنه يُخزَّن صغيراً كله.
 */
function platformLabel(platform: { name: string; code: string }): string {
  const latin = platform.code.charAt(0).toUpperCase() + platform.code.slice(1);
  return `${platform.name} (${latin})`;
}

/**
 * اسم الحساب — رابطاً لمن يملك تصفّح الدليل، ونصّاً لغيره.
 *
 * الاسم يبقى للجميع: هو بيانٌ في المنشور لا تصفّحٌ للدليل، ومنشورٌ بلا
 * قائله ناقص. أما الرابط فيقود إلى صفحة يحرسها الخادم، فوجودُه لمن لا
 * يملكها وعدٌ بباب مغلق.
 */
function AccountName({
  id,
  name,
  className,
}: {
  id: string;
  name: string;
  className?: string;
}) {
  const canBrowse = useCan(PERMISSIONS.ACCOUNTS_VIEW);
  if (!canBrowse) return <span className={className}>{name}</span>;

  return (
    <Link href={`/accounts/${id}`} className={className}>
      {name}
    </Link>
  );
}

/** بطاقة منشور — العرض الافتراضي في شاشة المنشورات */
export function PostCard({
  post,
  canReview,
  onDelete,
  query,
}: {
  post: PostListItemView;
  canReview?: boolean;
  /** سطرُ البحث الجاري — يُبرَز موضعُه في المقتطف */
  query?: string;
  /** يُمرَّر لمن يملك صلاحية الحذف وحده — وغيابه يُخفي الزرّ */
  onDelete?: (post: PostListItemView) => void;
}) {
  const hasMedia = Boolean(post.thumbnailUrl || post.imageUrl);

  /*
   * التفاصيل مطويّة افتراضاً ومفتوحةٌ لمن ضغط.
   *
   * اللوحة أداةُ مسحٍ سريع: أربعٌ وعشرون بطاقة كلٌّ منها تعرض خمسة
   * أسطر من التعليل تصير جداراً لا يُمسح. والشارة تقول الحكم في كلمة،
   * ومن سأل «لماذا؟» ضغطها فانفتح ما وراءها في موضعه.
   */
  const [showAnalysis, setShowAnalysis] = useState(false);
  const level = post.analysis?.severityLevel ?? 0;
  const severity = level >= SEVERITY_VISIBLE_FROM ? SEVERITY_LEVELS[level] : undefined;
  /* أخطر وسمٍ وحده — القائمة كاملةً في صفحة المنشور */
  const topLabelKey = sortLabels(post.analysis?.labels ?? [])[0];
  const topLabel = topLabelKey ? CONTENT_LABELS[topLabelKey] : undefined;

  return (
    /*
      @container يجعل البطاقة نفسها مرجع القياس لا النافذة.
      وهذا هو الصحيح هنا: عرض البطاقة يتغيّر بعدد الأعمدة وبطيّ الشريط
      الجانبي معاً، فالنافذة وحدها لا تعرف كم بقي لها فعلاً. البطاقة بعرض
      220 بكسل تتصرّف تصرّفاً واحداً سواء أكانت النافذة 1280 أم 2560.
    */
    <article className="@container card-interactive flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-elev-2 print-avoid-break">
      {/*
        الترويسة: الحساب أوّلاً ثم الحذف في الطرف المقابل.

        صاحبُ المنشور هو ما يبحث عنه المراجع في لوحة من أربع وعشرين بطاقة،
        فيتصدّر. وكان في الأسفل تحت النصّ، فيُقرأ المنشور كله قبل أن يُعرف
        قائله. والحذف معزول في الطرف الآخر لأنه لا رجعة فيه.
      */}
      <header className="flex items-center gap-3">
        <AccountAvatar
          name={post.account.name}
          src={post.account.avatarUrl}
          mediaKey={post.account.avatarKey}
        />

        <div className="min-w-0 flex-1">
          <AccountName
            id={post.account.id}
            name={post.account.name}
            className="block truncate text-sm font-semibold text-foreground hover:text-primary-text @[15rem]:text-[0.95rem]"
          />
          {/*
            متى نُشر، ثمّ أين — في سطرٍ واحد تحت الاسم.

            ★ الوقت أوّلاً ولا يُقصّ، والمنصّة بعده وتُقصّ إن ضاق السطر.

              في لوحة رصد «متى» هو السؤال الأوّل بعد «من»: منشورٌ عمره
              ساعة غيرُ منشورٍ عمره أسبوع وإن تطابق نصّاهما. فالوقت لا
              يتنازل عن مكانه، والمنصّة تُعرف أيضاً من رابط «عرض المنشور»
              ومن الاسم كاملاً في التلميح.

            و`<time>` بقيمته الآلية كاملةً، والوقت الكامل في `title`: البطاقة
            تختصر («قبل ٣ ساعات»)، ومن أراد الدقيقة مرّر المؤشّر.
          */}
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            {post.publishedAt && (
              <>
                <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <time
                  dateTime={post.publishedAt}
                  title={formatDateTime(post.publishedAt)}
                  className="shrink-0 whitespace-nowrap"
                >
                  {formatPublishedAt(post.publishedAt)}
                </time>
                <span aria-hidden className="shrink-0">
                  ·
                </span>
              </>
            )}
            {/*
              الاسم العربي وحده هنا، والاسمان معاً في التلميح.

              «إنستغرام (Instagram)» في سطرٍ يتقاسمه مع الوقت يُقصّ من
              طرفه اللاتيني، فيظهر «...ram) إنستغرام» — نصفُ كلمةٍ وقوسٌ
              معكوس. والاسم العربي قصيرٌ يتّسع، ومن أراد الآخر مرّر المؤشّر.
            */}
            <span className="truncate" title={platformLabel(post.platform)}>
              {post.platform.name}
            </span>
          </p>
        </div>

        {onDelete && (
          <Button
            size="icon-sm"
            variant="secondary"
            className="shrink-0 text-danger"
            aria-label={`حذف منشور ${post.account.name}`}
            onClick={() => onDelete(post)}
          >
            <Trash2 aria-hidden />
          </Button>
        )}
      </header>

      {hasMedia && (
        <PostThumb
          postId={post.id}
          src={post.thumbnailUrl ?? post.imageUrl ?? ''}
          isVideo={Boolean(post.videoUrl) || post.postType === 'VIDEO' || post.postType === 'REEL'}
          extraCount={Math.max(0, (post.mediaUrls?.length ?? 0) - 1)}
          mediaKey={post.mediaKey}
          className="rounded-xl"
        />
      )}

      {/*
        النصّ بارتفاع سطر واسع (2.0) لا افتراضي.

        العربية تحمل نقاطاً تحت الحرف وتشكيلاً فوقه، فالسطران المتقاربان
        يتداخلان بصرياً ويتعب المسح السريع. والفرق يُرى في فقرة من أربعة
        أسطر لا في سطر واحد.
      */}
      <Link href={`/posts/${post.id}`} className="flex-1">
        <p className="line-clamp-4 text-sm leading-[2] text-foreground">
          {post.text ? (
            <PostSnippet text={post.text} query={query} />
          ) : (
            <span className="text-subtle-foreground">منشور بلا نص</span>
          )}
        </p>
      </Link>

      {/*
        الشارات بعد النصّ لا قبله.

        الحكم على المنشور يُقرأ بعد المحكوم عليه: قراءة «سلبي» قبل النصّ
        تصبغ قراءة النصّ نفسه.

        ★ وشارةُ الموقف لا تُخفى في أيّ عرض.

          كان الصفّ كله `hidden @[15rem]:flex`، فالبطاقة في عمودٍ ضيّق —
          أو على شاشة جوّال — تُعرض بلا نتيجة تحليل أصلاً، وهي أوّل ما
          يُبحث عنه في لوحة المراجعة. وحجّةُ الإخفاء كانت أربع شارات
          تلتفّ ثلاثة سطور؛ والحلّ أن يُخفى الزائد لا الأصل: الموضوع
          يُخفى دون ١٧rem، والموقف كلمةٌ واحدة تتّسع في كل عرض.
      */}
      <div className="flex flex-wrap items-center gap-1.5">
        {/*
          نتيجة التحليل — كلمةٌ واحدة وفق معايير سياسة التصنيف في الموقع:
          إيجابي، أو محايد، أو سلبي، أو مختلط. وما لم تبلغه المكنسة بعد
          يُقال «بانتظار التصنيف» بصراحة، ولا تُخترع له نتيجة ولا يُخلط
          بمن نُظر فيه ولم يُحسم — انظر `ClassificationBadge`.

          واسم المقياس لقارئ الشاشة وحده: «سلبي» بلا سياق كلمةٌ معلّقة،
          والعنوان المكتوب يأخذ سطراً في بطاقةٍ ضيّقة بلا حاجة — الشارة
          الملوّنة في موضعها الثابت تكفي من يرى.
        */}
        <ClassificationBadge
          analysis={post.analysis}
          onClick={post.analysis ? () => setShowAnalysis((open) => !open) : undefined}
          expanded={showAnalysis}
        />
        {/*
          ★ الخطورة تسبق الموضوع في البطاقة الضيّقة.

            من يمسح لوحةً من أربعٍ وعشرين بطاقة يبحث عن الخطر لا عن
            التصنيف الموضوعي. ودرجةٌ ٢ فما فوق («يحتاج مراقبة») هي أوّل
            ما يستحقّ أن يُرى قبل فتح المنشور — وما دونها ضجيجٌ في شبكة.
        */}
        {severity && (
          <Badge tone={severity.tone} size="sm" title={`درجة الخطورة: ${severity.label}`}>
            <span className="sr-only">خطورة </span>
            {severity.label}
          </Badge>
        )}
        {topLabel && (
          <Badge tone={topLabel.tone} size="sm" className="hidden @[17rem]:inline-flex">
            {topLabel.label}
          </Badge>
        )}
        {post.topic && (
          <Badge tone="info" size="sm" className="hidden @[20rem]:inline-flex">
            {post.topic.name}
          </Badge>
        )}
        {post.isHidden && canReview && (
          <Badge tone="warning" size="sm">
            <EyeOff className="h-3 w-3" aria-hidden />
            مخفي
          </Badge>
        )}
      </div>

      {showAnalysis && <AnalysisSummary post={post} />}

      {post.url && (
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-primary-text hover:underline @[15rem]:text-sm"
        >
          عرض المنشور
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      )}

      {/*
        المقاييس موزّعة على العرض كله لا متلاصقة.

        أربعة أرقام متجاورة تُقرأ رقماً واحداً طويلاً؛ وتوزيعها يجعل لكلٍّ
        موضعاً ثابتاً في كل بطاقة، فتُقارَن البطاقات عمودياً بلمحة.
      */}
      {/*
        أربعة أعمدة متساوية لا مسافاتٌ موزّعة: العمود الثابت يجعل «الإعجابات»
        في الموضع نفسه في كلّ بطاقة، فتُقارَن البطاقات عمودياً بلمحة. وفي
        البطاقة الأضيق من 19rem يصير المربّع اثنين في اثنين بدل أن تتلاصق.
      */}
      <footer className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border pt-3 @[19rem]:grid-cols-4">
        <EngagementStat icon={ThumbsUp} value={post.likes} label="إعجابات" />
        <EngagementStat icon={MessageSquare} value={post.comments} label="تعليقات" />
        <EngagementStat icon={Share2} value={post.shares} label="مشاركات" />
        <EngagementStat icon={Eye} value={post.views} label="مشاهدات" />
      </footer>
    </article>
  );
}

/** ترويسة جدول المنشورات */
export function PostTableHead() {
  return (
    <THead>
      <TR>
        <TH>المنشور</TH>
        <TH>الحساب</TH>
        <TH>المنصة</TH>
        <TH>النوع</TH>
        <TH>{STANCE_METRIC.compact}</TH>
        <TH>تاريخ النشر</TH>
        <TH>إعجابات</TH>
        <TH>تعليقات</TH>
        <TH>مشاركات</TH>
        <TH>مشاهدات</TH>
        <TH>التفاعل</TH>
      </TR>
    </THead>
  );
}

/**
 * صف منشور في عرض الجدول.
 *
 * والإبراز فيه كالبطاقة: من بدّل الشكل لا يفقد ما يدلّه على موضع
 * المطابقة — والجدول أضيق، فسطراه أحقّ بأن يحملا المطابقة لا أوّل
 * الكلام.
 */
export function PostRow({ post, query }: { post: PostListItemView; query?: string }) {
  return (
    <TR>
      <TD className="max-w-80">
        <Link href={`/posts/${post.id}`} className="line-clamp-2 text-sm hover:text-primary-text">
          {post.text ? <PostSnippet text={post.text} query={query} limit={140} /> : 'منشور بلا نص'}
        </Link>
      </TD>
      <TD className="text-xs">
        <AccountName
          id={post.account.id}
          name={post.account.name}
          className="hover:text-primary-text hover:underline"
        />
      </TD>
      <TD className="text-xs text-muted-foreground">{post.platform.name}</TD>
      <TD className="text-xs text-muted-foreground">
        {POST_TYPE_LABELS[post.postType as keyof typeof POST_TYPE_LABELS] ?? post.postType}
      </TD>
      <TD>
        {/* الجدول والبطاقة يقولان الشيء نفسه — ومن شارةٍ واحدة لا من نسختين */}
        <ClassificationBadge analysis={post.analysis} />
      </TD>
      <TD className="whitespace-nowrap text-xs text-muted-foreground">
        {formatDateTime(post.publishedAt)}
      </TD>
      <TD className="num">{formatNumber(post.likes)}</TD>
      <TD className="num">{formatNumber(post.comments)}</TD>
      <TD className="num">{formatNumber(post.shares)}</TD>
      <TD className="num">{formatNumber(post.views)}</TD>
      <TD className="num font-semibold text-primary-text">{formatNumber(post.engagementTotal)}</TD>
    </TR>
  );
}

/** بطاقة معلومات لغة ودولة المنشور */
export function PostMetaRow({ post }: { post: PostListItemView }) {
  return (
    <p className="text-xs text-muted-foreground">
      اللغة: {languageLabel(post.language)}
      {post.country ? ` · الدولة: ${post.country}` : ''}
    </p>
  );
}

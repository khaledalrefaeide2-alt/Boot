'use client';

import Link from 'next/link';
import { Eye, ExternalLink, EyeOff, MessageSquare, Share2, ThumbsUp, Trash2 } from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AccountAvatar } from '@/components/ui/avatar';
import { PostThumb } from '@/components/posts/post-thumb';
import { TD, TH, THead, TR } from '@/components/ui/table';
import {
  POST_TYPE_LABELS,
  SENTIMENT_LABELS,
  SENTIMENT_TONE,
  languageLabel,
} from '@/lib/domain/constants';
import { formatCompactNumber, formatDateTime, formatNumber, truncate } from '@/lib/utils';

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
  account: { id: string; name: string; avatarUrl: string | null };
  platform: { id: string; name: string; code: string };
  topic: { id: string; name: string } | null;
}

function sentimentTone(sentiment: string): BadgeTone {
  return (SENTIMENT_TONE[sentiment as keyof typeof SENTIMENT_TONE] ?? 'neutral') as BadgeTone;
}

/** مقياس تفاعل مصغّر يظهر في البطاقة والجدول */
function EngagementStat({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof ThumbsUp;
  value: number;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground" title={label}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span className="num">{formatCompactNumber(value)}</span>
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

/** بطاقة منشور — العرض الافتراضي في شاشة المنشورات */
export function PostCard({
  post,
  canReview,
  onDelete,
}: {
  post: PostListItemView;
  canReview?: boolean;
  /** يُمرَّر لمن يملك صلاحية الحذف وحده — وغيابه يُخفي الزرّ */
  onDelete?: (post: PostListItemView) => void;
}) {
  const hasMedia = Boolean(post.thumbnailUrl || post.imageUrl);

  return (
    /*
      @container يجعل البطاقة نفسها مرجع القياس لا النافذة.
      وهذا هو الصحيح هنا: عرض البطاقة يتغيّر بعدد الأعمدة وبطيّ الشريط
      الجانبي معاً، فالنافذة وحدها لا تعرف كم بقي لها فعلاً. البطاقة بعرض
      220 بكسل تتصرّف تصرّفاً واحداً سواء أكانت النافذة 1280 أم 2560.
    */
    <article className="@container card-interactive flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-elev-2 print-avoid-break">
      {/*
        الترويسة: الحساب أوّلاً ثم الحذف في الطرف المقابل.

        صاحبُ المنشور هو ما يبحث عنه المراجع في لوحة من أربع وعشرين بطاقة،
        فيتصدّر. وكان في الأسفل تحت النصّ، فيُقرأ المنشور كله قبل أن يُعرف
        قائله. والحذف معزول في الطرف الآخر لأنه لا رجعة فيه.
      */}
      <header className="flex items-center gap-3">
        <Link href={`/accounts/${post.account.id}`} className="shrink-0">
          <AccountAvatar name={post.account.name} src={post.account.avatarUrl} />
        </Link>

        <div className="min-w-0 flex-1">
          <Link
            href={`/accounts/${post.account.id}`}
            className="block truncate text-sm font-semibold text-foreground hover:text-primary @[15rem]:text-[0.95rem]"
          >
            {post.account.name}
          </Link>
          <p className="truncate text-xs text-muted-foreground">{platformLabel(post.platform)}</p>
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
            truncate(post.text, 220)
          ) : (
            <span className="text-subtle-foreground">منشور بلا نص</span>
          )}
        </p>
      </Link>

      {/*
        الشارات بعد النصّ لا قبله.

        المشاعر والتصنيف حكمٌ على المنشور، وقراءة الحكم قبل المحكوم عليه
        تصبغ القراءة. وتظهر على البطاقة الواسعة وحدها — أربع شارات في بطاقة
        بعرض 220 بكسل تلتفّ ثلاثة سطور فتأكل ارتفاعها.
      */}
      <div className="hidden flex-wrap items-center gap-1.5 @[15rem]:flex">
        <Badge tone={sentimentTone(post.sentiment)} size="sm">
          {SENTIMENT_LABELS[post.sentiment as keyof typeof SENTIMENT_LABELS] ?? post.sentiment}
        </Badge>
        {post.topic && (
          <Badge tone="info" size="sm" className="hidden @[17rem]:inline-flex">
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

      {post.url && (
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-primary hover:underline @[15rem]:text-sm"
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
      <footer className="flex items-center justify-between border-t border-border pt-3">
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
        <TH>المشاعر</TH>
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

/** صف منشور في عرض الجدول */
export function PostRow({ post }: { post: PostListItemView }) {
  return (
    <TR>
      <TD className="max-w-80">
        <Link href={`/posts/${post.id}`} className="line-clamp-2 text-sm hover:text-primary">
          {post.text ? truncate(post.text, 140) : 'منشور بلا نص'}
        </Link>
      </TD>
      <TD className="text-xs">
        <Link href={`/accounts/${post.account.id}`} className="hover:text-primary hover:underline">
          {post.account.name}
        </Link>
      </TD>
      <TD className="text-xs text-muted-foreground">{post.platform.name}</TD>
      <TD className="text-xs text-muted-foreground">
        {POST_TYPE_LABELS[post.postType as keyof typeof POST_TYPE_LABELS] ?? post.postType}
      </TD>
      <TD>
        <Badge tone={sentimentTone(post.sentiment)} size="sm">
          {SENTIMENT_LABELS[post.sentiment as keyof typeof SENTIMENT_LABELS] ?? post.sentiment}
        </Badge>
      </TD>
      <TD className="whitespace-nowrap text-xs text-muted-foreground">
        {formatDateTime(post.publishedAt)}
      </TD>
      <TD className="num">{formatNumber(post.likes)}</TD>
      <TD className="num">{formatNumber(post.comments)}</TD>
      <TD className="num">{formatNumber(post.shares)}</TD>
      <TD className="num">{formatNumber(post.views)}</TD>
      <TD className="num font-semibold text-primary">{formatNumber(post.engagementTotal)}</TD>
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

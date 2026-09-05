'use client';

import Link from 'next/link';
import { ExternalLink, EyeOff, Heart, MessageSquare, Play, Share2 } from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { RemoteMedia } from '@/components/posts/remote-media';
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
  account: { id: string; name: string };
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
  icon: typeof Heart;
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

/** بطاقة منشور — العرض الافتراضي في شاشة المنشورات */
export function PostCard({ post, canReview }: { post: PostListItemView; canReview?: boolean }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xs transition-colors hover:border-border-strong print-avoid-break">
      {(post.thumbnailUrl || post.imageUrl) && (
        <Link href={`/posts/${post.id}`} className="relative block bg-surface-2">
          <RemoteMedia
            src={post.thumbnailUrl ?? post.imageUrl ?? ''}
            className="h-36 w-full object-cover"
            fallback="placeholder"
          />
          {post.videoUrl && (
            <span className="absolute bottom-2 start-2 flex items-center gap-1 rounded bg-black/65 px-1.5 py-0.5 text-[0.6875rem] text-white">
              <Play className="h-3 w-3" aria-hidden />
              فيديو
            </span>
          )}
        </Link>
      )}

      <div className="flex flex-1 flex-col gap-2.5 p-3.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="primary" size="sm">
            {post.platform.name}
          </Badge>
          <Badge size="sm">{POST_TYPE_LABELS[post.postType as keyof typeof POST_TYPE_LABELS] ?? post.postType}</Badge>
          <Badge tone={sentimentTone(post.sentiment)} size="sm">
            {SENTIMENT_LABELS[post.sentiment as keyof typeof SENTIMENT_LABELS] ?? post.sentiment}
          </Badge>
          {post.topic && (
            <Badge tone="info" size="sm">
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

        <Link href={`/posts/${post.id}`} className="flex-1">
          <p className="line-clamp-4 text-sm leading-relaxed text-foreground">
            {post.text ? truncate(post.text, 260) : <span className="text-subtle-foreground">منشور بلا نص</span>}
          </p>
        </Link>

        {post.hashtags.length > 0 && (
          <p className="line-clamp-1 text-xs text-primary">
            {post.hashtags.slice(0, 5).map((tag) => `#${tag}`).join(' ')}
          </p>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-border pt-2.5">
          <div className="min-w-0">
            <Link
              href={`/accounts/${post.account.id}`}
              className="block truncate text-xs font-medium text-foreground hover:text-primary hover:underline"
            >
              {post.account.name}
            </Link>
            <p className="text-[0.6875rem] text-subtle-foreground">
              {formatDateTime(post.publishedAt)}
            </p>
          </div>
          {post.url && (
            /* p-1.5 يجعل مساحة اللمس 26px: أقل من 24px يصعب إصابته على الجوال */
            <a
              href={post.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center justify-center rounded p-1.5 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-primary"
              title="فتح المنشور في المنصة"
              aria-label="فتح المنشور في المنصة"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <EngagementStat icon={Heart} value={post.likes} label="إعجابات" />
          <EngagementStat icon={MessageSquare} value={post.comments} label="تعليقات" />
          <EngagementStat icon={Share2} value={post.shares} label="مشاركات" />
          {post.views > 0 && <EngagementStat icon={Play} value={post.views} label="مشاهدات" />}
          <span className="num me-auto text-xs font-semibold text-primary" title="إجمالي التفاعل">
            {formatCompactNumber(post.engagementTotal)}
          </span>
        </div>
      </div>
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

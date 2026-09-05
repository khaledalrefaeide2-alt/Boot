import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ExternalLink, Heart, MessageSquare, Play, Share2, Bookmark } from 'lucide-react';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { can, PERMISSIONS } from '@/lib/auth/rbac';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/ui/stat-card';
import { Alert } from '@/components/ui/alert';
import {
  POST_TYPE_LABELS,
  SENTIMENT_LABELS,
  SENTIMENT_TONE,
  languageLabel,
} from '@/lib/domain/constants';
import { formatDateTime, formatNumber } from '@/lib/utils';
import { MediaGallery } from '@/components/posts/media-gallery';

export const metadata: Metadata = { title: 'تفاصيل المنشور' };

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border py-2.5 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{children}</span>
    </div>
  );
}

export default async function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSession();
  if (!can(user, PERMISSIONS.POSTS_VIEW)) notFound();

  const post = await prisma.post.findUnique({
    where: { id },
    include: {
      account: { select: { id: true, name: true, url: true, followersCount: true } },
      platform: { select: { id: true, name: true } },
      topic: { select: { id: true, name: true } },
      keywordLinks: { include: { keyword: { select: { id: true, term: true } } } },
      extractionRun: { select: { id: true, createdAt: true } },
      reviewedBy: { select: { name: true } },
    },
  });

  if (!post) notFound();
  const canReview = can(user, PERMISSIONS.POSTS_REVIEW);
  if (post.isHidden && !canReview) notFound();

  const mediaUrls = Array.isArray(post.mediaUrls) ? (post.mediaUrls as string[]) : [];

  return (
    <>
      <PageHeader
        title="تفاصيل المنشور"
        description={`${post.account.name} — ${post.platform.name}`}
        action={
          <>
            <Link href={`/posts?accountId=${post.account.id}&range=all`}>
              <Button variant="secondary">منشورات الحساب</Button>
            </Link>
            {post.url && (
              <a href={post.url} target="_blank" rel="noopener noreferrer">
                <Button>
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  فتح في المنصة
                </Button>
              </a>
            )}
          </>
        }
      />

      {post.isHidden && (
        <Alert tone="warning" title="هذا المنشور مخفي" className="mb-4">
          مستبعد من كل اللوحات والإحصاءات والتقارير. يظهر لك لأنك تملك صلاحية المراجعة.
        </Alert>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="الإعجابات" value={post.likes} icon={Heart} compact />
        <StatCard label="التعليقات" value={post.comments} icon={MessageSquare} compact />
        <StatCard label="المشاركات" value={post.shares} icon={Share2} compact />
        <StatCard label="المشاهدات" value={post.views} icon={Play} compact />
        <StatCard label="الحفظ" value={post.saves} icon={Bookmark} compact />
        <StatCard label="إجمالي التفاعل" value={post.engagementTotal} tone="primary" compact />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="نص المنشور" />
          <CardBody>
            {post.text ? (
              <p className="whitespace-pre-wrap text-sm leading-loose text-foreground">{post.text}</p>
            ) : (
              <p className="text-sm text-subtle-foreground">منشور بلا نص</p>
            )}

            <MediaGallery
              urls={[post.imageUrl, ...mediaUrls]
                .filter((url, index, list): url is string => Boolean(url) && list.indexOf(url) === index)
                .slice(0, 12)}
            />

            {post.videoUrl && (
              <a
                href={post.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <Play className="h-4 w-4" aria-hidden />
                فتح رابط الفيديو
              </a>
            )}

            {post.hashtags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5 border-t border-border pt-4">
                {post.hashtags.map((tag) => (
                  <Link key={tag} href={`/posts?hashtag=${encodeURIComponent(tag)}&range=all`}>
                    <Badge tone="primary">#{tag}</Badge>
                  </Link>
                ))}
              </div>
            )}

            {post.keywordLinks.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">كلمات مكتشفة:</span>
                {post.keywordLinks.map((link) => (
                  <Link
                    key={link.keyword.id}
                    href={`/posts?keywordId=${link.keyword.id}&range=all`}
                  >
                    <Badge tone="info">{link.keyword.term}</Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="بيانات المنشور" />
          <CardBody className="py-1">
            <DetailRow label="المنصة">{post.platform.name}</DetailRow>
            <DetailRow label="الحساب">
              <Link href={`/accounts/${post.account.id}`} className="text-primary hover:underline">
                {post.account.name}
              </Link>
            </DetailRow>
            <DetailRow label="الناشر">{post.authorName ?? '—'}</DetailRow>
            <DetailRow label="تاريخ النشر">{formatDateTime(post.publishedAt)}</DetailRow>
            <DetailRow label="نوع المنشور">{POST_TYPE_LABELS[post.postType]}</DetailRow>
            <DetailRow label="اللغة">{languageLabel(post.language)}</DetailRow>
            <DetailRow label="الدولة">{post.country ?? '—'}</DetailRow>
            <DetailRow label="الموقع">{post.location ?? '—'}</DetailRow>
            <DetailRow label="المشاعر">
              <Badge tone={SENTIMENT_TONE[post.sentiment]}>
                {SENTIMENT_LABELS[post.sentiment]}
              </Badge>
              {post.sentimentScore !== null && (
                <span className="num ms-2 text-xs text-muted-foreground">
                  {post.sentimentScore.toFixed(2)}
                </span>
              )}
            </DetailRow>
            <DetailRow label="مصدر تحليل المشاعر">
              {post.sentimentSource === 'MANUAL'
                ? 'تعديل يدوي'
                : post.sentimentSource === 'AI'
                  ? 'ذكاء اصطناعي'
                  : 'قواعد لغوية'}
            </DetailRow>
            <DetailRow label="التصنيف">
              {post.topic ? (
                <Link href={`/posts?topicId=${post.topic.id}&range=all`} className="text-primary hover:underline">
                  {post.topic.name}
                </Link>
              ) : (
                'بلا تصنيف'
              )}
            </DetailRow>
            <DetailRow label="متابعو الحساب">
              <span className="num">
                {post.account.followersCount ? formatNumber(post.account.followersCount) : '—'}
              </span>
            </DetailRow>
            <DetailRow label="تاريخ الاستيراد">{formatDateTime(post.createdAt)}</DetailRow>
            {canReview && post.extractionRun && (
              <DetailRow label="عملية الاستخراج">
                <Link
                  href={`/admin/extractions/${post.extractionRun.id}`}
                  className="text-primary hover:underline"
                >
                  عرض العملية
                </Link>
              </DetailRow>
            )}
            {post.reviewedBy && (
              <DetailRow label="روجع بواسطة">{post.reviewedBy.name}</DetailRow>
            )}
          </CardBody>
        </Card>
      </div>

      {canReview && post.rawData ? (
        <Card className="mt-4">
          <CardHeader
            title="البيانات الخام"
            description="كما وصلت من Apify — تظهر لأصحاب صلاحية المراجعة فقط"
          />
          <CardBody>
            <pre className="ltr max-h-96 overflow-auto rounded-md border border-border bg-surface-2 p-3 text-xs leading-relaxed">
              {JSON.stringify(post.rawData, null, 2)}
            </pre>
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}

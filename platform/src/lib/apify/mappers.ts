import 'server-only';
import { createHash } from 'node:crypto';
import type { PostType } from '@/generated/prisma';
import { detectLanguage, extractHashtags } from '@/lib/analysis/text';

/**
 * تحويل عناصر Apify الخام إلى حقول المنشور عندنا.
 *
 * القواعد الحاكمة:
 *  - كل حقل غير متاح يبقى null، ولا يُفترض وجوده أبداً.
 *  - منشور واحد فاسد لا يُفشل العملية كاملة — يُتجاهل ويُحصى.
 *  - لا نستخرج التعليقات ولا نحللها إطلاقاً.
 */

export interface MappedPost {
  externalId: string | null;
  dedupeKey: string;
  url: string | null;
  text: string | null;
  publishedAt: Date | null;
  postType: PostType;
  language: string | null;
  country: string | null;
  location: string | null;
  authorName: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  mediaUrls: string[] | null;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  saves: number;
  hashtags: string[];
  /** عدد المتابعين إن أرجعه الـ Actor — يُحدَّث على مستوى الحساب */
  followersCount: number | null;
}

// ============================ أدوات قراءة آمنة ============================

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** قراءة أول قيمة نصية موجودة من بين عدة مسارات محتملة */
function pickString(source: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = readPath(source, key);
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/** قراءة أول قيمة عددية موجودة */
function pickNumber(source: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = readPath(source, key);
    if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value));
    if (typeof value === 'string') {
      const parsed = parseCompactNumber(value);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

/** قراءة قيمة عبر مسار منقوط مع دعم فهرسة المصفوفات: media.0.url */
function readPath(source: Record<string, unknown>, path: string): unknown {
  if (!path.includes('.')) return source[path];
  let current: unknown = source;
  for (const segment of path.split('.')) {
    if (Array.isArray(current)) {
      const index = Number.parseInt(segment, 10);
      if (Number.isNaN(index)) return undefined;
      current = current[index];
      continue;
    }
    const record = asRecord(current);
    if (!record) return undefined;
    current = record[segment];
  }
  return current;
}

/** تحويل "12.4K" أو "١٢٣" أو "1,234" إلى رقم */
function parseCompactNumber(value: string): number | null {
  const cleaned = value
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[,\s]/g, '')
    .trim();
  const match = cleaned.match(/^([\d.]+)\s*([KkMmثمأ]|ألف|الف|مليون)?$/);
  if (!match?.[1]) return null;
  const base = Number.parseFloat(match[1]);
  if (!Number.isFinite(base)) return null;
  const suffix = match[2]?.toLowerCase();
  if (suffix === 'k' || suffix === 'ألف' || suffix === 'الف') return Math.round(base * 1000);
  if (suffix === 'm' || suffix === 'مليون') return Math.round(base * 1_000_000);
  return Math.round(base);
}

/** تحويل أي صيغة تاريخ يرجعها الـ Actor إلى Date */
function parseDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    // الطوابع الزمنية قد تكون بالثواني أو بالميلي ثانية
    const ms = value > 1e12 ? value : value * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === 'string' && value.trim()) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

function pickDate(source: Record<string, unknown>, keys: string[]): Date | null {
  for (const key of keys) {
    const date = parseDate(readPath(source, key));
    if (date) return date;
  }
  return null;
}

/** جمع روابط الوسائط من الأشكال المختلفة التي ترجعها الـ Actors */
function collectMediaUrls(source: Record<string, unknown>, keys: string[]): string[] {
  const urls: string[] = [];

  for (const key of keys) {
    const value = readPath(source, key);
    if (typeof value === 'string' && value.startsWith('http')) {
      urls.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string' && item.startsWith('http')) {
          urls.push(item);
        } else {
          const record = asRecord(item);
          if (!record) continue;
          const nested = pickString(record, ['url', 'src', 'image', 'thumbnail', 'displayUrl', 'media_url']);
          if (nested?.startsWith('http')) urls.push(nested);
        }
      }
    }
  }

  return Array.from(new Set(urls)).slice(0, 20);
}

/** مفتاح منع التكرار: المعرّف الخارجي، أو بصمة الرابط، أو بصمة المحتوى */
function buildDedupeKey(externalId: string | null, url: string | null, text: string | null): string {
  if (externalId) return `id:${externalId}`;
  if (url) return `url:${createHash('sha1').update(url).digest('hex')}`;
  if (text) return `txt:${createHash('sha1').update(text).digest('hex')}`;
  return `rnd:${createHash('sha1').update(`${Date.now()}${Math.random()}`).digest('hex')}`;
}

/** تحديد نوع المنشور من الوسائط والحقول المتاحة */
function resolvePostType(
  source: Record<string, unknown>,
  hasVideo: boolean,
  hasImage: boolean,
  mediaCount: number,
  text: string | null,
): PostType {
  const declared = pickString(source, ['type', 'postType', 'mediaType', 'product_type', '__typename']);
  if (declared) {
    const value = declared.toLowerCase();
    if (value.includes('reel') || value.includes('clips')) return 'REEL';
    if (value.includes('story')) return 'STORY';
    if (value.includes('video')) return 'VIDEO';
    if (value.includes('sidecar') || value.includes('album') || value.includes('carousel')) return 'ALBUM';
    if (value.includes('photo') || value.includes('image')) return 'IMAGE';
    if (value.includes('link') || value.includes('share')) return 'LINK';
  }

  if (hasVideo) return 'VIDEO';
  if (mediaCount > 1) return 'ALBUM';
  if (hasImage) return 'IMAGE';
  if (pickString(source, ['link', 'externalLink', 'linkUrl'])) return 'LINK';
  if (text) return 'TEXT';
  return 'OTHER';
}

// ============================ المحوّل الموحّد ============================

/**
 * محوّل واحد يغطي المنصات الثلاث عبر قائمة مسارات محتملة لكل حقل.
 * هذا أمتن من محوّل لكل Actor، لأن الـ Actors تغيّر أسماء حقولها بين الإصدارات.
 */
export function mapApifyItem(raw: unknown, platformCode: string): MappedPost | null {
  const source = asRecord(raw);
  if (!source) return null;

  const text = pickString(source, [
    'text',
    'message',
    'caption',
    'content',
    'postText',
    'full_text',
    'description',
    'title',
  ]);

  const url = pickString(source, [
    'url',
    'postUrl',
    'link',
    'permalink',
    'twitterUrl',
    'displayUrl',
    'post_url',
  ]);

  const externalId = pickString(source, [
    'id',
    'postId',
    'post_id',
    'shortCode',
    'shortcode',
    'legacyId',
    'conversationId',
    'facebookId',
  ]);

  // عنصر بلا نص وبلا رابط وبلا معرّف لا يصلح منشوراً
  if (!text && !url && !externalId) return null;

  const videoUrl = pickString(source, [
    'videoUrl',
    'video_url',
    'videoUrls.0',
    'media.video_url',
    'videoPlayUrl',
  ]);

  const imageUrl = pickString(source, [
    'imageUrl',
    'image',
    'displayUrl',
    'thumbnailUrl',
    'media.image.uri',
    'images.0',
    'photos.0',
    'media.0.url',
  ]);

  const mediaUrls = collectMediaUrls(source, [
    'images',
    'photos',
    'media',
    'attachments',
    'mediaUrls',
    'childPosts',
  ]);

  const thumbnailUrl = pickString(source, ['thumbnailUrl', 'thumbnail', 'previewImageUrl', 'displayUrl']);

  const likes =
    pickNumber(source, [
      'likes',
      'likesCount',
      'likeCount',
      'favoriteCount',
      'reactionsCount',
      'reactions.like',
      'stats.likes',
      'engagement.likes',
    ]) ?? 0;

  const comments =
    pickNumber(source, [
      'comments',
      'commentsCount',
      'commentCount',
      'replyCount',
      'stats.comments',
      'engagement.comments',
    ]) ?? 0;

  const shares =
    pickNumber(source, [
      'shares',
      'sharesCount',
      'shareCount',
      'retweetCount',
      'reshareCount',
      'stats.shares',
    ]) ?? 0;

  const views =
    pickNumber(source, [
      'views',
      'viewCount',
      'videoViewCount',
      'videoPlayCount',
      'playCount',
      'impressions',
      'viewsCount',
    ]) ?? 0;

  const saves = pickNumber(source, ['saves', 'savesCount', 'bookmarkCount', 'saveCount']) ?? 0;

  const authorName = pickString(source, [
    'author.name',
    'author',
    'user.name',
    'user.fullName',
    'ownerFullName',
    'ownerUsername',
    'pageName',
    'username',
    'authorName',
  ]);

  const publishedAt = pickDate(source, [
    'timestamp',
    'time',
    'date',
    'publishedAt',
    'createdAt',
    'created_at',
    'taken_at',
    'postedAt',
  ]);

  const country = pickString(source, ['country', 'countryCode', 'location.country', 'place.country']);
  const location = pickString(source, [
    'location',
    'locationName',
    'place.name',
    'place.full_name',
    'locationInfo.name',
  ]);

  const followersCount = pickNumber(source, [
    'followersCount',
    'author.followers',
    'user.followers_count',
    'user.followersCount',
    'ownerFollowersCount',
  ]);

  const hashtagsFromText = extractHashtags(text);
  const declaredHashtags = Array.isArray(source.hashtags)
    ? source.hashtags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.replace(/^#/, ''))
    : [];
  const hashtags = Array.from(new Set([...hashtagsFromText, ...declaredHashtags])).slice(0, 50);

  // بعض الـ Actors ترجع الوسائط في مصفوفة فقط بلا حقل صورة صريح
  const resolvedImageUrl = imageUrl ?? mediaUrls.find((url) => !url.match(/\.(mp4|mov|webm)(\?|$)/i)) ?? null;

  const postType = resolvePostType(
    source,
    Boolean(videoUrl),
    Boolean(resolvedImageUrl),
    mediaUrls.length,
    text,
  );

  return {
    externalId,
    dedupeKey: buildDedupeKey(externalId, url, text),
    url,
    text,
    publishedAt,
    postType,
    language: detectLanguage(text),
    country: country?.slice(0, 80) ?? null,
    location: location?.slice(0, 200) ?? null,
    authorName: authorName?.slice(0, 200) ?? null,
    imageUrl: resolvedImageUrl,
    videoUrl,
    thumbnailUrl: thumbnailUrl ?? resolvedImageUrl,
    mediaUrls: mediaUrls.length > 0 ? mediaUrls : null,
    likes,
    comments,
    shares,
    views,
    saves,
    hashtags,
    followersCount,
  };
}

/**
 * تحويل دفعة كاملة مع عزل الأخطاء.
 * لا يُرمى أي استثناء إلى الأعلى — تُحصى العناصر الفاشلة فقط.
 */
export function mapApifyItems(
  items: unknown[],
  platformCode: string,
): { posts: MappedPost[]; failed: number; failures: string[] } {
  const posts: MappedPost[] = [];
  const failures: string[] = [];
  let failed = 0;

  for (const [index, item] of items.entries()) {
    try {
      const mapped = mapApifyItem(item, platformCode);
      if (mapped) posts.push(mapped);
      else {
        failed += 1;
        if (failures.length < 10) failures.push(`العنصر رقم ${index + 1}: بيانات غير كافية`);
      }
    } catch (error) {
      failed += 1;
      if (failures.length < 10) {
        failures.push(
          `العنصر رقم ${index + 1}: ${error instanceof Error ? error.message : 'خطأ غير معروف'}`,
        );
      }
    }
  }

  return { posts, failed, failures };
}

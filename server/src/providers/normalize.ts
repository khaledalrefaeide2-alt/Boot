import { ProviderPost, SearchFilters } from '../types';

/**
 * Single tolerant mapper from an arbitrary provider payload to ProviderPost.
 * Understands field names used by apidirect.io (`author_*`, `reshare_count`,
 * `image_url`, `sentiment.polarity`), Apify Facebook actors (`user`, `pageName`,
 * `postText`, `likesCount`…), and generic shapes. Never throws.
 */
export function normalizeProviderPost(raw: any): ProviderPost {
  const r = raw && typeof raw === 'object' ? raw : {};

  // Apify actors return `topReactions` (capitalised keys); apidirect returns
  // `reactions` (a number or lowercase breakdown).
  const reactionsField = r.reactions ?? r.topReactions ?? r.reaction_count;
  const reactionsFromObj =
    reactionsField && typeof reactionsField === 'object' ? sumValues(reactionsField) : num(reactionsField);

  const likes = num(
    r.likes ?? r.likesCount ?? r.like_count ?? pickCI(reactionsField, 'like')
  );
  const comments = num(r.comments ?? r.commentsCount ?? r.comment_count ?? r.comments_count);
  const shares = num(r.shares ?? r.sharesCount ?? r.share_count ?? r.shares_count ?? r.reshare_count);
  const reactions = num(r.reactions_count ?? r.reactionsCount) || reactionsFromObj || likes;
  const reach = num(r.reach) || reactions + comments * 10 + shares * 25 + 1000;
  const denom = reach || 1;

  const author = r.user && typeof r.user === 'object' ? r.user : {};

  return {
    externalId: String(
      r.post_id ?? r.postId ?? r.id ?? r._id ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
    ),
    pageName:
      r.author_name ?? r.pageName ?? r.page_name ?? r.page ?? author.name ?? r.author ?? r.from?.name ?? 'Unknown',
    pageId: String(r.author_id ?? r.pageId ?? r.page_id ?? author.id ?? r.from?.id ?? ''),
    pageUrl: r.author_url ?? r.pageUrl ?? r.page_url ?? author.profileUrl ?? author.url ?? undefined,
    pageAvatar:
      r.author_profile_picture ?? r.author_avatar ?? r.profile_picture ?? author.profilePic ?? author.avatar ?? undefined,
    content: r.message ?? r.postText ?? r.text ?? r.content ?? r.caption ?? '',
    url: r.url ?? r.postUrl ?? r.permalink ?? r.link ?? r.post_url ?? '',
    mediaUrl:
      r.image_url ?? r.media_url ?? r.imageUrl ?? r.image ?? r.picture ?? r.thumbnail ?? firstMedia(r.media) ?? r.video ?? undefined,
    language: r.language ?? r.lang ?? 'en',
    likes,
    comments,
    shares,
    reactions,
    engagementRate: +(((likes + comments + shares) / denom) * 100).toFixed(2),
    sentiment: parseSentiment(r.sentiment ?? r.sentiment_score),
    publishedAt: parseDate(
      r.date ?? r.time ?? r.published_at ?? r.publishedAt ?? r.created_time ?? r.created_at ?? r.timestamp
    ),
  };
}

/** Pull the posts array out of the many shapes providers wrap it in. */
export function extractPosts(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  return (payload.posts ?? payload.data ?? payload.results ?? payload.items ?? payload.result ?? []) as any[];
}

/** Local sort so explorer sort options work regardless of provider order. */
export function sortPosts(posts: ProviderPost[], sort?: SearchFilters['sort']): ProviderPost[] {
  const by: Record<string, (p: ProviderPost) => number> = {
    viral: (p) => p.shares + p.reactions,
    newest: (p) => new Date(p.publishedAt).getTime(),
    engagement: (p) => p.engagementRate,
    comments: (p) => p.comments,
    shares: (p) => p.shares,
  };
  const fn = by[sort || 'viral'] || by.viral;
  return [...posts].sort((a, b) => fn(b) - fn(a));
}

/** Convert varied sentiment encodings to a -1..1 number, or undefined. */
export function parseSentiment(v: any): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(-1, Math.min(1, v));
  if (typeof v === 'object') return parseSentiment(v.polarity ?? v.score ?? v.value ?? v.label ?? v.sentiment);
  const s = String(v).toLowerCase().trim();
  if (['positive', 'pos', 'good'].includes(s)) return 1;
  if (['negative', 'neg', 'bad'].includes(s)) return -1;
  if (['neutral', 'neu', 'mixed'].includes(s)) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : undefined;
}

/** Parse a date field (ISO string, "YYYY-MM-DD HH:mm:ss", unix s/ms) to ISO. */
export function parseDate(v: any): string {
  if (v === undefined || v === null || v === '') return new Date().toISOString();
  if (typeof v === 'number') {
    const ms = v < 1e12 ? v * 1000 : v; // treat < 1e12 as unix seconds
    const d = new Date(ms);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export const num = (v: any): number => (Number.isFinite(+v) ? Math.floor(+v) : 0);

export const sumValues = (obj: Record<string, any>): number =>
  Object.values(obj).reduce((a: number, b) => a + (Number.isFinite(+b) ? +b : 0), 0);

/** Case-insensitive numeric lookup on a breakdown object (e.g. "Like"/"like"). */
function pickCI(obj: any, key: string): number | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const found = Object.keys(obj).find((k) => k.toLowerCase() === key.toLowerCase());
  return found ? obj[found] : undefined;
}

function firstMedia(media: any): string | undefined {
  if (Array.isArray(media) && media.length) {
    const m = media[0];
    return typeof m === 'string' ? m : m?.url ?? m?.image ?? m?.thumbnail ?? undefined;
  }
  return undefined;
}

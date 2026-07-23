import {
  HashtagInsight,
  KeywordInsight,
  PageInsight,
  ProviderPost,
  TimePoint,
} from '../types';

/**
 * Analytics engine. Every function derives insights from a normalized array of
 * posts and is **total**: given `[]` or malformed input it returns valid
 * zero/empty fallback objects instead of throwing. No division happens without
 * a guarded denominator, and no array op runs on a possibly-undefined value.
 */

const safeArr = (posts: ProviderPost[] | null | undefined): ProviderPost[] =>
  Array.isArray(posts) ? posts.filter(Boolean) : [];

const sum = (arr: number[]): number => arr.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);

const engagementOf = (p: ProviderPost): number =>
  (p.likes || 0) + (p.comments || 0) + (p.shares || 0);

const reachOf = (p: ProviderPost): number =>
  (p.reactions || 0) + (p.comments || 0) * 10 + (p.shares || 0) * 25 + 1000;

/** Average sentiment across posts. Returns 0 when there is nothing to average. */
export function calculateSentiment(posts: ProviderPost[]): number {
  const list = safeArr(posts).filter((p) => typeof p.sentiment === 'number');
  if (list.length === 0) return 0;
  const avg = sum(list.map((p) => p.sentiment as number)) / list.length;
  return clamp(+avg.toFixed(2), -1, 1);
}

/** Daily engagement timeline over the last `days`. Zero-filled when empty. */
export function buildTrends(posts: ProviderPost[], days = 30): TimePoint[] {
  const buckets = new Map<string, number>();
  // Seed the window so the chart always has a continuous axis.
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    buckets.set(day, 0);
  }
  for (const p of safeArr(posts)) {
    const day = toDay(p.publishedAt);
    if (buckets.has(day)) buckets.set(day, (buckets.get(day) || 0) + engagementOf(p));
  }
  return Array.from(buckets.entries()).map(([date, value]) => ({ date, value }));
}

export function getKeywordAnalytics(keyword: string, posts: ProviderPost[]): KeywordInsight {
  const list = safeArr(posts);
  if (list.length === 0) return emptyKeywordInsight(keyword);

  const engagement = sum(list.map(engagementOf));
  const reach = sum(list.map(reachOf));
  const mentions = list.length;
  const avgEngagement = engagement / mentions;

  return {
    keyword,
    mentions,
    engagement,
    reach,
    sentiment: calculateSentiment(list),
    // Heuristic 0..100 scores derived from volume/engagement, always bounded.
    popularity: clamp(Math.round(scale(mentions, 0, 500) * 100), 0, 100),
    engagementScore: clamp(Math.round(scale(avgEngagement, 0, 50000) * 100), 0, 100),
    related: deriveRelated(keyword, list),
    trend: buildTrends(list),
  };
}

export function getHashtagAnalytics(hashtag: string, posts: ProviderPost[]): HashtagInsight {
  const tag = normalizeTag(hashtag);
  const list = safeArr(posts);
  if (list.length === 0) return emptyHashtagInsight(tag);

  const engagement = sum(list.map(engagementOf));
  const timeline = buildTrends(list);

  // Top pages by summed engagement.
  const pageMap = new Map<string, number>();
  for (const p of list) {
    const name = p.pageName || 'Unknown';
    pageMap.set(name, (pageMap.get(name) || 0) + engagementOf(p));
  }
  const topPages = [...pageMap.entries()]
    .map(([name, eng]) => ({ name, engagement: eng }))
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, 5);

  const totalLikes = sum(list.map((p) => p.likes || 0));
  const totalComments = sum(list.map((p) => p.comments || 0));
  const totalShares = sum(list.map((p) => p.shares || 0));
  const totalReactions = sum(list.map((p) => p.reactions || 0));
  const distTotal = totalLikes + totalComments + totalShares + totalReactions || 1;

  return {
    hashtag: tag,
    mentions: list.length,
    engagement,
    trendingScore: clamp(Math.round(scale(engagement / list.length, 0, 50000) * 100), 0, 100),
    growth: growthFromTimeline(timeline),
    topPages,
    topPosts: [...list].sort((a, b) => engagementOf(b) - engagementOf(a)).slice(0, 6),
    engagementDistribution: [
      { bucket: 'Likes', value: Math.round((totalLikes / distTotal) * 100) },
      { bucket: 'Comments', value: Math.round((totalComments / distTotal) * 100) },
      { bucket: 'Shares', value: Math.round((totalShares / distTotal) * 100) },
      { bucket: 'Reactions', value: Math.round((totalReactions / distTotal) * 100) },
    ],
    timeline,
  };
}

export function getPageAnalytics(page: string, posts: ProviderPost[]): PageInsight {
  const list = safeArr(posts);
  if (list.length === 0) return emptyPageInsight(page);

  const engagement = sum(list.map(engagementOf));
  const n = list.length;
  const timeline = buildTrends(list);

  return {
    name: page,
    pageId: list[0]?.pageId || '',
    followers: 0, // not derivable from posts alone
    engagement,
    postingFrequency: +(n / 4).toFixed(1), // posts over a ~4 week window
    avgReactions: Math.round(sum(list.map((p) => p.reactions || 0)) / n),
    avgComments: Math.round(sum(list.map((p) => p.comments || 0)) / n),
    avgShares: Math.round(sum(list.map((p) => p.shares || 0)) / n),
    growthRate: growthFromTimeline(timeline),
  };
}

// ---- Empty fallbacks -------------------------------------------------------

export function emptyKeywordInsight(keyword: string): KeywordInsight {
  return {
    keyword,
    mentions: 0,
    engagement: 0,
    reach: 0,
    sentiment: 0,
    popularity: 0,
    engagementScore: 0,
    related: [],
    trend: buildTrends([]),
  };
}

export function emptyHashtagInsight(hashtag: string): HashtagInsight {
  return {
    hashtag: normalizeTag(hashtag),
    mentions: 0,
    engagement: 0,
    trendingScore: 0,
    growth: 0,
    topPages: [],
    topPosts: [],
    engagementDistribution: [
      { bucket: 'Likes', value: 0 },
      { bucket: 'Comments', value: 0 },
      { bucket: 'Shares', value: 0 },
      { bucket: 'Reactions', value: 0 },
    ],
    timeline: buildTrends([]),
  };
}

export function emptyPageInsight(page: string): PageInsight {
  return {
    name: page,
    pageId: '',
    followers: 0,
    engagement: 0,
    postingFrequency: 0,
    avgReactions: 0,
    avgComments: 0,
    avgShares: 0,
    growthRate: 0,
  };
}

// ---- helpers ---------------------------------------------------------------

function deriveRelated(keyword: string, posts: ProviderPost[]): string[] {
  // Surface the most common hashtags found in matching posts as related terms.
  const counts = new Map<string, number>();
  for (const p of posts) {
    const tags = (p.content || '').match(/#[\p{L}0-9_]+/gu) || [];
    for (const t of tags) {
      const k = t.toLowerCase();
      counts.set(k, (counts.get(k) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t)
    .filter((t) => t !== `#${keyword.toLowerCase()}`)
    .slice(0, 6);
}

function growthFromTimeline(timeline: TimePoint[]): number {
  if (!timeline || timeline.length < 2) return 0;
  const half = Math.floor(timeline.length / 2);
  const first = sum(timeline.slice(0, half).map((t) => t.value));
  const second = sum(timeline.slice(half).map((t) => t.value));
  if (first <= 0) return second > 0 ? 100 : 0;
  return +(((second - first) / first) * 100).toFixed(1);
}

function toDay(iso: string | undefined): string {
  const d = iso ? new Date(iso) : new Date();
  return isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
}

function normalizeTag(tag: string): string {
  const t = (tag || '').trim();
  return t.startsWith('#') ? t : `#${t}`;
}

const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));

const scale = (v: number, min: number, max: number): number =>
  max <= min ? 0 : clamp((v - min) / (max - min), 0, 1);

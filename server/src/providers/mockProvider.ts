import {
  HashtagInsight,
  KeywordInsight,
  PageInsight,
  ProviderPost,
  SearchFilters,
  SocialProvider,
  TimePoint,
} from '../types';
import { pick, randInt, seededRng } from '../utils/rng';

const PAGES = [
  'TechCrunch', 'National Geographic', 'BBC News', 'NASA', 'Nike',
  'Red Bull', 'The Economist', 'GaryVee', 'Marvel', 'Spotify',
  'Airbnb', 'Tesla Owners', 'Foodie Daily', 'Travel Insider', 'Startup Grind',
];
const LANGS = ['en', 'ar', 'es', 'fr', 'de', 'pt'];
const SAMPLE_SENTENCES = [
  'Breaking down the latest trends shaping the industry this quarter.',
  'This is exactly why community-driven growth outperforms paid reach.',
  'A thread on what actually moved the needle for us last month.',
  'The numbers are in — engagement is up across every format.',
  'Here is how the best creators are adapting to the new algorithm.',
  'We tested this for 30 days. The results surprised everyone.',
  'Everything you need to know before your next campaign launch.',
];

/**
 * Fully offline provider that produces realistic, deterministic analytics so
 * the platform is functional without a real API key. Swap for HttpProvider by
 * configuring an API key + base URL in Settings.
 */
export class MockProvider implements SocialProvider {
  readonly platform = 'facebook';

  isConfigured(): boolean {
    return true;
  }

  async testConnection() {
    return {
      ok: true,
      message: 'Mock provider active — configure a Direct API key to use live data.',
      latencyMs: randInt(seededRng('conn'), 40, 120),
    };
  }

  private buildPost(seed: string, i: number, filters: SearchFilters): ProviderPost {
    const rng = seededRng(`${seed}-post-${i}`);
    const likes = randInt(rng, 50, 90000);
    const comments = randInt(rng, 5, 12000);
    const shares = randInt(rng, 2, 20000);
    const reactions = likes + randInt(rng, 0, 15000);
    const reach = reactions + comments * 10 + shares * 25 + 1000;
    const engagementRate = +(((likes + comments + shares) / reach) * 100).toFixed(2);
    const daysAgo = randInt(rng, 0, 30);
    const published = new Date(Date.now() - daysAgo * 86400000).toISOString();
    const page = pick(rng, PAGES);
    return {
      externalId: `${seed}-${i}`,
      pageName: page,
      pageId: `pg_${Math.abs(hashCode(page))}`,
      content: `${pick(rng, SAMPLE_SENTENCES)} ${seed.startsWith('#') ? seed : '#' + seed}`,
      url: `https://facebook.com/${page.replace(/\s+/g, '')}/posts/${randInt(rng, 10000, 99999)}`,
      mediaUrl: rng() > 0.5 ? `https://picsum.photos/seed/${seed}${i}/600/400` : undefined,
      language: filters.language || pick(rng, LANGS),
      likes,
      comments,
      shares,
      reactions,
      engagementRate,
      publishedAt: published,
    };
  }

  async searchContent(query: string, filters: SearchFilters): Promise<ProviderPost[]> {
    const limit = Math.min(filters.limit || 25, 100);
    let posts = Array.from({ length: limit }, (_, i) =>
      this.buildPost(query, i, filters)
    );
    const isHashtag = query.trim().startsWith('#');
    posts = posts.map((p) => ({
      ...p,
      matchedKeyword: isHashtag ? undefined : query,
      matchedHashtag: isHashtag ? query : undefined,
    }));
    return sortPosts(posts, filters.sort);
  }

  async keywordInsight(keyword: string, filters: SearchFilters): Promise<KeywordInsight> {
    const rng = seededRng(`kw-${keyword}`);
    const related = deriveRelated(keyword, rng);
    return {
      keyword,
      mentions: randInt(rng, 1200, 480000),
      engagement: randInt(rng, 50000, 9000000),
      reach: randInt(rng, 200000, 40000000),
      sentiment: +(rng() * 2 - 1).toFixed(2),
      popularity: randInt(rng, 20, 100),
      engagementScore: randInt(rng, 30, 100),
      related,
      trend: buildTrend(`kw-${keyword}`, filters),
    };
  }

  async hashtagInsight(hashtag: string, filters: SearchFilters): Promise<HashtagInsight> {
    const tag = hashtag.startsWith('#') ? hashtag : `#${hashtag}`;
    const rng = seededRng(`ht-${tag}`);
    const topPosts = (await this.searchContent(tag, { ...filters, limit: 6, sort: 'viral' }));
    return {
      hashtag: tag,
      mentions: randInt(rng, 5000, 900000),
      engagement: randInt(rng, 100000, 20000000),
      trendingScore: randInt(rng, 40, 100),
      growth: +(rng() * 180 - 20).toFixed(1),
      topPages: Array.from({ length: 5 }, () => ({
        name: pick(rng, PAGES),
        engagement: randInt(rng, 10000, 900000),
      })),
      topPosts,
      engagementDistribution: [
        { bucket: 'Likes', value: randInt(rng, 30, 60) },
        { bucket: 'Comments', value: randInt(rng, 10, 30) },
        { bucket: 'Shares', value: randInt(rng, 10, 30) },
        { bucket: 'Reactions', value: randInt(rng, 5, 20) },
      ],
      timeline: buildTrend(`ht-${tag}`, filters),
    };
  }

  async pageInsight(page: string): Promise<PageInsight> {
    const rng = seededRng(`pg-${page}`);
    return {
      name: page,
      pageId: `pg_${Math.abs(hashCode(page))}`,
      followers: randInt(rng, 50000, 25000000),
      engagement: randInt(rng, 100000, 8000000),
      postingFrequency: randInt(rng, 3, 40),
      avgReactions: randInt(rng, 500, 90000),
      avgComments: randInt(rng, 50, 12000),
      avgShares: randInt(rng, 20, 30000),
      growthRate: +(rng() * 30 - 5).toFixed(1),
    };
  }
}

// ---- helpers ---------------------------------------------------------------

function buildTrend(seed: string, filters: SearchFilters): TimePoint[] {
  const days = 30;
  const rng = seededRng(`trend-${seed}`);
  let base = randInt(rng, 1000, 50000);
  const out: TimePoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    base = Math.max(100, base + randInt(rng, -8000, 9000));
    out.push({
      date: new Date(Date.now() - i * 86400000).toISOString().slice(0, 10),
      value: base,
    });
  }
  return out;
}

function deriveRelated(keyword: string, rng: () => number): string[] {
  const suffixes = ['trends', 'marketing', 'strategy', '2026', 'tips', 'analytics', 'growth', 'viral'];
  return Array.from({ length: 6 }, () => `${keyword} ${pick(rng, suffixes)}`);
}

function sortPosts(posts: ProviderPost[], sort?: SearchFilters['sort']): ProviderPost[] {
  const s = sort || 'engagement';
  const by: Record<string, (p: ProviderPost) => number> = {
    viral: (p) => p.shares + p.reactions,
    newest: (p) => new Date(p.publishedAt).getTime(),
    engagement: (p) => p.engagementRate,
    comments: (p) => p.comments,
    shares: (p) => p.shares,
  };
  return [...posts].sort((a, b) => by[s](b) - by[s](a));
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

import { q } from '../db';
import { SearchFilters } from '../types';

export function recordSearch(opts: {
  userId: number;
  type: 'keyword' | 'hashtag' | 'content' | 'page';
  query: string;
  filters?: SearchFilters;
  resultsCount: number;
  apiCalls?: number;
}): number {
  const info = q.run(
    `INSERT INTO searches (user_id, type, query, filters, results_count, api_calls)
     VALUES (?, ?, ?, ?, ?, ?)`,
    opts.userId,
    opts.type,
    opts.query,
    opts.filters ? JSON.stringify(opts.filters) : null,
    opts.resultsCount,
    opts.apiCalls ?? 1
  );
  return Number(info.lastInsertRowid);
}

/** Persist keyword metric snapshot for historical trend tracking. */
export function snapshotKeyword(keyword: string, mentions: number, engagement: number, reach: number, sentiment: number) {
  q.run(
    `INSERT INTO keyword_metrics (keyword, mentions, engagement, reach, sentiment)
     VALUES (?, ?, ?, ?, ?)`,
    keyword,
    mentions,
    engagement,
    reach,
    sentiment
  );
}

export function snapshotHashtag(hashtag: string, mentions: number, engagement: number, trendingScore: number, growth: number) {
  q.run(
    `INSERT INTO hashtag_metrics (hashtag, mentions, engagement, trending_score, growth)
     VALUES (?, ?, ?, ?, ?)`,
    hashtag,
    mentions,
    engagement,
    trendingScore,
    growth
  );
}

export function parseFilters(query: any): SearchFilters {
  return {
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    country: query.country,
    language: query.language,
    engagementLevel: query.engagementLevel,
    postType: query.postType,
    limit: query.limit ? Math.min(Number(query.limit), 100) : 25,
    sort: query.sort,
  };
}

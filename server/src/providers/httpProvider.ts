import {
  HashtagInsight,
  KeywordInsight,
  PageInsight,
  ProviderPost,
  SearchFilters,
  SocialProvider,
} from '../types';
import { logApiCall } from '../services/apiLog.service';

export interface HttpProviderOptions {
  baseUrl: string;
  apiKey: string;
  apiSecret?: string;
}

/**
 * Adapter for any third-party "Facebook Direct API". Because such APIs differ,
 * response mapping is kept in one place (`normalizePost`). Point `baseUrl` at
 * your provider and adjust the field mapping to match its payload. Every call
 * is timed and written to `api_logs` for the rate-limit monitor.
 */
export class HttpProvider implements SocialProvider {
  readonly platform = 'facebook';
  constructor(private opts: HttpProviderOptions) {}

  isConfigured(): boolean {
    return Boolean(this.opts.baseUrl && this.opts.apiKey);
  }

  private async request<T>(path: string, params: Record<string, any>): Promise<T> {
    const url = new URL(path, this.opts.baseUrl);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    });
    const started = Date.now();
    try {
      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${this.opts.apiKey}`,
          'x-api-key': this.opts.apiKey,
          ...(this.opts.apiSecret ? { 'x-api-secret': this.opts.apiSecret } : {}),
          Accept: 'application/json',
        },
      });
      const duration = Date.now() - started;
      logApiCall({
        endpoint: path,
        method: 'GET',
        statusCode: res.status,
        durationMs: duration,
        ok: res.ok,
        error: res.ok ? undefined : `HTTP ${res.status}`,
      });
      if (!res.ok) throw new Error(`Provider responded with HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (err: any) {
      logApiCall({
        endpoint: path,
        method: 'GET',
        statusCode: 0,
        durationMs: Date.now() - started,
        ok: false,
        error: err?.message || 'network error',
      });
      throw err;
    }
  }

  async testConnection() {
    const started = Date.now();
    try {
      await this.request('/health', {});
      return { ok: true, message: 'Connected', latencyMs: Date.now() - started };
    } catch (err: any) {
      return { ok: false, message: err?.message || 'Connection failed', latencyMs: Date.now() - started };
    }
  }

  async searchContent(query: string, filters: SearchFilters): Promise<ProviderPost[]> {
    const data = await this.request<{ data: any[] }>('/search/posts', {
      q: query,
      from: filters.dateFrom,
      to: filters.dateTo,
      country: filters.country,
      language: filters.language,
      type: filters.postType,
      limit: filters.limit || 25,
      sort: filters.sort,
    });
    return (data.data || []).map(normalizePost);
  }

  async keywordInsight(keyword: string, filters: SearchFilters): Promise<KeywordInsight> {
    return this.request<KeywordInsight>('/insights/keyword', {
      keyword,
      from: filters.dateFrom,
      to: filters.dateTo,
    });
  }

  async hashtagInsight(hashtag: string, filters: SearchFilters): Promise<HashtagInsight> {
    return this.request<HashtagInsight>('/insights/hashtag', {
      hashtag,
      from: filters.dateFrom,
      to: filters.dateTo,
    });
  }

  async pageInsight(page: string): Promise<PageInsight> {
    return this.request<PageInsight>('/insights/page', { page });
  }
}

/** Map a provider payload to our normalized ProviderPost shape. */
function normalizePost(raw: any): ProviderPost {
  const likes = num(raw.likes ?? raw.like_count);
  const comments = num(raw.comments ?? raw.comment_count);
  const shares = num(raw.shares ?? raw.share_count);
  const reactions = num(raw.reactions ?? raw.reaction_count ?? likes);
  const reach = num(raw.reach) || reactions + comments * 10 + shares * 25 + 1000;
  return {
    externalId: String(raw.id ?? raw.post_id ?? crypto.randomUUID()),
    pageName: raw.page_name ?? raw.author ?? 'Unknown',
    pageId: String(raw.page_id ?? ''),
    content: raw.message ?? raw.content ?? raw.text ?? '',
    url: raw.url ?? raw.permalink ?? '',
    mediaUrl: raw.media_url ?? raw.image ?? undefined,
    language: raw.language ?? raw.lang ?? 'en',
    likes,
    comments,
    shares,
    reactions,
    engagementRate: +(((likes + comments + shares) / reach) * 100).toFixed(2),
    publishedAt: raw.published_at ?? raw.created_time ?? new Date().toISOString(),
  };
}

const num = (v: any): number => (Number.isFinite(+v) ? Math.floor(+v) : 0);

import {
  HashtagInsight,
  KeywordInsight,
  PageInsight,
  ProviderPost,
  SearchFilters,
  SocialProvider,
} from '../types';
import { logApiCall } from '../services/apiLog.service';
import {
  getHashtagAnalytics,
  getKeywordAnalytics,
  getPageAnalytics,
} from '../services/analytics.service';
import { extractPosts, normalizeProviderPost, sortPosts } from './normalize';

export interface HttpProviderOptions {
  baseUrl: string;
  apiKey: string;
  apiSecret?: string;
  /** Path to the posts search endpoint. Defaults to apidirect.io's route. */
  postsPath?: string;
  /** Query parameter name for the search term. Defaults to `query`. */
  queryParam?: string;
  /** Pages to fetch per search (apidirect.io bills per page). 1–10. */
  pages?: number;
  /** Ask the provider for AI sentiment analysis (apidirect.io: +cost/page). */
  getSentiment?: boolean;
}

interface RequestResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

/**
 * Adapter for third-party "Facebook Direct API" providers such as apidirect.io.
 *
 * Design: these providers typically expose a single posts-search endpoint
 * (`GET /facebook/posts?query=...`) and NOT bespoke keyword/hashtag/page insight
 * endpoints. So this adapter fetches posts once and derives every insight
 * locally via the analytics service. Requests never throw — non-2xx responses
 * (401/403/404/etc.) and network errors are logged and downgraded to empty
 * results so the API layer can return safe fallbacks instead of a 500.
 */
export class HttpProvider implements SocialProvider {
  readonly platform = 'facebook';
  private readonly postsPath: string;
  private readonly queryParam: string;
  private readonly pages: number;
  private readonly getSentiment: boolean;

  constructor(private opts: HttpProviderOptions) {
    this.postsPath = opts.postsPath || '/facebook/posts';
    this.queryParam = opts.queryParam || 'query';
    // Clamp to apidirect.io's documented 1–10 range; default to 5 for volume.
    this.pages = Math.min(10, Math.max(1, Math.floor(opts.pages || 5)));
    this.getSentiment = opts.getSentiment !== false; // default on
  }

  isConfigured(): boolean {
    return Boolean(this.opts.baseUrl && this.opts.apiKey);
  }

  /** Join base URL + path without dropping a base path prefix like `/v1`. */
  private buildUrl(path: string, params: Record<string, any>): string {
    const base = (this.opts.baseUrl || '').replace(/\/+$/, '');
    const rel = String(path || '').replace(/^\/+/, '');
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      // encodeURIComponent so non-English/Arabic queries are transmitted safely.
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    return `${base}/${rel}${qs ? `?${qs}` : ''}`;
  }

  /** Perform a GET that resolves to a structured result and never rejects. */
  private async request<T = any>(path: string, params: Record<string, any>): Promise<RequestResult<T>> {
    const url = this.buildUrl(path, params);
    const started = Date.now();
    try {
      const res = await fetch(url, {
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

      if (!res.ok) {
        console.warn(
          `[HttpProvider] ${path} returned HTTP ${res.status} — downgrading to empty result.`
        );
        return { ok: false, status: res.status, data: null, error: `HTTP ${res.status}` };
      }

      const json = (await res.json().catch(() => null)) as T | null;
      return { ok: true, status: res.status, data: json };
    } catch (err: any) {
      const message = err?.message || 'network error';
      logApiCall({
        endpoint: path,
        method: 'GET',
        statusCode: 0,
        durationMs: Date.now() - started,
        ok: false,
        error: message,
      });
      console.warn(`[HttpProvider] ${path} request failed: ${message} — returning empty result.`);
      return { ok: false, status: 0, data: null, error: message };
    }
  }

  async testConnection() {
    const started = Date.now();
    const result = await this.request<any>(this.postsPath, { [this.queryParam]: 'test', limit: 1 });
    const latencyMs = Date.now() - started;
    if (result.ok) {
      return { ok: true, message: 'Connected to provider', latencyMs };
    }
    const hint =
      result.status === 401 || result.status === 403
        ? 'Authentication failed — check your API key.'
        : result.status === 404
        ? 'Endpoint not found — check your Base URL and posts path.'
        : result.error || 'Connection failed';
    return { ok: false, message: hint, latencyMs };
  }

  /**
   * Fetch and normalize posts for a query. Always returns an array.
   * Sends apidirect.io's documented parameters — crucially `pages` (not
   * `limit`) drives how many results come back, so we request several pages
   * to maximise volume. Result sorting is applied locally to honour the
   * explorer's sort options (viral / engagement / comments / shares).
   */
  async searchContent(query: string, filters: SearchFilters): Promise<ProviderPost[]> {
    const result = await this.request<any>(this.postsPath, {
      [this.queryParam]: query,
      pages: this.pages,
      start_date: filters.dateFrom,
      end_date: filters.dateTo,
      location_id: filters.country,
      sort_by: filters.sort === 'newest' ? 'most_recent' : 'relevance',
      get_sentiment: this.getSentiment ? 'true' : undefined,
      // Also send generic aliases so alternative providers still work.
      from: filters.dateFrom,
      to: filters.dateTo,
      language: filters.language,
      limit: filters.limit,
    });
    const rows = extractPosts(result.data);
    const isHashtag = String(query).trim().startsWith('#');
    const posts = rows.map((raw) => {
      const post = normalizeProviderPost(raw);
      return {
        ...post,
        matchedKeyword: isHashtag ? undefined : query,
        matchedHashtag: isHashtag ? query : undefined,
      };
    });
    return sortPosts(posts, filters.sort);
  }

  // Insights are derived from the posts endpoint (see class docs), so an empty
  // or failed fetch yields a valid zero-value insight rather than an error.
  async keywordInsight(keyword: string, filters: SearchFilters): Promise<KeywordInsight> {
    const posts = await this.searchContent(keyword, { ...filters, limit: filters.limit || 50 });
    return getKeywordAnalytics(keyword, posts);
  }

  async hashtagInsight(hashtag: string, filters: SearchFilters): Promise<HashtagInsight> {
    const tag = String(hashtag).trim().startsWith('#') ? hashtag : `#${hashtag}`;
    const posts = await this.searchContent(tag, { ...filters, limit: filters.limit || 50 });
    return getHashtagAnalytics(tag, posts);
  }

  async pageInsight(page: string): Promise<PageInsight> {
    const posts = await this.searchContent(page, { limit: 50 });
    return getPageAnalytics(page, posts);
  }
}

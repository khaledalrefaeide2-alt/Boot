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

export interface HttpProviderOptions {
  baseUrl: string;
  apiKey: string;
  apiSecret?: string;
  /** Path to the posts search endpoint. Defaults to apidirect.io's route. */
  postsPath?: string;
  /** Query parameter name for the search term. Defaults to `query`. */
  queryParam?: string;
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

  constructor(private opts: HttpProviderOptions) {
    this.postsPath = opts.postsPath || '/facebook/posts';
    this.queryParam = opts.queryParam || 'query';
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

  /** Fetch and normalize posts for a query. Always returns an array. */
  async searchContent(query: string, filters: SearchFilters): Promise<ProviderPost[]> {
    const result = await this.request<any>(this.postsPath, {
      [this.queryParam]: query,
      from: filters.dateFrom,
      to: filters.dateTo,
      country: filters.country,
      language: filters.language,
      type: filters.postType,
      limit: filters.limit || 25,
      sort: filters.sort,
    });
    const rows = extractPosts(result.data);
    const isHashtag = String(query).trim().startsWith('#');
    return rows.map((raw) => {
      const post = normalizePost(raw);
      return {
        ...post,
        matchedKeyword: isHashtag ? undefined : query,
        matchedHashtag: isHashtag ? query : undefined,
      };
    });
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

/** Pull the posts array out of the many shapes providers wrap it in. */
function extractPosts(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  return (
    payload.data ??
    payload.posts ??
    payload.results ??
    payload.items ??
    payload.result ??
    []
  ) as any[];
}

/**
 * Map an apidirect.io (or similar) payload to our normalized ProviderPost.
 * Tolerates missing fields — never throws — and understands apidirect.io's
 * `post_id`, `message`, `date`, `reactions` and `sentiment` fields.
 */
function normalizePost(raw: any): ProviderPost {
  const r = raw && typeof raw === 'object' ? raw : {};

  // apidirect.io returns `reactions` either as a number or a breakdown object.
  const reactionsField = r.reactions ?? r.reaction_count;
  const reactionsFromObj =
    reactionsField && typeof reactionsField === 'object'
      ? sumValues(reactionsField)
      : num(reactionsField);

  const likes = num(r.likes ?? r.like_count ?? (typeof reactionsField === 'object' ? reactionsField.like : undefined));
  const comments = num(r.comments ?? r.comment_count ?? r.comments_count);
  const shares = num(r.shares ?? r.share_count ?? r.shares_count);
  const reactions = reactionsFromObj || likes;
  const reach = num(r.reach) || reactions + comments * 10 + shares * 25 + 1000;
  const denom = reach || 1;

  return {
    externalId: String(r.post_id ?? r.id ?? r._id ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`),
    pageName: r.page_name ?? r.page ?? r.author ?? r.from?.name ?? 'Unknown',
    pageId: String(r.page_id ?? r.from?.id ?? ''),
    content: r.message ?? r.content ?? r.text ?? r.caption ?? '',
    url: r.url ?? r.permalink ?? r.link ?? r.post_url ?? '',
    mediaUrl: r.media_url ?? r.image ?? r.picture ?? r.thumbnail ?? undefined,
    language: r.language ?? r.lang ?? 'en',
    likes,
    comments,
    shares,
    reactions,
    engagementRate: +(((likes + comments + shares) / denom) * 100).toFixed(2),
    sentiment: parseSentiment(r.sentiment ?? r.sentiment_score),
    publishedAt: parseDate(r.date ?? r.published_at ?? r.created_time ?? r.created_at ?? r.timestamp),
  };
}

/** Convert varied sentiment encodings to a -1..1 number, or undefined. */
function parseSentiment(v: any): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(-1, Math.min(1, v));
  if (typeof v === 'object') return parseSentiment(v.score ?? v.value ?? v.label);
  const s = String(v).toLowerCase().trim();
  if (['positive', 'pos', 'good'].includes(s)) return 1;
  if (['negative', 'neg', 'bad'].includes(s)) return -1;
  if (['neutral', 'neu', 'mixed'].includes(s)) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : undefined;
}

/** Parse a date field (ISO string, unix seconds, or ms) to an ISO string. */
function parseDate(v: any): string {
  if (v === undefined || v === null || v === '') return new Date().toISOString();
  if (typeof v === 'number') {
    const ms = v < 1e12 ? v * 1000 : v; // treat < 1e12 as unix seconds
    const d = new Date(ms);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

const num = (v: any): number => (Number.isFinite(+v) ? Math.floor(+v) : 0);

const sumValues = (obj: Record<string, any>): number =>
  Object.values(obj).reduce((a: number, b) => a + (Number.isFinite(+b) ? +b : 0), 0);

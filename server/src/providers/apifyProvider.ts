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

export interface ApifyProviderOptions {
  token: string;
  /** Actor id, e.g. "easyapi/facebook-hashtag-search-scraper". */
  actor: string;
  /** JSON input template; `{{query}}` is replaced with the search term. */
  inputTemplate?: string;
  /** Max dataset items to request. */
  resultsLimit?: number;
}

const APIFY_BASE = 'https://api.apify.com/v2';
// Default matches easyapi/facebook-hashtag-search-scraper input schema.
const DEFAULT_TEMPLATE = '{"searchQuery":"{{query}}","maxItems":{{limit}}}';

/**
 * Provider backed by the Apify platform. It runs an actor synchronously and
 * reads its dataset:
 *   POST /v2/acts/{actor}/run-sync-get-dataset-items?token=...
 * The actor id and its JSON input are fully configurable from Settings, so any
 * Apify Facebook actor works — the default targets
 * easyapi/facebook-hashtag-search-scraper. Requests never throw; failures are
 * logged and downgraded to empty results.
 */
export class ApifyProvider implements SocialProvider {
  readonly platform = 'facebook';
  private readonly actorPath: string;
  private readonly template: string;
  private readonly resultsLimit: number;

  constructor(private opts: ApifyProviderOptions) {
    // Apify's API uses `~` between username and actor name.
    this.actorPath = (opts.actor || 'easyapi/facebook-hashtag-search-scraper').replace('/', '~');
    this.template = opts.inputTemplate || DEFAULT_TEMPLATE;
    this.resultsLimit = Math.max(1, Math.min(1000, Math.floor(opts.resultsLimit || 50)));
  }

  isConfigured(): boolean {
    return Boolean(this.opts.token && this.actorPath);
  }

  /** Build the actor input JSON from the template, safely embedding the query. */
  private buildInput(query: string): any {
    // Hashtag actors expect bare tags; drop a leading '#'.
    const term = String(query).trim().replace(/^#/, '');
    const escaped = JSON.stringify(term).slice(1, -1); // JSON-safe, no outer quotes
    const filled = this.template
      .replace(/\{\{query\}\}/g, escaped)
      .replace(/\{\{limit\}\}/g, String(this.resultsLimit));
    try {
      return JSON.parse(filled);
    } catch {
      console.warn('[ApifyProvider] invalid input template, falling back to default.');
      return { searchQuery: term, maxItems: this.resultsLimit };
    }
  }

  async searchContent(query: string, filters: SearchFilters): Promise<ProviderPost[]> {
    const path = `/acts/${this.actorPath}/run-sync-get-dataset-items`;
    const url = `${APIFY_BASE}${path}?token=${encodeURIComponent(this.opts.token)}&limit=${this.resultsLimit}`;
    const input = this.buildInput(query);
    const started = Date.now();
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(input),
      });
      logApiCall({
        endpoint: path,
        method: 'POST',
        statusCode: res.status,
        durationMs: Date.now() - started,
        ok: res.ok,
        error: res.ok ? undefined : `HTTP ${res.status}`,
      });
      if (!res.ok) {
        console.warn(`[ApifyProvider] ${this.actorPath} returned HTTP ${res.status} — empty result.`);
        return [];
      }
      const json = await res.json().catch(() => null);
      const rows = extractPosts(json);
      const isHashtag = String(query).trim().startsWith('#');
      const posts = rows.map((raw) => ({
        ...normalizeProviderPost(raw),
        matchedKeyword: isHashtag ? undefined : query,
        matchedHashtag: isHashtag ? (query.startsWith('#') ? query : `#${query}`) : undefined,
      }));
      return sortPosts(posts, filters.sort);
    } catch (err: any) {
      logApiCall({
        endpoint: path,
        method: 'POST',
        statusCode: 0,
        durationMs: Date.now() - started,
        ok: false,
        error: err?.message || 'network error',
      });
      console.warn(`[ApifyProvider] request failed: ${err?.message} — returning empty result.`);
      return [];
    }
  }

  async testConnection() {
    const started = Date.now();
    const path = `/acts/${this.actorPath}`;
    try {
      const res = await fetch(`${APIFY_BASE}${path}?token=${encodeURIComponent(this.opts.token)}`, {
        headers: { Accept: 'application/json' },
      });
      logApiCall({ endpoint: path, method: 'GET', statusCode: res.status, durationMs: Date.now() - started, ok: res.ok });
      if (res.ok) return { ok: true, message: `Actor ${this.opts.actor} reachable`, latencyMs: Date.now() - started };
      const msg =
        res.status === 401 ? 'Invalid Apify token.' : res.status === 404 ? 'Actor not found — check the actor id.' : `HTTP ${res.status}`;
      return { ok: false, message: msg, latencyMs: Date.now() - started };
    } catch (err: any) {
      return { ok: false, message: err?.message || 'Connection failed', latencyMs: Date.now() - started };
    }
  }

  async keywordInsight(keyword: string, filters: SearchFilters): Promise<KeywordInsight> {
    return getKeywordAnalytics(keyword, await this.searchContent(keyword, filters));
  }

  async hashtagInsight(hashtag: string, filters: SearchFilters): Promise<HashtagInsight> {
    const tag = String(hashtag).trim().startsWith('#') ? hashtag : `#${hashtag}`;
    return getHashtagAnalytics(tag, await this.searchContent(tag, filters));
  }

  async pageInsight(page: string): Promise<PageInsight> {
    return getPageAnalytics(page, await this.searchContent(page, {}));
  }
}

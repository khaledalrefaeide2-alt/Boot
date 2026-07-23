import { ApifyProvider } from '../providers/apifyProvider';
import { HttpProvider } from '../providers/httpProvider';
import { MockProvider } from '../providers/mockProvider';
import { SocialProvider } from '../types';
import { getApiConfig } from './settings.service';

const mock = new MockProvider();

/**
 * Returns the active provider based on Settings. If a real API is configured
 * (provider=http with a base URL + key) the HttpProvider is used; otherwise the
 * offline MockProvider keeps the platform fully functional.
 *
 * The interface is platform-agnostic, so Instagram / Threads / X / YouTube /
 * TikTok / LinkedIn / Reddit adapters can be added here without touching routes.
 */
export function getProvider(): SocialProvider {
  const cfg = getApiConfig();
  if (cfg.provider === 'apify' && cfg.apifyToken) {
    return new ApifyProvider({
      token: cfg.apifyToken,
      actor: cfg.apifyActor,
      inputTemplate: cfg.apifyInput || undefined,
      resultsLimit: cfg.apifyResultsLimit,
    });
  }
  if (cfg.provider === 'http' && cfg.baseUrl && cfg.apiKey) {
    return new HttpProvider({
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      apiSecret: cfg.apiSecret,
      postsPath: cfg.postsPath,
      queryParam: cfg.queryParam,
      pages: cfg.pages,
      getSentiment: cfg.getSentiment,
    });
  }
  return mock;
}

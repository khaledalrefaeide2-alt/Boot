import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncH } from '../middleware/error';
import { recentApiLogs, apiUsageStats } from '../services/apiLog.service';
import { audit } from '../services/audit.service';
import { getPublicSettings, getApiConfig, setSetting } from '../services/settings.service';
import { HttpProvider } from '../providers/httpProvider';
import { getProvider } from '../services/provider.factory';

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

settingsRouter.get(
  '/',
  asyncH(async (_req, res) => {
    res.json({ settings: getPublicSettings() });
  })
);

// General + theme + language settings (non-secret).
settingsRouter.put(
  '/',
  requireRole('editor'),
  asyncH(async (req, res) => {
    const schema = z.record(z.string(), z.string());
    const body = schema.parse(req.body);
    for (const [k, v] of Object.entries(body)) setSetting(k, v);
    audit(req.user!.id, 'settings.update', Object.keys(body).join(','), req.ip);
    res.json({ settings: getPublicSettings() });
  })
);

// API connection configuration.
settingsRouter.put(
  '/api',
  requireRole('editor'),
  asyncH(async (req, res) => {
    const schema = z.object({
      provider: z.enum(['mock', 'http']),
      baseUrl: z.string().url().optional().or(z.literal('')),
      apiKey: z.string().optional(),
      apiSecret: z.string().optional(),
    });
    const b = schema.parse(req.body);
    setSetting('api.provider', b.provider);
    if (b.baseUrl !== undefined) setSetting('api.baseUrl', b.baseUrl);
    // Only overwrite secrets when a non-masked value is supplied.
    if (b.apiKey && !b.apiKey.includes('••')) setSetting('api.apiKey', b.apiKey);
    if (b.apiSecret && !b.apiSecret.includes('••')) setSetting('api.apiSecret', b.apiSecret);
    audit(req.user!.id, 'settings.api.update', `provider=${b.provider}`, req.ip);
    res.json({ settings: getPublicSettings() });
  })
);

// Test the current API connection.
settingsRouter.post(
  '/api/test',
  asyncH(async (_req, res) => {
    const cfg = getApiConfig();
    if (cfg.provider === 'http' && cfg.baseUrl && cfg.apiKey) {
      const provider = new HttpProvider({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, apiSecret: cfg.apiSecret });
      res.json(await provider.testConnection());
    } else {
      res.json(await getProvider().testConnection());
    }
  })
);

settingsRouter.post(
  '/api/disconnect',
  requireRole('editor'),
  asyncH(async (req, res) => {
    setSetting('api.provider', 'mock');
    audit(req.user!.id, 'settings.api.disconnect', undefined, req.ip);
    res.json({ ok: true, settings: getPublicSettings() });
  })
);

settingsRouter.get(
  '/api/logs',
  asyncH(async (_req, res) => {
    res.json({ logs: recentApiLogs(100), usage: apiUsageStats() });
  })
);

settingsRouter.get(
  '/api/status',
  asyncH(async (_req, res) => {
    const cfg = getApiConfig();
    res.json({
      provider: cfg.provider,
      connected: cfg.provider === 'mock' || Boolean(cfg.baseUrl && cfg.apiKey),
      baseUrl: cfg.baseUrl || null,
      usage: apiUsageStats(),
    });
  })
);

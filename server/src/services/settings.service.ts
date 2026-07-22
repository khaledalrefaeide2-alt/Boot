import { q } from '../db';
import { decryptSecret, encryptSecret, maskSecret } from '../utils/crypto';

interface SettingRow {
  key: string;
  value: string | null;
  is_secret: number;
  updated_at: string;
}

const SECRET_KEYS = new Set(['api.apiKey', 'api.apiSecret']);

export function setSetting(key: string, value: string): void {
  const isSecret = SECRET_KEYS.has(key) ? 1 : 0;
  const stored = isSecret && value ? encryptSecret(value) : value;
  q.run(
    `INSERT INTO settings (key, value, is_secret, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value,
       is_secret = excluded.is_secret, updated_at = datetime('now')`,
    key,
    stored,
    isSecret
  );
}

/** Raw decrypted value — for internal use only (never send secrets to client). */
export function getSettingRaw(key: string): string {
  const row = q.get<SettingRow>('SELECT * FROM settings WHERE key = ?', key);
  if (!row || row.value == null) return '';
  return row.is_secret ? decryptSecret(row.value) : row.value;
}

/** All settings, with secret values masked for safe transport to the client. */
export function getPublicSettings(): Record<string, string> {
  const rows = q.all<SettingRow>('SELECT * FROM settings');
  const out: Record<string, string> = {};
  for (const r of rows) {
    if (r.is_secret) {
      const dec = r.value ? decryptSecret(r.value) : '';
      out[r.key] = maskSecret(dec);
    } else {
      out[r.key] = r.value ?? '';
    }
  }
  return out;
}

export function getApiConfig() {
  return {
    baseUrl: getSettingRaw('api.baseUrl'),
    apiKey: getSettingRaw('api.apiKey'),
    apiSecret: getSettingRaw('api.apiSecret'),
    provider: getSettingRaw('api.provider') || 'mock',
  };
}

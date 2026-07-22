import crypto from 'crypto';
import { config } from '../config';

const ALGO = 'aes-256-gcm';

function keyBuffer(): Buffer {
  const raw = config.settingsEncryptionKey;
  // Accept hex (64 chars) or fall back to a sha256 of whatever was provided.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  return crypto.createHash('sha256').update(raw).digest();
}

/** Encrypt a plaintext string. Returns "iv:tag:ciphertext" (all base64). */
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, keyBuffer(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

/** Decrypt a value produced by encryptSecret. Returns '' if it can't be decrypted. */
export function decryptSecret(payload: string): string {
  try {
    const [ivB64, tagB64, dataB64] = payload.split(':');
    if (!ivB64 || !tagB64 || !dataB64) return '';
    const decipher = crypto.createDecipheriv(
      ALGO,
      keyBuffer(),
      Buffer.from(ivB64, 'base64')
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]);
    return dec.toString('utf8');
  } catch {
    return '';
  }
}

/** Mask a secret for display, e.g. "sk_live_1234********cdef". */
export function maskSecret(secret: string): string {
  if (!secret) return '';
  if (secret.length <= 8) return '••••••••';
  return `${secret.slice(0, 4)}••••••••${secret.slice(-4)}`;
}

import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const bool = (v: string | undefined, def = false) =>
  v === undefined ? def : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());

export const config = {
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: parseInt(process.env.PORT || '4000', 10),
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  jwt: {
    secret: process.env.JWT_SECRET || 'insecure-dev-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  db: {
    client: (process.env.DB_CLIENT || 'sqlite') as 'sqlite' | 'postgres',
    sqlitePath: path.resolve(
      process.cwd(),
      process.env.SQLITE_PATH || './data/fbintel.db'
    ),
    databaseUrl: process.env.DATABASE_URL || '',
  },
  // 32-byte key for encrypting sensitive settings (API keys) at rest.
  settingsEncryptionKey:
    process.env.SETTINGS_ENCRYPTION_KEY ||
    '0000000000000000000000000000000000000000000000000000000000000000',
  seed: {
    adminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@fbintel.local',
    adminPassword: process.env.SEED_ADMIN_PASSWORD || 'Admin123!',
  },
  verbose: bool(process.env.VERBOSE, false),
};

export type AppConfig = typeof config;

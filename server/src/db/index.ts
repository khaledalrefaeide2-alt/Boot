import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

/**
 * SQLite is the default local database. PostgreSQL is supported as an optional
 * upgrade — the query surface used by the services is intentionally small and
 * centralised so a Postgres adapter can be dropped in behind the same helpers.
 */

let db: Database.Database;

export function getDb(): Database.Database {
  if (db) return db;
  const dir = path.dirname(config.db.sqlitePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  db = new Database(config.db.sqlitePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

export function initSchema(): void {
  const schema = fs.readFileSync(
    path.join(__dirname, 'schema.sql'),
    'utf8'
  );
  getDb().exec(schema);
}

/** Convenience helpers so route code stays terse and consistent. */
export const q = {
  all<T = any>(sql: string, ...params: any[]): T[] {
    return getDb().prepare(sql).all(...params) as T[];
  },
  get<T = any>(sql: string, ...params: any[]): T | undefined {
    return getDb().prepare(sql).get(...params) as T | undefined;
  },
  run(sql: string, ...params: any[]): Database.RunResult {
    return getDb().prepare(sql).run(...params);
  },
};

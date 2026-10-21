import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

/** Absolute path of the app-state database (conversations). */
export const APP_DB_PATH = path.join(REPO_ROOT, 'data', 'app.db');

/** Absolute path of the queried dataset and its metadata, created by `npm run seed`. */
export const DATA_DB_PATH = path.join(REPO_ROOT, 'data', 'data.db');

/** Opens (and creates, if missing) a SQLite database file. Pass ':memory:' for tests. */
export function openDatabase(file: string): DatabaseSync {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  return new DatabaseSync(file);
}

/** The largest string or blob a read-only connection produces, in bytes (UTF-8 for text). */
export const MAX_VALUE_LENGTH = 1_000_000;

/**
 * Opens an existing database read-only, so SQLite itself rejects any write to the file.
 * Temp tables are still allowed, so code that runs untrusted SQL must also check the
 * statement. A value longer than MAX_VALUE_LENGTH fails with "string or blob too big":
 * SQLite's own limit (1 GB) lets through values that crash Node. Never creates the file.
 */
export function openReadOnlyDatabase(file: string): DatabaseSync {
  if (!existsSync(file)) {
    throw new Error(`Database not found at ${file}. Run \`npm run seed\` to create it.`);
  }
  return new DatabaseSync(file, { readOnly: true, limits: { length: MAX_VALUE_LENGTH } });
}

export function sqliteVersion(db: DatabaseSync): string {
  const row = db.prepare('SELECT sqlite_version() AS version').get() as { version: string };
  return row.version;
}

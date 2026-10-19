import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** Absolute path of the app-state database (conversations), relative to the repo root. */
export const APP_DB_PATH = path.resolve(import.meta.dirname, '../../data/app.db');

/** Opens (and creates, if missing) a SQLite database file. Pass ':memory:' for tests. */
export function openDatabase(file: string): DatabaseSync {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  return new DatabaseSync(file);
}

export function sqliteVersion(db: DatabaseSync): string {
  const row = db.prepare('SELECT sqlite_version() AS version').get() as { version: string };
  return row.version;
}

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { APP_DB_PATH, openDatabase, sqliteVersion } from './db.ts';

describe('openDatabase', () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  });

  it('opens an in-memory database without touching the filesystem', () => {
    const db = openDatabase(':memory:');
    expect(db.isOpen).toBe(true);
    db.close();
  });

  it('creates missing parent folders and the database file', () => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'utdt-db-'));
    const file = path.join(tempDir, 'nested', 'app.db');

    const db = openDatabase(file);
    db.close();

    expect(existsSync(file)).toBe(true);
  });
});

describe('sqliteVersion', () => {
  it('returns the SQLite library version', () => {
    const db = openDatabase(':memory:');
    expect(sqliteVersion(db)).toMatch(/^\d+\.\d+\.\d+$/);
    db.close();
  });
});

describe('APP_DB_PATH', () => {
  it('points at data/app.db in the repo root', () => {
    const root = path.dirname(path.dirname(APP_DB_PATH));
    const rootPackage = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

    expect(path.relative(root, APP_DB_PATH)).toBe(path.join('data', 'app.db'));
    expect(rootPackage.workspaces).toContain('backend');
  });
});

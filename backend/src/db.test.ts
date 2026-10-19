import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  APP_DB_PATH,
  DATA_DB_PATH,
  openDatabase,
  openReadOnlyDatabase,
  sqliteVersion,
} from './db.ts';

let tempDir: string | undefined;

function makeTempDir(): string {
  tempDir = mkdtempSync(path.join(tmpdir(), 'utdt-db-'));
  return tempDir;
}

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

describe('openDatabase', () => {
  it('opens an in-memory database without touching the filesystem', () => {
    const db = openDatabase(':memory:');
    expect(db.isOpen).toBe(true);
    db.close();
  });

  it('creates missing parent folders and the database file', () => {
    const file = path.join(makeTempDir(), 'nested', 'app.db');

    const db = openDatabase(file);
    db.close();

    expect(existsSync(file)).toBe(true);
  });
});

describe('openReadOnlyDatabase', () => {
  it('reads an existing database but rejects writes', () => {
    const file = path.join(makeTempDir(), 'data.db');
    const writer = openDatabase(file);
    writer.exec('CREATE TABLE t (x INTEGER); INSERT INTO t VALUES (1);');
    writer.close();

    const db = openReadOnlyDatabase(file);
    try {
      expect(db.prepare('SELECT x FROM t').get()).toEqual({ x: 1 });
      expect(() => db.exec('INSERT INTO t VALUES (2)')).toThrow(/readonly/);
      expect(() => db.exec('CREATE TABLE u (y INTEGER)')).toThrow(/readonly/);
    } finally {
      db.close();
    }
  });

  it('fails with the path and a hint to run the seed, without creating the file', () => {
    const file = path.join(makeTempDir(), 'missing.db');

    expect(() => openReadOnlyDatabase(file)).toThrow(file);
    expect(() => openReadOnlyDatabase(file)).toThrow('npm run seed');
    expect(existsSync(file)).toBe(false);
  });
});

describe('sqliteVersion', () => {
  it('returns the SQLite library version', () => {
    const db = openDatabase(':memory:');
    expect(sqliteVersion(db)).toMatch(/^\d+\.\d+\.\d+$/);
    db.close();
  });
});

describe.each([
  ['APP_DB_PATH', APP_DB_PATH, 'app.db'],
  ['DATA_DB_PATH', DATA_DB_PATH, 'data.db'],
])('%s', (_name, dbPath, fileName) => {
  it(`points at data/${fileName} in the repo root`, () => {
    const root = path.dirname(path.dirname(dbPath));
    const rootPackage = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

    expect(path.relative(root, dbPath)).toBe(path.join('data', fileName));
    expect(rootPackage.workspaces).toContain('backend');
  });
});

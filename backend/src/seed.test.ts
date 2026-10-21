import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase, openReadOnlyDatabase } from './db.ts';
import { type Dataset, seedDatabase, seedFile } from './seed.ts';

// A tiny dataset with neutral names: the seed must work for any dataset, not only the demo.
const fixture: Dataset = {
  schema: `
    CREATE TABLE widgets (widget_id INTEGER PRIMARY KEY, label TEXT NOT NULL);
    CREATE TABLE parts (
      part_id INTEGER PRIMARY KEY,
      widget_id INTEGER NOT NULL REFERENCES widgets (widget_id)
    );
  `,
  data: [
    {
      table: 'widgets',
      columns: ['widget_id', 'label'],
      rows: [
        [1, 'alpha'],
        [2, 'beta'],
      ],
    },
    {
      table: 'parts',
      columns: ['part_id', 'widget_id'],
      rows: [
        [10, 1],
        [11, 2],
      ],
    },
  ],
  metadata: {
    tables: [
      { tableName: 'widgets', description: 'Widgets.' },
      { tableName: 'parts', description: 'Parts of a widget.' },
    ],
    columns: [
      { tableName: 'widgets', columnName: 'widget_id', dataType: 'INTEGER', description: 'Id.' },
      { tableName: 'widgets', columnName: 'label', dataType: 'TEXT', description: 'Label.' },
      { tableName: 'parts', columnName: 'part_id', dataType: 'INTEGER', description: 'Id.' },
      { tableName: 'parts', columnName: 'widget_id', dataType: 'INTEGER', description: 'Owner.' },
    ],
    relationships: [
      {
        fromTable: 'parts',
        fromColumn: 'widget_id',
        toTable: 'widgets',
        toColumn: 'widget_id',
        description: 'The widget a part belongs to.',
      },
    ],
  },
};

// The last data row points at a widget that doesn't exist, so the load fails after most
// tables and rows are already in.
const invalidFixture: Dataset = {
  ...fixture,
  data: [
    fixture.data[0],
    {
      ...fixture.data[1],
      rows: [
        [10, 1],
        [11, 99],
      ],
    },
  ],
};

function count(db: DatabaseSync, table: string): number {
  return (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
}

function tableNames(db: DatabaseSync): string[] {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all();
  return rows.map((r) => r.name as string);
}

/** The whole content of a database file: its schema plus every row, in rowid order. */
function dump(file: string): unknown {
  const db = openReadOnlyDatabase(file);
  try {
    const schema = db
      .prepare('SELECT type, name, sql FROM sqlite_master ORDER BY type, name')
      .all();
    const rows = Object.fromEntries(
      tableNames(db).map((t) => [t, db.prepare(`SELECT * FROM "${t}" ORDER BY rowid`).all()]),
    );
    return { schema, rows };
  } finally {
    db.close();
  }
}

describe('seedDatabase', () => {
  it('loads the metadata tables, the schema, the rows and the metadata', () => {
    const db = openDatabase(':memory:');

    seedDatabase(db, fixture);

    expect(tableNames(db)).toEqual([
      'meta_columns',
      'meta_relationships',
      'meta_tables',
      'parts',
      'widgets',
    ]);
    expect(count(db, 'widgets')).toBe(2);
    expect(count(db, 'parts')).toBe(2);
    expect(count(db, 'meta_tables')).toBe(2);
    expect(count(db, 'meta_columns')).toBe(4);
    expect(count(db, 'meta_relationships')).toBe(1);
    db.close();
  });

  it('rolls everything back when the load fails halfway', () => {
    const db = openDatabase(':memory:');

    expect(() => seedDatabase(db, invalidFixture)).toThrow(/FOREIGN KEY/);

    expect(tableNames(db)).toEqual([]);
    expect(db.isTransaction).toBe(false);
    db.close();
  });

  it('rethrows the original error when SQLite already ended the transaction', () => {
    const db = openDatabase(':memory:');
    // The schema ends the transaction itself, then fails: there's nothing left to roll back.
    const endsTransaction: Dataset = { ...fixture, schema: 'ROLLBACK; CREATE TABLE broken (' };

    expect(() => seedDatabase(db, endsTransaction)).toThrow(/syntax error|incomplete input/);
    expect(db.isTransaction).toBe(false);
    db.close();
  });
});

describe('seedFile', () => {
  let tempDir: string;

  function tempFile(...segments: string[]): string {
    tempDir = mkdtempSync(path.join(tmpdir(), 'utdt-seed-'));
    return path.join(tempDir, ...segments);
  }

  afterEach(() => rmSync(tempDir, { recursive: true, force: true }));

  it('creates missing parent folders and the seeded file', () => {
    const file = tempFile('nested', 'data.db');

    seedFile(file, fixture);

    const db = openReadOnlyDatabase(file);
    expect(count(db, 'widgets')).toBe(2);
    db.close();
  });

  it('recreates the file from scratch, dropping anything added by hand', () => {
    const file = tempFile('data.db');
    seedFile(file, fixture);
    const firstRun = dump(file);

    const db = openDatabase(file);
    db.exec(`
      CREATE TABLE extra (x INTEGER);
      INSERT INTO meta_tables VALUES ('extra', 'Added by hand.');
      INSERT INTO widgets VALUES (3, 'gamma');
    `);
    db.close();
    seedFile(file, fixture);

    expect(dump(file)).toEqual(firstRun);
  });

  it('deletes leftover journal files so they are not replayed', () => {
    const file = tempFile('data.db');
    writeFileSync(`${file}-journal`, 'stale');

    seedFile(file, fixture);

    expect(existsSync(`${file}-journal`)).toBe(false);
  });

  it('propagates a failed load and leaves no file behind, so opening it says to seed', () => {
    const file = tempFile('data.db');
    seedFile(file, fixture);

    expect(() => seedFile(file, invalidFixture)).toThrow(/FOREIGN KEY/);

    // The file could only be removed because the seed closed its connection first
    // (Windows refuses to delete an open file).
    expect(existsSync(file)).toBe(false);
    expect(() => openReadOnlyDatabase(file)).toThrow('npm run seed');
  });
});

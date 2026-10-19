import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from './db.ts';
import { createMetadataTables, insertMetadata, type Metadata } from './metadata.ts';

interface ColumnInfo {
  name: string;
  type: string;
  notnull: number;
  pk: number;
}

const EXPECTED_COLUMNS = {
  meta_tables: ['table_name', 'description'],
  meta_columns: ['table_name', 'column_name', 'data_type', 'description'],
  meta_relationships: ['from_table', 'from_column', 'to_table', 'to_column', 'description'],
};

const metadata: Metadata = {
  tables: [
    { tableName: 'b_table', description: 'Second alphabetically, first loaded.' },
    { tableName: 'a_table', description: 'First alphabetically, second loaded.' },
  ],
  columns: [
    { tableName: 'b_table', columnName: 'z', dataType: 'TEXT', description: 'Loaded first.' },
    { tableName: 'b_table', columnName: 'a', dataType: 'INTEGER', description: 'Loaded second.' },
  ],
  relationships: [
    {
      fromTable: 'b_table',
      fromColumn: 'a',
      toTable: 'a_table',
      toColumn: 'id',
      description: 'Links b to a.',
    },
  ],
};

describe('createMetadataTables', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = openDatabase(':memory:');
    createMetadataTables(db);
  });

  afterEach(() => db.close());

  it.each(Object.entries(EXPECTED_COLUMNS))(
    'creates %s with exactly its columns, all TEXT NOT NULL',
    (table, columns) => {
      const info = db
        .prepare('SELECT * FROM pragma_table_info(?)')
        .all(table) as unknown as ColumnInfo[];

      expect(info.map((c) => c.name)).toEqual(columns);
      expect(info.every((c) => c.type === 'TEXT' && c.notnull === 1)).toBe(true);
    },
  );

  it.each([
    ['meta_tables', "INSERT INTO meta_tables VALUES ('t', 'd')"],
    ['meta_columns', "INSERT INTO meta_columns VALUES ('t', 'c', 'TEXT', 'd')"],
    ['meta_relationships', "INSERT INTO meta_relationships VALUES ('t', 'c', 'u', 'd', 'x')"],
  ])('rejects a duplicate primary key in %s', (_table, insert) => {
    db.exec(insert);
    expect(() => db.exec(insert)).toThrow(/UNIQUE constraint failed/);
  });
});

describe('insertMetadata', () => {
  it('inserts every row and keeps the load order', () => {
    const db = openDatabase(':memory:');
    createMetadataTables(db);

    insertMetadata(db, metadata);

    const tables = db.prepare('SELECT table_name FROM meta_tables ORDER BY rowid').all();
    const columns = db.prepare('SELECT column_name FROM meta_columns ORDER BY rowid').all();
    const relationships = db.prepare('SELECT * FROM meta_relationships').all();
    expect(tables.map((t) => t.table_name)).toEqual(['b_table', 'a_table']);
    expect(columns.map((c) => c.column_name)).toEqual(['z', 'a']);
    expect(relationships).toEqual([
      {
        from_table: 'b_table',
        from_column: 'a',
        to_table: 'a_table',
        to_column: 'id',
        description: 'Links b to a.',
      },
    ]);
    db.close();
  });
});

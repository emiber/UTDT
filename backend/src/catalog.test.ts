import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { readCatalog } from './catalog.ts';
import { openDatabase } from './db.ts';
import { createMetadataTables, insertMetadata, type Metadata } from './metadata.ts';

let db: DatabaseSync;

beforeEach(() => {
  db = openDatabase(':memory:');
  createMetadataTables(db);
});

afterEach(() => {
  db.close();
});

function load(metadata: Partial<Metadata>): void {
  insertMetadata(db, { tables: [], columns: [], relationships: [], ...metadata });
}

describe('readCatalog', () => {
  it('returns declared tables with their columns and indexes, and their relationships', () => {
    db.exec(`
      CREATE TABLE authors (author_id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE books (book_id INTEGER PRIMARY KEY, author_id INTEGER, title TEXT);
      CREATE INDEX idx_books_author_id ON books (author_id);
    `);
    load({
      tables: [
        { tableName: 'authors', description: 'One row per author.' },
        { tableName: 'books', description: 'One row per book.' },
      ],
      columns: [
        { tableName: 'authors', columnName: 'author_id', dataType: 'INTEGER', description: 'Id.' },
        {
          tableName: 'books',
          columnName: 'author_id',
          dataType: 'INTEGER',
          description: 'Author.',
        },
      ],
      relationships: [
        {
          fromTable: 'books',
          fromColumn: 'author_id',
          toTable: 'authors',
          toColumn: 'author_id',
          description: 'Who wrote the book.',
        },
      ],
    });

    expect(readCatalog(db)).toEqual({
      tables: [
        {
          name: 'authors',
          description: 'One row per author.',
          columns: [{ name: 'author_id', dataType: 'INTEGER', description: 'Id.' }],
          // INTEGER PRIMARY KEY is the rowid: SQLite creates no index for it.
          indexes: [],
        },
        {
          name: 'books',
          description: 'One row per book.',
          columns: [{ name: 'author_id', dataType: 'INTEGER', description: 'Author.' }],
          indexes: [{ name: 'idx_books_author_id', unique: false, columns: ['author_id'] }],
        },
      ],
      relationships: [
        {
          fromTable: 'books',
          fromColumn: 'author_id',
          toTable: 'authors',
          toColumn: 'author_id',
          description: 'Who wrote the book.',
        },
      ],
    });
  });

  it('returns an empty catalog for empty metadata', () => {
    expect(readCatalog(db)).toEqual({ tables: [], relationships: [] });
  });

  it('throws when the metadata tables are missing', () => {
    const bare = openDatabase(':memory:');
    try {
      expect(() => readCatalog(bare)).toThrow(/meta_tables/);
    } finally {
      bare.close();
    }
  });

  it('drops columns and relationships of undeclared tables', () => {
    load({
      tables: [{ tableName: 'declared', description: 'Declared.' }],
      columns: [
        { tableName: 'hidden', columnName: 'x', dataType: 'TEXT', description: 'Hidden.' },
        { tableName: 'declared', columnName: 'y', dataType: 'TEXT', description: 'Shown.' },
      ],
      relationships: [
        {
          fromTable: 'declared',
          fromColumn: 'y',
          toTable: 'hidden',
          toColumn: 'x',
          description: 'To.',
        },
        {
          fromTable: 'hidden',
          fromColumn: 'x',
          toTable: 'declared',
          toColumn: 'y',
          description: 'From.',
        },
      ],
    });

    const catalog = readCatalog(db);

    expect(catalog.tables.map((t) => t.name)).toEqual(['declared']);
    expect(catalog.tables[0].columns.map((c) => c.name)).toEqual(['y']);
    expect(catalog.relationships).toEqual([]);
  });

  it('lists every index SQLite reports, with its uniqueness and columns in index order', () => {
    db.exec(`
      CREATE TABLE items (code TEXT UNIQUE, a TEXT, b TEXT, c TEXT);
      CREATE INDEX idx_items_c_a ON items (c, a);
      CREATE UNIQUE INDEX idx_items_b ON items (b);
    `);
    load({ tables: [{ tableName: 'items', description: 'Items.' }] });

    expect(readCatalog(db).tables[0].indexes).toEqual([
      { name: 'idx_items_b', unique: true, columns: ['b'] },
      { name: 'idx_items_c_a', unique: false, columns: ['c', 'a'] },
      { name: 'sqlite_autoindex_items_1', unique: true, columns: ['code'] },
    ]);
  });

  it('shows an index on an undescribed column, and an expression part as such', () => {
    db.exec(`
      CREATE TABLE notes (body TEXT, tag TEXT);
      CREATE INDEX idx_notes_lower_tag ON notes (lower(tag), body);
    `);
    load({
      tables: [{ tableName: 'notes', description: 'Notes.' }],
      columns: [{ tableName: 'notes', columnName: 'tag', dataType: 'TEXT', description: 'Tag.' }],
    });

    expect(readCatalog(db).tables[0].indexes).toEqual([
      { name: 'idx_notes_lower_tag', unique: false, columns: ['(expression)', 'body'] },
    ]);
  });

  it('keeps tables without columns or indexes, and declared tables missing from the database', () => {
    db.exec('CREATE TABLE plain (x TEXT)');
    load({
      tables: [
        { tableName: 'plain', description: 'No columns described, no indexes.' },
        { tableName: 'ghost', description: 'Declared but never created.' },
      ],
    });

    expect(readCatalog(db).tables).toEqual([
      { name: 'plain', description: 'No columns described, no indexes.', columns: [], indexes: [] },
      { name: 'ghost', description: 'Declared but never created.', columns: [], indexes: [] },
    ]);
  });

  it('keeps the load order of tables, columns and relationships', () => {
    load({
      tables: [
        { tableName: 'zeta', description: 'Z.' },
        { tableName: 'alpha', description: 'A.' },
      ],
      columns: [
        { tableName: 'alpha', columnName: 'z', dataType: 'TEXT', description: 'Z.' },
        { tableName: 'zeta', columnName: 'k', dataType: 'TEXT', description: 'K.' },
        { tableName: 'alpha', columnName: 'a', dataType: 'TEXT', description: 'A.' },
      ],
      relationships: [
        { fromTable: 'zeta', fromColumn: 'k', toTable: 'alpha', toColumn: 'z', description: '1.' },
        { fromTable: 'alpha', fromColumn: 'a', toTable: 'zeta', toColumn: 'k', description: '2.' },
      ],
    });

    const catalog = readCatalog(db);

    expect(catalog.tables.map((t) => t.name)).toEqual(['zeta', 'alpha']);
    expect(catalog.tables[1].columns.map((c) => c.name)).toEqual(['z', 'a']);
    expect(catalog.relationships.map((r) => r.description)).toEqual(['1.', '2.']);
  });
});

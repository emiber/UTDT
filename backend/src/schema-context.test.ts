import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from './db.ts';
import { createMetadataTables, insertMetadata } from './metadata.ts';
import { buildSchemaContext } from './schema-context.ts';

let db: DatabaseSync;

beforeEach(() => {
  db = openDatabase(':memory:');
  createMetadataTables(db);
});

afterEach(() => {
  db.close();
});

describe('buildSchemaContext', () => {
  it('describes tables, columns and relationships, without indexes or hidden tables', () => {
    db.exec(`
      CREATE TABLE authors (author_id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE books (book_id INTEGER PRIMARY KEY, author_id INTEGER);
      CREATE INDEX idx_books_author_id ON books (author_id);
    `);
    insertMetadata(db, {
      tables: [
        { tableName: 'authors', description: 'One row per author.' },
        { tableName: 'books', description: 'One row per book.' },
      ],
      columns: [
        { tableName: 'authors', columnName: 'author_id', dataType: 'INTEGER', description: 'Id.' },
        { tableName: 'authors', columnName: 'name', dataType: 'TEXT', description: 'Full name.' },
        {
          tableName: 'books',
          columnName: 'author_id',
          dataType: 'INTEGER',
          description: 'Author.',
        },
        { tableName: 'secrets', columnName: 'token', dataType: 'TEXT', description: 'Hidden.' },
      ],
      relationships: [
        {
          fromTable: 'books',
          fromColumn: 'author_id',
          toTable: 'authors',
          toColumn: 'author_id',
          description: 'Who wrote the book.',
        },
        {
          fromTable: 'secrets',
          fromColumn: 'token',
          toTable: 'authors',
          toColumn: 'author_id',
          description: 'Hidden link.',
        },
      ],
    });

    expect(buildSchemaContext(db)).toBe(
      [
        'Table authors: One row per author.',
        '  - author_id (INTEGER): Id.',
        '  - name (TEXT): Full name.',
        '',
        'Table books: One row per book.',
        '  - author_id (INTEGER): Author.',
        '',
        'Relationships:',
        '  - books.author_id → authors.author_id: Who wrote the book.',
      ].join('\n'),
    );
  });

  it('is empty for empty metadata', () => {
    expect(buildSchemaContext(db)).toBe('');
  });

  it('throws when the metadata tables are missing', () => {
    db.exec('DROP TABLE meta_tables');
    expect(() => buildSchemaContext(db)).toThrow(/meta_tables/);
  });
});

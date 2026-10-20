import type { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../db.ts';
import { createMetadataTables, insertMetadata } from '../metadata.ts';

/** An in-memory dataset for tests: one described table, `items`, with two rows. */
export function openTestDataDb(): DatabaseSync {
  const db = openDatabase(':memory:');
  createMetadataTables(db);
  db.exec(`
    CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT, qty INTEGER);
    INSERT INTO items (name, qty) VALUES ('pen', 3), ('ink', 5);
  `);
  insertMetadata(db, {
    tables: [{ tableName: 'items', description: 'One row per item.' }],
    columns: [
      { tableName: 'items', columnName: 'id', dataType: 'INTEGER', description: 'Item id.' },
      { tableName: 'items', columnName: 'name', dataType: 'TEXT', description: 'Item name.' },
      { tableName: 'items', columnName: 'qty', dataType: 'INTEGER', description: 'Units.' },
    ],
    relationships: [],
  });
  return db;
}

import { rmSync } from 'node:fs';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { openDatabase } from './db.ts';
import { createMetadataTables, insertMetadata, type Metadata } from './metadata.ts';

export interface TableRows {
  table: string;
  columns: string[];
  rows: SQLInputValue[][];
}

/** A dataset to seed: its schema, its rows, and the metadata that describes it to the bot. */
export interface Dataset {
  /** DDL that creates the dataset's tables and indexes. */
  schema: string;
  /** Rows to insert, table by table, in order (parents before children). */
  data: TableRows[];
  metadata: Metadata;
}

/** Loads the metadata tables and a dataset into an empty database, all in one transaction. */
export function seedDatabase(db: DatabaseSync, dataset: Dataset): void {
  db.exec('BEGIN');
  try {
    createMetadataTables(db);
    db.exec(dataset.schema);
    for (const tableRows of dataset.data) insertRows(db, tableRows);
    insertMetadata(db, dataset.metadata);
    db.exec('COMMIT');
  } catch (error) {
    // SQLite may already have rolled back (e.g. disk full); a second ROLLBACK would mask the error.
    if (db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }
}

/**
 * Recreates a database file from scratch: whatever it held before is deleted. If the load
 * fails, no file is left behind, so opening it reports that the seed has to run.
 */
export function seedFile(file: string, dataset: Dataset): void {
  removeDatabaseFiles(file);
  const db = openDatabase(file);
  try {
    seedDatabase(db, dataset);
  } catch (error) {
    db.close();
    removeDatabaseFiles(file);
    throw error;
  }
  db.close();
}

function removeDatabaseFiles(file: string): void {
  // Leftover journal files would otherwise be replayed onto a new database.
  for (const suffix of ['', '-journal', '-wal', '-shm']) rmSync(file + suffix, { force: true });
}

function insertRows(db: DatabaseSync, { table, columns, rows }: TableRows): void {
  const placeholders = columns.map(() => '?').join(', ');
  const insert = db.prepare(
    `INSERT INTO ${quote(table)} (${columns.map(quote).join(', ')}) VALUES (${placeholders})`,
  );
  for (const row of rows) insert.run(...row);
}

function quote(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

import type { DatabaseSync } from 'node:sqlite';

// The metadata tables describe a dataset to the bot: it only knows the tables listed in
// meta_tables. They're plain rowid tables, so readers can return rows in load order.

export interface MetaTable {
  tableName: string;
  description: string;
}

export interface MetaColumn {
  tableName: string;
  columnName: string;
  /** Declared SQLite type (INTEGER, REAL, TEXT); format and units go in the description. */
  dataType: string;
  description: string;
}

export interface MetaRelationship {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  description: string;
}

export interface Metadata {
  tables: MetaTable[];
  columns: MetaColumn[];
  relationships: MetaRelationship[];
}

/** Creates the empty metadata tables. Knows nothing about any particular dataset. */
export function createMetadataTables(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE meta_tables (
      table_name TEXT NOT NULL,
      description TEXT NOT NULL,
      PRIMARY KEY (table_name)
    );
    CREATE TABLE meta_columns (
      table_name TEXT NOT NULL,
      column_name TEXT NOT NULL,
      data_type TEXT NOT NULL,
      description TEXT NOT NULL,
      PRIMARY KEY (table_name, column_name)
    );
    CREATE TABLE meta_relationships (
      from_table TEXT NOT NULL,
      from_column TEXT NOT NULL,
      to_table TEXT NOT NULL,
      to_column TEXT NOT NULL,
      description TEXT NOT NULL,
      PRIMARY KEY (from_table, from_column, to_table, to_column)
    );
  `);
}

/** Inserts metadata rows in the given order, which is the order readers return them in. */
export function insertMetadata(db: DatabaseSync, metadata: Metadata): void {
  const insertTable = db.prepare('INSERT INTO meta_tables VALUES (?, ?)');
  for (const t of metadata.tables) insertTable.run(t.tableName, t.description);

  const insertColumn = db.prepare('INSERT INTO meta_columns VALUES (?, ?, ?, ?)');
  for (const c of metadata.columns) {
    insertColumn.run(c.tableName, c.columnName, c.dataType, c.description);
  }

  const insertRelationship = db.prepare('INSERT INTO meta_relationships VALUES (?, ?, ?, ?, ?)');
  for (const r of metadata.relationships) {
    insertRelationship.run(r.fromTable, r.fromColumn, r.toTable, r.toColumn, r.description);
  }
}

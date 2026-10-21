import type { DatabaseSync } from 'node:sqlite';

// What the bot knows about the data: the tables declared in the metadata, with their
// columns and relationships, plus each table's indexes as SQLite reports them.

export interface CatalogColumn {
  name: string;
  dataType: string;
  description: string;
}

export interface CatalogIndex {
  name: string;
  unique: boolean;
  /** Column names in index order; an expression part shows as `(expression)`. */
  columns: string[];
}

export interface CatalogTable {
  name: string;
  description: string;
  columns: CatalogColumn[];
  indexes: CatalogIndex[];
}

export interface CatalogRelationship {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  description: string;
}

export interface Catalog {
  tables: CatalogTable[];
  relationships: CatalogRelationship[];
}

/**
 * Reads the catalog from a dataset database. Only tables with a `meta_tables` row exist:
 * columns and relationships of undeclared tables are dropped. Tables, columns and
 * relationships keep their load order; indexes are sorted by name. Throws if the metadata
 * tables are missing, rather than returning an empty catalog.
 */
export function readCatalog(db: DatabaseSync): Catalog {
  const tableRows = db
    .prepare('SELECT table_name, description FROM meta_tables ORDER BY rowid')
    .all() as { table_name: string; description: string }[];
  const columnRows = db
    .prepare(
      'SELECT table_name, column_name, data_type, description FROM meta_columns ORDER BY rowid',
    )
    .all() as { table_name: string; column_name: string; data_type: string; description: string }[];
  const relationshipRows = db
    .prepare(
      `SELECT from_table, from_column, to_table, to_column, description
       FROM meta_relationships ORDER BY rowid`,
    )
    .all() as {
    from_table: string;
    from_column: string;
    to_table: string;
    to_column: string;
    description: string;
  }[];

  const tables = new Map<string, CatalogTable>();
  for (const t of tableRows) {
    tables.set(t.table_name, {
      name: t.table_name,
      description: t.description,
      columns: [],
      indexes: readIndexes(db, t.table_name),
    });
  }
  for (const c of columnRows) {
    tables.get(c.table_name)?.columns.push({
      name: c.column_name,
      dataType: c.data_type,
      description: c.description,
    });
  }

  const relationships = relationshipRows
    .filter((r) => tables.has(r.from_table) && tables.has(r.to_table))
    .map((r) => ({
      fromTable: r.from_table,
      fromColumn: r.from_column,
      toTable: r.to_table,
      toColumn: r.to_column,
      description: r.description,
    }));

  return { tables: [...tables.values()], relationships };
}

/** A table's indexes, automatic ones included. A table that doesn't exist has none. */
function readIndexes(db: DatabaseSync, table: string): CatalogIndex[] {
  // Table and index names are bound as parameters, never interpolated into the SQL.
  const indexRows = db
    .prepare('SELECT name, "unique" FROM pragma_index_list(?) ORDER BY name')
    .all(table) as { name: string; unique: number }[];
  const columnsOf = db.prepare(
    // An expression index part has no column name.
    "SELECT coalesce(name, '(expression)') AS name FROM pragma_index_info(?) ORDER BY seqno",
  );

  return indexRows.map((i) => ({
    name: i.name,
    unique: i.unique === 1,
    columns: (columnsOf.all(i.name) as { name: string }[]).map((c) => c.name),
  }));
}

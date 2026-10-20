import type { DatabaseSync } from 'node:sqlite';

// Runs LLM-generated SQL on the dataset. Safety is layered: the connection is read-only
// (SQLite itself rejects writes), a cheap guard accepts exactly one statement starting with
// SELECT or WITH, and a row cap rejects oversized results. Problems a rewritten query can
// fix are returned, with a message meant for the LLM; anything else is thrown.

/** Most rows a result may have. A bigger one is rejected, not truncated. */
export const MAX_ROWS = 500;

export type SqlResult =
  | { ok: true; columns: string[]; rows: unknown[][] }
  | { ok: false; kind: 'guard' | 'sql' | 'row_limit'; message: string };

/**
 * Runs one read query on `db`, which must be a read-only connection. Rows are lists aligned
 * with `columns`, so columns with the same name keep both values.
 */
export function executeSql(db: DatabaseSync, sql: string): SqlResult {
  const text = sql.trim();
  if (!text) return guard('The query is empty. Write a single SELECT statement.');
  if (!/^(select|with)\b/i.test(text)) {
    return guard(
      'The query must start with SELECT or WITH, with nothing before it (no comments or markdown).',
    );
  }

  try {
    const statement = db.prepare(text);
    // SQLite prepares only the first statement and node:sqlite drops the rest silently, so
    // anything after it (even a comment after the ';') would never run: reject it instead.
    if (text.slice(statement.sourceSQL.length).trim()) {
      return guard("Only one statement is allowed: remove everything after the first ';'.");
    }
    statement.setReturnArrays(true);
    const columns = statement.columns().map((c) => c.name);
    const rows: unknown[][] = [];
    const iterator = statement.iterate();
    try {
      // Stops reading at MAX_ROWS + 1, so a huge result is never read in full.
      for (const row of iterator) {
        if (rows.length === MAX_ROWS) {
          return {
            ok: false,
            kind: 'row_limit',
            message: `The result has more than ${MAX_ROWS} rows. Write a more selective query: aggregate or filter so it returns at most ${MAX_ROWS} rows.`,
          };
        }
        rows.push(row as unknown as unknown[]);
      }
    } finally {
      // for…of skips this when reading a row throws (e.g. an integer beyond 2^53), and an
      // unreset statement keeps a read lock on the file for as long as the connection lives.
      iterator.return?.();
    }
    return { ok: true, columns, rows };
  } catch (error) {
    if (isQueryError(error)) return { ok: false, kind: 'sql', message: error.message };
    throw error;
  }
}

function guard(message: string): SqlResult {
  return { ok: false, kind: 'guard', message };
}

/**
 * Whether the query itself caused the error, so the LLM can fix it. Anything else (busy or
 * locked, I/O, corrupt or non-database file, a hot journal) is an environment fault.
 */
function isQueryError(error: unknown): error is Error {
  const { code, errcode = 0 } = error as { code?: string; errcode?: number };
  if (code === 'ERR_OUT_OF_RANGE') return true; // an integer beyond 2^53 in the result
  if (code !== 'ERR_SQLITE_ERROR') return false;
  // Extended result codes keep the primary code in the low byte.
  return (
    (errcode & 0xff) === 1 || // SQLITE_ERROR: syntax, unknown table or column, overflow…
    errcode === 8 || // plain SQLITE_READONLY: a write on the read-only connection
    (errcode & 0xff) === 18 || // SQLITE_TOOBIG: a string or blob over SQLite's size limit
    (errcode & 0xff) === 20 // SQLITE_MISMATCH: e.g. a non-integer LIMIT or OFFSET
  );
}

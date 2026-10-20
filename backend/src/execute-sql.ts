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
 * SQLite primary result codes that no rewritten query can fix: busy or locked, out of
 * memory, I/O error, corrupt, disk full, can't open, not a database.
 */
const ENVIRONMENT_ERROR_CODES = new Set([5, 6, 7, 10, 11, 13, 14, 26]);

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
    // Stops reading at MAX_ROWS + 1, so a huge result is never read in full.
    for (const row of statement.iterate()) {
      if (rows.length === MAX_ROWS) {
        return {
          ok: false,
          kind: 'row_limit',
          message: `The result has more than ${MAX_ROWS} rows. Write a more selective query: aggregate or filter so it returns at most ${MAX_ROWS} rows.`,
        };
      }
      rows.push(row as unknown as unknown[]);
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
 * Whether the query itself caused the error (syntax, unknown table or column, a write on
 * the read-only connection, an integer beyond 2^53), so the LLM can fix it.
 */
function isQueryError(error: unknown): error is Error {
  const { code, errcode } = error as { code?: string; errcode?: number };
  if (code === 'ERR_OUT_OF_RANGE') return true;
  // Extended result codes keep the primary code in the low byte.
  return code === 'ERR_SQLITE_ERROR' && !ENVIRONMENT_ERROR_CODES.has((errcode ?? 0) & 0xff);
}

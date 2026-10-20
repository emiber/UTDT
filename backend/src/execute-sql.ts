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

/** Error codes of failures caused by the query itself, so the LLM can fix them. */
const QUERY_ERROR_CODES = new Set([
  'ERR_SQLITE_ERROR', // syntax errors, unknown tables or columns, writes on read-only
  'ERR_OUT_OF_RANGE', // an integer beyond 2^53 in the result
]);

/**
 * Runs one read query on `db`, which must be a read-only connection. Rows are lists aligned
 * with `columns`, so columns with the same name keep both values.
 */
export function executeSql(db: DatabaseSync, sql: string): SqlResult {
  const guardMessage = checkStatement(sql);
  if (guardMessage) return { ok: false, kind: 'guard', message: guardMessage };

  try {
    const statement = db.prepare(sql);
    statement.setReturnArrays(true);
    const columns = statement.columns().map((c) => c.name);
    const rows: unknown[][] = [];
    // Stops reading at MAX_ROWS + 1, so even an endless recursive CTE ends here.
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
    const { code, message } = error as { code?: string; message: string };
    if (code && QUERY_ERROR_CODES.has(code)) return { ok: false, kind: 'sql', message };
    throw error;
  }
}

/** Returns why the SQL isn't exactly one SELECT/WITH statement, or null if it is. */
function checkStatement(sql: string): string | null {
  const text = sql.trim();
  if (!text) return 'The query is empty. Write a single SELECT statement.';
  if (!/^(select|with)\b/i.test(text)) {
    return 'The query must start with SELECT or WITH, with nothing before it (no comments or markdown).';
  }
  const end = firstStatementEnd(text);
  if (end !== -1 && text.slice(end + 1).trim()) {
    return "Only one statement is allowed: remove everything after the first ';'.";
  }
  return null;
}

/**
 * Index of the first ';' that ends a statement, or -1. A ';' inside a string literal, a
 * quoted identifier or a comment doesn't count. Not a SQL parser: an unterminated quote
 * just runs to the end, and SQLite reports the syntax error.
 */
function firstStatementEnd(text: string): number {
  const closers: Record<string, string> = { "'": "'", '"': '"', '`': '`', '[': ']' };
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === ';') return i;
    if (ch in closers) {
      // A doubled quote ('it''s') closes and reopens, which skips the same characters.
      const close = text.indexOf(closers[ch], i + 1);
      i = close === -1 ? text.length : close + 1;
    } else if (text.startsWith('--', i)) {
      const close = text.indexOf('\n', i + 2);
      i = close === -1 ? text.length : close + 1;
    } else if (text.startsWith('/*', i)) {
      const close = text.indexOf('*/', i + 2);
      i = close === -1 ? text.length : close + 2;
    } else {
      i++;
    }
  }
  return -1;
}

import type { DatabaseSync } from 'node:sqlite';
import type { HistoryTurn } from './conversations.ts';
import { executeSql, MAX_ROWS } from './execute-sql.ts';
import { LlmError, requestStructured, type LlmCall, type LlmClient } from './llm.ts';
import { renderPrompt } from './prompts.ts';
import { buildSchemaContext } from './schema-context.ts';
import { elapsed } from './timing.ts';

/** Attempts per question, the first one included: at most two retries. */
export const MAX_ATTEMPTS = 3;

/** The logging this module needs; Fastify's `request.log` fits it. */
export interface StepLogger {
  info(fields: Record<string, unknown>, message: string): void;
}

/** Queries per question: one per separate result the message asks for. */
export const MAX_QUERIES = 5;

/** One query of the answer, with its result. */
export interface QueryResult {
  /** A short title for this result, in the language of the question. */
  title: string;
  sql: string;
  columns: string[];
  rows: unknown[][];
}

export type GenerateSqlResult =
  | {
      ok: true;
      /** Every query's SQL, as `joinSql` writes it: what the saved turn and the history keep. */
      sql: string;
      queries: QueryResult[];
    }
  /** The first query that failed in the last attempt: its kind and message; `sql` is every query's. */
  | { ok: false; sql: string; kind: 'guard' | 'sql' | 'row_limit'; message: string };

/** The SQL of every query as one text, one after the other. With a single query, it's that SQL. */
export function joinSql(queries: { sql: string }[]): string {
  return queries.map(({ sql }) => sql).join('\n\n');
}

const SQL_SCHEMA = {
  type: 'object',
  properties: {
    // Written first, so the aliases follow it: without it, earlier turns in another language
    // pull the column names into theirs. The value itself isn't used.
    language: {
      type: 'string',
      description:
        'The language of the question, not of the earlier turns (e.g. "English"). The titles and the column aliases are written in it.',
    },
    queries: {
      type: 'array',
      minItems: 1,
      maxItems: MAX_QUERIES,
      description:
        'The queries that answer the message: one, or several when it asks for separate results.',
      items: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: "A short title for this query's result, in the language of the question.",
          },
          sql: {
            type: 'string',
            description: 'One SQLite statement that starts with SELECT or WITH.',
          },
        },
        required: ['title', 'sql'],
        additionalProperties: false,
      },
    },
  },
  required: ['language', 'queries'],
  additionalProperties: false,
};

/** The queries the model wrote, checked: 1 to MAX_QUERIES, each with a title and an SQL string. */
function parseQueries(value: unknown): { title: string; sql: string }[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_QUERIES) {
    throw new LlmError(`The model returned no valid queries: expected 1 to ${MAX_QUERIES}.`);
  }
  return value.map((item) => {
    const { title, sql } = (item ?? {}) as { title?: unknown; sql?: unknown };
    if (typeof sql !== 'string') throw new LlmError('The model returned no SQL string.');
    if (typeof title !== 'string' || !title.trim()) {
      throw new LlmError('The model returned a query with no title.');
    }
    return { title, sql };
  });
}

export interface GenerateSqlInput {
  question: string;
  /** Read-only connection to `data.db`. */
  db: DatabaseSync;
  llm: LlmClient;
  log: StepLogger;
  /** Earlier turns of the conversation, oldest first; every attempt gets them. */
  history?: HistoryTurn[];
  /** Called with each generated SQL (every query's, joined), so a caller still knows the last one if a later step throws. */
  onSql?: (sql: string) => void;
  /** Gets each attempt's call to the LLM, failed or not, with the attempt number. */
  onLlmCall?: (call: LlmCall & { attempt: number }) => void;
}

/**
 * Turns a question into one or more queries (up to MAX_QUERIES, one per separate result it
 * asks for) and runs them. When any query's guarded execution returns an error, the LLM
 * writes the whole set again with every failed query of every failed attempt as feedback, up
 * to MAX_ATTEMPTS in total; then the first failed query of the last attempt is returned.
 * OpenAI failures, refusals, a malformed set of queries, and errors the executor or the
 * catalog throw are thrown, without retrying.
 */
export async function generateSql({
  question,
  db,
  llm,
  log,
  history = [],
  onSql,
  onLlmCall,
}: GenerateSqlInput): Promise<GenerateSqlResult> {
  const schemaContext = buildSchemaContext(db);
  const instructions = renderPrompt('sql-system', { maxRows: MAX_ROWS, maxQueries: MAX_QUERIES });
  const failures: { queries: { sql: string; message: string }[] }[] = [];

  for (let attempt = 1; ; attempt++) {
    let started = performance.now();
    let planned: { title: string; sql: string }[];
    try {
      const output = await requestStructured<{ queries: unknown }>(
        llm,
        {
          name: 'sql_query',
          schema: SQL_SCHEMA,
          instructions,
          input: renderPrompt('sql-user', { schemaContext, history, question, failures }),
        },
        (call) => onLlmCall?.({ ...call, attempt }),
      );
      planned = parseQueries(output.queries);
      onSql?.(joinSql(planned));
    } catch (error) {
      // A failed or hung call still shows up in the log, with how long it took.
      log.info(
        { step: 'generate_sql', attempt, durationMs: elapsed(started), result: 'error' },
        'SQL generation failed',
      );
      throw error;
    }
    log.info(
      { step: 'generate_sql', attempt, durationMs: elapsed(started), result: 'ok' },
      'SQL generated',
    );

    // Every query runs, so the next attempt hears about all the ones that failed.
    const queries: QueryResult[] = [];
    const failed: { sql: string; kind: 'guard' | 'sql' | 'row_limit'; message: string }[] = [];
    planned.forEach(({ title, sql }, index) => {
      started = performance.now();
      let result: ReturnType<typeof executeSql>;
      try {
        result = executeSql(db, sql);
      } catch (error) {
        log.info(
          {
            step: 'execute_sql',
            attempt,
            query: index + 1,
            durationMs: elapsed(started),
            result: 'error',
          },
          'SQL execution failed',
        );
        throw error;
      }
      log.info(
        {
          step: 'execute_sql',
          attempt,
          query: index + 1,
          durationMs: elapsed(started),
          result: result.ok ? 'ok' : result.kind,
        },
        'SQL executed',
      );
      if (result.ok) queries.push({ title, sql, columns: result.columns, rows: result.rows });
      else failed.push({ sql, kind: result.kind, message: result.message });
    });

    if (!failed.length) return { ok: true, sql: joinSql(queries), queries };
    if (attempt === MAX_ATTEMPTS) {
      const [{ kind, message }] = failed;
      return { ok: false, sql: joinSql(planned), kind, message };
    }
    failures.push({ queries: failed.map(({ sql, message }) => ({ sql, message })) });
  }
}

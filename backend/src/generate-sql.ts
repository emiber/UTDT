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

export type GenerateSqlResult =
  | { ok: true; sql: string; columns: string[]; rows: unknown[][] }
  | { ok: false; sql: string; kind: 'guard' | 'sql' | 'row_limit'; message: string };

const SQL_SCHEMA = {
  type: 'object',
  properties: {
    // Written first, so the aliases follow it: without it, earlier turns in another language
    // pull the column names into theirs. The value itself isn't used.
    language: {
      type: 'string',
      description:
        'The language of the question, not of the earlier turns (e.g. "English"). The column aliases are written in it.',
    },
    sql: { type: 'string', description: 'One SQLite statement that starts with SELECT or WITH.' },
  },
  required: ['language', 'sql'],
  additionalProperties: false,
};

export interface GenerateSqlInput {
  question: string;
  /** Read-only connection to `data.db`. */
  db: DatabaseSync;
  llm: LlmClient;
  log: StepLogger;
  /** Earlier turns of the conversation, oldest first; every attempt gets them. */
  history?: HistoryTurn[];
  /** Called with each generated SQL, so a caller still knows the last one if a later step throws. */
  onSql?: (sql: string) => void;
  /** Gets each attempt's call to the LLM, failed or not, with the attempt number. */
  onLlmCall?: (call: LlmCall & { attempt: number }) => void;
}

/**
 * Turns a question into SQL and runs it. When the guarded execution returns an error, the
 * LLM tries again with every failed attempt as feedback, up to MAX_ATTEMPTS in total; then
 * the last attempt's error is returned. OpenAI failures, refusals, and errors the executor
 * or the catalog throw are thrown, without retrying.
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
  const instructions = renderPrompt('sql-system', { maxRows: MAX_ROWS });
  const failures: { sql: string; message: string }[] = [];

  for (let attempt = 1; ; attempt++) {
    let started = performance.now();
    let sql: string;
    try {
      const output = await requestStructured<{ sql: unknown }>(
        llm,
        {
          name: 'sql_query',
          schema: SQL_SCHEMA,
          instructions,
          input: renderPrompt('sql-user', { schemaContext, history, question, failures }),
        },
        (call) => onLlmCall?.({ ...call, attempt }),
      );
      if (typeof output.sql !== 'string') throw new LlmError('The model returned no SQL string.');
      sql = output.sql;
      onSql?.(sql);
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

    started = performance.now();
    let result: ReturnType<typeof executeSql>;
    try {
      result = executeSql(db, sql);
    } catch (error) {
      log.info(
        { step: 'execute_sql', attempt, durationMs: elapsed(started), result: 'error' },
        'SQL execution failed',
      );
      throw error;
    }
    log.info(
      {
        step: 'execute_sql',
        attempt,
        durationMs: elapsed(started),
        result: result.ok ? 'ok' : result.kind,
      },
      'SQL executed',
    );

    if (result.ok) return { ok: true, sql, columns: result.columns, rows: result.rows };
    if (attempt === MAX_ATTEMPTS) {
      return { ok: false, sql, kind: result.kind, message: result.message };
    }
    failures.push({ sql, message: result.message });
  }
}

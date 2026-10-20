import type { DatabaseSync } from 'node:sqlite';
import { executeSql, MAX_ROWS } from './execute-sql.ts';
import { requestStructured, type LlmClient } from './llm.ts';
import { renderPrompt } from './prompts.ts';
import { buildSchemaContext } from './schema-context.ts';

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
    sql: { type: 'string', description: 'One SQLite statement that starts with SELECT or WITH.' },
  },
  required: ['sql'],
  additionalProperties: false,
};

export interface GenerateSqlInput {
  question: string;
  /** Read-only connection to `data.db`. */
  db: DatabaseSync;
  llm: LlmClient;
  log: StepLogger;
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
}: GenerateSqlInput): Promise<GenerateSqlResult> {
  const schemaContext = buildSchemaContext(db);
  const instructions = renderPrompt('sql-system', { maxRows: MAX_ROWS });
  const failures: { sql: string; message: string }[] = [];

  for (let attempt = 1; ; attempt++) {
    let started = performance.now();
    let sql: string;
    try {
      const output = await requestStructured<{ sql: unknown }>(llm, {
        name: 'sql_query',
        schema: SQL_SCHEMA,
        instructions,
        input: renderPrompt('sql-user', { schemaContext, question, failures }),
      });
      if (typeof output.sql !== 'string') throw new Error('The model returned no SQL string.');
      sql = output.sql;
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

function elapsed(started: number): number {
  return Math.round(performance.now() - started);
}

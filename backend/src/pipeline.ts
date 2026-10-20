import type { DatabaseSync } from 'node:sqlite';
import { generateSql, type StepLogger } from './generate-sql.ts';
import { buildInsights } from './insights.ts';
import type { LlmClient } from './llm.ts';
import { elapsed } from './timing.ts';

// The Text-to-SQL pipeline for one question, without HTTP or app.db: the chat route and the
// offline evaluation both call it.

/** A response block; the frontend renders them in order. */
export type Block =
  { type: 'text'; markdown: string } | { type: 'table'; columns: string[]; rows: unknown[][] };

export type PipelineResult =
  | {
      ok: true;
      sql: string;
      columns: string[];
      rows: unknown[][];
      narrative: string;
      suggestions: string[];
      blocks: Block[];
    }
  /** Every SQL attempt failed: the last attempt's SQL and error. */
  | { ok: false; sql: string; kind: 'guard' | 'sql' | 'row_limit'; message: string };

/** A thrown pipeline failure, with the last SQL it generated, so the turn can keep it. */
export class PipelineError extends Error {
  /** The last generated SQL (final or still being retried), or null if there was none. */
  readonly sql: string | null;

  constructor(sql: string | null, cause: unknown) {
    super(`The pipeline failed: ${(cause as Error).message}`, { cause });
    this.name = 'PipelineError';
    this.sql = sql;
  }
}

export interface PipelineInput {
  question: string;
  /** Read-only connection to `data.db`. */
  dataDb: DatabaseSync;
  llm: LlmClient;
  log: StepLogger;
}

/**
 * Answers a question: SQL (with its retries), then insights, then the blocks. When every SQL
 * attempt fails, returns why, without calling the insights. Anything thrown (OpenAI
 * failures, unexpected errors) comes out as a PipelineError whose `cause` is the original.
 */
export async function answerQuestion({
  question,
  dataDb,
  llm,
  log,
}: PipelineInput): Promise<PipelineResult> {
  let lastSql: string | null = null;
  let step = 'sql';
  let started = performance.now();
  try {
    const onSql = (sql: string) => {
      lastSql = sql;
    };
    const result = await generateSql({ question, db: dataDb, llm, log, onSql });
    log.info(
      { step, durationMs: elapsed(started), result: result.ok ? 'ok' : result.kind },
      'Pipeline step done',
    );
    if (!result.ok) return result;

    step = 'insights';
    started = performance.now();
    const { sql, columns, rows } = result;
    const { narrative, suggestions } = await buildInsights({ question, sql, columns, rows, llm });
    log.info({ step, durationMs: elapsed(started), result: 'ok' }, 'Pipeline step done');

    const blocks: Block[] = [{ type: 'text', markdown: narrative }];
    if (result.rows.length) {
      blocks.push({ type: 'table', columns: result.columns, rows: result.rows });
    }
    return { ...result, narrative, suggestions, blocks };
  } catch (error) {
    log.info({ step, durationMs: elapsed(started), result: 'error' }, 'Pipeline step failed');
    throw new PipelineError(lastSql, error);
  }
}

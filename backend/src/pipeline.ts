import type { DatabaseSync } from 'node:sqlite';
import { buildChart, type ChartBlock, type ChartSpec } from './chart.ts';
import { classifyQuestion, type Classification } from './classify.ts';
import type { HistoryTurn, LlmStep, TurnLlmCall } from './conversations.ts';
import { generateSql, type StepLogger } from './generate-sql.ts';
import { buildInsights } from './insights.ts';
import { LlmError, type DecisionClient, type LlmCall, type LlmClient } from './llm.ts';
import { buildReply } from './reply.ts';
import { buildSchemaContext } from './schema-context.ts';
import { elapsed } from './timing.ts';

// The Text-to-SQL pipeline for one question, without HTTP or app.db: the chat route and the
// offline evaluation both call it.

/** A response block; the frontend renders them in order. */
export type Block =
  | { type: 'text'; markdown: string }
  | { type: 'table'; columns: string[]; rows: unknown[][] }
  | ChartBlock;

export type PipelineResult =
  /** A data question, answered from the query result. */
  | {
      ok: true;
      kind: 'data';
      /** `data_question`, or null when the classifier failed and the data path was the fallback. */
      classification: 'data_question' | null;
      sql: string;
      columns: string[];
      rows: unknown[][];
      narrative: string;
      suggestions: string[];
      blocks: Block[];
      /** The chart spec behind the chart block, or null when there's no chart. */
      chart: ChartSpec | null;
    }
  /** Not a data question: a text reply, with no SQL. */
  | {
      ok: true;
      kind: 'reply';
      classification: Exclude<Classification, 'data_question'>;
      narrative: string;
      suggestions: string[];
      blocks: Block[];
    }
  /** Every SQL attempt failed: the last attempt's SQL and error. */
  | {
      ok: false;
      classification: 'data_question' | null;
      sql: string;
      kind: 'guard' | 'sql' | 'row_limit';
      message: string;
    };

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

/** The pipeline also warns when it drops a chart; Fastify's `request.log` fits it. */
export interface PipelineLogger extends StepLogger {
  warn(fields: Record<string, unknown>, message: string): void;
}

export interface PipelineInput {
  question: string;
  /** Read-only connection to `data.db`. */
  dataDb: DatabaseSync;
  llm: LlmClient;
  /** The Decisions API client, for the classification. */
  decisions: DecisionClient;
  log: PipelineLogger;
  /** Earlier turns of the conversation, oldest first: context for every step. */
  history?: HistoryTurn[];
  /** Gets each call to the LLM as it ends, failed ones included, even if the pipeline throws. */
  onLlmCall?: (call: TurnLlmCall) => void;
}

/**
 * Answers a message. First it's classified; anything but a data question gets a text reply.
 * A data question goes through SQL (with its retries), then insights, then the blocks: always
 * text, a table when there are rows (but not for a single value, which the text already
 * says), and a chart when the LLM's spec fits the result (one that doesn't is dropped with a
 * warning). When every SQL attempt fails, returns why, without calling the insights.
 * Anything thrown (OpenAI failures, unexpected errors) comes out as a PipelineError whose
 * `cause` is the original.
 */
export async function answerQuestion({
  question,
  dataDb,
  llm,
  decisions,
  log,
  history = [],
  onLlmCall,
}: PipelineInput): Promise<PipelineResult> {
  let lastSql: string | null = null;
  // Tags a step's calls; generateSql's calls bring their own attempt number. The `answer`
  // step is the text reply or the insights, which the step logs call `reply` and `insights`.
  const record =
    (llmStep: LlmStep) =>
    (call: LlmCall & { attempt?: number }): void =>
      onLlmCall?.({ step: llmStep, attempt: 1, ...call });
  let step = 'classify';
  let started = performance.now();
  try {
    const schemaContext = buildSchemaContext(dataDb);
    let classification: Classification | null = null;
    try {
      const result = await classifyQuestion(decisions, {
        question,
        schemaContext,
        history,
        onLlmCall: record('classify'),
      });
      ({ classification } = result);
      log.info(
        {
          step,
          durationMs: elapsed(started),
          result: classification,
          confidence: result.confidence,
          overridden: result.overridden,
        },
        'Pipeline step done',
      );
    } catch (error) {
      // The Decisions API is a beta: if it fails, behave as before it existed.
      if (!(error instanceof LlmError)) throw error;
      log.warn(
        { step, durationMs: elapsed(started), result: 'error', reason: error.message },
        'Classification failed; answering from the data',
      );
    }

    if (classification && classification !== 'data_question') {
      step = 'reply';
      started = performance.now();
      const reply = await buildReply({
        question,
        classification,
        schemaContext,
        history,
        llm,
        onLlmCall: record('answer'),
      });
      log.info({ step, durationMs: elapsed(started), result: 'ok' }, 'Pipeline step done');
      const blocks: Block[] = [{ type: 'text', markdown: reply.narrative }];
      return { ok: true, kind: 'reply', classification, ...reply, blocks };
    }

    step = 'sql';
    started = performance.now();
    const onSql = (sql: string) => {
      lastSql = sql;
    };
    const generated = await generateSql({
      question,
      db: dataDb,
      llm,
      log,
      history,
      onSql,
      onLlmCall: record('sql'),
    });
    log.info(
      { step, durationMs: elapsed(started), result: generated.ok ? 'ok' : generated.kind },
      'Pipeline step done',
    );
    if (!generated.ok) return { ...generated, classification };
    const result = { ...generated, classification };

    step = 'insights';
    started = performance.now();
    const { sql, columns, rows } = result;
    const insights = await buildInsights({
      question,
      sql,
      columns,
      rows,
      llm,
      history,
      onLlmCall: record('answer'),
    });
    log.info({ step, durationMs: elapsed(started), result: 'ok' }, 'Pipeline step done');

    const blocks: Block[] = [{ type: 'text', markdown: insights.narrative }];
    // A single value is already in the text: a one-cell table adds nothing.
    const singleValue = rows.length === 1 && columns.length === 1;
    if (rows.length && !singleValue) blocks.push({ type: 'table', columns, rows });
    let chart: ChartSpec | null = null;
    if (insights.chart) {
      const built = buildChart(insights.chart, columns, rows);
      if (built.ok) {
        blocks.push(built.block);
        chart = insights.chart;
      } else {
        // Not a step line (no duration): the reason only, never the rows.
        log.warn({ reason: built.reason }, 'Chart dropped');
      }
    }
    const { narrative, suggestions } = insights;
    return { ...result, kind: 'data', narrative, suggestions, blocks, chart };
  } catch (error) {
    log.info({ step, durationMs: elapsed(started), result: 'error' }, 'Pipeline step failed');
    throw new PipelineError(lastSql, error);
  }
}

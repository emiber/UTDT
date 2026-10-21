import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SAMPLE_ROWS } from './insights.ts';
import { LlmError, type DecisionAnswer } from './llm.ts';
import { answerQuestion, PipelineError, type PipelineLogger } from './pipeline.ts';
import { openTestDataDb } from './testing/dataset.ts';
import {
  fakeClassifier,
  fakeDecisions,
  fakeLlm,
  jsonResponse,
  refusalResponse,
  type FakeDecisions,
} from './testing/fake-llm.ts';

const INSIGHTS = { narrative: 'Ink sold the most.', suggestions: ['A?', 'B?', 'C?'] };
const sqlReply = (sql: string) => jsonResponse({ sql });

let dataDb: DatabaseSync;
let logs: Record<string, unknown>[];
let warnings: Record<string, unknown>[];
let log: PipelineLogger;
let decisions: FakeDecisions;

beforeEach(() => {
  decisions = fakeClassifier();
  dataDb = openTestDataDb();
  logs = [];
  warnings = [];
  log = { info: (fields) => logs.push(fields), warn: (fields) => warnings.push(fields) };
});

afterEach(() => {
  if (dataDb.isOpen) dataDb.close();
});

const ask = (llm: ReturnType<typeof fakeLlm>) =>
  answerQuestion({ question: 'Units per item?', dataDb, llm, decisions, log });

async function rejection(promise: Promise<unknown>): Promise<PipelineError> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(PipelineError);
  return error as PipelineError;
}

describe('answerQuestion', () => {
  it('returns the SQL, the result, the insights and the text and table blocks', async () => {
    const llm = fakeLlm(
      sqlReply('SELECT name, qty FROM items ORDER BY id'),
      jsonResponse(INSIGHTS),
    );

    expect(await ask(llm)).toEqual({
      ok: true,
      kind: 'data',
      classification: 'data_question',
      sql: 'SELECT name, qty FROM items ORDER BY id',
      columns: ['name', 'qty'],
      rows: [
        ['pen', 3],
        ['ink', 5],
      ],
      narrative: 'Ink sold the most.',
      suggestions: ['A?', 'B?', 'C?'],
      chart: null,
      blocks: [
        { type: 'text', markdown: 'Ink sold the most.' },
        {
          type: 'table',
          columns: ['name', 'qty'],
          rows: [
            ['pen', 3],
            ['ink', 5],
          ],
        },
      ],
    });
  });

  it('returns only the text block for an empty result', async () => {
    const llm = fakeLlm(sqlReply('SELECT name FROM items WHERE qty > 99'), jsonResponse(INSIGHTS));

    const result = await ask(llm);

    expect(result.ok && result.blocks).toEqual([{ type: 'text', markdown: 'Ink sold the most.' }]);
  });

  it('returns the last error, without insights, when every SQL attempt fails', async () => {
    const llm = fakeLlm(
      sqlReply('SELECT a FROM items'),
      sqlReply('SELECT b FROM items'),
      sqlReply('SELECT c FROM items'),
    );

    expect(await ask(llm)).toEqual({
      ok: false,
      classification: 'data_question',
      sql: 'SELECT c FROM items',
      kind: 'sql',
      message: 'no such column: c',
    });
    expect(llm.requests).toHaveLength(3);
  });

  it('throws when OpenAI fails while generating the SQL', async () => {
    const error = await rejection(ask(fakeLlm(new Error('503 Service Unavailable'))));

    expect(error.cause).toBeInstanceOf(LlmError);
    expect(error.sql).toBeNull();
  });

  it('throws with the final SQL when the insights fail', async () => {
    const llm = fakeLlm(sqlReply('SELECT name FROM items'), refusalResponse('No.'));

    const error = await rejection(ask(llm));

    expect(error.cause).toBeInstanceOf(LlmError);
    expect(error.sql).toBe('SELECT name FROM items');
    expect(logs.at(-1)).toEqual({
      step: 'insights',
      durationMs: expect.any(Number),
      result: 'error',
    });
  });

  it('keeps the last SQL tried when a retry request fails', async () => {
    const llm = fakeLlm(sqlReply('SELECT nope FROM items'), new Error('429 Rate limit reached'));

    const error = await rejection(ask(llm));

    expect(error.sql).toBe('SELECT nope FROM items');
    expect(logs.at(-1)).toMatchObject({ step: 'sql', result: 'error' });
  });

  it(`gives the table every row while the insights see only ${SAMPLE_ROWS}`, async () => {
    const total = SAMPLE_ROWS + 10;
    const sql = `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ${total}) SELECT i FROM n`;
    const llm = fakeLlm(sqlReply(sql), jsonResponse(INSIGHTS));

    const result = await ask(llm);

    expect(result.ok && result.blocks[1]).toMatchObject({ type: 'table', columns: ['i'] });
    expect(result.ok && (result.blocks[1] as { rows: unknown[] }).rows).toHaveLength(total);
    const prompt = String(llm.requests[1].input);
    expect(prompt).toContain(`Total rows: ${total}`);
    expect(prompt).toContain(`First ${SAMPLE_ROWS} rows`);
  });

  it('throws on an unexpected error, keeping it as the cause', async () => {
    dataDb.exec('DROP TABLE meta_tables');

    const error = await rejection(ask(fakeLlm()));

    expect(error.cause).not.toBeInstanceOf(LlmError);
    expect(error.message).toMatch(/meta_tables/);
  });

  it('logs the SQL and insights steps with their duration', async () => {
    const llm = fakeLlm(sqlReply('SELECT name FROM items'), jsonResponse(INSIGHTS));

    await ask(llm);

    const steps = logs.filter((l) => l.step === 'sql' || l.step === 'insights');
    expect(steps).toEqual([
      { step: 'sql', durationMs: expect.any(Number), result: 'ok' },
      { step: 'insights', durationMs: expect.any(Number), result: 'ok' },
    ]);
  });

  describe('chart', () => {
    const SQL = 'SELECT name, qty FROM items ORDER BY id';
    const SPEC = { type: 'bar', x: 'name', series: ['qty'], title: 'Units' };
    const withChart = (chart: unknown, sql = SQL) =>
      fakeLlm(sqlReply(sql), jsonResponse({ ...INSIGHTS, chart }));

    it('adds the chart block after the table and returns the spec', async () => {
      const result = await ask(withChart(SPEC));

      expect(result.ok && result.blocks.map((b) => b.type)).toEqual(['text', 'table', 'chart']);
      expect(result.ok && result.blocks[2]).toEqual({
        type: 'chart',
        chartType: 'bar',
        title: 'Units',
        labels: ['pen', 'ink'],
        datasets: [{ label: 'qty', data: [3, 5] }],
      });
      expect(result.ok && result.kind === 'data' && result.chart).toEqual(SPEC);
      expect(warnings).toEqual([]);
    });

    it('adds no chart and warns nothing when the spec is null', async () => {
      const result = await ask(withChart(null));

      expect(result.ok && result.blocks.map((b) => b.type)).toEqual(['text', 'table']);
      expect(result.ok && result.kind === 'data' && result.chart).toBeNull();
      expect(warnings).toEqual([]);
    });

    it('drops a spec that does not fit the result, with a warning', async () => {
      const result = await ask(withChart({ ...SPEC, series: ['nope'] }));

      expect(result.ok && result.blocks.map((b) => b.type)).toEqual(['text', 'table']);
      expect(result.ok && result.kind === 'data' && result.chart).toBeNull();
      expect(warnings).toEqual([{ reason: 'column "nope" is not in the result' }]);
    });

    it('drops a spec for an empty result, keeping only the text block', async () => {
      const result = await ask(withChart(SPEC, 'SELECT name, qty FROM items WHERE qty > 99'));

      expect(result.ok && result.blocks.map((b) => b.type)).toEqual(['text']);
      expect(warnings).toEqual([{ reason: 'the result has no rows' }]);
    });
  });
});

describe('answerQuestion: classification', () => {
  const REPLY = {
    narrative: '¡Hola! Puedo responder sobre los artículos.',
    suggestions: ['A?', 'B?', 'C?'],
  };

  it('replies with text only, without SQL, to a message that is not a data question', async () => {
    decisions = fakeClassifier('conversation');
    const llm = fakeLlm(jsonResponse(REPLY));

    expect(await ask(llm)).toEqual({
      ok: true,
      kind: 'reply',
      classification: 'conversation',
      narrative: REPLY.narrative,
      suggestions: REPLY.suggestions,
      blocks: [{ type: 'text', markdown: REPLY.narrative }],
    });
    // The only Responses call is the reply: no SQL was generated.
    expect(llm.requests).toHaveLength(1);
    expect(llm.requests[0].text?.format).toMatchObject({ name: 'reply' });
    expect(logs.map((l) => l.step).filter(Boolean)).toEqual(['classify', 'reply']);
    expect(logs[0]).toMatchObject({
      step: 'classify',
      result: 'conversation',
      confidence: 0.9,
      overridden: false,
    });
  });

  it('answers from the data when the classifier is unsure of another label', async () => {
    decisions = fakeClassifier('out_of_scope', 0.3);
    const llm = fakeLlm(sqlReply('SELECT name FROM items'), jsonResponse(INSIGHTS));

    const result = await ask(llm);

    expect(result).toMatchObject({ ok: true, kind: 'data', classification: 'data_question' });
    expect(logs[0]).toMatchObject({ step: 'classify', result: 'data_question', overridden: true });
  });

  it('gives the classifier the earlier turns', async () => {
    const history = [{ question: 'Units per item?', narrative: 'Ink leads.' }];
    const llm = fakeLlm(sqlReply('SELECT name FROM items'), jsonResponse(INSIGHTS));

    await answerQuestion({ question: 'Show it as a chart', dataDb, llm, decisions, log, history });

    const input = String(decisions.requests[0].input);
    expect(input).toContain('Question: Units per item?');
    expect(input).toContain('Message:\nShow it as a chart');
  });

  it('answers from the data, with a warning, when the classifier fails', async () => {
    decisions = fakeDecisions(new Error('503 Busy'));
    const llm = fakeLlm(sqlReply('SELECT name FROM items'), jsonResponse(INSIGHTS));

    const result = await ask(llm);

    expect(result).toMatchObject({ ok: true, kind: 'data', classification: null });
    expect(warnings).toEqual([
      {
        step: 'classify',
        durationMs: expect.any(Number),
        result: 'error',
        reason: 'OpenAI decision failed: 503 Busy',
      },
    ]);
  });

  it('throws an unexpected classifier error instead of falling back to the data', async () => {
    // An answer missing from the list is a bug, not an OpenAI failure: it must not be hidden.
    decisions = fakeDecisions([null as unknown as DecisionAnswer]);

    const error = await rejection(ask(fakeLlm()));

    expect(error.cause).toBeInstanceOf(TypeError);
    expect(error.sql).toBeNull();
  });

  it('throws when the reply request fails', async () => {
    decisions = fakeClassifier('out_of_scope');

    const error = await rejection(ask(fakeLlm(new Error('500 Server error'))));

    expect(error.cause).toBeInstanceOf(LlmError);
    expect(error.sql).toBeNull();
  });

  it.each([
    ['a single value', 'SELECT count(*) AS n FROM items', ['text']],
    ['two rows of one column', 'SELECT name FROM items', ['text', 'table']],
    ['one row of two columns', 'SELECT name, qty FROM items WHERE id = 1', ['text', 'table']],
  ])('shows a table for %s only when it adds something', async (_case, sql, types) => {
    const result = await ask(fakeLlm(sqlReply(sql), jsonResponse(INSIGHTS)));

    expect(result.ok && result.blocks.map((b) => b.type)).toEqual(types);
  });
});

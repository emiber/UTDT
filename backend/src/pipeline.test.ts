import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SAMPLE_ROWS } from './insights.ts';
import { LlmError, type DecisionAnswer } from './llm.ts';
import { answerQuestion, PipelineError, type PipelineLogger } from './pipeline.ts';
import type { TurnLlmCall } from './conversations.ts';
import { openTestDataDb } from './testing/dataset.ts';
import {
  fakeClassifier,
  fakeDecisions,
  fakeLlm,
  jsonResponse,
  refusalResponse,
  type FakeDecisions,
} from './testing/fake-llm.ts';

const SUGGESTIONS = ['A?', 'B?', 'C?'];
const INSIGHTS = {
  sections: [{ narrative: 'Ink sold the most.', chart: null }],
  suggestions: SUGGESTIONS,
};
// What the LLM answers for several results: a section each, in order.
const sectionsReply = (...sections: { narrative: string; chart?: unknown }[]) =>
  jsonResponse({
    sections: sections.map(({ narrative, chart = null }) => ({ narrative, chart })),
    suggestions: SUGGESTIONS,
  });
const queriesReply = (...queries: { title: string; sql: string }[]) => jsonResponse({ queries });
const sqlReply = (sql: string) => queriesReply({ title: 'Items', sql });

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
      narrative: 'Ink sold the most.',
      results: [
        {
          title: 'Items',
          sql: 'SELECT name, qty FROM items ORDER BY id',
          columns: ['name', 'qty'],
          rows: [
            ['pen', 3],
            ['ink', 5],
          ],
          narrative: 'Ink sold the most.',
          chart: null,
        },
      ],
      suggestions: SUGGESTIONS,
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
      fakeLlm(sqlReply(sql), sectionsReply({ narrative: 'Ink sold the most.', chart }));

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
      expect(result.ok && result.kind === 'data' && result.results[0].chart).toEqual(SPEC);
      expect(warnings).toEqual([]);
    });

    it('adds no chart and warns nothing when the spec is null', async () => {
      const result = await ask(withChart(null));

      expect(result.ok && result.blocks.map((b) => b.type)).toEqual(['text', 'table']);
      expect(result.ok && result.kind === 'data' && result.results[0].chart).toBeNull();
      expect(warnings).toEqual([]);
    });

    it('drops a spec that does not fit the result, with a warning', async () => {
      const result = await ask(withChart({ ...SPEC, series: ['nope'] }));

      expect(result.ok && result.blocks.map((b) => b.type)).toEqual(['text', 'table']);
      expect(result.ok && result.kind === 'data' && result.results[0].chart).toBeNull();
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

describe('answerQuestion: LLM calls', () => {
  const askRecording = async (llm: ReturnType<typeof fakeLlm>) => {
    const calls: TurnLlmCall[] = [];
    const result = await answerQuestion({
      question: 'Units per item?',
      dataDb,
      llm,
      decisions,
      log,
      onLlmCall: (call) => calls.push(call),
    }).catch((error: unknown) => error);
    // step, attempt, model and tokens; the duration is real time, so only its type.
    for (const call of calls) expect(call.durationMs).toEqual(expect.any(Number));
    const summary = calls.map(({ step, attempt, model, inputTokens, outputTokens }) =>
      [step, attempt, model, inputTokens, outputTokens].map(String).join(' '),
    );
    return { result, summary };
  };

  it('reports the classification, the SQL and the answer of a data question', async () => {
    const llm = fakeLlm(sqlReply('SELECT name, qty FROM items'), jsonResponse(INSIGHTS));

    const { summary } = await askRecording(llm);

    expect(summary).toEqual([
      'classify 1 fake-decisions-model 50 0',
      'sql 1 fake-model 100 20',
      'answer 1 fake-model 100 20',
    ]);
  });

  it('reports each SQL attempt with its number', async () => {
    const llm = fakeLlm(
      sqlReply('SELECT nope FROM items'),
      sqlReply('SELECT name FROM items'),
      jsonResponse(INSIGHTS),
    );

    const { summary } = await askRecording(llm);

    expect(summary).toEqual([
      'classify 1 fake-decisions-model 50 0',
      'sql 1 fake-model 100 20',
      'sql 2 fake-model 100 20',
      'answer 1 fake-model 100 20',
    ]);
  });

  it('reports the classification and the text reply of a message that is not a data question', async () => {
    decisions = fakeClassifier('conversation');
    const llm = fakeLlm(jsonResponse({ narrative: '¡Hola!', suggestions: ['A?', 'B?', 'C?'] }));

    const { summary } = await askRecording(llm);

    expect(summary).toEqual(['classify 1 fake-decisions-model 50 0', 'answer 1 fake-model 100 20']);
  });

  it('reports a failed text reply without tokens', async () => {
    decisions = fakeClassifier('out_of_scope');

    const { result, summary } = await askRecording(fakeLlm(new Error('500 Server error')));

    expect(result).toBeInstanceOf(PipelineError);
    expect(summary).toEqual([
      'classify 1 fake-decisions-model 50 0',
      'answer 1 fake-model null null',
    ]);
  });

  it('reports a failed classification without tokens, then the data path', async () => {
    decisions = fakeDecisions(new Error('503 Busy'));
    const llm = fakeLlm(sqlReply('SELECT name FROM items'), jsonResponse(INSIGHTS));

    const { summary } = await askRecording(llm);

    expect(summary).toEqual([
      'classify 1 fake-decisions-model null null',
      'sql 1 fake-model 100 20',
      'answer 1 fake-model 100 20',
    ]);
  });

  it('reports the calls made before the pipeline throws, the failed one included', async () => {
    const llm = fakeLlm(sqlReply('SELECT name FROM items'), new Error('Request timed out.'));

    const { result, summary } = await askRecording(llm);

    expect(result).toBeInstanceOf(PipelineError);
    expect(summary).toEqual([
      'classify 1 fake-decisions-model 50 0',
      'sql 1 fake-model 100 20',
      'answer 1 fake-model null null',
    ]);
  });
});

describe('answerQuestion: several results', () => {
  const CUSTOMERS = 'SELECT name, qty FROM items ORDER BY id';
  const PRODUCTS = 'SELECT name FROM items ORDER BY id';
  const TWO = () =>
    queriesReply({ title: 'Top items', sql: CUSTOMERS }, { title: 'Names', sql: PRODUCTS });
  const SPEC = { type: 'bar', x: 'name', series: ['qty'], title: 'Units' };
  const BAD_SPEC = { ...SPEC, series: ['nope'] };

  it('answers with a section per result: heading and text, table, and chart', async () => {
    const llm = fakeLlm(
      TWO(),
      sectionsReply({ narrative: 'Ink leads.', chart: SPEC }, { narrative: 'Two names.' }),
    );

    const result = await ask(llm);

    expect(result.ok && result.blocks.map((b) => b.type)).toEqual([
      'text',
      'table',
      'chart',
      'text',
      'table',
    ]);
    expect(result.ok && result.blocks[0]).toEqual({
      type: 'text',
      markdown: '### Top items\n\nInk leads.',
    });
    expect(result.ok && result.blocks[1]).toMatchObject({
      type: 'table',
      columns: ['name', 'qty'],
    });
    expect(result.ok && result.blocks[3]).toEqual({
      type: 'text',
      markdown: '### Names\n\nTwo names.',
    });
    expect(result.ok && result.blocks[4]).toMatchObject({ type: 'table', columns: ['name'] });
  });

  it('returns every result, the joined SQL and text for the turn, and the suggestions', async () => {
    const llm = fakeLlm(
      TWO(),
      sectionsReply({ narrative: 'Ink leads.', chart: SPEC }, { narrative: 'Two names.' }),
    );

    const result = await ask(llm);

    expect(result).toMatchObject({
      ok: true,
      kind: 'data',
      sql: `${CUSTOMERS}\n\n${PRODUCTS}`,
      narrative: '### Top items\n\nInk leads.\n\n### Names\n\nTwo names.',
      suggestions: SUGGESTIONS,
    });
    expect(result.ok && result.kind === 'data' && result.results).toEqual([
      {
        title: 'Top items',
        sql: CUSTOMERS,
        columns: ['name', 'qty'],
        rows: [
          ['pen', 3],
          ['ink', 5],
        ],
        narrative: 'Ink leads.',
        chart: SPEC,
      },
      {
        title: 'Names',
        sql: PRODUCTS,
        columns: ['name'],
        rows: [['pen'], ['ink']],
        narrative: 'Two names.',
        chart: null,
      },
    ]);
  });

  it('checks each chart against its own result, dropping a bad one alone', async () => {
    const llm = fakeLlm(
      queriesReply({ title: 'First', sql: CUSTOMERS }, { title: 'Second', sql: CUSTOMERS }),
      sectionsReply({ narrative: 'A.', chart: BAD_SPEC }, { narrative: 'B.', chart: SPEC }),
    );

    const result = await ask(llm);

    expect(warnings).toEqual([{ reason: 'column "nope" is not in the result' }]);
    expect(result.ok && result.blocks.map((b) => b.type)).toEqual([
      'text',
      'table',
      'text',
      'table',
      'chart',
    ]);
    expect(result.ok && result.kind === 'data' && result.results.map((r) => r.chart)).toEqual([
      null,
      SPEC,
    ]);
  });

  it('uses the columns of the right result for each chart', async () => {
    // `qty` is a column of the first result only: the same spec fits one and not the other.
    const llm = fakeLlm(
      TWO(),
      sectionsReply(
        { narrative: 'A.', chart: SPEC },
        {
          narrative: 'B.',
          chart: SPEC,
        },
      ),
    );

    const result = await ask(llm);

    expect(result.ok && result.blocks.filter((b) => b.type === 'chart')).toHaveLength(1);
    expect(warnings).toEqual([{ reason: 'column "qty" is not in the result' }]);
  });

  it('keeps the other sections when one result has no rows', async () => {
    const llm = fakeLlm(
      queriesReply(
        { title: 'Nothing', sql: 'SELECT name, qty FROM items WHERE qty > 99' },
        { title: 'Names', sql: PRODUCTS },
      ),
      sectionsReply({ narrative: 'No results.', chart: SPEC }, { narrative: 'Two names.' }),
    );

    const result = await ask(llm);

    expect(result.ok && result.blocks.map((b) => b.type)).toEqual(['text', 'text', 'table']);
    expect(result.ok && result.blocks[0]).toEqual({
      type: 'text',
      markdown: '### Nothing\n\nNo results.',
    });
    expect(warnings).toEqual([{ reason: 'the result has no rows' }]);
  });

  it('shows a single-value result without a table, in its own section', async () => {
    const llm = fakeLlm(
      queriesReply(
        { title: 'Count', sql: 'SELECT count(*) AS n FROM items' },
        { title: 'Names', sql: PRODUCTS },
      ),
      sectionsReply({ narrative: 'There are 2.' }, { narrative: 'Two names.' }),
    );

    const result = await ask(llm);

    expect(result.ok && result.blocks.map((b) => b.type)).toEqual(['text', 'text', 'table']);
  });

  it('writes a title on one line, so it stays a heading', async () => {
    const llm = fakeLlm(
      queriesReply(
        { title: 'Top\n  items\r\n of all', sql: CUSTOMERS },
        { title: ' Names ', sql: PRODUCTS },
      ),
      sectionsReply({ narrative: 'A.' }, { narrative: 'B.' }),
    );

    const result = await ask(llm);

    expect(result.ok && result.blocks[0]).toEqual({
      type: 'text',
      markdown: '### Top items of all\n\nA.',
    });
    expect(result.ok && result.blocks[2]).toEqual({ type: 'text', markdown: '### Names\n\nB.' });
  });

  it('puts no heading on a single result', async () => {
    const llm = fakeLlm(
      queriesReply({ title: 'Top items', sql: CUSTOMERS }),
      sectionsReply({ narrative: 'Ink leads.' }),
    );

    const result = await ask(llm);

    expect(result.ok && result.blocks[0]).toEqual({ type: 'text', markdown: 'Ink leads.' });
    expect(result.ok && result.kind === 'data' && result.narrative).toBe('Ink leads.');
  });

  it('gives the insights every result, with its title', async () => {
    const llm = fakeLlm(TWO(), sectionsReply({ narrative: 'A.' }, { narrative: 'B.' }));

    await ask(llm);

    expect(llm.requests).toHaveLength(2);
    const prompt = String(llm.requests[1].input);
    expect(prompt).toContain('Result 1: Top items');
    expect(prompt).toContain('Result 2: Names');
  });

  it('makes the same calls as for a single result', async () => {
    const calls: TurnLlmCall[] = [];
    const llm = fakeLlm(TWO(), sectionsReply({ narrative: 'A.' }, { narrative: 'B.' }));

    await answerQuestion({
      question: 'Both?',
      dataDb,
      llm,
      decisions,
      log,
      onLlmCall: (call) => calls.push(call),
    });

    expect(calls.map(({ step, attempt }) => `${step} ${attempt}`)).toEqual([
      'classify 1',
      'sql 1',
      'answer 1',
    ]);
  });

  it('tells why when every attempt fails on one of the queries', async () => {
    const attempt = (n: number) =>
      queriesReply(
        { title: 'Ok', sql: PRODUCTS },
        { title: 'Bad', sql: `SELECT bad${n} FROM items` },
      );
    const llm = fakeLlm(attempt(1), attempt(2), attempt(3));

    expect(await ask(llm)).toEqual({
      ok: false,
      classification: 'data_question',
      sql: `${PRODUCTS}\n\nSELECT bad3 FROM items`,
      kind: 'sql',
      message: 'no such column: bad3',
    });
    expect(llm.requests).toHaveLength(3);
  });

  it('throws with every query joined when the insights fail', async () => {
    const llm = fakeLlm(TWO(), refusalResponse('No.'));

    const error = await rejection(ask(llm));

    expect(error.cause).toBeInstanceOf(LlmError);
    expect(error.sql).toBe(`${CUSTOMERS}\n\n${PRODUCTS}`);
  });

  it('throws when the insights give fewer sections than results', async () => {
    const llm = fakeLlm(TWO(), sectionsReply({ narrative: 'Only one.' }));

    const error = await rejection(ask(llm));

    expect(error.cause).toBeInstanceOf(LlmError);
    expect(error.cause).toMatchObject({ message: 'The model returned no valid insights.' });
  });
});

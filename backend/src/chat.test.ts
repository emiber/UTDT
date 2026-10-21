import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.ts';
import { NO_ANSWER_MESSAGE } from './chat.ts';
import { openDatabase } from './db.ts';
import { openTestDataDb } from './testing/dataset.ts';
import {
  fakeClassifier,
  fakeLlm,
  jsonResponse,
  refusalResponse,
  type FakeDecisions,
  type FakeLlm,
} from './testing/fake-llm.ts';

const ACCESS_KEY = 'test-access-key';
const AUTH = { authorization: `Bearer ${ACCESS_KEY}` };
const INSIGHTS = { narrative: 'Ink leads with 999 units.', suggestions: ['A?', 'B?', 'C?'] };
const sqlReply = (sql: string) => jsonResponse({ sql });

let db: DatabaseSync;
let dataDb: DatabaseSync;
let app: FastifyInstance | undefined;
let llm: FakeLlm;
let decisions: FakeDecisions;

beforeEach(() => {
  decisions = fakeClassifier();
  db = openDatabase(':memory:');
  dataDb = openTestDataDb();
});

afterEach(async () => {
  await app?.close();
  app = undefined;
  if (db.isOpen) db.close();
  if (dataDb.isOpen) dataDb.close();
});

/** Builds the app with a fake LLM that gives these replies, in order. */
function start(...replies: Parameters<typeof fakeLlm>) {
  llm = fakeLlm(...replies);
  app = buildApp({ db, dataDb, llm, decisions, accessKey: ACCESS_KEY });
  return app;
}

const chat = (payload: unknown, headers: Record<string, string> = AUTH) =>
  app!.inject({ method: 'POST', url: '/api/chat', headers, payload: payload as object });

const turns = () =>
  db.prepare('SELECT * FROM turns ORDER BY id').all() as Record<string, unknown>[];
const llmCalls = () =>
  db
    .prepare(
      'SELECT turn_id, step, attempt, model, input_tokens, output_tokens FROM llm_calls ORDER BY id',
    )
    .all();
const conversationCount = () =>
  (db.prepare('SELECT count(*) AS n FROM conversations').get() as { n: number }).n;

describe('POST /api/chat', () => {
  it('requires the access key', async () => {
    start();

    const res = await chat({ question: 'Hi?' }, {});

    expect(res.statusCode).toBe(401);
  });

  it('answers in a new conversation with text and table blocks, and saves the turn', async () => {
    start(sqlReply('SELECT name, qty FROM items ORDER BY id'), jsonResponse(INSIGHTS));

    const res = await chat({ question: 'Units per item?' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual({
      conversationId: expect.any(String),
      turnId: expect.any(Number),
      blocks: [
        { type: 'text', markdown: 'Ink leads with 999 units.' },
        {
          type: 'table',
          columns: ['name', 'qty'],
          rows: [
            ['pen', 3],
            ['ink', 5],
          ],
        },
      ],
      suggestions: ['A?', 'B?', 'C?'],
    });
    expect(turns()).toEqual([
      {
        id: body.turnId,
        conversation_id: body.conversationId,
        created_at: expect.any(String),
        question: 'Units per item?',
        sql: 'SELECT name, qty FROM items ORDER BY id',
        narrative: 'Ink leads with 999 units.',
        response: JSON.stringify({ blocks: body.blocks, suggestions: body.suggestions }),
        error: null,
        duration_ms: expect.any(Number),
        classification: 'data_question',
      },
    ]);
  });

  it('saves each LLM call of the turn, linked to it', async () => {
    start(
      sqlReply('SELECT nope FROM items'),
      sqlReply('SELECT name FROM items'),
      jsonResponse(INSIGHTS),
    );

    const { turnId } = (await chat({ question: 'Names?' })).json();

    const call = { turn_id: turnId, attempt: 1, model: 'fake-model' };
    expect(llmCalls()).toEqual([
      {
        ...call,
        step: 'classify',
        model: 'fake-decisions-model',
        input_tokens: 50,
        output_tokens: 0,
      },
      { ...call, step: 'sql', input_tokens: 100, output_tokens: 20 },
      { ...call, step: 'sql', attempt: 2, input_tokens: 100, output_tokens: 20 },
      { ...call, step: 'answer', input_tokens: 100, output_tokens: 20 },
    ]);
  });

  it('adds a second question to the same conversation', async () => {
    start(
      sqlReply('SELECT name FROM items'),
      jsonResponse(INSIGHTS),
      sqlReply('SELECT qty FROM items'),
      jsonResponse(INSIGHTS),
    );

    const first = (await chat({ question: 'Names?' })).json();
    const second = (
      await chat({ question: 'Units?', conversationId: first.conversationId })
    ).json();

    expect(second.conversationId).toBe(first.conversationId);
    expect(second.turnId).not.toBe(first.turnId);
    expect(conversationCount()).toBe(1);
    expect(turns().map((t) => t.conversation_id)).toEqual([
      first.conversationId,
      first.conversationId,
    ]);
  });

  it('builds the table from the real rows, repeated columns included', async () => {
    start(
      sqlReply('SELECT a.id, b.id, a.name FROM items a JOIN items b ON b.id = a.id'),
      jsonResponse(INSIGHTS),
    );

    const table = (await chat({ question: 'Ids?' })).json().blocks[1];

    expect(table).toEqual({
      type: 'table',
      columns: ['id', 'id', 'name'],
      rows: [
        [1, 1, 'pen'],
        [2, 2, 'ink'],
      ],
    });
  });

  it('answers an empty result with the text block only', async () => {
    start(sqlReply('SELECT name FROM items WHERE qty > 99'), jsonResponse(INSIGHTS));

    const body = (await chat({ question: 'Big items?' })).json();

    expect(body.blocks).toEqual([{ type: 'text', markdown: 'Ink leads with 999 units.' }]);
    expect(body.suggestions).toHaveLength(3);
  });

  it('adds the chart block after the table, without the spec in the response', async () => {
    const chart = { type: 'bar', x: 'name', series: ['qty', 'id'], title: 'Units per item' };
    // A repeated x value stays a separate point: nothing is grouped.
    const sql = "SELECT name, qty, id FROM items UNION ALL SELECT 'pen', 1, 9";
    start(sqlReply(sql), jsonResponse({ ...INSIGHTS, chart }));

    const body = (await chat({ question: 'Units per item?' })).json();

    expect(body.blocks.map((b: { type: string }) => b.type)).toEqual(['text', 'table', 'chart']);
    expect(body.blocks[2]).toEqual({
      type: 'chart',
      chartType: 'bar',
      title: 'Units per item',
      labels: ['pen', 'ink', 'pen'],
      datasets: [
        { label: 'qty', data: [3, 5, 1] },
        { label: 'id', data: [1, 2, 9] },
      ],
    });
    expect(Object.keys(body)).toEqual(['conversationId', 'turnId', 'blocks', 'suggestions']);
  });

  it.each([
    ['an unknown x', { type: 'bar', x: 'day', series: ['qty'], title: 't' }],
    ['a text series', { type: 'bar', x: 'qty', series: ['name'], title: 't' }],
    ['a pie with two series', { type: 'pie', x: 'name', series: ['qty', 'id'], title: 't' }],
  ])('answers 200 without a chart for %s, with one insights call', async (_case, chart) => {
    start(sqlReply('SELECT id, name, qty FROM items'), jsonResponse({ ...INSIGHTS, chart }));

    const res = await chat({ question: 'Units?' });

    expect(res.statusCode).toBe(200);
    expect(res.json().blocks.map((b: { type: string }) => b.type)).toEqual(['text', 'table']);
    expect(res.json().suggestions).toHaveLength(3);
    expect(llm.requests).toHaveLength(2);
  });

  it('logs a dropped chart as a warning with its reason, not the rows', async () => {
    const lines: string[] = [];
    const chart = { type: 'bar', x: 'day', series: ['qty'], title: 't' };
    llm = fakeLlm(sqlReply('SELECT name, qty FROM items'), jsonResponse({ ...INSIGHTS, chart }));
    app = buildApp({
      db,
      dataDb,
      llm,
      decisions,
      accessKey: ACCESS_KEY,
      logger: { level: 'info', stream: { write: (line: string) => lines.push(line) } },
    });

    await chat({ question: 'Units?' });

    const warnings = lines.map((line) => JSON.parse(line)).filter((entry) => entry.level === 40);
    expect(warnings).toEqual([
      expect.objectContaining({
        msg: 'Chart dropped',
        reason: 'column "day" is not in the result',
      }),
    ]);
    expect(JSON.stringify(warnings)).not.toContain('ink');
  });

  it('answers an empty result with the text block only, even with a chart spec', async () => {
    const chart = { type: 'bar', x: 'name', series: ['qty'], title: 't' };
    start(
      sqlReply('SELECT name, qty FROM items WHERE qty > 99'),
      jsonResponse({ ...INSIGHTS, chart }),
    );

    const body = (await chat({ question: 'Big items?' })).json();

    expect(body.blocks.map((b: { type: string }) => b.type)).toEqual(['text']);
  });

  describe('conversation history', () => {
    it('sends the earlier turns to the SQL and insights requests, never their rows', async () => {
      dataDb.exec("INSERT INTO items (name, qty) VALUES ('zz-sentinel', 42)");
      start(
        sqlReply('SELECT name, qty FROM items ORDER BY id'),
        // A chart too, so the sentinel is in the first turn's saved table and chart blocks.
        jsonResponse({
          ...INSIGHTS,
          chart: { type: 'bar', x: 'name', series: ['qty'], title: 't' },
        }),
        // The second turn's own rows leave the sentinel out: only the first turn has it.
        sqlReply('SELECT name FROM items WHERE qty < 10'),
        jsonResponse(INSIGHTS),
        sqlReply('SELECT qty FROM items'),
        jsonResponse(INSIGHTS),
      );

      const first = (await chat({ question: 'Units per item?' })).json();
      await chat({ question: 'And only names?', conversationId: first.conversationId });
      await chat({ question: 'Fresh start?' });

      const prompts = llm.requests.map((request) => String(request.input));
      const firstTurn = [
        'Question: Units per item?',
        'SQL: SELECT name, qty FROM items ORDER BY id',
        'Answer: Ink leads with 999 units.',
      ].join('\n');
      for (const prompt of prompts.slice(2, 4)) {
        expect(prompt).toContain(firstTurn);
        expect(prompt).not.toContain('zz-sentinel');
        expect(prompt).not.toContain('Turn 2:');
      }
      for (const prompt of prompts.slice(4)) {
        expect(prompt).not.toContain('Conversation so far');
      }
    });

    it('sends only the question of a turn whose SQL attempts all failed', async () => {
      start(
        sqlReply('SELECT zz_bad FROM items'),
        sqlReply('SELECT zz_bad FROM items'),
        sqlReply('SELECT zz_bad FROM items'),
        sqlReply('SELECT name FROM items'),
        jsonResponse(INSIGHTS),
      );

      const first = (await chat({ question: 'Colors?' })).json();
      await chat({ question: 'And names?', conversationId: first.conversationId });

      const onlyQuestion = ['Turn 1:', 'Question: Colors?', '', 'Question:', 'And names?'].join(
        '\n',
      );
      for (const prompt of llm.requests.slice(3).map((request) => String(request.input))) {
        expect(prompt).toContain(onlyQuestion);
        expect(prompt).not.toContain('zz_bad');
        expect(prompt).not.toContain(NO_ANSWER_MESSAGE);
      }
    });
  });

  it.each([
    ['no question', {}],
    ['a question that is not a string', { question: 42 }],
    ['an empty question', { question: '' }],
    ['a blank question', { question: ' \n ' }],
    ['a conversationId that is not a string', { question: 'Hi?', conversationId: 7 }],
    ['an empty conversationId', { question: 'Hi?', conversationId: '' }],
  ])('rejects %s with a 400, without calling OpenAI or saving', async (_case, payload) => {
    start();

    const res = await chat(payload);

    expect(res.statusCode).toBe(400);
    expect(llm.requests).toHaveLength(0);
    expect(turns()).toHaveLength(0);
  });

  it('answers a greeting with text only, saving the turn with its classification', async () => {
    decisions = fakeClassifier('conversation');
    const reply = {
      narrative: '¡Hola! Puedo responder sobre artículos.',
      suggestions: ['A?', 'B?', 'C?'],
    };
    start(jsonResponse(reply));

    const res = await chat({ question: 'Hola!' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      blocks: [{ type: 'text', markdown: reply.narrative }],
      suggestions: reply.suggestions,
    });
    expect(turns()[0]).toMatchObject({
      question: 'Hola!',
      sql: null,
      narrative: reply.narrative,
      error: null,
      classification: 'conversation',
    });
  });

  it('answers 404 for an unknown conversation, without calling OpenAI or saving', async () => {
    start();

    const res = await chat({ question: 'Hi?', conversationId: 'nope' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'Conversation not found.',
    });
    expect(llm.requests).toHaveLength(0);
    expect(conversationCount()).toBe(0);
  });

  it('answers with a fixed message when every SQL attempt fails, and saves the error', async () => {
    start(
      sqlReply('SELECT a FROM items'),
      sqlReply('SELECT b FROM items'),
      sqlReply('SELECT c FROM items'),
    );

    const res = await chat({ question: 'Colors?' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      conversationId: expect.any(String),
      turnId: expect.any(Number),
      blocks: [{ type: 'text', markdown: NO_ANSWER_MESSAGE }],
      suggestions: [],
    });
    expect(llm.requests).toHaveLength(3);
    expect(turns()[0]).toMatchObject({
      sql: 'SELECT c FROM items',
      narrative: null,
      error: 'sql: no such column: c',
    });
  });

  it.each([
    ['the SQL request throws', [new Error('429 Rate limit reached')], null],
    ['the SQL request is refused', [refusalResponse('No.')], null],
    [
      'a retry request throws',
      [sqlReply('SELECT nope FROM items'), new Error('429 Rate limit reached')],
      'SELECT nope FROM items',
    ],
    [
      'the insights request fails',
      [sqlReply('SELECT name FROM items'), new Error('500 Internal Server Error')],
      'SELECT name FROM items',
    ],
  ])('answers 502 with a generic message when %s', async (_case, replies, sql) => {
    start(...replies);

    const res = await chat({ question: 'Names?' });

    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({
      statusCode: 502,
      error: 'Bad Gateway',
      message: 'The language model request failed. Try again.',
    });
    const [turn] = turns();
    expect(turn).toMatchObject({ sql, response: null, narrative: null });
    expect(turn.error).toMatch(/429|refused|500/);
    // The failed turn keeps every call it made: the classification, then one per reply.
    const calls = llmCalls() as { turn_id: number }[];
    expect(calls).toHaveLength(1 + replies.length);
    expect(calls.every((call) => call.turn_id === turn.id)).toBe(true);
  });

  it('answers 500 with a generic message on an unexpected error, and saves it', async () => {
    start();
    dataDb.exec('DROP TABLE meta_tables');

    const res = await chat({ question: 'Names?' });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Something went wrong while answering the question.',
    });
    expect(turns()[0].error).toMatch(/no such table: meta_tables/);
  });

  it('keeps the LLM calls made before an unexpected error', async () => {
    start(sqlReply('SELECT name FROM items'));
    const create = llm.createResponse;
    llm.createResponse = async (body) => {
      // The SQL arrives, but the data.db connection is gone when it runs.
      dataDb.close();
      return create(body);
    };

    const res = await chat({ question: 'Names?' });

    expect(res.statusCode).toBe(500);
    const [turn] = turns();
    expect(llmCalls()).toEqual([
      expect.objectContaining({ turn_id: turn.id, step: 'classify' }),
      expect.objectContaining({ turn_id: turn.id, step: 'sql', input_tokens: 100 }),
    ]);
  });

  it('saves a failed answer call with no tokens', async () => {
    start(sqlReply('SELECT name FROM items'), new Error('500 Internal Server Error'));

    const res = await chat({ question: 'Names?' });

    expect(res.statusCode).toBe(502);
    expect(llmCalls()).toEqual([
      expect.objectContaining({ step: 'classify', input_tokens: 50 }),
      expect.objectContaining({ step: 'sql', input_tokens: 100, output_tokens: 20 }),
      expect.objectContaining({ step: 'answer', input_tokens: null, output_tokens: null }),
    ]);
  });

  it('logs each pipeline step, persist included, with its duration', async () => {
    const lines: string[] = [];
    llm = fakeLlm(sqlReply('SELECT name FROM items'), jsonResponse(INSIGHTS));
    app = buildApp({
      db,
      dataDb,
      llm,
      decisions,
      accessKey: ACCESS_KEY,
      logger: { level: 'info', stream: { write: (line: string) => lines.push(line) } },
    });

    await chat({ question: 'Names?' });

    const steps = lines.map((line) => JSON.parse(line)).filter((entry) => entry.step);
    expect(steps.map((s) => s.step)).toEqual([
      'classify',
      'generate_sql',
      'execute_sql',
      'sql',
      'insights',
      'persist',
    ]);
    expect(steps.at(-1)).toMatchObject({ durationMs: expect.any(Number), result: 'ok' });
    expect(lines.join('\n')).not.toContain(ACCESS_KEY);
  });

  it('answers a generic 500 when the conversation cannot be read', async () => {
    start();
    db.exec('DROP TABLE turns; DROP TABLE conversations');

    const res = await chat({ question: 'Names?', conversationId: 'some-id' });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Could not read the conversation.',
    });
    expect(llm.requests).toHaveLength(0);
  });

  it('answers 500 when the turn cannot be saved', async () => {
    start(sqlReply('SELECT name FROM items'), jsonResponse(INSIGHTS));
    db.exec('DROP TABLE turns');

    const res = await chat({ question: 'Names?' });

    expect(res.statusCode).toBe(500);
    expect(res.json().message).toBe('Could not save the turn.');
    expect(conversationCount()).toBe(0);
  });

  it('creates the app tables at startup and keeps their data on the next start', async () => {
    start(sqlReply('SELECT name FROM items'), jsonResponse(INSIGHTS));
    await chat({ question: 'Names?' });
    await app!.close();

    start();

    expect(turns()).toHaveLength(1);
  });
});

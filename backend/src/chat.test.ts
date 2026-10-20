import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.ts';
import { NO_ANSWER_MESSAGE } from './chat.ts';
import { openDatabase } from './db.ts';
import { openTestDataDb } from './testing/dataset.ts';
import { fakeLlm, jsonResponse, refusalResponse, type FakeLlm } from './testing/fake-llm.ts';

const ACCESS_KEY = 'test-access-key';
const AUTH = { authorization: `Bearer ${ACCESS_KEY}` };
const INSIGHTS = { narrative: 'Ink leads with 999 units.', suggestions: ['A?', 'B?', 'C?'] };
const sqlReply = (sql: string) => jsonResponse({ sql });

let db: DatabaseSync;
let dataDb: DatabaseSync;
let app: FastifyInstance | undefined;
let llm: FakeLlm;

beforeEach(() => {
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
  app = buildApp({ db, dataDb, llm, accessKey: ACCESS_KEY });
  return app;
}

const chat = (payload: unknown, headers: Record<string, string> = AUTH) =>
  app!.inject({ method: 'POST', url: '/api/chat', headers, payload: payload as object });

const turns = () =>
  db.prepare('SELECT * FROM turns ORDER BY id').all() as Record<string, unknown>[];
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
      },
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

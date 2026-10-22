import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.ts';
import { saveTurn } from './conversations.ts';
import { openDatabase } from './db.ts';
import { readPrices } from './prices.ts';
import { openTestDataDb } from './testing/dataset.ts';
import { fakeClassifier, fakeLlm } from './testing/fake-llm.ts';

const ACCESS_KEY = 'test-access-key';
const AUTH = { authorization: `Bearer ${ACCESS_KEY}` };
const QUERY = 'from=2026-10-19&to=2026-10-25&granularity=day&tz=-180';

let db: DatabaseSync;
let dataDb: DatabaseSync;
let app: FastifyInstance;

beforeEach(() => {
  db = openDatabase(':memory:');
  dataDb = openTestDataDb();
  app = buildApp({
    db,
    dataDb,
    llm: fakeLlm(),
    decisions: fakeClassifier(),
    accessKey: ACCESS_KEY,
    prices: readPrices({ OPENAI_PRICES: 'gpt-a=1/10' }),
  });
  const { turnId } = saveTurn(db, null, {
    question: 'Units?',
    sql: null,
    narrative: null,
    response: null,
    error: null,
    durationMs: 1,
    classification: null,
    llmCalls: [
      {
        step: 'sql',
        attempt: 1,
        model: 'gpt-a',
        durationMs: 900,
        inputTokens: 400,
        outputTokens: 30,
      },
    ],
  });
  db.prepare('UPDATE turns SET created_at = ? WHERE id = ?').run(
    '2026-10-20T15:00:00.000Z',
    turnId,
  );
});

afterEach(async () => {
  await app.close();
  if (db.isOpen) db.close();
  dataDb.close();
});

const get = (query: string, headers: Record<string, string> = AUTH) =>
  app.inject({ method: 'GET', url: `/api/usage?${query}`, headers });

describe('GET /api/usage', () => {
  it('requires the access key', async () => {
    expect((await get(QUERY, {})).statusCode).toBe(401);
  });

  it('returns the report of the period, with the configured prices', async () => {
    const res = await get(`${QUERY}&model=gpt-a&step=sql`);

    expect(res.statusCode).toBe(200);
    const report = res.json();
    expect(report.filters).toEqual({
      from: '2026-10-19',
      to: '2026-10-25',
      granularity: 'day',
      tz: -180,
      model: 'gpt-a',
      step: 'sql',
    });
    expect(report.totals).toMatchObject({ calls: 1, turns: 1, costUsd: 0.0007 });
    expect(report.series).toHaveLength(7);
  });

  it('answers a generic 500 when the report fails', async () => {
    db.close();

    const res = await get(QUERY);

    expect(res.statusCode).toBe(500);
    expect(res.json().message).toBe('Something went wrong on the server.');
  });

  it.each([
    ['a missing parameter', 'from=2026-10-19&to=2026-10-25&granularity=day', /tz/],
    ['an unknown granularity', QUERY.replace('day', 'year'), /granularity/],
    ['a malformed date', QUERY.replace('2026-10-19', '19/10/2026'), /from/],
    ['an unknown step', `${QUERY}&step=judge`, /step/],
    ['a tz that is not a number', QUERY.replace('-180', 'UTC'), /tz/],
    ['an impossible date', QUERY.replace('2026-10-25', '2026-02-30'), /to is not a valid date/],
    ['an out-of-range tz', QUERY.replace('-180', '-900'), /tz must be/],
    [
      'too many intervals',
      'from=2026-01-01&to=2026-12-31&granularity=hour&tz=0',
      /more than 1000 intervals/,
    ],
  ])('answers 400 for %s', async (_case, query, message) => {
    const res = await get(query);

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ statusCode: 400, error: 'Bad Request', message });
  });
});

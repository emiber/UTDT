import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createConversationTables,
  saveTurn,
  type Turn,
  type TurnLlmCall,
} from './conversations.ts';
import { openDatabase } from './db.ts';
import { readPrices } from './prices.ts';
import { buildUsageReport, MAX_BUCKETS, TOP_TURNS, type UsageFilters } from './usage.ts';

const PRICES = readPrices({ OPENAI_PRICES: 'gpt-a=1/10' });
// Argentina: UTC-3.
const TZ = -180;

let db: DatabaseSync;

const call = (
  step: TurnLlmCall['step'],
  model: string,
  durationMs: number,
  inputTokens: number | null,
  outputTokens: number | null,
  attempt = 1,
): TurnLlmCall => ({ step, attempt, model, durationMs, inputTokens, outputTokens });

/** Saves a turn with these calls, as if it had been saved at `createdAt` (UTC). */
function turn(createdAt: string, question: string, llmCalls: TurnLlmCall[]): number {
  const base: Turn = {
    question,
    sql: null,
    narrative: null,
    response: null,
    error: null,
    durationMs: 1,
    classification: null,
    llmCalls,
  };
  const { turnId } = saveTurn(db, null, base);
  db.prepare('UPDATE turns SET created_at = ? WHERE id = ?').run(createdAt, turnId);
  return turnId;
}

let a: number;
let b: number;
let c: number;

beforeEach(() => {
  db = openDatabase(':memory:');
  createConversationTables(db);
  // 23:30 on Monday 2026-10-19 in UTC-3, but already Tuesday in UTC.
  a = turn('2026-10-20T02:30:00.000Z', 'Sales per month?', [
    call('classify', 'gpt-dec', 300, 50, 0),
    call('sql', 'gpt-a', 900, 400, 30),
    call('answer', 'gpt-a', 1500, 600, 100),
  ]);
  // Noon on Tuesday 2026-10-20: the second SQL attempt never got a response.
  b = turn('2026-10-20T15:00:00.000Z', 'Units per item?', [
    call('classify', 'gpt-dec', 200, 50, 0),
    call('sql', 'gpt-a', 1000, 400, 30),
    call('sql', 'gpt-a', 30000, null, null, 2),
  ]);
  // Monday 2026-10-26, the next week.
  c = turn('2026-10-26T13:00:00.000Z', 'Hello!', [
    call('classify', 'gpt-dec', 250, 50, 0),
    call('answer', 'gpt-a', 800, 300, 50),
  ]);
  // September: outside the October periods below.
  turn('2026-09-30T12:00:00.000Z', 'Old one', [call('classify', 'gpt-dec', 100, 10, 0)]);
});

afterEach(() => {
  db.close();
});

const report = (filters: Partial<UsageFilters> = {}, prices = PRICES) =>
  buildUsageReport(
    db,
    { from: '2026-10-19', to: '2026-10-26', granularity: 'day', tz: TZ, ...filters },
    prices,
  );

describe('buildUsageReport', () => {
  it('adds up the calls of the period', () => {
    expect(report().totals).toEqual({
      calls: 8,
      turns: 3,
      inputTokens: 1850,
      outputTokens: 210,
      // gpt-a only: (1700 input × $1 + 210 output × $10) per million tokens.
      costUsd: 0.0038,
      avgMs: 4369,
      maxMs: 30000,
      failedCalls: 1,
      sqlRetries: 1,
    });
  });

  it('lists every day of the period, empty ones included, in local time', () => {
    const { series } = report();

    expect(series.map((s) => [s.bucket, s.turns, s.calls])).toEqual([
      ['2026-10-19', 1, 3],
      ['2026-10-20', 1, 3],
      ['2026-10-21', 0, 0],
      ['2026-10-22', 0, 0],
      ['2026-10-23', 0, 0],
      ['2026-10-24', 0, 0],
      ['2026-10-25', 0, 0],
      ['2026-10-26', 1, 2],
    ]);
    expect(series[0]).toEqual({
      bucket: '2026-10-19',
      turns: 1,
      calls: 3,
      inputTokens: 1050,
      outputTokens: 130,
      costUsd: (1000 * 1 + 130 * 10) / 1_000_000,
      tokensByStep: { classify: 50, sql: 430, answer: 700 },
    });
    expect(series[2]).toMatchObject({
      costUsd: null,
      tokensByStep: { classify: 0, sql: 0, answer: 0 },
    });
  });

  it('puts the 23:30 turn on its UTC day when the browser is on UTC', () => {
    const { series } = report({ tz: 0 });

    expect(series.slice(0, 2).map((s) => [s.bucket, s.turns])).toEqual([
      ['2026-10-19', 0],
      ['2026-10-20', 2],
    ]);
  });

  it.each([
    ['hour', { from: '2026-10-19', to: '2026-10-19' }, 24, ['2026-10-19 23:00', 1]],
    ['week', {}, 2, ['2026-10-19', 2]],
    ['month', { from: '2026-09-01', to: '2026-10-31' }, 2, ['2026-09', 1]],
  ] as const)('groups by %s', (granularity, period, count, [first, turns]) => {
    const { series } = report({ granularity, ...period });

    expect(series).toHaveLength(count);
    expect(series.find((s) => s.turns > 0)).toMatchObject({ bucket: first, turns });
  });

  it('crosses into the next year by month', () => {
    const { series } = report({ granularity: 'month', from: '2026-11-15', to: '2027-01-10' });

    expect(series.map((s) => s.bucket)).toEqual(['2026-11', '2026-12', '2027-01']);
  });

  it('starts a week on the Monday before the period', () => {
    const { series } = report({ granularity: 'week', from: '2026-10-21', to: '2026-10-27' });

    expect(series.map((s) => s.bucket)).toEqual(['2026-10-19', '2026-10-26']);
  });

  it('breaks the calls down by step and model, with their times', () => {
    expect(report().breakdown).toEqual([
      {
        step: 'classify',
        model: 'gpt-dec',
        calls: 3,
        inputTokens: 150,
        outputTokens: 0,
        costUsd: null,
        avgMs: 250,
        maxMs: 300,
        failedCalls: 0,
      },
      {
        step: 'sql',
        model: 'gpt-a',
        calls: 3,
        inputTokens: 800,
        outputTokens: 60,
        costUsd: (800 + 600) / 1_000_000,
        avgMs: 10633,
        maxMs: 30000,
        failedCalls: 1,
      },
      {
        step: 'answer',
        model: 'gpt-a',
        calls: 2,
        inputTokens: 900,
        outputTokens: 150,
        costUsd: (900 + 1500) / 1_000_000,
        avgMs: 1150,
        maxMs: 1500,
        failedCalls: 0,
      },
    ]);
  });

  it('orders the breakdown by step, then by model', () => {
    turn('2026-10-21T12:00:00.000Z', 'Other model', [call('sql', 'gpt-b', 500, 10, 1)]);

    expect(report().breakdown.map((r) => `${r.step} ${r.model}`)).toEqual([
      'classify gpt-dec',
      'sql gpt-a',
      'sql gpt-b',
      'answer gpt-a',
    ]);
  });

  it(`lists the turns with the most tokens, at most ${TOP_TURNS}, with their question`, () => {
    for (let n = 0; n < TOP_TURNS; n++) {
      turn('2026-10-22T12:00:00.000Z', `Small ${n}`, [call('classify', 'gpt-dec', 10, 1, 0)]);
    }

    const { topTurns } = report();

    expect(topTurns).toHaveLength(TOP_TURNS);
    expect(topTurns.slice(0, 3).map((t) => [t.turnId, t.inputTokens + t.outputTokens])).toEqual([
      [a, 1180],
      [b, 480],
      [c, 400],
    ]);
    expect(topTurns[0]).toEqual({
      turnId: a,
      createdAt: '2026-10-20T02:30:00.000Z',
      question: 'Sales per month?',
      calls: 3,
      inputTokens: 1050,
      outputTokens: 130,
      costUsd: 0.0023,
      durationMs: 2700,
    });
  });

  it('filters by model and step', () => {
    expect(report({ model: 'gpt-dec' }).totals).toMatchObject({
      calls: 3,
      turns: 3,
      costUsd: null,
    });
    expect(report({ step: 'sql' }).totals).toMatchObject({
      calls: 3,
      turns: 2,
      failedCalls: 1,
      sqlRetries: 1,
    });
    expect(report({ model: 'gpt-a', step: 'answer' }).breakdown).toHaveLength(1);
  });

  it('lists every model for the filter, and the ones without a price', () => {
    const filtered = report({ model: 'gpt-a' });

    expect(filtered.models).toEqual(['gpt-a', 'gpt-dec']);
    expect(filtered.unpricedModels).toEqual([]);
    expect(report().unpricedModels).toEqual(['gpt-dec']);
    expect(report({}, new Map()).totals.costUsd).toBeNull();
  });

  it('reports zeros, and no times or cost, for a period without calls', () => {
    expect(report({ from: '2026-11-01', to: '2026-11-02' }).totals).toEqual({
      calls: 0,
      turns: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: null,
      avgMs: null,
      maxMs: null,
      failedCalls: 0,
      sqlRetries: 0,
    });
  });

  it(`accepts up to ${MAX_BUCKETS} intervals and refuses more`, () => {
    // 41 days by the hour is 984 intervals; 42 is 1008.
    expect(
      report({ granularity: 'hour', from: '2026-10-01', to: '2026-11-10' }).series,
    ).toHaveLength(984);
    expect(() => report({ granularity: 'hour', from: '2026-10-01', to: '2026-11-11' })).toThrow(
      `more than ${MAX_BUCKETS} intervals`,
    );
  });

  it.each([
    [{ from: '2026-02-30' }, 'from is not a valid date'],
    [{ to: '2026-13-01' }, 'to is not a valid date'],
    [{ from: '2026-10-27' }, 'from must not be after to'],
    [{ tz: 900 }, 'tz must be a whole number'],
    [{ tz: 1.5 }, 'tz must be a whole number'],
  ])('refuses %j', (filters, message) => {
    expect(() => report(filters)).toThrow(message);
  });
});

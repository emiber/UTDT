import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from './db.ts';
import { runEvalCommand, type EvalCommandOptions } from './eval-command.ts';
import type { DecisionAnswer } from './llm.ts';
import { createMetadataTables, insertMetadata } from './metadata.ts';
import {
  fakeDecisions,
  fakeLlm,
  jsonResponse,
  type FakeDecisions,
  type FakeLlm,
} from './testing/fake-llm.ts';

const ENV = {
  OPENAI_API_KEY: 'sk-test-key',
  OPENAI_MODEL: 'test-model',
  OPENAI_DECISIONS_MODEL: 'judge-model',
};
const NOW = new Date('2026-10-20T10:00:00.000Z');
const score = (value: number): DecisionAnswer => ({
  type: 'score',
  name: null,
  score: value,
  confidence: 0.9,
  probabilities: [],
});

let dir: string;
let lines: string[];
let llm: FakeLlm;
let judge: FakeDecisions;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'utdt-eval-'));
  const db = openDatabase(path.join(dir, 'data.db'));
  createMetadataTables(db);
  db.exec(`
    CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT, qty INTEGER);
    INSERT INTO items (name, qty) VALUES ('pen', 3), ('ink', 5);
  `);
  insertMetadata(db, {
    tables: [{ tableName: 'items', description: 'One row per item.' }],
    columns: [
      { tableName: 'items', columnName: 'qty', dataType: 'INTEGER', description: 'Units.' },
    ],
    relationships: [],
  });
  db.close();
  writeGolden([
    { id: 'units', question: 'Units per item?' },
    { id: 'colors', question: 'Colors?' },
  ]);
  lines = [];
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeGolden(content: unknown) {
  writeFileSync(
    path.join(dir, 'golden.json'),
    typeof content === 'string' ? content : JSON.stringify(content),
  );
}

function run(overrides: Partial<EvalCommandOptions> = {}) {
  return runEvalCommand({
    env: ENV,
    goldenPath: path.join(dir, 'golden.json'),
    dataDbPath: path.join(dir, 'data.db'),
    reportDir: path.join(dir, 'reports'),
    print: (line) => lines.push(line),
    now: () => NOW,
    createLlm: () => llm,
    createJudge: () => judge,
    ...overrides,
  });
}

describe('runEvalCommand', () => {
  it('judges each question, prints the lines and the summary, writes the report and returns 0', async () => {
    const bad = jsonResponse({ sql: 'SELECT nope FROM items' });
    llm = fakeLlm(
      jsonResponse({ sql: 'SELECT name, qty FROM items' }),
      jsonResponse({ narrative: 'Ink leads.', suggestions: ['A?', 'B?', 'C?'], chart: null }),
      bad,
      bad,
      bad,
    );
    judge = fakeDecisions([score(2), score(1.5)]);

    const code = await run();

    expect(code).toBe(0);
    const reportPath = path.join(dir, 'reports', 'eval-2026-10-20T10-00-00-000Z.json');
    expect(lines).toEqual([
      'units: sql 2.00/2 | narrative 1.50/2 | chart n/a',
      'colors: no answer (sql: no such column: nope)',
      'Summary: 2 questions, 1 answered, 1 without an answer, 0 errors',
      '  The SQL answers the question: 2.00/2 (1 judged, 0 refused, 0 not applicable)',
      '  The narrative is faithful to the data: 1.50/2 (1 judged, 0 refused, 0 not applicable)',
      '  The chart fits: nothing judged (0 judged, 0 refused, 1 not applicable)',
      `Report: ${reportPath}`,
    ]);
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    expect(report).toMatchObject({
      startedAt: '2026-10-20T10:00:00.000Z',
      models: { pipeline: 'fake-model', judge: 'fake-decisions-model' },
      summary: { questions: 2, answered: 1, unanswered: 1, errors: 0 },
    });
    expect(report.results[0]).toMatchObject({
      id: 'units',
      question: 'Units per item?',
      sql: 'SELECT name, qty FROM items',
      rowCount: 2,
      narrative: 'Ink leads.',
      chart: null,
      criteria: {
        sql: { status: 'judged', answer: score(2) },
        chart: { status: 'not_applicable' },
      },
    });
    expect(report.results[1]).toMatchObject({
      status: 'unanswered',
      reason: 'sql: no such column: nope',
    });
  });

  it('still returns 0 when questions fail, recording each error', async () => {
    llm = fakeLlm(
      new Error('500 Server error'),
      jsonResponse({ sql: 'SELECT name FROM items' }),
      jsonResponse({ narrative: 'Two.', suggestions: ['A?', 'B?', 'C?'], chart: null }),
    );
    judge = fakeDecisions(new Error('503 Busy'));

    expect(await run()).toBe(0);
    expect(lines.slice(0, 2)).toEqual([
      'units: error (OpenAI request failed: 500 Server error)',
      'colors: error (OpenAI decision failed: 503 Busy)',
    ]);
  });

  it('never writes an app database', async () => {
    llm = fakeLlm(new Error('x'), new Error('y'));
    judge = fakeDecisions();

    // Without `now`, the report is named after the current time.
    await run({ now: undefined });

    expect(readdirSync(dir).sort()).toEqual(['data.db', 'golden.json', 'reports']);
    expect(readdirSync(path.join(dir, 'reports'))).toEqual([
      expect.stringMatching(/^eval-\d{4}-.*\.json$/),
    ]);
  });

  describe('startup errors', () => {
    beforeEach(() => {
      llm = fakeLlm();
      judge = fakeDecisions();
    });

    it.each([
      ['OPENAI_API_KEY', { OPENAI_MODEL: 'm', OPENAI_DECISIONS_MODEL: 'j' }],
      ['OPENAI_MODEL', { OPENAI_API_KEY: 'k', OPENAI_DECISIONS_MODEL: 'j' }],
      ['OPENAI_DECISIONS_MODEL', { OPENAI_API_KEY: 'k', OPENAI_MODEL: 'm' }],
    ])('stops when %s is missing', async (name, env) => {
      // The real client factories: they check the variables before any request.
      const code = await run({ env, createLlm: undefined, createJudge: undefined });

      expect(code).toBe(1);
      expect(lines).toEqual([
        `The evaluation could not start: ${name} is not set. Copy .env.example to .env in the repo root and set it.`,
      ]);
      expect(existsSync(path.join(dir, 'reports'))).toBe(false);
    });

    it.each([
      [
        'a missing golden file',
        () => rmSync(path.join(dir, 'golden.json')),
        'golden file was not found',
      ],
      ['an invalid golden file', () => writeGolden('[]'), 'non-empty JSON array'],
      ['a golden case without a question', () => writeGolden([{ id: 'a' }]), 'has no question'],
      ['a missing data.db', () => rmSync(path.join(dir, 'data.db')), 'npm run seed'],
      [
        'a data.db without metadata',
        () => {
          rmSync(path.join(dir, 'data.db'));
          openDatabase(path.join(dir, 'data.db')).close();
        },
        'no such table: meta_tables',
      ],
    ])(
      'stops on %s, without calling OpenAI or writing a report',
      async (_case, breakIt, message) => {
        breakIt();

        const code = await run();

        expect(code).toBe(1);
        expect(lines).toHaveLength(1);
        expect(lines[0]).toMatch(/^The evaluation could not start: /);
        expect(lines[0]).toContain(message);
        expect(llm.requests).toHaveLength(0);
        expect(judge.requests).toHaveLength(0);
        expect(existsSync(path.join(dir, 'reports'))).toBe(false);
      },
    );
  });
});

import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { StepLogger } from './generate-sql.ts';
import { LlmError } from './llm.ts';
import { answerQuestion, PipelineError } from './pipeline.ts';
import { openTestDataDb } from './testing/dataset.ts';
import { fakeLlm, jsonResponse, refusalResponse } from './testing/fake-llm.ts';

const INSIGHTS = { narrative: 'Ink sold the most.', suggestions: ['A?', 'B?', 'C?'] };
const sqlReply = (sql: string) => jsonResponse({ sql });

let dataDb: DatabaseSync;
let logs: Record<string, unknown>[];
let log: StepLogger;

beforeEach(() => {
  dataDb = openTestDataDb();
  logs = [];
  log = { info: (fields) => logs.push(fields) };
});

afterEach(() => {
  if (dataDb.isOpen) dataDb.close();
});

const ask = (llm: ReturnType<typeof fakeLlm>) =>
  answerQuestion({ question: 'Units per item?', dataDb, llm, log });

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
      sql: 'SELECT name, qty FROM items ORDER BY id',
      columns: ['name', 'qty'],
      rows: [
        ['pen', 3],
        ['ink', 5],
      ],
      narrative: 'Ink sold the most.',
      suggestions: ['A?', 'B?', 'C?'],
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
});

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, openReadOnlyDatabase } from './db.ts';
import { MAX_ROWS } from './execute-sql.ts';
import { generateSql, MAX_ATTEMPTS, type StepLogger } from './generate-sql.ts';
import { LlmError } from './llm.ts';
import { createMetadataTables, insertMetadata } from './metadata.ts';
import { fakeLlm, incompleteResponse, jsonResponse, refusalResponse } from './testing/fake-llm.ts';

let tempDir: string;
let db: DatabaseSync;
let logs: Record<string, unknown>[];
let log: StepLogger;

const OK_SQL = 'SELECT name, qty FROM items ORDER BY id';
const sqlReply = (sql: unknown) => jsonResponse({ sql });

beforeEach(() => {
  tempDir = mkdtempSync(path.join(tmpdir(), 'utdt-gen-'));
  const file = path.join(tempDir, 'data.db');
  const writer = openDatabase(file);
  createMetadataTables(writer);
  writer.exec(`
    CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT, qty INTEGER);
    INSERT INTO items (name, qty) VALUES ('pen', 3), ('ink', 5);
    CREATE TABLE numbers (n INTEGER);
    WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c WHERE x <= ${MAX_ROWS})
    INSERT INTO numbers SELECT x FROM c;
  `);
  insertMetadata(writer, {
    tables: [{ tableName: 'items', description: 'One row per item.' }],
    columns: [
      { tableName: 'items', columnName: 'name', dataType: 'TEXT', description: 'Item name.' },
      { tableName: 'items', columnName: 'qty', dataType: 'INTEGER', description: 'Units.' },
    ],
    relationships: [],
  });
  writer.close();
  db = openReadOnlyDatabase(file);
  logs = [];
  log = { info: (fields) => logs.push(fields) };
});

afterEach(() => {
  if (db.isOpen) db.close();
  rmSync(tempDir, { recursive: true, force: true });
});

const ask = (llm: ReturnType<typeof fakeLlm>, question = 'How many units of each item?') =>
  generateSql({ question, db, llm, log });

describe('generateSql', () => {
  it('asks once for Structured Outputs with the schema context and returns the result', async () => {
    const llm = fakeLlm(sqlReply(OK_SQL));

    const result = await ask(llm);

    expect(result).toEqual({
      ok: true,
      sql: OK_SQL,
      columns: ['name', 'qty'],
      rows: [
        ['pen', 3],
        ['ink', 5],
      ],
    });
    expect(llm.requests).toHaveLength(1);
    const [request] = llm.requests;
    expect(request.model).toBe('fake-model');
    expect(request.input).toContain('Table items: One row per item.');
    expect(request.input).toContain('  - qty (INTEGER): Units.');
    expect(request.input).toContain('How many units of each item?');
    expect(request.text?.format).toEqual({
      type: 'json_schema',
      name: 'sql_query',
      strict: true,
      schema: expect.objectContaining({
        properties: { sql: expect.objectContaining({ type: 'string' }) },
        required: ['sql'],
        additionalProperties: false,
      }),
    });
  });

  it('treats an empty result as a success, without retrying', async () => {
    const llm = fakeLlm(sqlReply('SELECT name FROM items WHERE qty > 100'));

    expect(await ask(llm)).toEqual({
      ok: true,
      sql: 'SELECT name FROM items WHERE qty > 100',
      columns: ['name'],
      rows: [],
    });
    expect(llm.requests).toHaveLength(1);
  });

  it('runs the SQL exactly as the LLM returned it', async () => {
    const raw = '\n  SELECT name FROM items WHERE id = 1;  ';

    expect(await ask(fakeLlm(sqlReply(raw)))).toMatchObject({ ok: true, sql: raw });
  });

  it.each([
    ['guard', 'DELETE FROM items', 'must start with SELECT or WITH'],
    ['sql', 'SELECT nope FROM items', 'no such column: nope'],
    ['row_limit', 'SELECT n FROM numbers', `more than ${MAX_ROWS} rows`],
  ])(
    'retries after a %s error, sending the failed SQL and its message',
    async (_kind, bad, message) => {
      const llm = fakeLlm(sqlReply(bad), sqlReply(OK_SQL));

      const result = await ask(llm);

      expect(result).toMatchObject({ ok: true, sql: OK_SQL });
      expect(llm.requests).toHaveLength(2);
      expect(llm.requests[0].input).not.toContain('Previous attempts');
      expect(llm.requests[1].input).toContain(`SQL: ${bad}`);
      expect(llm.requests[1].input).toContain(message);
    },
  );

  it('sends every earlier failure, in order, on each retry', async () => {
    const llm = fakeLlm(
      sqlReply('SELECT first FROM items'),
      sqlReply('SELECT second FROM items'),
      sqlReply(OK_SQL),
    );

    expect(await ask(llm)).toMatchObject({ ok: true });

    const third = String(llm.requests[2].input);
    expect(third).toMatch(
      /Attempt 1:\nSQL: SELECT first FROM items\nError: no such column: first\n\nAttempt 2:\nSQL: SELECT second FROM items\nError: no such column: second$/,
    );
  });

  it(`stops after ${MAX_ATTEMPTS} attempts and returns the last error`, async () => {
    // A fourth request would fail: the fake has no reply for it.
    const llm = fakeLlm(
      sqlReply('SELECT a FROM items'),
      sqlReply('SELECT b FROM items'),
      sqlReply('SELECT c FROM items'),
    );

    const result = await ask(llm);

    expect(result).toEqual({
      ok: false,
      sql: 'SELECT c FROM items',
      kind: 'sql',
      message: 'no such column: c',
    });
    expect(llm.requests).toHaveLength(MAX_ATTEMPTS);
    expect(logs.filter((l) => l.step === 'execute_sql')).toHaveLength(MAX_ATTEMPTS);
  });

  it.each([
    ['the client throws', new Error('500 Internal Server Error'), '500 Internal Server Error'],
    ['the model refuses', refusalResponse('No.'), 'refused'],
    ['the response is incomplete', incompleteResponse('max_output_tokens'), 'incomplete'],
    ['the output has no SQL string', sqlReply(42), 'no SQL string'],
  ])('throws without retrying when %s', async (_case, reply, message) => {
    const llm = fakeLlm(reply);

    const call = ask(llm);

    await expect(call).rejects.toThrow(message);
    await expect(call).rejects.toBeInstanceOf(LlmError);
    expect(llm.requests).toHaveLength(1);
    expect(logs).toEqual([
      { step: 'generate_sql', attempt: 1, durationMs: expect.any(Number), result: 'error' },
    ]);
  });

  it('propagates an error the executor throws, without asking again', async () => {
    const llm = fakeLlm(sqlReply(OK_SQL));
    const create = llm.createResponse;
    llm.createResponse = async (body) => {
      db.close();
      return create(body);
    };

    await expect(ask(llm)).rejects.toThrow(/not open/);
    expect(llm.requests).toHaveLength(1);
    expect(logs.at(-1)).toEqual({
      step: 'execute_sql',
      attempt: 1,
      durationMs: expect.any(Number),
      result: 'error',
    });
  });

  it('throws without calling the LLM when the metadata tables are missing', async () => {
    const bareFile = path.join(tempDir, 'bare.db');
    openDatabase(bareFile).close();
    const bare = openReadOnlyDatabase(bareFile);
    const llm = fakeLlm(sqlReply(OK_SQL));

    try {
      await expect(generateSql({ question: 'Anything?', db: bare, llm, log })).rejects.toThrow(
        /meta_tables/,
      );
    } finally {
      bare.close();
    }
    expect(llm.requests).toHaveLength(0);
  });

  it('puts the question and failed SQL in the prompt literally', async () => {
    const question = `Items named 'pen' or "ink" with qty < 5 > 1 {{ x }}`;
    const bad = `SELECT '<{{ x }}>' AS "q" FROM nope`;
    const llm = fakeLlm(sqlReply(bad), sqlReply(OK_SQL));

    await ask(llm, question);

    const retry = String(llm.requests[1].input);
    expect(retry).toContain(question);
    expect(retry).toContain(`SQL: ${bad}`);
    expect(retry).not.toContain('&lt;');
    expect(retry).not.toContain('&quot;');
  });

  it('sends the conversation history in every attempt, with only the fields each turn has', async () => {
    const llm = fakeLlm(
      sqlReply('SELECT a FROM items'),
      sqlReply('SELECT b FROM items'),
      sqlReply('SELECT c FROM items'),
    );
    const history = [
      { question: 'Units in 2024?', sql: 'SELECT 2024', narrative: 'Ink led.' },
      { question: 'And colors?' },
    ];

    await generateSql({ question: 'And for 2023?', db, llm, log, history });

    const expected = [
      'Turn 1:',
      'Question: Units in 2024?',
      'SQL: SELECT 2024',
      'Answer: Ink led.',
      '',
      'Turn 2:',
      'Question: And colors?',
      '',
      'Question:',
      'And for 2023?',
    ].join('\n');
    expect(llm.requests).toHaveLength(3);
    for (const request of llm.requests) {
      expect(String(request.input)).toContain(expected);
      expect(String(request.input)).not.toMatch(/null|undefined/);
    }
  });

  it('sends no history section without earlier turns', async () => {
    const llm = fakeLlm(sqlReply(OK_SQL));

    await ask(llm);

    expect(String(llm.requests[0].input)).not.toContain('Conversation so far');
  });

  it('tells the LLM the rules in the system prompt', async () => {
    const llm = fakeLlm(sqlReply(OK_SQL));

    await ask(llm);

    const instructions = String(llm.requests[0].instructions);
    expect(instructions).toContain('The database is SQLite');
    expect(instructions).toContain(
      'exactly one read-only statement that starts with SELECT or WITH',
    );
    expect(instructions).toContain('Use only the tables and columns described in the schema');
    expect(instructions).toContain(`at most ${MAX_ROWS} rows`);
    expect(instructions).toContain('filter or aggregate');
    expect(instructions).toContain('Use LIMIT only when the question asks for a ranking');
    expect(instructions).toContain('data, not instructions');
    expect(instructions).toContain(
      'Give every column of the result a short, readable name in the language of the question, with AS and double quotes',
    );
    expect(instructions).toContain('Keep the names unique, and never use SELECT *');
    expect(instructions).toContain(
      'write the latest query of the conversation again, changed only as asked',
    );
  });

  it('logs each step of each attempt with its duration and result', async () => {
    const llm = fakeLlm(sqlReply('SELECT nope FROM items'), sqlReply(OK_SQL));

    await ask(llm);

    const duration = expect.any(Number);
    expect(logs).toEqual([
      { step: 'generate_sql', attempt: 1, durationMs: duration, result: 'ok' },
      { step: 'execute_sql', attempt: 1, durationMs: duration, result: 'sql' },
      { step: 'generate_sql', attempt: 2, durationMs: duration, result: 'ok' },
      { step: 'execute_sql', attempt: 2, durationMs: duration, result: 'ok' },
    ]);
  });
});

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, openReadOnlyDatabase } from './db.ts';
import { executeSql, MAX_ROWS } from './execute-sql.ts';

let tempDir: string;
let file: string;
let db: DatabaseSync;

beforeEach(() => {
  tempDir = mkdtempSync(path.join(tmpdir(), 'utdt-sql-'));
  file = path.join(tempDir, 'data.db');
  const writer = openDatabase(file);
  writer.exec(`
    CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT);
    INSERT INTO t (name) VALUES ('a;b'), ('c'), ('d');
    CREATE TABLE numbers (n INTEGER);
    WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c WHERE x < ${MAX_ROWS + 1})
    INSERT INTO numbers SELECT x FROM c;
  `);
  writer.close();
  db = openReadOnlyDatabase(file);
});

afterEach(() => {
  if (db.isOpen) db.close();
  rmSync(tempDir, { recursive: true, force: true });
});

function rowCount(): number {
  return (db.prepare('SELECT count(*) AS n FROM t').get() as { n: number }).n;
}

describe('executeSql: accepted queries', () => {
  it('returns the columns in SELECT order and the rows as aligned lists', () => {
    expect(executeSql(db, 'SELECT name, id FROM t ORDER BY id')).toEqual({
      ok: true,
      columns: ['name', 'id'],
      rows: [
        ['a;b', 1],
        ['c', 2],
        ['d', 3],
      ],
    });
  });

  it('accepts WITH … SELECT', () => {
    const result = executeSql(db, 'WITH x AS (SELECT id FROM t WHERE id > 2) SELECT id FROM x');
    expect(result).toEqual({ ok: true, columns: ['id'], rows: [[3]] });
  });

  it.each([
    ['lower case', 'select id from t where id = 1'],
    ['surrounding whitespace and newlines', '\n  SELECT id FROM t WHERE id = 1  \n'],
    ['a final semicolon', 'SELECT id FROM t WHERE id = 1;  '],
    ['a semicolon in a string literal', "SELECT id FROM t WHERE name = 'a;b'"],
    ['a semicolon in a quoted identifier', 'SELECT id AS "x;y" FROM t WHERE id = 1'],
    ['a semicolon in a bracketed identifier', 'SELECT id AS [x;y] FROM t WHERE id = 1'],
    ['an unterminated trailing block comment', 'SELECT id FROM t WHERE id = 1 /* open;'],
    ['a semicolon in a comment', 'SELECT id FROM t -- one; two\nWHERE id = 1'],
    ['a block comment in the middle', 'SELECT id /* ; */ FROM t WHERE id = 1'],
    ['a trailing comment without a semicolon', 'SELECT id FROM t WHERE id = 1 -- done'],
    ['an escaped quote', "SELECT id FROM t WHERE id = 1 AND 'it''s;' <> ''"],
  ])('accepts %s', (_case, sql) => {
    expect(executeSql(db, sql)).toMatchObject({ ok: true, rows: [[1]] });
  });

  it('returns an empty result with its columns', () => {
    expect(executeSql(db, 'SELECT id, name FROM t WHERE 0')).toEqual({
      ok: true,
      columns: ['id', 'name'],
      rows: [],
    });
  });

  it('keeps both values of two columns with the same name', () => {
    const result = executeSql(db, 'SELECT a.id, b.id FROM t a JOIN t b ON b.id = a.id + 1');
    expect(result).toEqual({
      ok: true,
      columns: ['id', 'id'],
      rows: [
        [1, 2],
        [2, 3],
      ],
    });
  });

  it('accepts read-only table-valued functions', () => {
    expect(executeSql(db, "SELECT name FROM pragma_table_info('t')")).toEqual({
      ok: true,
      columns: ['name'],
      rows: [['id'], ['name']],
    });
  });
});

describe('executeSql: guard', () => {
  it.each([
    ['an empty query', ''],
    ['a blank query', ' \n\t '],
    ['INSERT', "INSERT INTO t (name) VALUES ('x')"],
    ['UPDATE', "UPDATE t SET name = 'x'"],
    ['DELETE', 'DELETE FROM t'],
    ['DROP', 'DROP TABLE t'],
    ['CREATE TEMP TABLE', 'CREATE TEMP TABLE z (x)'],
    ['ATTACH', "ATTACH DATABASE ':memory:' AS other"],
    ['PRAGMA', 'PRAGMA table_info(t)'],
    ['VACUUM', 'VACUUM'],
    ['EXPLAIN', 'EXPLAIN SELECT 1'],
    ['VALUES', 'VALUES (1)'],
    ['a leading line comment', '-- top\nSELECT 1'],
    ['a leading block comment', '/* top */ SELECT 1'],
    ['a markdown fence', '```sql\nSELECT 1\n```'],
    ['a word that only starts like SELECT', 'SELECTED 1'],
    ['a second statement', 'SELECT 1; DROP TABLE t'],
    ['a comment after the semicolon', 'SELECT 1; -- end'],
    ['two semicolons', 'SELECT 1;;'],
    // SQLite reads `$a(...)` as one token, so a hand-rolled scanner would miss this ';'.
    ['a second statement after a variable token', 'SELECT $a([) ;CREATE TEMP TABLE z (x)'],
  ])('rejects %s without touching the database', (_case, sql) => {
    const result = executeSql(db, sql);

    expect(result).toMatchObject({ ok: false, kind: 'guard' });
    expect(rowCount()).toBe(3);
  });

  it('says which rule was broken', () => {
    expect(executeSql(db, '')).toMatchObject({ message: expect.stringMatching(/empty/) });
    expect(executeSql(db, 'DELETE FROM t')).toMatchObject({
      message: expect.stringMatching(/start with SELECT or WITH/),
    });
    expect(executeSql(db, 'SELECT 1; SELECT 2')).toMatchObject({
      message: expect.stringMatching(/one statement/),
    });
  });
});

describe('executeSql: SQL errors', () => {
  it('returns the read-only error for a write hidden behind WITH, and keeps the rows', () => {
    const result = executeSql(db, 'WITH x AS (SELECT 1) DELETE FROM t');

    expect(result).toEqual({
      ok: false,
      kind: 'sql',
      message: 'attempt to write a readonly database',
    });
    expect(rowCount()).toBe(3);
  });

  it.each([
    ['a syntax error', 'SELECT FROM WHERE', /syntax error/],
    ['an unknown column', 'SELECT nope FROM t', /no such column/],
    ['an unknown table', 'SELECT * FROM nope', /no such table/],
    ['an unterminated string', "SELECT id FROM t WHERE name = 'a;", /unrecognized token/],
    ['a loaded extension', "SELECT load_extension('x')", /not authorized/],
  ])('returns SQLite’s message for %s', (_case, sql, message) => {
    expect(executeSql(db, sql)).toMatchObject({ ok: false, kind: 'sql', message });
  });

  it('returns an error for an integer beyond 2^53 instead of throwing', () => {
    expect(executeSql(db, 'SELECT 9007199254740993 AS big FROM t')).toMatchObject({
      ok: false,
      kind: 'sql',
      message: expect.stringMatching(/too large/),
    });
  });

  it('returns an error for a value over SQLite’s size limit', () => {
    expect(executeSql(db, 'SELECT zeroblob(2000000000)')).toMatchObject({
      ok: false,
      kind: 'sql',
      message: expect.stringMatching(/too big/),
    });
  });

  it.each([
    ['a value that cannot be read', 'SELECT 9007199254740993 AS big FROM t', 'sql'],
    ['a result over the row cap', 'SELECT n FROM numbers', 'row_limit'],
  ])('releases its read lock after %s', (_case, sql, kind) => {
    expect(executeSql(db, sql)).toMatchObject({ ok: false, kind });

    const writer = openDatabase(file);
    try {
      expect(() => writer.exec('BEGIN EXCLUSIVE; ROLLBACK;')).not.toThrow();
    } finally {
      writer.close();
    }
  });

  it('throws when the connection is closed: rewriting the SQL cannot fix it', () => {
    db.close();

    expect(() => executeSql(db, 'SELECT 1')).toThrow(/not open/);
  });

  it('throws when another connection locks the database', () => {
    const writer = openDatabase(file);
    writer.exec('BEGIN EXCLUSIVE');
    try {
      expect(() => executeSql(db, 'SELECT id FROM t')).toThrow(/locked/);
    } finally {
      writer.exec('ROLLBACK');
      writer.close();
    }
  });

  it('throws when the file is not a database', () => {
    const garbage = path.join(tempDir, 'garbage.db');
    writeFileSync(garbage, 'not a database '.repeat(100));
    const notADatabase = openReadOnlyDatabase(garbage);
    try {
      expect(() => executeSql(notADatabase, 'SELECT 1 FROM t')).toThrow(/not a database/);
    } finally {
      notADatabase.close();
    }
  });
});

describe('executeSql: row cap', () => {
  it(`returns exactly ${MAX_ROWS} rows`, () => {
    const result = executeSql(db, `SELECT n FROM numbers WHERE n <= ${MAX_ROWS}`);

    expect(result.ok).toBe(true);
    expect(result.ok && result.rows.length).toBe(MAX_ROWS);
  });

  it(`rejects ${MAX_ROWS + 1} rows, naming the cap`, () => {
    expect(executeSql(db, 'SELECT n FROM numbers')).toMatchObject({
      ok: false,
      kind: 'row_limit',
      message: expect.stringContaining(String(MAX_ROWS)),
    });
  });

  it('stops an endless recursive CTE', () => {
    const sql = 'WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c) SELECT x FROM c';
    expect(executeSql(db, sql)).toMatchObject({ ok: false, kind: 'row_limit' });
  });
});

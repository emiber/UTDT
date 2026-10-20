import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { buildApp } from './app.ts';
import { openDatabase, sqliteVersion } from './db.ts';
import { createMetadataTables, insertMetadata } from './metadata.ts';

const ACCESS_KEY = 'test-access-key';
const AUTH = { authorization: `Bearer ${ACCESS_KEY}` };

let db: DatabaseSync;
let dataDb: DatabaseSync;
let app: FastifyInstance;

beforeEach(() => {
  db = openDatabase(':memory:');
  dataDb = openDatabase(':memory:');
  createMetadataTables(dataDb);
  app = buildApp({ db, dataDb, accessKey: ACCESS_KEY });
  // Stand-ins for the protected routes later issues add.
  app.get('/api/protected', async () => ({ ok: true }));
  app.post(
    '/api/echo',
    {
      schema: {
        body: {
          type: 'object',
          required: ['text'],
          properties: { text: { type: 'string' } },
        },
      },
    },
    async (request) => request.body,
  );
});

afterEach(async () => {
  await app.close();
  if (db.isOpen) db.close();
  dataDb.close();
});

describe('GET /api/health', () => {
  it('reports ok and the SQLite version', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', sqliteVersion: sqliteVersion(db) });
  });

  it.each([
    ['with a wrong key', '/api/health', { authorization: 'Bearer wrong' }],
    ['with a query string', '/api/health?x=1', {}],
  ])('stays public %s', async (_case, url, headers) => {
    const res = await app.inject({ method: 'GET', url, headers });
    expect(res.statusCode).toBe(200);
  });

  it('fails with 500 when the database is unavailable', async () => {
    db.close();

    const res = await app.inject({ method: 'GET', url: '/api/health' });

    expect(res.statusCode).toBe(500);
  });
});

describe('access key', () => {
  it.each([['Bearer'], ['bearer']])('lets a request with "%s <key>" through', async (scheme) => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/protected',
      headers: { authorization: `${scheme} ${ACCESS_KEY}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it.each([
    ['no header', {}],
    ['another scheme', { authorization: `Basic ${ACCESS_KEY}` }],
    ['Bearer without a key', { authorization: 'Bearer ' }],
    ['a wrong key of the same length', { authorization: 'Bearer test-access-kez' }],
    ['a wrong key of another length', { authorization: 'Bearer short' }],
  ])('rejects %s with the same generic 401', async (_case, headers) => {
    const res = await app.inject({ method: 'GET', url: '/api/protected', headers });

    expect(res.statusCode).toBe(401);
    expect(res.headers['www-authenticate']).toBe('Bearer');
    expect(res.json()).toEqual({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Missing or invalid access key.',
    });
  });

  it('keeps another method on a public path protected', async () => {
    app.post('/api/health', async () => ({ written: true }));

    const withoutKey = await app.inject({ method: 'POST', url: '/api/health' });
    const withKey = await app.inject({ method: 'POST', url: '/api/health', headers: AUTH });

    expect(withoutKey.statusCode).toBe(401);
    expect(withKey.statusCode).toBe(200);
  });

  it('answers 401 for an unknown route without the key, 404 with it', async () => {
    const withoutKey = await app.inject({ method: 'GET', url: '/api/nope' });
    const withKey = await app.inject({ method: 'GET', url: '/api/nope', headers: AUTH });

    expect(withoutKey.statusCode).toBe(401);
    expect(withKey.statusCode).toBe(404);
  });

  it('checks the key before validating the body', async () => {
    // Missing the required field (Ajv would coerce a wrong type instead of rejecting it).
    const invalidBody = { method: 'POST' as const, url: '/api/echo', payload: {} };

    const withoutKey = await app.inject(invalidBody);
    const withKey = await app.inject({ ...invalidBody, headers: AUTH });

    expect(withoutKey.statusCode).toBe(401);
    expect(withKey.statusCode).toBe(400);
  });
});

describe('GET /api/catalog', () => {
  const get = () => app.inject({ method: 'GET', url: '/api/catalog', headers: AUTH });

  it('returns the catalog: tables with columns and indexes, and relationships', async () => {
    dataDb.exec(`
      CREATE TABLE authors (author_id INTEGER PRIMARY KEY);
      CREATE TABLE books (book_id INTEGER PRIMARY KEY, author_id INTEGER);
      CREATE INDEX idx_books_author_id ON books (author_id);
    `);
    insertMetadata(dataDb, {
      tables: [
        { tableName: 'authors', description: 'Authors.' },
        { tableName: 'books', description: 'Books.' },
      ],
      columns: [
        {
          tableName: 'books',
          columnName: 'author_id',
          dataType: 'INTEGER',
          description: 'Author.',
        },
      ],
      relationships: [
        {
          fromTable: 'books',
          fromColumn: 'author_id',
          toTable: 'authors',
          toColumn: 'author_id',
          description: 'Who wrote it.',
        },
      ],
    });

    const res = await get();

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      tables: [
        { name: 'authors', description: 'Authors.', columns: [], indexes: [] },
        {
          name: 'books',
          description: 'Books.',
          columns: [{ name: 'author_id', dataType: 'INTEGER', description: 'Author.' }],
          indexes: [{ name: 'idx_books_author_id', unique: false, columns: ['author_id'] }],
        },
      ],
      relationships: [
        {
          fromTable: 'books',
          fromColumn: 'author_id',
          toTable: 'authors',
          toColumn: 'author_id',
          description: 'Who wrote it.',
        },
      ],
    });
  });

  it('requires the access key', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/catalog' });
    expect(res.statusCode).toBe(401);
  });

  it('returns an empty catalog for empty metadata', async () => {
    const res = await get();

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ tables: [], relationships: [] });
  });

  it('answers 200 for a declared table missing from the database', async () => {
    insertMetadata(dataDb, {
      tables: [{ tableName: 'ghost', description: 'Never created.' }],
      columns: [],
      relationships: [],
    });

    const res = await get();

    expect(res.statusCode).toBe(200);
    expect(res.json().tables).toEqual([
      { name: 'ghost', description: 'Never created.', columns: [], indexes: [] },
    ]);
  });

  it('fails with 500 when the metadata tables are missing', async () => {
    dataDb.exec('DROP TABLE meta_tables');

    const res = await get();

    expect(res.statusCode).toBe(500);
  });

  it('reads the metadata on every request', async () => {
    const before = await get();
    insertMetadata(dataDb, {
      tables: [{ tableName: 'added', description: 'Added later.' }],
      columns: [],
      relationships: [],
    });
    const after = await get();

    expect(before.json().tables).toEqual([]);
    expect(after.json().tables.map((t: { name: string }) => t.name)).toEqual(['added']);
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { buildApp } from './app.ts';
import { openDatabase, sqliteVersion } from './db.ts';

const ACCESS_KEY = 'test-access-key';
const AUTH = { authorization: `Bearer ${ACCESS_KEY}` };

let db: DatabaseSync;
let app: FastifyInstance;

beforeEach(() => {
  db = openDatabase(':memory:');
  app = buildApp({ db, accessKey: ACCESS_KEY });
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

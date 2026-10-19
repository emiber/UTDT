import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { buildApp } from './app.ts';
import { openDatabase, sqliteVersion } from './db.ts';

describe('GET /api/health', () => {
  let db: DatabaseSync;
  let app: FastifyInstance;

  beforeEach(() => {
    db = openDatabase(':memory:');
    app = buildApp({ db });
  });

  afterEach(async () => {
    await app.close();
    if (db.isOpen) db.close();
  });

  it('reports ok and the SQLite version', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', sqliteVersion: sqliteVersion(db) });
  });

  it('fails with 500 when the database is unavailable', async () => {
    db.close();

    const res = await app.inject({ method: 'GET', url: '/api/health' });

    expect(res.statusCode).toBe(500);
  });

  it('returns 404 for unknown routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(res.statusCode).toBe(404);
  });
});

import Fastify, { type FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { sqliteVersion } from './db.ts';

export interface AppOptions {
  db: DatabaseSync;
  logger?: boolean;
}

export function buildApp({ db, logger = false }: AppOptions): FastifyInstance {
  const app = Fastify({ logger });

  app.get('/api/health', async () => ({ status: 'ok', sqliteVersion: sqliteVersion(db) }));

  return app;
}

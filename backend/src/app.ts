import Fastify, { type FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { hasValidAccessKey } from './auth.ts';
import { sqliteVersion } from './db.ts';

export interface AppOptions {
  db: DatabaseSync;
  accessKey: string;
  logger?: boolean;
}

/** Routes anyone may call; every other route, existing or not, requires the access key. */
const PUBLIC_ROUTES = new Set(['/api/health']);

export function buildApp({ db, accessKey, logger = false }: AppOptions): FastifyInstance {
  const app = Fastify({ logger });

  // onRequest runs before body parsing and validation, so a bad key never reaches a 400.
  app.addHook('onRequest', async (request, reply) => {
    if (PUBLIC_ROUTES.has(request.routeOptions.url ?? '')) return;
    if (hasValidAccessKey(request.headers.authorization, accessKey)) return;
    return reply.code(401).header('WWW-Authenticate', 'Bearer').send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Missing or invalid access key.',
    });
  });

  app.get('/api/health', async () => ({ status: 'ok', sqliteVersion: sqliteVersion(db) }));

  return app;
}

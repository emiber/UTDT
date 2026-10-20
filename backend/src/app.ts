import Fastify, { type FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { hasValidAccessKey } from './auth.ts';
import { readCatalog } from './catalog.ts';
import { registerChatRoute } from './chat.ts';
import { createConversationTables } from './conversations.ts';
import { sqliteVersion } from './db.ts';
import type { LlmClient } from './llm.ts';

export interface AppOptions {
  /** App state (`app.db`). Its tables are created here if missing. */
  db: DatabaseSync;
  /** The queried dataset and its metadata (`data.db`), opened read-only. */
  dataDb: DatabaseSync;
  /** The OpenAI client, or a fake one in tests. */
  llm: LlmClient;
  accessKey: string;
  logger?: boolean;
}

/**
 * Routes anyone may call, as "METHOD /path". Every other route, existing or not, requires
 * the access key; keying by method too means a new POST on a public path isn't public.
 */
const PUBLIC_ROUTES = new Set(['GET /api/health']);

export function buildApp({
  db,
  dataDb,
  llm,
  accessKey,
  logger = false,
}: AppOptions): FastifyInstance {
  // No type coercion: a body field of the wrong type is a 400, not silently converted.
  const app = Fastify({ logger, ajv: { customOptions: { coerceTypes: false } } });
  createConversationTables(db);

  // onRequest runs before body parsing and validation, so a bad key never reaches a 400.
  app.addHook('onRequest', async (request, reply) => {
    const { method, url } = request.routeOptions;
    if (PUBLIC_ROUTES.has(`${method} ${url}`)) return;
    if (hasValidAccessKey(request.headers.authorization, accessKey)) return;
    return reply.code(401).header('WWW-Authenticate', 'Bearer').send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Missing or invalid access key.',
    });
  });

  app.get('/api/health', async () => ({ status: 'ok', sqliteVersion: sqliteVersion(db) }));

  // Read on every request, so metadata edits show up without a restart.
  app.get('/api/catalog', async () => readCatalog(dataDb));

  registerChatRoute(app, { db, dataDb, llm });

  return app;
}

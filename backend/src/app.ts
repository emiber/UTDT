import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { hasValidAccessKey } from './auth.ts';
import { readCatalog } from './catalog.ts';
import { registerChatRoute } from './chat.ts';
import { createConversationTables } from './conversations.ts';
import { sqliteVersion } from './db.ts';
import type { DecisionClient, LlmClient } from './llm.ts';

export interface AppOptions {
  /** App state (`app.db`). Its tables are created here if missing. */
  db: DatabaseSync;
  /** The queried dataset and its metadata (`data.db`), opened read-only. */
  dataDb: DatabaseSync;
  /** The OpenAI client, or a fake one in tests. */
  llm: LlmClient;
  /** The Decisions API client (classification), or a fake one in tests. */
  decisions: DecisionClient;
  accessKey: string;
  /** Fastify's logger option: `true` in the server; tests may pass a stream to read lines. */
  logger?: FastifyServerOptions['logger'];
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
  decisions,
  accessKey,
  logger = false,
}: AppOptions): FastifyInstance {
  // No type coercion, app-wide: a body field of the wrong type is a 400, not silently
  // converted. Querystring and params arrive as strings, so their schemas must say
  // `type: 'string'` and parse by hand.
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

  // A server error never shows its own message to the client (a SQLite one names tables,
  // for example): it's logged, and the response is generic. A client error (a 400 from
  // validation, a 415...) goes on to Fastify's default handler, unchanged.
  app.setErrorHandler((error, request, reply) => {
    // Anything can be thrown, so `error` may not even be an object.
    const statusCode = (error as FastifyError | null)?.statusCode;
    if (statusCode !== undefined && statusCode < 500) throw error;
    request.log.error({ err: error }, 'Request failed');
    return reply.code(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Something went wrong on the server.',
    });
  });

  app.get('/api/health', async () => ({ status: 'ok', sqliteVersion: sqliteVersion(db) }));

  // Read on every request, so metadata edits show up without a restart.
  app.get('/api/catalog', async () => readCatalog(dataDb));

  registerChatRoute(app, { db, dataDb, llm, decisions });

  return app;
}

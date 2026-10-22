import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { LLM_STEPS, type LlmStep } from './conversations.ts';
import type { Prices } from './prices.ts';
import { buildUsageReport, GRANULARITIES, UsageFilterError, type Granularity } from './usage.ts';

interface UsageQuery {
  from: string;
  to: string;
  granularity: Granularity;
  tz: string;
  model?: string;
  step?: LlmStep;
}

const DAY = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } as const;

const USAGE_QUERY_SCHEMA = {
  type: 'object',
  required: ['from', 'to', 'granularity', 'tz'],
  properties: {
    from: DAY,
    to: DAY,
    granularity: { type: 'string', enum: GRANULARITIES },
    // A querystring arrives as text and the app doesn't coerce types: parsed below.
    tz: { type: 'string', pattern: '^[+-]?\\d{1,4}$' },
    model: { type: 'string', minLength: 1 },
    step: { type: 'string', enum: LLM_STEPS },
  },
} as const;

/**
 * `GET /api/usage`: the LLM usage report of a period (see `buildUsageReport`). Filters it
 * can't use (an impossible date, a period of more than MAX_BUCKETS intervals) are a 400.
 */
export function registerUsageRoute(
  app: FastifyInstance,
  { db, prices }: { db: DatabaseSync; prices: Prices },
): void {
  app.get<{ Querystring: UsageQuery }>(
    '/api/usage',
    { schema: { querystring: USAGE_QUERY_SCHEMA } },
    async (request, reply) => {
      const { tz, ...filters } = request.query;
      try {
        return buildUsageReport(db, { ...filters, tz: Number(tz) }, prices);
      } catch (error) {
        if (!(error instanceof UsageFilterError)) throw error;
        return reply
          .code(400)
          .send({ statusCode: 400, error: 'Bad Request', message: error.message });
      }
    },
  );
}

import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { conversationExists, saveTurn, type Turn } from './conversations.ts';
import { LlmError, type LlmClient } from './llm.ts';
import { answerQuestion, type Block, type PipelineError } from './pipeline.ts';

/** What the bot says when no SQL attempt worked. English, like every hardcoded UI text. */
export const NO_ANSWER_MESSAGE =
  "I couldn't answer that with the available data. Try rephrasing the question.";

interface ChatBody {
  conversationId?: string;
  question: string;
}

const CHAT_BODY_SCHEMA = {
  type: 'object',
  required: ['question'],
  properties: {
    conversationId: { type: 'string', minLength: 1 },
    // At least one non-space character.
    question: { type: 'string', pattern: '\\S' },
  },
};

export interface ChatDeps {
  /** App state (`app.db`). */
  db: DatabaseSync;
  /** The dataset (`data.db`), read-only. */
  dataDb: DatabaseSync;
  llm: LlmClient;
}

/**
 * `POST /api/chat`: answers a question in a conversation and saves the turn, failed ones
 * included. A 502 or 500 carries a generic message; the detail goes to the log and the turn.
 */
export function registerChatRoute(app: FastifyInstance, { db, dataDb, llm }: ChatDeps): void {
  app.post<{ Body: ChatBody }>(
    '/api/chat',
    { schema: { body: CHAT_BODY_SCHEMA } },
    async (request, reply) => {
      const started = performance.now();
      const { question } = request.body;
      const conversationId = request.body.conversationId ?? null;
      if (conversationId && !conversationExists(db, conversationId)) {
        return reply.code(404).send(httpError(404, 'Not Found', 'Conversation not found.'));
      }

      let turn: Omit<Turn, 'durationMs'>;
      let body: { blocks: Block[]; suggestions: string[] } | null = null;
      let failure: { status: 502 | 500; message: string } | null = null;
      try {
        const result = await answerQuestion({ question, dataDb, llm, log: request.log });
        body = result.ok
          ? { blocks: result.blocks, suggestions: result.suggestions }
          : { blocks: [{ type: 'text', markdown: NO_ANSWER_MESSAGE }], suggestions: [] };
        turn = {
          question,
          sql: result.sql,
          narrative: result.ok ? result.narrative : null,
          response: body,
          error: result.ok ? null : `${result.kind}: ${result.message}`,
        };
      } catch (error) {
        // answerQuestion throws only PipelineErrors, wrapping the original as the cause.
        const { cause, sql } = error as PipelineError;
        request.log.error({ err: cause }, 'Chat pipeline failed');
        failure =
          cause instanceof LlmError
            ? { status: 502, message: 'The language model request failed. Try again.' }
            : { status: 500, message: 'Something went wrong while answering the question.' };
        turn = {
          question,
          sql,
          narrative: null,
          response: null,
          error: (cause as Error).message,
        };
      }

      let saved: { conversationId: string; turnId: number };
      const persistStarted = performance.now();
      try {
        saved = saveTurn(db, conversationId, { ...turn, durationMs: elapsed(started) });
      } catch (error) {
        request.log.error({ err: error }, 'Could not save the turn');
        return reply
          .code(500)
          .send(httpError(500, 'Internal Server Error', 'Could not save the turn.'));
      }
      request.log.info(
        { step: 'persist', durationMs: elapsed(persistStarted), result: 'ok' },
        'Pipeline step done',
      );

      if (failure) {
        const error = failure.status === 502 ? 'Bad Gateway' : 'Internal Server Error';
        return reply.code(failure.status).send(httpError(failure.status, error, failure.message));
      }
      return { ...saved, ...body };
    },
  );
}

/** Fastify's standard error shape. */
function httpError(statusCode: number, error: string, message: string) {
  return { statusCode, error, message };
}

function elapsed(started: number): number {
  return Math.round(performance.now() - started);
}

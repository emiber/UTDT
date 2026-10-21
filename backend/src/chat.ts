import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import {
  conversationExists,
  loadHistory,
  saveTurn,
  type HistoryTurn,
  type Turn,
  type TurnLlmCall,
} from './conversations.ts';
import { LlmError, type DecisionClient, type LlmClient } from './llm.ts';
import { answerQuestion, type Block, type PipelineError } from './pipeline.ts';
import { elapsed } from './timing.ts';

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
  /** The Decisions API client, for the classification. */
  decisions: DecisionClient;
}

/**
 * `POST /api/chat`: answers a question in a conversation and saves the turn, failed ones
 * included. A 502 or 500 carries a generic message; the detail goes to the log and the turn.
 */
export function registerChatRoute(
  app: FastifyInstance,
  { db, dataDb, llm, decisions }: ChatDeps,
): void {
  app.post<{ Body: ChatBody }>(
    '/api/chat',
    { schema: { body: CHAT_BODY_SCHEMA } },
    async (request, reply) => {
      const started = performance.now();
      const { question } = request.body;
      const conversationId = request.body.conversationId ?? null;
      let known: boolean;
      let history: HistoryTurn[] = [];
      try {
        known = !conversationId || conversationExists(db, conversationId);
        // Read here, before this turn is saved: the current question is never its own history.
        if (known) history = loadHistory(db, conversationId);
      } catch (error) {
        request.log.error({ err: error }, 'Could not read the conversation');
        return reply
          .code(500)
          .send(httpError(500, 'Internal Server Error', 'Could not read the conversation.'));
      }
      if (!known) {
        return reply.code(404).send(httpError(404, 'Not Found', 'Conversation not found.'));
      }

      let turn: Omit<Turn, 'durationMs'>;
      // Filled as the pipeline goes, so a failed turn still keeps the calls it made.
      const llmCalls: TurnLlmCall[] = [];
      let body: { blocks: Block[]; suggestions: string[] } | null = null;
      let failure: { status: 502 | 500; message: string } | null = null;
      try {
        const result = await answerQuestion({
          question,
          dataDb,
          llm,
          decisions,
          log: request.log,
          history,
          onLlmCall: (call) => llmCalls.push(call),
        });
        body = result.ok
          ? { blocks: result.blocks, suggestions: result.suggestions }
          : { blocks: [{ type: 'text', markdown: NO_ANSWER_MESSAGE }], suggestions: [] };
        turn = {
          question,
          // A text reply ran no SQL.
          sql: result.ok && result.kind === 'reply' ? null : result.sql,
          narrative: result.ok ? result.narrative : null,
          response: body,
          error: result.ok ? null : `${result.kind}: ${result.message}`,
          classification: result.classification,
          llmCalls,
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
          classification: null,
          llmCalls,
        };
      }

      let saved: { conversationId: string; turnId: number };
      const persistStarted = performance.now();
      try {
        saved = saveTurn(db, conversationId, { ...turn, durationMs: elapsed(started) });
      } catch (error) {
        request.log.info(
          { step: 'persist', durationMs: elapsed(persistStarted), result: 'error' },
          'Pipeline step failed',
        );
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

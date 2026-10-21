import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { LlmCall } from './llm.ts';

// App state in app.db: conversations, their turns, and each turn's calls to the LLM. Every
// answered question is a turn, failed ones included, so the turns are also the query log.

/** Creates the conversation, turn and LLM call tables if missing; keeps existing data. */
export function createConversationTables(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS turns (
      id INTEGER PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations (id),
      created_at TEXT NOT NULL,
      question TEXT NOT NULL,
      sql TEXT,
      narrative TEXT,
      response TEXT,
      error TEXT,
      duration_ms INTEGER NOT NULL,
      classification TEXT
    );
    CREATE TABLE IF NOT EXISTS llm_calls (
      id INTEGER PRIMARY KEY,
      turn_id INTEGER NOT NULL REFERENCES turns (id),
      step TEXT NOT NULL,
      attempt INTEGER NOT NULL,
      model TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      input_tokens INTEGER,
      output_tokens INTEGER
    );
  `);
  // An app.db from before the classification step: add its column, keeping the turns.
  const columns = db.prepare("SELECT name FROM pragma_table_info('turns')").all() as {
    name: string;
  }[];
  if (!columns.some((c) => c.name === 'classification')) {
    db.exec('ALTER TABLE turns ADD COLUMN classification TEXT');
  }
}

export function conversationExists(db: DatabaseSync, id: string): boolean {
  return db.prepare('SELECT 1 FROM conversations WHERE id = ?').get(id) !== undefined;
}

/** The pipeline steps an LLM call can belong to: `answer` is the insights or the text reply. */
export const LLM_STEPS = ['classify', 'sql', 'answer'] as const;
export type LlmStep = (typeof LLM_STEPS)[number];

/** One call to the LLM in a turn, as `llm_calls` stores it. */
export interface TurnLlmCall extends LlmCall {
  step: LlmStep;
  /** The SQL attempt (1 to 3); 1 for the other steps. */
  attempt: number;
}

export interface Turn {
  question: string;
  /** The final SQL, or the last one tried when the turn failed. */
  sql: string | null;
  narrative: string | null;
  /** The JSON body of a 200 response (blocks and suggestions). */
  response: unknown;
  error: string | null;
  durationMs: number;
  /** The classifier's label, or null when there was none (it failed, or the turn did). */
  classification: string | null;
  /** Every call to the LLM the turn made, in order, failed ones included. */
  llmCalls: TurnLlmCall[];
}

/**
 * Saves a turn and its LLM calls, in the given conversation or in a new one when
 * `conversationId` is null. Every write happens in one transaction, so a failed save leaves
 * no empty conversation and no calls without their turn.
 */
export function saveTurn(
  db: DatabaseSync,
  conversationId: string | null,
  turn: Turn,
): { conversationId: string; turnId: number } {
  const now = new Date().toISOString();
  db.exec('BEGIN');
  try {
    const id = conversationId ?? randomUUID();
    if (!conversationId) {
      db.prepare('INSERT INTO conversations (id, created_at) VALUES (?, ?)').run(id, now);
    }
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO turns
           (conversation_id, created_at, question, sql, narrative, response, error, duration_ms,
            classification)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        now,
        turn.question,
        turn.sql,
        turn.narrative,
        turn.response === null ? null : JSON.stringify(turn.response),
        turn.error,
        turn.durationMs,
        turn.classification,
      );
    const turnId = Number(lastInsertRowid);
    const insertCall = db.prepare(
      `INSERT INTO llm_calls
         (turn_id, step, attempt, model, duration_ms, input_tokens, output_tokens)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const call of turn.llmCalls) {
      insertCall.run(
        turnId,
        call.step,
        call.attempt,
        call.model,
        call.durationMs,
        call.inputTokens,
        call.outputTokens,
      );
    }
    db.exec('COMMIT');
    return { conversationId: id, turnId };
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }
}

/** Earlier turns that go to the LLM as context. */
export const HISTORY_TURNS = 5;

/** A turn as the LLM sees it: never its rows, chart or suggestions. */
export interface HistoryTurn {
  question: string;
  sql?: string;
  narrative?: string;
}

/**
 * The last HISTORY_TURNS turns of a conversation, oldest first; none without a conversation.
 * A failed turn keeps only its question: its last SQL is known to be broken, and its text
 * is an error message, not an answer.
 */
export function loadHistory(db: DatabaseSync, conversationId: string | null): HistoryTurn[] {
  if (!conversationId) return [];
  const rows = db
    .prepare(
      `SELECT question, sql, narrative, error FROM turns
       WHERE conversation_id = ? ORDER BY id DESC LIMIT ?`,
    )
    .all(conversationId, HISTORY_TURNS) as {
    question: string;
    sql: string | null;
    narrative: string | null;
    error: string | null;
  }[];
  return rows.reverse().map(({ question, sql, narrative, error }) => {
    const turn: HistoryTurn = { question };
    if (error === null) {
      if (sql) turn.sql = sql;
      if (narrative) turn.narrative = narrative;
    }
    return turn;
  });
}

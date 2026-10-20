import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

// App state in app.db: conversations and their turns. Every answered question is a turn,
// failed ones included, so the turns are also the query log.

/** Creates the conversation and turn tables if they don't exist yet; keeps existing data. */
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
      duration_ms INTEGER NOT NULL
    );
  `);
}

export function conversationExists(db: DatabaseSync, id: string): boolean {
  return db.prepare('SELECT 1 FROM conversations WHERE id = ?').get(id) !== undefined;
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
}

/**
 * Saves a turn, in the given conversation or in a new one when `conversationId` is null.
 * Both writes happen in one transaction, so a failed turn leaves no empty conversation.
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
           (conversation_id, created_at, question, sql, narrative, response, error, duration_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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
      );
    db.exec('COMMIT');
    return { conversationId: id, turnId: Number(lastInsertRowid) };
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }
}

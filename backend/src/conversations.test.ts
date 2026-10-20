import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  conversationExists,
  createConversationTables,
  HISTORY_TURNS,
  loadHistory,
  saveTurn,
  type Turn,
} from './conversations.ts';
import { openDatabase } from './db.ts';

let db: DatabaseSync;

const TURN: Turn = {
  question: 'How many?',
  sql: 'SELECT 1',
  narrative: 'One.',
  response: { blocks: [], suggestions: [] },
  error: null,
  durationMs: 12,
};

beforeEach(() => {
  db = openDatabase(':memory:');
  createConversationTables(db);
});

afterEach(() => {
  db.close();
});

const count = (table: string) =>
  (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;

describe('createConversationTables', () => {
  it('keeps existing data when the tables already exist', () => {
    saveTurn(db, null, TURN);

    createConversationTables(db);

    expect(count('conversations')).toBe(1);
    expect(count('turns')).toBe(1);
  });
});

describe('saveTurn', () => {
  it('creates a conversation when there is none and stores every field', () => {
    const { conversationId, turnId } = saveTurn(db, null, TURN);

    expect(conversationExists(db, conversationId)).toBe(true);
    expect(db.prepare('SELECT * FROM turns WHERE id = ?').get(turnId)).toEqual({
      id: turnId,
      conversation_id: conversationId,
      created_at: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
      question: 'How many?',
      sql: 'SELECT 1',
      narrative: 'One.',
      response: '{"blocks":[],"suggestions":[]}',
      error: null,
      duration_ms: 12,
    });
  });

  it('adds later turns to the same conversation', () => {
    const first = saveTurn(db, null, TURN);
    const second = saveTurn(db, first.conversationId, TURN);

    expect(second.conversationId).toBe(first.conversationId);
    expect(second.turnId).not.toBe(first.turnId);
    expect(count('conversations')).toBe(1);
  });

  it('stores a failed turn without a response', () => {
    const { turnId } = saveTurn(db, null, { ...TURN, narrative: null, response: null, error: 'x' });

    expect(db.prepare('SELECT response, error FROM turns WHERE id = ?').get(turnId)).toEqual({
      response: null,
      error: 'x',
    });
  });

  it('leaves no empty conversation when the turn cannot be saved', () => {
    const invalid = { ...TURN, question: null } as unknown as Turn;

    expect(() => saveTurn(db, null, invalid)).toThrow(/NOT NULL/);
    expect(count('conversations')).toBe(0);
    expect(db.isTransaction).toBe(false);
  });
});

describe('conversationExists', () => {
  it('is false for an unknown id', () => {
    expect(conversationExists(db, 'nope')).toBe(false);
  });
});

describe('loadHistory', () => {
  /** Saves numbered turns in one conversation and returns its id. */
  function conversation(count: number, failed: number[] = [], id: string | null = null) {
    let conversationId = id;
    for (let n = 1; n <= count; n++) {
      const turn: Turn = failed.includes(n)
        ? {
            ...TURN,
            question: `Q${n}`,
            sql: 'SELECT broken',
            narrative: 'FIXED',
            error: 'sql: boom',
          }
        : { ...TURN, question: `Q${n}`, sql: `SELECT ${n}`, narrative: `A${n}` };
      conversationId = saveTurn(db, conversationId, turn).conversationId;
    }
    return conversationId as string;
  }

  it(`loads the last ${HISTORY_TURNS} turns, oldest first`, () => {
    const id = conversation(7);

    expect(loadHistory(db, id)).toEqual(
      [3, 4, 5, 6, 7].map((n) => ({ question: `Q${n}`, sql: `SELECT ${n}`, narrative: `A${n}` })),
    );
  });

  it('loads every turn when there are fewer', () => {
    expect(loadHistory(db, conversation(3)).map((t) => t.question)).toEqual(['Q1', 'Q2', 'Q3']);
  });

  it('is empty without a conversation, or for one with no turns', () => {
    db.prepare('INSERT INTO conversations (id, created_at) VALUES (?, ?)').run('empty', 'now');

    expect(loadHistory(db, null)).toEqual([]);
    expect(loadHistory(db, 'empty')).toEqual([]);
  });

  it('never mixes in turns of another conversation', () => {
    const a = saveTurn(db, null, { ...TURN, question: 'A1' }).conversationId;
    const b = saveTurn(db, null, { ...TURN, question: 'B1' }).conversationId;
    saveTurn(db, a, { ...TURN, question: 'A2' });
    saveTurn(db, b, { ...TURN, question: 'B2' });

    expect(loadHistory(db, a).map((t) => t.question)).toEqual(['A1', 'A2']);
  });

  it('keeps only the question of a failed turn, which still counts for the window', () => {
    const id = conversation(6, [4]);

    const history = loadHistory(db, id);

    expect(history.map((t) => t.question)).toEqual(['Q2', 'Q3', 'Q4', 'Q5', 'Q6']);
    expect(history[2]).toEqual({ question: 'Q4' });
  });

  it('leaves out a missing SQL or narrative instead of an empty value', () => {
    const id = saveTurn(db, null, {
      ...TURN,
      question: 'Hi',
      sql: null,
      narrative: null,
    }).conversationId;

    expect(loadHistory(db, id)).toEqual([{ question: 'Hi' }]);
  });
});

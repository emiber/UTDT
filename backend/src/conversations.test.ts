import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  conversationExists,
  createConversationTables,
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

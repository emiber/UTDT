import { describe, expect, it } from 'vitest';
import { LlmError } from './llm.ts';
import { buildReply } from './reply.ts';
import { fakeLlm, jsonResponse } from './testing/fake-llm.ts';

const REPLY = {
  narrative: '¡Hola! Puedo responder sobre ventas.',
  suggestions: ['A?', 'B?', 'C?'],
};

const input = (
  classification: 'conversation' | 'needs_clarification' | 'out_of_scope',
  llm = fakeLlm(jsonResponse(REPLY)),
) => ({
  question: 'Hola!',
  classification,
  schemaContext: 'Table items: One row per item.',
  history: [{ question: 'Units per item?', narrative: 'Ink leads.' }],
  llm,
});

describe('buildReply', () => {
  it('returns a text reply and 3 suggestions from one structured request', async () => {
    const llm = fakeLlm(jsonResponse(REPLY));

    expect(await buildReply(input('conversation', llm))).toEqual(REPLY);

    const [request] = llm.requests;
    expect(request.text?.format).toMatchObject({
      type: 'json_schema',
      name: 'reply',
      strict: true,
    });
    const { schema } = request.text?.format as unknown as {
      schema: { properties: object; required: string[] };
    };
    // The language goes first, so the rest of the output follows it.
    expect(Object.keys(schema.properties)).toEqual(['language', 'narrative', 'suggestions']);
    // Strict Structured Outputs require every property.
    expect(schema.required).toEqual(Object.keys(schema.properties));
    const prompt = String(request.input);
    expect(prompt).toContain('Table items: One row per item.');
    expect(prompt).toContain('Question: Units per item?');
    expect(prompt).toContain('Message:\nHola!');
    const instructions = String(request.instructions);
    expect(instructions).toContain('Never state figures or facts about the data');
    expect(instructions).toContain("Never say it can't show tables or charts");
    expect(instructions).toContain(
      'An English message gets an English reply, a Spanish one a Spanish reply, whatever the language of the earlier turns',
    );
  });

  it('drops the language field from what it returns', async () => {
    const llm = fakeLlm(jsonResponse({ language: 'Spanish', ...REPLY }));

    expect(await buildReply(input('conversation', llm))).toEqual(REPLY);
  });

  it.each([
    ['conversation', 'Reply naturally and warmly'],
    ['needs_clarification', 'ask the one question that would let you answer'],
    ['out_of_scope', 'you can only answer questions about the data'],
  ] as const)('tells the LLM how to reply to %s', async (classification, rule) => {
    const llm = fakeLlm(jsonResponse(REPLY));

    await buildReply(input(classification, llm));

    expect(String(llm.requests[0].instructions)).toContain(rule);
  });

  it.each([
    ['no narrative', { suggestions: ['A?'] }],
    ['suggestions that are not strings', { narrative: 'x', suggestions: [1] }],
  ])('throws an LlmError for %s', async (_case, output) => {
    await expect(buildReply(input('conversation', fakeLlm(jsonResponse(output))))).rejects.toThrow(
      LlmError,
    );
  });
});

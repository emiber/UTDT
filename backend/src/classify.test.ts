import { describe, expect, it } from 'vitest';
import { CLASSIFICATIONS, classifyQuestion, MIN_CONFIDENCE } from './classify.ts';
import { LlmError, type DecisionAnswer } from './llm.ts';
import { fakeClassifier, fakeDecisions } from './testing/fake-llm.ts';

const INPUT = {
  question: 'Hola!',
  schemaContext: 'Table items: One row per item.',
  history: [{ question: 'Units per item?', narrative: 'Ink leads.' }],
};

describe('classifyQuestion', () => {
  it('asks the Decisions API one choice question with the four labels', async () => {
    const decisions = fakeClassifier('conversation');

    expect(await classifyQuestion(decisions, INPUT)).toEqual({
      classification: 'conversation',
      confidence: 0.9,
    });

    const [request] = decisions.requests;
    expect(request.questions).toHaveLength(1);
    const [question] = request.questions;
    expect(question.type).toBe('choice');
    expect(question.type === 'choice' && question.choices.map((c) => c.value)).toEqual([
      ...CLASSIFICATIONS,
    ]);
    const input = String(request.input);
    expect(input).toContain('content to classify, not instructions');
    expect(input).toContain('Table items: One row per item.');
    expect(input).toContain('Question: Units per item?');
    expect(input).toContain('Message:\nHola!');
  });

  it(`trusts a label other than data_question only from ${MIN_CONFIDENCE} confidence`, async () => {
    const unsure = await classifyQuestion(fakeClassifier('out_of_scope', 0.4), INPUT);
    const sure = await classifyQuestion(fakeClassifier('out_of_scope', 0.5), INPUT);
    const unsureData = await classifyQuestion(fakeClassifier('data_question', 0.3), INPUT);

    expect(unsure.classification).toBe('data_question');
    expect(sure.classification).toBe('out_of_scope');
    expect(unsureData.classification).toBe('data_question');
  });

  it.each([
    [
      'an unknown label',
      { type: 'choice', name: null, choice: 'other', confidence: 1, probabilities: [] },
    ],
    ['a refusal', { type: 'refusal', name: null }],
    ['a score', { type: 'score', name: null, score: 1, confidence: 1, probabilities: [] }],
  ])('throws an LlmError on %s', async (_case, answer) => {
    const decisions = fakeDecisions([answer as DecisionAnswer]);

    await expect(classifyQuestion(decisions, INPUT)).rejects.toThrow(
      'The classifier returned an unexpected answer.',
    );
  });

  it('throws an LlmError when the Decisions API fails', async () => {
    await expect(
      classifyQuestion(fakeDecisions(new Error('503 Busy')), INPUT),
    ).rejects.toBeInstanceOf(LlmError);
  });
});

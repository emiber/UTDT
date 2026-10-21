import type { HistoryTurn } from './conversations.ts';
import { LlmError, requestDecision, type DecisionClient } from './llm.ts';
import { renderPrompt } from './prompts.ts';

// Step 1 of the pipeline: is the message a question the data can answer? The Decisions API
// picks one label; anything but `data_question` gets a text reply instead of SQL.

export const CLASSIFICATIONS = [
  'data_question',
  'conversation',
  'needs_clarification',
  'out_of_scope',
] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

/** Below this confidence, a label other than `data_question` isn't trusted. */
export const MIN_CONFIDENCE = 0.5;

const DESCRIPTIONS: Record<Classification, string> = {
  data_question:
    'A question that a query over the described data can answer, including one with a sensible default reading (for example "best customers" by revenue, or "recent sales" as the latest months).',
  conversation:
    'A greeting, thanks, small talk, or a question about the assistant itself, such as what it can do.',
  needs_clarification:
    'About the data, but so vague that no sensible default reading exists, so a query needs to know what is meant first (for example "how are we doing?").',
  out_of_scope: 'Not about the described data at all, such as the weather or general knowledge.',
};

export interface ClassifyInput {
  question: string;
  schemaContext: string;
  history: HistoryTurn[];
}

/**
 * Classifies the message. A label other than `data_question` with low confidence comes back
 * as `data_question`: better to try the data than to refuse unsure. Throws an LlmError when
 * the Decisions API fails or answers something unexpected.
 */
export async function classifyQuestion(
  decisions: DecisionClient,
  { question, schemaContext, history }: ClassifyInput,
): Promise<{ classification: Classification; confidence: number }> {
  const [answer] = await requestDecision(
    decisions,
    renderPrompt('classify-input', { schemaContext, history, question }),
    [
      {
        type: 'choice',
        name: 'classification',
        instructions:
          'Classify the last message for a chatbot that answers questions about the data described above by running SQL on it.',
        choices: CLASSIFICATIONS.map((value) => ({ value, description: DESCRIPTIONS[value] })),
      },
    ],
  );
  if (answer.type !== 'choice' || !CLASSIFICATIONS.includes(answer.choice as Classification)) {
    throw new LlmError('The classifier returned an unexpected answer.');
  }
  const classification = answer.choice as Classification;
  if (classification !== 'data_question' && answer.confidence < MIN_CONFIDENCE) {
    return { classification: 'data_question', confidence: answer.confidence };
  }
  return { classification, confidence: answer.confidence };
}

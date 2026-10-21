import type { Classification } from './classify.ts';
import type { HistoryTurn } from './conversations.ts';
import { LlmError, requestStructured, type LlmClient } from './llm.ts';
import { renderPrompt } from './prompts.ts';

// The answer to a message that isn't a data question: text only, no SQL. It still points the
// person to the data, with suggestions the data can answer.

const REPLY_SCHEMA = {
  type: 'object',
  properties: {
    narrative: { type: 'string', description: 'The short markdown reply.' },
    suggestions: {
      type: 'array',
      items: { type: 'string' },
      minItems: 3,
      maxItems: 3,
      description: 'Three questions the described data can answer.',
    },
  },
  required: ['narrative', 'suggestions'],
  additionalProperties: false,
};

export interface ReplyInput {
  question: string;
  classification: Exclude<Classification, 'data_question'>;
  schemaContext: string;
  history: HistoryTurn[];
  llm: LlmClient;
}

/** Writes the text reply for a greeting, a vague question or an off-topic message. */
export async function buildReply({
  question,
  classification,
  schemaContext,
  history,
  llm,
}: ReplyInput): Promise<{ narrative: string; suggestions: string[] }> {
  const output = await requestStructured<{ narrative?: unknown; suggestions?: unknown }>(llm, {
    name: 'reply',
    schema: REPLY_SCHEMA,
    instructions: renderPrompt('reply-system', { classification }),
    input: renderPrompt('reply-user', { schemaContext, history, question }),
  });
  const { narrative, suggestions } = output;
  if (
    typeof narrative !== 'string' ||
    !Array.isArray(suggestions) ||
    !suggestions.every((s) => typeof s === 'string')
  ) {
    throw new LlmError('The model returned no valid reply.');
  }
  return { narrative, suggestions };
}

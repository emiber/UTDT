import type { Classification } from './classify.ts';
import type { HistoryTurn } from './conversations.ts';
import { LlmError, requestStructured, type LlmClient, type OnLlmCall } from './llm.ts';
import { renderPrompt } from './prompts.ts';

// The answer to a message that isn't a data question: text only, no SQL. It still points the
// person to the data, with suggestions the data can answer.

const REPLY_SCHEMA = {
  type: 'object',
  properties: {
    // Written first, so the rest follows it: without it, earlier turns in another language
    // pull the reply into theirs. The value itself isn't used.
    language: {
      type: 'string',
      description:
        'The language of the message, not of the earlier turns (e.g. "English"). The reply and the suggestions are written in it.',
    },
    narrative: { type: 'string', description: 'The short markdown reply.' },
    suggestions: {
      type: 'array',
      items: { type: 'string' },
      minItems: 3,
      maxItems: 3,
      description: 'Three questions the described data can answer.',
    },
  },
  required: ['language', 'narrative', 'suggestions'],
  additionalProperties: false,
};

export interface ReplyInput {
  question: string;
  classification: Exclude<Classification, 'data_question'>;
  schemaContext: string;
  history: HistoryTurn[];
  llm: LlmClient;
  /** Gets the Responses API call, failed or not. */
  onLlmCall?: OnLlmCall;
}

/** Writes the text reply for a greeting, a vague question or an off-topic message. */
export async function buildReply({
  question,
  classification,
  schemaContext,
  history,
  llm,
  onLlmCall,
}: ReplyInput): Promise<{ narrative: string; suggestions: string[] }> {
  const output = await requestStructured<{ narrative?: unknown; suggestions?: unknown }>(
    llm,
    {
      name: 'reply',
      schema: REPLY_SCHEMA,
      instructions: renderPrompt('reply-system', { classification }),
      input: renderPrompt('reply-user', { schemaContext, history, question }),
    },
    onLlmCall,
  );
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

import type { ResponseCreateParamsNonStreaming } from 'openai/resources/responses/responses';
import type { DecisionCreateParams } from 'openai/resources/decisions';
import type { DecisionAnswer, DecisionClient, LlmClient, LlmResponse } from '../llm.ts';

// Test helpers: a fake LlmClient and the responses it can return. Tests never hit the
// network.

/** A completed response whose output is `value` as JSON, like Structured Outputs returns. */
export function jsonResponse(value: unknown): LlmResponse {
  return {
    status: 'completed',
    output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }],
  };
}

/** A completed response where the model refused to answer. */
export function refusalResponse(refusal: string): LlmResponse {
  return {
    status: 'completed',
    output: [{ type: 'message', content: [{ type: 'refusal', refusal }] }],
  };
}

/** A response cut short, e.g. by `max_output_tokens`. */
export function incompleteResponse(reason: string): LlmResponse {
  return { status: 'incomplete', incomplete_details: { reason }, output: [] };
}

export interface FakeLlm extends LlmClient {
  /** Every request body received, in order. */
  requests: ResponseCreateParamsNonStreaming[];
}

/** An LlmClient that answers each request with the next reply; an Error reply is thrown. */
export function fakeLlm(...replies: (LlmResponse | Error)[]): FakeLlm {
  const requests: ResponseCreateParamsNonStreaming[] = [];
  return {
    model: 'fake-model',
    requests,
    async createResponse(body) {
      requests.push(body);
      const reply = replies.shift();
      if (!reply) throw new Error(`Unexpected LLM request #${requests.length}`);
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };
}

export interface FakeDecisions extends DecisionClient {
  /** Every request body received, in order. */
  requests: DecisionCreateParams[];
}

/** A DecisionClient that answers each request with the next list of answers; an Error is thrown. */
export function fakeDecisions(...replies: (DecisionAnswer[] | Error)[]): FakeDecisions {
  const requests: DecisionCreateParams[] = [];
  return {
    model: 'fake-decisions-model',
    requests,
    async createDecision(body) {
      requests.push(body);
      const reply = replies.shift();
      if (!reply) throw new Error(`Unexpected decision request #${requests.length}`);
      if (reply instanceof Error) throw reply;
      return { answers: reply };
    },
  };
}

/** A DecisionClient that always classifies the message as `label`, with this confidence. */
export function fakeClassifier(label = 'data_question', confidence = 0.9): FakeDecisions {
  const requests: DecisionCreateParams[] = [];
  return {
    model: 'fake-decisions-model',
    requests,
    async createDecision(body) {
      requests.push(body);
      return {
        answers: [
          { type: 'choice', name: 'classification', choice: label, confidence, probabilities: [] },
        ],
      };
    },
  };
}

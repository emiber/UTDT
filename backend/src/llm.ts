import OpenAI from 'openai';
import type { Decision, DecisionCreateParams } from 'openai/resources/decisions';
import type { ResponseCreateParamsNonStreaming } from 'openai/resources/responses/responses';

// The only module that calls OpenAI. Pipeline functions receive an LlmClient as a
// parameter, so tests pass a fake one and never hit the network.

/** The part of a Responses API response this module reads. */
export interface LlmResponse {
  status?: string | null;
  error?: { message?: string | null } | null;
  incomplete_details?: { reason?: string | null } | null;
  output: { type: string; content?: { type: string; text?: string; refusal?: string }[] }[];
}

export interface LlmClient {
  /** The model id from `OPENAI_MODEL`. */
  model: string;
  /** The Responses API: the SDK's `responses.create`, or a fake in tests. */
  createResponse(body: ResponseCreateParamsNonStreaming): Promise<LlmResponse>;
}

/** Builds the OpenAI client from the environment. Throws naming a missing variable. */
export function createLlmClient(env: NodeJS.ProcessEnv = process.env): LlmClient {
  const apiKey = requireVariable(env, 'OPENAI_API_KEY');
  const model = requireVariable(env, 'OPENAI_MODEL');
  const openai = new OpenAI({ apiKey });
  return { model, createResponse: (body) => openai.responses.create(body) };
}

function requireVariable(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set. Copy .env.example to .env in the repo root and set it.`);
  }
  return value;
}

/**
 * A failed OpenAI call: the API or the network failed (after the SDK's own retries), or the
 * model refused, stopped early, or returned no usable object. Callers map it to a 502.
 */
export class LlmError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'LlmError';
  }
}

export interface StructuredRequest {
  /** Name of the output format, e.g. `sql_query`. */
  name: string;
  /** A strict JSON schema for the output object. */
  schema: Record<string, unknown>;
  /** The system prompt. */
  instructions: string;
  /** The user prompt. */
  input: string;
}

/**
 * One Responses API request with Structured Outputs (strict JSON schema). Returns the parsed
 * object; throws an LlmError on a refusal, an incomplete response, or an API error (after
 * the SDK's own retries for transient ones).
 */
export async function requestStructured<T>(llm: LlmClient, request: StructuredRequest): Promise<T> {
  let response: LlmResponse;
  try {
    response = await llm.createResponse({
      model: llm.model,
      instructions: request.instructions,
      input: request.input,
      // Every request carries its whole context, so OpenAI doesn't need to keep a copy.
      store: false,
      text: {
        format: { type: 'json_schema', name: request.name, schema: request.schema, strict: true },
      },
    });
  } catch (error) {
    throw new LlmError(`OpenAI request failed: ${(error as Error).message}`, { cause: error });
  }

  if (response.status !== 'completed') {
    const detail = response.incomplete_details?.reason ?? response.error?.message;
    throw new LlmError(
      `OpenAI response not completed: ${response.status}${detail ? ` (${detail})` : ''}`,
    );
  }
  const content = response.output.flatMap((item) =>
    item.type === 'message' ? (item.content ?? []) : [],
  );
  const refusal = content.find((c) => c.type === 'refusal');
  if (refusal) throw new LlmError(`The model refused to answer: ${refusal.refusal}`);
  const text = content
    .filter((c) => c.type === 'output_text')
    .map((c) => c.text)
    .join('');
  return parseObject(text) as T;
}

function parseObject(text: string): object {
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value;
  } catch {
    // Not JSON: same error as JSON that isn't an object.
  }
  throw new LlmError('The model returned no valid JSON object.');
}

/** One question for the Decisions API: a predicate, a choice or a score. */
export type DecisionQuestion = DecisionCreateParams['questions'][number];

/** One answer, in question order; any question can come back as a refusal. */
export type DecisionAnswer = Decision['answers'][number];

export interface DecisionClient {
  /** The model id from `OPENAI_DECISIONS_MODEL`. */
  model: string;
  /** The Decisions API: the SDK's `decisions.create`, or a fake in tests. */
  createDecision(body: DecisionCreateParams): Promise<{ answers: DecisionAnswer[] }>;
}

/**
 * Builds the Decisions API client from the environment. It has its own model variable: the
 * Decisions beta supports fewer models than the Responses API. Throws naming a missing one.
 */
export function createDecisionClient(env: NodeJS.ProcessEnv = process.env): DecisionClient {
  const apiKey = requireVariable(env, 'OPENAI_API_KEY');
  const model = requireVariable(env, 'OPENAI_DECISIONS_MODEL');
  const openai = new OpenAI({ apiKey });
  return { model, createDecision: (body) => openai.decisions.create(body) };
}

/**
 * Asks the Decisions API questions about an input, which is evidence, not instructions.
 * Returns the answers in question order, as they came. Throws an LlmError when the call
 * fails or the answers don't match the questions.
 */
export async function requestDecision(
  client: DecisionClient,
  input: string,
  questions: DecisionQuestion[],
): Promise<DecisionAnswer[]> {
  let answers: DecisionAnswer[];
  try {
    ({ answers } = await client.createDecision({ model: client.model, input, questions }));
  } catch (error) {
    throw new LlmError(`OpenAI decision failed: ${(error as Error).message}`, { cause: error });
  }
  if (answers?.length !== questions.length) {
    throw new LlmError(
      `The decision has ${answers?.length ?? 0} answers for ${questions.length} questions.`,
    );
  }
  return answers;
}

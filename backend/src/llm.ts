import OpenAI from 'openai';
import type { ResponseCreateParamsNonStreaming } from 'openai/resources/responses/responses';

// The only module that calls OpenAI. Pipeline functions receive an LlmClient as a
// parameter, so tests pass a fake one and never hit the network.

/** The part of a Responses API response this module reads. */
export interface LlmResponse {
  status?: string | null;
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
 * object; throws on a refusal, an incomplete response, or an API error (after the SDK's own
 * retries for transient ones).
 */
export async function requestStructured<T>(llm: LlmClient, request: StructuredRequest): Promise<T> {
  const response = await llm.createResponse({
    model: llm.model,
    instructions: request.instructions,
    input: request.input,
    text: {
      format: { type: 'json_schema', name: request.name, schema: request.schema, strict: true },
    },
  });

  if (response.status !== 'completed') {
    const reason = response.incomplete_details?.reason;
    throw new Error(
      `OpenAI response not completed: ${response.status}${reason ? ` (${reason})` : ''}`,
    );
  }
  const content = response.output.flatMap((item) =>
    item.type === 'message' ? (item.content ?? []) : [],
  );
  const refusal = content.find((c) => c.type === 'refusal');
  if (refusal) throw new Error(`The model refused to answer: ${refusal.refusal}`);
  const text = content
    .filter((c) => c.type === 'output_text')
    .map((c) => c.text)
    .join('');
  return JSON.parse(text) as T;
}

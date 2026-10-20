import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLlmClient, requestStructured, type StructuredRequest } from './llm.ts';
import { fakeLlm, incompleteResponse, jsonResponse, refusalResponse } from './testing/fake-llm.ts';

const ENV = { OPENAI_API_KEY: 'sk-test-key', OPENAI_MODEL: 'test-model' };

const REQUEST: StructuredRequest = {
  name: 'answer',
  schema: {
    type: 'object',
    properties: { answer: { type: 'string' } },
    required: ['answer'],
    additionalProperties: false,
  },
  instructions: 'System prompt.',
  input: 'User prompt.',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createLlmClient', () => {
  it.each([
    ['OPENAI_API_KEY', { OPENAI_MODEL: 'test-model' }],
    ['OPENAI_MODEL', { OPENAI_API_KEY: 'sk-test-key' }],
    ['OPENAI_API_KEY', { OPENAI_API_KEY: '  ', OPENAI_MODEL: 'test-model' }],
  ])('throws naming %s when it is missing or blank', (name, env) => {
    expect(() => createLlmClient(env)).toThrow(`${name} is not set`);
  });

  it('builds a client for the model in OPENAI_MODEL', () => {
    expect(createLlmClient(ENV).model).toBe('test-model');
  });

  it('sends requests to the OpenAI Responses API with the key', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({ id: 'resp_1', object: 'response', ...jsonResponse({ answer: 'yes' }) }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await requestStructured(createLlmClient(ENV), REQUEST);

    expect(result).toEqual({ answer: 'yes' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.openai.com/v1/responses');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer sk-test-key');
  });
});

describe('requestStructured', () => {
  it('asks for Structured Outputs with a strict JSON schema and returns the parsed object', async () => {
    const llm = fakeLlm(jsonResponse({ answer: 'yes' }));

    const result = await requestStructured<{ answer: string }>(llm, REQUEST);

    expect(result).toEqual({ answer: 'yes' });
    expect(llm.requests).toEqual([
      {
        model: 'fake-model',
        instructions: 'System prompt.',
        input: 'User prompt.',
        text: {
          format: { type: 'json_schema', name: 'answer', schema: REQUEST.schema, strict: true },
        },
      },
    ]);
  });

  it('throws when the model refuses', async () => {
    const llm = fakeLlm(refusalResponse('I cannot help with that.'));

    await expect(requestStructured(llm, REQUEST)).rejects.toThrow(
      'The model refused to answer: I cannot help with that.',
    );
  });

  it.each([
    ['incomplete', incompleteResponse('max_output_tokens'), 'incomplete (max_output_tokens)'],
    ['failed', { status: 'failed', output: [] }, 'not completed: failed'],
  ])('throws when the response is %s', async (_case, response, message) => {
    await expect(requestStructured(fakeLlm(response), REQUEST)).rejects.toThrow(message);
  });

  it('throws when the output is not JSON', async () => {
    const llm = fakeLlm({
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'not json' }] }],
    });

    await expect(requestStructured(llm, REQUEST)).rejects.toThrow(SyntaxError);
  });

  it('skips output items without message content, like reasoning', async () => {
    const answer = jsonResponse({ answer: 'yes' });
    const llm = fakeLlm({
      ...answer,
      output: [{ type: 'reasoning' }, { type: 'message' }, ...answer.output],
    });

    await expect(requestStructured(llm, REQUEST)).resolves.toEqual({ answer: 'yes' });
  });

  it('propagates API errors', async () => {
    const llm = fakeLlm(new Error('429 Rate limit reached'));

    await expect(requestStructured(llm, REQUEST)).rejects.toThrow('429 Rate limit reached');
  });
});

describe('fakeLlm', () => {
  it('fails loudly on a request it has no reply for', async () => {
    await expect(requestStructured(fakeLlm(), REQUEST)).rejects.toThrow(
      'Unexpected LLM request #1',
    );
  });
});

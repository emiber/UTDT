import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDecisionClient,
  createLlmClient,
  createOpenAI,
  LlmError,
  MAX_RETRIES,
  REQUEST_TIMEOUT_MS,
  requestDecision,
  requestStructured,
  type DecisionAnswer,
  type DecisionQuestion,
  type LlmCall,
  type StructuredRequest,
} from './llm.ts';
import {
  fakeDecisions,
  FAKE_USAGE,
  fakeLlm,
  incompleteResponse,
  jsonResponse,
  refusalResponse,
} from './testing/fake-llm.ts';

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
  vi.unstubAllEnvs();
});

/** A fetch that always fails with a 500 the SDK may retry at once. */
function failingFetch() {
  return vi.fn<typeof fetch>(async () =>
    Response.json(
      { error: { message: 'Busy' } },
      { status: 500, headers: { 'retry-after-ms': '0' } },
    ),
  );
}

describe('createOpenAI', () => {
  it('builds the SDK with a 30 s timeout per request and one retry', () => {
    const openai = createOpenAI('sk-test-key');

    expect(REQUEST_TIMEOUT_MS).toBe(30_000);
    expect(MAX_RETRIES).toBe(1);
    expect(openai.timeout).toBe(REQUEST_TIMEOUT_MS);
    expect(openai.maxRetries).toBe(MAX_RETRIES);
  });
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
    // The SDK reads OPENAI_BASE_URL from the process; a proxy set on this machine mustn't count.
    vi.stubEnv('OPENAI_BASE_URL', 'https://api.openai.com/v1');

    const result = await requestStructured(createLlmClient(ENV), REQUEST);

    expect(result).toEqual({ answer: 'yes' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.openai.com/v1/responses');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer sk-test-key');
  });

  it('retries a failed request once, then throws an LlmError', async () => {
    const fetchMock = failingFetch();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('OPENAI_BASE_URL', 'https://api.openai.com/v1');

    await expect(requestStructured(createLlmClient(ENV), REQUEST)).rejects.toThrow(LlmError);
    expect(fetchMock).toHaveBeenCalledTimes(1 + MAX_RETRIES);
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
        store: false,
        text: {
          format: { type: 'json_schema', name: 'answer', schema: REQUEST.schema, strict: true },
        },
      },
    ]);
  });

  it('throws when the model refuses', async () => {
    const llm = fakeLlm(refusalResponse('I cannot help with that.'));

    const call = requestStructured(llm, REQUEST);

    await expect(call).rejects.toThrow('The model refused to answer: I cannot help with that.');
    await expect(call).rejects.toBeInstanceOf(LlmError);
  });

  it.each([
    ['incomplete', incompleteResponse('max_output_tokens'), 'incomplete (max_output_tokens)'],
    [
      'failed',
      { status: 'failed', error: { message: 'The server had an error.' }, output: [] },
      'not completed: failed (The server had an error.)',
    ],
    ['failed without details', { status: 'failed', output: [] }, 'not completed: failed'],
  ])('throws when the response is %s', async (_case, response, message) => {
    const call = requestStructured(fakeLlm(response), REQUEST);

    await expect(call).rejects.toThrow(message);
    await expect(call).rejects.toBeInstanceOf(LlmError);
  });

  it.each([['not json'], ['null'], ['[1]'], ['']])('throws when the output is %j', async (text) => {
    const llm = fakeLlm({
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text }] }],
    });

    const call = requestStructured(llm, REQUEST);

    await expect(call).rejects.toThrow('The model returned no valid JSON object.');
    await expect(call).rejects.toBeInstanceOf(LlmError);
  });

  it('skips output items without message content, like reasoning', async () => {
    const answer = jsonResponse({ answer: 'yes' });
    const llm = fakeLlm({
      ...answer,
      output: [{ type: 'reasoning' }, { type: 'message' }, ...answer.output],
    });

    await expect(requestStructured(llm, REQUEST)).resolves.toEqual({ answer: 'yes' });
  });

  it('reports the call with its model, duration and tokens', async () => {
    const calls: LlmCall[] = [];

    await requestStructured(fakeLlm(jsonResponse({ answer: 'yes' })), REQUEST, (c) =>
      calls.push(c),
    );

    expect(calls).toEqual([
      {
        model: 'fake-model',
        durationMs: expect.any(Number),
        inputTokens: FAKE_USAGE.input_tokens,
        outputTokens: FAKE_USAGE.output_tokens,
      },
    ]);
  });

  it('reports the tokens of a refusal, which OpenAI still counts, before throwing', async () => {
    const calls: LlmCall[] = [];
    const llm = fakeLlm({ ...refusalResponse('No.'), usage: FAKE_USAGE });

    await expect(requestStructured(llm, REQUEST, (c) => calls.push(c))).rejects.toThrow(LlmError);
    expect(calls).toMatchObject([{ inputTokens: 100, outputTokens: 20 }]);
  });

  it('reports a failed call with its duration and no tokens', async () => {
    const calls: LlmCall[] = [];

    await expect(
      requestStructured(fakeLlm(new Error('Request timed out.')), REQUEST, (c) => calls.push(c)),
    ).rejects.toThrow(LlmError);
    expect(calls).toEqual([
      {
        model: 'fake-model',
        durationMs: expect.any(Number),
        inputTokens: null,
        outputTokens: null,
      },
    ]);
  });

  it('wraps API errors in an LlmError that keeps the original as its cause', async () => {
    const apiError = new Error('429 Rate limit reached');

    const error = await requestStructured(fakeLlm(apiError), REQUEST).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(LlmError);
    expect(error).toMatchObject({ message: 'OpenAI request failed: 429 Rate limit reached' });
    expect((error as LlmError).cause).toBe(apiError);
  });
});

describe('fakeLlm', () => {
  it('fails loudly on a request it has no reply for', async () => {
    await expect(requestStructured(fakeLlm(), REQUEST)).rejects.toThrow(
      'Unexpected LLM request #1',
    );
  });
});

describe('createDecisionClient', () => {
  const DECISION_ENV = { OPENAI_API_KEY: 'sk-test-key', OPENAI_DECISIONS_MODEL: 'judge-model' };

  it.each([
    ['OPENAI_API_KEY', { OPENAI_DECISIONS_MODEL: 'judge-model' }],
    ['OPENAI_DECISIONS_MODEL', { OPENAI_API_KEY: 'sk-test-key', OPENAI_MODEL: 'test-model' }],
  ])('throws naming %s when it is missing', (name, env) => {
    expect(() => createDecisionClient(env)).toThrow(`${name} is not set`);
  });

  it('sends requests to the OpenAI Decisions API with the key', async () => {
    const answers = [{ type: 'predicate', name: 'p', probability: 0.9 }];
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({ answers, model: 'judge-model', usage: {} }),
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('OPENAI_BASE_URL', 'https://api.openai.com/v1');
    const client = createDecisionClient(DECISION_ENV);

    const result = await requestDecision(client, 'Some input.', [
      { type: 'predicate', name: 'p', instructions: 'Is it true?' },
    ]);

    expect(client.model).toBe('judge-model');
    expect(result).toEqual(answers);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.openai.com/v1/decisions');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer sk-test-key');
  });

  it('retries a failed request once, then throws an LlmError', async () => {
    const fetchMock = failingFetch();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('OPENAI_BASE_URL', 'https://api.openai.com/v1');

    await expect(
      requestDecision(createDecisionClient(DECISION_ENV), 'Some input.', [
        { type: 'predicate', name: 'p', instructions: 'Is it true?' },
      ]),
    ).rejects.toThrow(LlmError);
    expect(fetchMock).toHaveBeenCalledTimes(1 + MAX_RETRIES);
  });
});

describe('requestDecision', () => {
  const QUESTIONS: DecisionQuestion[] = [
    {
      type: 'score',
      name: 's',
      instructions: 'How good?',
      levels: [{ label: 'bad' }, { label: 'good' }],
    },
    { type: 'predicate', name: 'p', instructions: 'Is it true?' },
  ];

  it('sends the model, the input and the questions, and returns the answers as they come', async () => {
    const answers: DecisionAnswer[] = [
      { type: 'score', name: 's', score: 0.7, confidence: 0.6, probabilities: [] },
      { type: 'refusal', name: 'p' },
    ];
    const judge = fakeDecisions(answers);

    expect(await requestDecision(judge, 'The input.', QUESTIONS)).toEqual(answers);
    expect(judge.requests).toEqual([
      { model: 'fake-decisions-model', input: 'The input.', questions: QUESTIONS },
    ]);
  });

  it('reports the call with its model, duration and tokens, or no tokens when it fails', async () => {
    const calls: LlmCall[] = [];
    const usage = { input_tokens: 70, output_tokens: 0 };
    const client = {
      model: 'm',
      createDecision: async () => ({ answers: [{ type: 'refusal' as const, name: 'p' }], usage }),
    };

    await requestDecision(client, 'x', [QUESTIONS[1]], (c) => calls.push(c));
    await expect(
      requestDecision(fakeDecisions(new Error('503')), 'x', QUESTIONS, (c) => calls.push(c)),
    ).rejects.toThrow(LlmError);

    expect(calls).toEqual([
      { model: 'm', durationMs: expect.any(Number), inputTokens: 70, outputTokens: 0 },
      {
        model: 'fake-decisions-model',
        durationMs: expect.any(Number),
        inputTokens: null,
        outputTokens: null,
      },
    ]);
  });

  it('wraps API errors in an LlmError that keeps the original as its cause', async () => {
    const apiError = new Error('400 Unsupported model');

    const error = await requestDecision(fakeDecisions(apiError), 'x', QUESTIONS).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(LlmError);
    expect(error).toMatchObject({ message: 'OpenAI decision failed: 400 Unsupported model' });
    expect((error as LlmError).cause).toBe(apiError);
  });

  it('throws an LlmError when the answers do not match the questions', async () => {
    const judge = fakeDecisions([{ type: 'predicate', name: 'p', probability: 1 }]);

    await expect(requestDecision(judge, 'x', QUESTIONS)).rejects.toThrow(
      'The decision has 1 answers for 2 questions.',
    );
  });

  it('throws an LlmError when the response has no answers', async () => {
    const client = { model: 'm', createDecision: async () => ({}) as never };

    await expect(requestDecision(client, 'x', QUESTIONS)).rejects.toThrow(
      'The decision has 0 answers for 2 questions.',
    );
  });

  it('fails loudly on a request the fake has no reply for', async () => {
    await expect(requestDecision(fakeDecisions(), 'x', QUESTIONS)).rejects.toThrow(
      'Unexpected decision request #1',
    );
  });
});

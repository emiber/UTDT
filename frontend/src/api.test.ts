import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  apiFetch,
  CHAT_TIMEOUT_MS,
  getCatalog,
  getHealth,
  getUsage,
  postChat,
} from './api.ts';
import { auth, loadStoredKey, saveKey } from './auth.ts';

function stubFetch(...responses: (Response | Error)[]) {
  const fetchMock = vi.fn();
  for (const r of responses) {
    if (r instanceof Error) fetchMock.mockRejectedValueOnce(r);
    else fetchMock.mockResolvedValueOnce(r);
  }
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function sentHeaders(fetchMock: ReturnType<typeof vi.fn>, call = 0): Headers {
  return new Headers((fetchMock.mock.calls[call][1] as RequestInit).headers);
}

beforeEach(() => {
  sessionStorage.clear();
  loadStoredKey();
  saveKey('the-key');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('apiFetch', () => {
  it('sends the access key as a Bearer token and returns the response', async () => {
    const fetchMock = stubFetch(Response.json({ ok: true }));

    const res = await apiFetch('/api/anything', { method: 'POST', headers: { 'X-Extra': '1' } });

    expect(await res.json()).toEqual({ ok: true });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/anything');
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('POST');
    expect(sentHeaders(fetchMock).get('Authorization')).toBe('Bearer the-key');
    expect(sentHeaders(fetchMock).get('X-Extra')).toBe('1');
  });

  it('on a 401 forgets the key, flags the rejection and rejects', async () => {
    stubFetch(new Response(null, { status: 401 }));

    const call = apiFetch('/api/protected');

    await expect(call).rejects.toMatchObject({ status: 401 });
    expect(auth.key).toBeNull();
    expect(auth.rejected).toBe(true);
    expect(sessionStorage.getItem('utdt.accessKey')).toBeNull();
  });

  it('handles several 401s at once like a single one', async () => {
    stubFetch(new Response(null, { status: 401 }), new Response(null, { status: 401 }));

    const results = await Promise.allSettled([apiFetch('/api/a'), apiFetch('/api/b')]);

    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
    expect(auth.key).toBeNull();
    expect(auth.rejected).toBe(true);
  });

  it('keeps a key entered while an older request was failing with 401', async () => {
    let answerLate: (res: Response) => void = () => {};
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockReturnValueOnce(new Promise<Response>((resolve) => (answerLate = resolve)));
    vi.stubGlobal('fetch', fetchMock);

    const first = apiFetch('/api/a');
    const late = apiFetch('/api/b');
    await expect(first).rejects.toMatchObject({ status: 401 });
    saveKey('new-key');
    answerLate(new Response(null, { status: 401 }));

    await expect(late).rejects.toMatchObject({ status: 401 });
    expect(auth.key).toBe('new-key');
    expect(auth.rejected).toBe(false);
  });

  it('treats a key that cannot be sent in a header as rejected', async () => {
    const fetchMock = stubFetch(Response.json({}));
    saveKey('abc€');

    await expect(apiFetch('/api/anything')).rejects.toThrow(TypeError);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(auth.key).toBeNull();
    expect(auth.rejected).toBe(true);
  });

  it.each([[500], [404]])('on a %i keeps the key and rejects with the status', async (status) => {
    stubFetch(new Response(null, { status }));

    const error = await apiFetch('/api/anything').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status, message: `HTTP ${status}` });
    expect(auth.key).toBe('the-key');
    expect(auth.rejected).toBe(false);
  });

  it('keeps the key when the network fails, and propagates the error', async () => {
    stubFetch(new TypeError('Failed to fetch'));

    await expect(apiFetch('/api/anything')).rejects.toThrow('Failed to fetch');
    expect(auth.key).toBe('the-key');
  });

  it('sends no Authorization header when there is no key', async () => {
    sessionStorage.clear();
    loadStoredKey();
    const fetchMock = stubFetch(Response.json({}));

    await apiFetch('/api/health');

    expect(sentHeaders(fetchMock).has('Authorization')).toBe(false);
  });
});

describe('getHealth', () => {
  it('returns the health payload, sending the access key', async () => {
    const payload = { status: 'ok', sqliteVersion: '3.50.0' };
    const fetchMock = stubFetch(Response.json(payload));

    await expect(getHealth()).resolves.toEqual(payload);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/health');
    expect(sentHeaders(fetchMock).get('Authorization')).toBe('Bearer the-key');
  });

  it('rejects with the HTTP status when the backend answers with an error', async () => {
    stubFetch(new Response(null, { status: 503 }));

    await expect(getHealth()).rejects.toThrow('HTTP 503');
  });
});

describe('getCatalog', () => {
  it('returns the catalog, sending the access key', async () => {
    const payload = { tables: [], relationships: [] };
    const fetchMock = stubFetch(Response.json(payload));

    await expect(getCatalog()).resolves.toEqual(payload);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/catalog');
    expect(sentHeaders(fetchMock).get('Authorization')).toBe('Bearer the-key');
  });

  it('rejects on an error status or a network error', async () => {
    stubFetch(new Response(null, { status: 500 }), new TypeError('Failed to fetch'));

    await expect(getCatalog()).rejects.toThrow('HTTP 500');
    await expect(getCatalog()).rejects.toThrow('Failed to fetch');
  });
});

describe('postChat', () => {
  const answer = { conversationId: 'c1', turnId: 1, blocks: [], suggestions: [] };

  it('posts the question as JSON with the access key and returns the answer', async () => {
    const fetchMock = stubFetch(Response.json(answer));

    await expect(postChat({ question: 'Hi?', conversationId: 'c1' })).resolves.toEqual(answer);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/chat');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ question: 'Hi?', conversationId: 'c1' });
    expect(sentHeaders(fetchMock).get('Content-Type')).toBe('application/json');
    expect(sentHeaders(fetchMock).get('Authorization')).toBe('Bearer the-key');
  });

  it(`gives up after ${CHAT_TIMEOUT_MS / 60_000} minutes, past the backend's worst case`, async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const fetchMock = stubFetch(Response.json(answer));

    await postChat({ question: 'Hi?' });

    // 5 OpenAI calls in series × 2 attempts × 30 s.
    expect(CHAT_TIMEOUT_MS).toBeGreaterThan(5 * 2 * 30_000);
    expect(timeout).toHaveBeenCalledWith(CHAT_TIMEOUT_MS);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBe(timeout.mock.results[0].value);
  });

  it('rejects with the status on an error, or with the network error', async () => {
    stubFetch(new Response(null, { status: 404 }), new TypeError('Failed to fetch'));

    await expect(postChat({ question: 'Hi?' })).rejects.toMatchObject({ status: 404 });
    await expect(postChat({ question: 'Hi?' })).rejects.toThrow('Failed to fetch');
  });
});

describe('getUsage', () => {
  const period = { from: '2026-10-15', to: '2026-10-21', granularity: 'day' } as const;

  it('asks for the period with the browser offset, sending the access key', async () => {
    const report = { models: [] };
    const fetchMock = stubFetch(Response.json(report));

    await expect(getUsage(period)).resolves.toEqual(report);

    const url = new URL(String(fetchMock.mock.calls[0][0]), 'http://x');
    expect(url.pathname).toBe('/api/usage');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      ...period,
      tz: String(-new Date().getTimezoneOffset()),
    });
    expect(sentHeaders(fetchMock).get('Authorization')).toBe('Bearer the-key');
  });

  it('sends the model and step only when they are set', async () => {
    const fetchMock = stubFetch(Response.json({}));

    await getUsage({ ...period, model: 'gpt-a', step: 'sql' });

    const url = new URL(String(fetchMock.mock.calls[0][0]), 'http://x');
    expect(url.searchParams.get('model')).toBe('gpt-a');
    expect(url.searchParams.get('step')).toBe('sql');
  });

  it('rejects with the status on an error', async () => {
    stubFetch(new Response(null, { status: 400 }));

    await expect(getUsage(period)).rejects.toMatchObject({ status: 400 });
  });
});

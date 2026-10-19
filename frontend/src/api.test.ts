import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch, getHealth } from './api.ts';
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

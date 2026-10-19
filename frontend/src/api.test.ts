import { afterEach, describe, expect, it, vi } from 'vitest';
import { getHealth } from './api.ts';

describe('getHealth', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the health payload from /api/health', async () => {
    const payload = { status: 'ok', sqliteVersion: '3.50.0' };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(payload));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getHealth()).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith('/api/health');
  });

  it('throws with the HTTP status when the backend answers with an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })));

    await expect(getHealth()).rejects.toThrow('Health check failed: HTTP 503');
  });

  it('propagates network errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(getHealth()).rejects.toThrow('Failed to fetch');
  });
});

import { auth, rejectKey } from './auth.ts';

/** A failed API call. `status` is the HTTP status, so callers can show it or branch on it. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * The single way to call `/api/*`: it sends the access key and handles a rejected one.
 * On a 401 it forgets the key (the app goes back to the key screen) and rejects, so
 * callers never handle a 401 themselves. Any other non-2xx rejects with an ApiError.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const sentKey = auth.key;
  const headers = new Headers(init.headers);
  if (sentKey) {
    try {
      headers.set('Authorization', `Bearer ${sentKey}`);
    } catch (error) {
      // A key that can't travel in a header (e.g. it has '€') can never be valid.
      rejectKey();
      throw error;
    }
  }

  const res = await fetch(path, { ...init, headers });
  // A late 401 for a key the user has already replaced must not wipe the new one.
  if (res.status === 401 && auth.key === sentKey) rejectKey();
  if (!res.ok) throw new ApiError(res.status);
  return res;
}

export interface Health {
  status: string;
  sqliteVersion: string;
}

export async function getHealth(): Promise<Health> {
  const res = await apiFetch('/api/health');
  return (await res.json()) as Health;
}

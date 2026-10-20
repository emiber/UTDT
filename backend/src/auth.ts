import { createHash, timingSafeEqual } from 'node:crypto';

/** The example value in `.env.example`: public, so never a valid key. */
export const ACCESS_KEY_PLACEHOLDER = 'change-me-to-a-long-random-string';

/** Reads the shared access key; the backend must not start without a real one. */
export function readAccessKey(env: NodeJS.ProcessEnv = process.env): string {
  const key = env.APP_ACCESS_KEY;
  if (!key) {
    throw new Error(
      'APP_ACCESS_KEY is not set. Copy .env.example to .env in the repo root and set it.',
    );
  }
  if (key.trim() === ACCESS_KEY_PLACEHOLDER) {
    throw new Error(
      "APP_ACCESS_KEY still has the placeholder from .env.example. Replace it with a long random value, e.g. from: node -e \"console.log(require('node:crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  return key;
}

/**
 * Checks an `Authorization: Bearer <key>` header against the access key. The scheme is
 * case-insensitive (RFC 9110); the key must match exactly, compared in constant time.
 */
export function hasValidAccessKey(header: string | undefined, accessKey: string): boolean {
  const match = /^bearer (.+)$/i.exec(header ?? '');
  if (!match) return false;
  // Hashing gives both sides the same length, which timingSafeEqual requires.
  return timingSafeEqual(sha256(match[1]), sha256(accessKey));
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

import { describe, expect, it } from 'vitest';
import { hasValidAccessKey, readAccessKey } from './auth.ts';

describe('readAccessKey', () => {
  it('returns the key when APP_ACCESS_KEY is set', () => {
    expect(readAccessKey({ APP_ACCESS_KEY: 's3cret' })).toBe('s3cret');
  });

  it.each([
    ['missing', {}],
    ['empty', { APP_ACCESS_KEY: '' }],
  ])('fails naming the variable and .env.example when it is %s', (_case, env) => {
    expect(() => readAccessKey(env)).toThrow('APP_ACCESS_KEY');
    expect(() => readAccessKey(env)).toThrow('.env.example');
  });
});

describe('hasValidAccessKey', () => {
  const key = 'correct-horse';

  it.each([['Bearer correct-horse'], ['bearer correct-horse'], ['BEARER correct-horse']])(
    'accepts %s',
    (header) => {
      expect(hasValidAccessKey(header, key)).toBe(true);
    },
  );

  it.each([
    ['no header', undefined],
    ['an empty header', ''],
    ['another scheme', 'Basic correct-horse'],
    ['Bearer without a key', 'Bearer '],
    ['a wrong key of the same length', 'Bearer correct-house'],
    ['a wrong key of another length', 'Bearer nope'],
    ['a key with different case', 'Bearer Correct-Horse'],
    ['an extra space before the key', 'Bearer  correct-horse'],
    ['a trailing space after the key', 'Bearer correct-horse '],
    ['the key without a scheme', 'correct-horse'],
  ])('rejects %s', (_case, header) => {
    expect(hasValidAccessKey(header, key)).toBe(false);
  });
});

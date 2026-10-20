import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACCESS_KEY_PLACEHOLDER, hasValidAccessKey, readAccessKey } from './auth.ts';

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

  it.each([[ACCESS_KEY_PLACEHOLDER], [`  ${ACCESS_KEY_PLACEHOLDER}\t`]])(
    'refuses the .env.example placeholder (%j)',
    (value) => {
      expect(() => readAccessKey({ APP_ACCESS_KEY: value })).toThrow(
        'APP_ACCESS_KEY still has the placeholder from .env.example',
      );
    },
  );

  it('knows the placeholder that .env.example actually ships', () => {
    const example = readFileSync(path.resolve(import.meta.dirname, '../../.env.example'), 'utf8');
    expect(example).toMatch(new RegExp(`^APP_ACCESS_KEY=${ACCESS_KEY_PLACEHOLDER}$`, 'm'));
  });

  it('accepts a value that only contains the placeholder', () => {
    const key = `${ACCESS_KEY_PLACEHOLDER}-but-longer`;
    expect(readAccessKey({ APP_ACCESS_KEY: key })).toBe(key);
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

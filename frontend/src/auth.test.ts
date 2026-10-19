import { beforeEach, describe, expect, it } from 'vitest';
import { auth, loadStoredKey, rejectKey, saveKey } from './auth.ts';

const STORAGE_KEY = 'utdt.accessKey';

beforeEach(() => {
  sessionStorage.clear();
  loadStoredKey();
});

describe('loadStoredKey', () => {
  it('has no key when this tab never stored one', () => {
    expect(auth.key).toBeNull();
    expect(auth.rejected).toBe(false);
  });

  it('picks up a key stored earlier in this tab', () => {
    sessionStorage.setItem(STORAGE_KEY, 'stored-key');

    loadStoredKey();

    expect(auth.key).toBe('stored-key');
  });
});

describe('saveKey', () => {
  it('stores the key without surrounding spaces', () => {
    saveKey('  my-key \n');

    expect(auth.key).toBe('my-key');
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe('my-key');
  });

  it.each([[''], ['   ']])('ignores a blank key (%j)', (raw) => {
    saveKey(raw);

    expect(auth.key).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('clears a previous rejection', () => {
    rejectKey();

    saveKey('new-key');

    expect(auth.rejected).toBe(false);
  });
});

describe('rejectKey', () => {
  it('forgets the key everywhere and flags the rejection', () => {
    saveKey('bad-key');

    rejectKey();

    expect(auth.key).toBeNull();
    expect(auth.rejected).toBe(true);
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

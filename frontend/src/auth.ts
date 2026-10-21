import { reactive } from 'vue';

// The shared access key, mirrored in sessionStorage (per tab, gone when the tab closes).
// A module-level reactive object is Vue's plain answer to small global state.

const STORAGE_KEY = 'utdt.accessKey';

export const auth = reactive({
  /** The stored key, or null when the app must ask for it. */
  key: null as string | null,
  /** True after the backend rejected the key, so the key screen can say why it's back. */
  rejected: false,
});

/** Reads the key saved in this tab, if any (e.g. after a reload). */
export function loadStoredKey(): void {
  auth.key = sessionStorage.getItem(STORAGE_KEY);
  auth.rejected = false;
}

/** Saves the key without surrounding spaces. A blank key is ignored. */
export function saveKey(raw: string): void {
  const key = raw.trim();
  if (!key) return;
  sessionStorage.setItem(STORAGE_KEY, key);
  auth.key = key;
  auth.rejected = false;
}

/** Forgets a key the backend rejected, so the app asks for it again. */
export function rejectKey(): void {
  sessionStorage.removeItem(STORAGE_KEY);
  auth.key = null;
  auth.rejected = true;
}

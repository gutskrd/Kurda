import type { TokenPair } from './types';
import { readRenamed } from './renamedKey';

/**
 * Token persistence. "Remember me" picks localStorage (survives a restart) over sessionStorage (cleared with the tab).
 * Writes clear both stores so switching the choice leaves no stale copy. No security decision is made here.
 */
const KEY = 'hevalo_tokens';
/* The key's name before the rename; see `readRenamed`. */
const LEGACY_KEY = 'mykurda_tokens';

export interface TokenStorage {
  get(): TokenPair | null;
  set(tokens: TokenPair): void;
  clear(): void;
}

function readFrom(store: Storage): TokenPair | null {
  try {
    const raw = readRenamed(store, KEY, LEGACY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TokenPair>;
    if (typeof parsed.accessToken === 'string' && typeof parsed.refreshToken === 'string') {
      return { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken };
    }
    return null;
  } catch {
    return null;
  }
}

export function createTokenStorage(): TokenStorage {
  return {
    get() {
      // Prefer a persistent session, then a tab-only one.
      return readFrom(localStorage) ?? readFrom(sessionStorage);
    },
    set(tokens) {
      // Writes persist by default; persistTokens re-homes them.
      localStorage.setItem(KEY, JSON.stringify(tokens));
      sessionStorage.removeItem(KEY);
    },
    clear() {
      localStorage.removeItem(KEY);
      sessionStorage.removeItem(KEY);
    },
  };
}

/** Stores the tokens in the chosen store, right after sign-in. */
export function persistTokens(tokens: TokenPair, remember: boolean): void {
  localStorage.removeItem(KEY);
  sessionStorage.removeItem(KEY);
  (remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(tokens));
}

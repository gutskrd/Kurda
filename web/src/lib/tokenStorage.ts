import type { TokenPair } from './types';

/**
 * Browser token persistence. "Remember me" chooses localStorage (survives a
 * browser restart) vs sessionStorage (cleared when the tab closes). We keep the
 * tokens in one JSON blob and always clear both stores on write, so switching
 * the remember choice never leaves a stale copy behind.
 *
 * Note: this is the same trade-off the API is built around — access tokens are
 * short-lived and refreshed; the refresh token rotates server-side with theft
 * detection. The browser is untrusted; no security decision is made here.
 */
const KEY = 'mykurda_tokens';

export interface TokenStorage {
  get(): TokenPair | null;
  set(tokens: TokenPair): void;
  clear(): void;
}

function readFrom(store: Storage): TokenPair | null {
  try {
    const raw = store.getItem(KEY);
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
      // prefer a persistent session, fall back to a tab-only one
      return readFrom(localStorage) ?? readFrom(sessionStorage);
    },
    set(tokens) {
      // default writes persist; setRemember() below re-homes them
      localStorage.setItem(KEY, JSON.stringify(tokens));
      sessionStorage.removeItem(KEY);
    },
    clear() {
      localStorage.removeItem(KEY);
      sessionStorage.removeItem(KEY);
    },
  };
}

/** Persist the current tokens in the chosen store (called right after sign-in). */
export function persistTokens(tokens: TokenPair, remember: boolean): void {
  localStorage.removeItem(KEY);
  sessionStorage.removeItem(KEY);
  (remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(tokens));
}

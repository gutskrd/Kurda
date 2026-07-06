/** Every API call returns a result — screens never try/catch fetch. */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export interface ApiError {
  kind: 'network' | 'unauthorized' | 'rate_limited' | 'client' | 'server';
  /** Envelope code from the server (VALIDATION_ERROR, EMAIL_TAKEN, ...). */
  code?: string;
  message: string;
  /** Present on rate_limited results (from Retry-After). */
  retryAfterSec?: number;
  requestId?: string;
  status?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Token persistence seam. The secure implementation (expo-secure-store /
 * Keychain / Keystore) lands with the auth screens (KUR-021, #21);
 * MemoryTokenStorage backs tests and development.
 */
export interface TokenStorage {
  get(): Promise<TokenPair | null>;
  set(tokens: TokenPair): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryTokenStorage implements TokenStorage {
  private tokens: TokenPair | null = null;

  async get(): Promise<TokenPair | null> {
    return this.tokens;
  }
  async set(tokens: TokenPair): Promise<void> {
    this.tokens = tokens;
  }
  async clear(): Promise<void> {
    this.tokens = null;
  }
}

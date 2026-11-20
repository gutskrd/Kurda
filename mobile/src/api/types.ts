import type { PictureRejection } from '@kurda/shared';

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
  /**
   * The envelope's `details`. Refusals that say until when carry them, 403 MUTED (shared `MutedErrorDetails`) and
   * 403 ACCOUNT_SUSPENDED (`SuspendedErrorDetails`), and a calm answer needs them (see `reports/sendErrors.ts`).
   */
  details?: unknown;
  /** A picture refused at upload (422 `PictureRejection`): why, and whether a person can be asked to look again. */
  rejection?: PictureRejection;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** Token storage. The app uses expo-secure-store (Keychain / Keystore); MemoryTokenStorage backs tests and development. */
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

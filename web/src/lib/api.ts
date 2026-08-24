import { API_URL } from './config';
import type { ApiError, ApiResult, TokenPair } from './types';
import { createTokenStorage, persistTokens, type TokenStorage } from './tokenStorage';

/**
 * Browser API client for MyKurda. It follows the same protocol the mobile
 * client already implements (mobile/src/api/client.ts):
 *   - attaches the access token to every request
 *   - on 401, refreshes once (single-flight) and replays the request
 *   - every mutating request carries an Idempotency-Key generated BEFORE the
 *     first attempt and reused on the replay, so a call can never double-apply
 *   - network failures and 429s come back as typed results, never throws
 *
 * The server remains authoritative for all auth/authz/validation — this client
 * only transports requests. The browser is untrusted.
 */

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const TIMEOUT_MS = 30_000; // Render free tier can cold-start ~20-40s

function requestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface RequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
}

export class ApiClient {
  private refreshInFlight: Promise<boolean> | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly storage: TokenStorage,
    private readonly onLogout: () => void,
  ) {}

  get isAuthenticated(): boolean {
    return this.storage.get() !== null;
  }

  get<T>(path: string, options?: RequestOptions): Promise<ApiResult<T>> {
    return this.request('GET', path, options);
  }
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResult<T>> {
    return this.request('POST', path, { ...options, body });
  }
  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResult<T>> {
    return this.request('PATCH', path, { ...options, body });
  }
  delete<T>(path: string, options?: RequestOptions): Promise<ApiResult<T>> {
    return this.request('DELETE', path, options);
  }

  /**
   * Upload raw bytes (e.g. a profile photo) — the endpoint reads the request
   * body as an image, so this sends the Blob directly with its own content-type
   * rather than JSON. Returns a typed result; no auto-refresh (caller retries).
   */
  async uploadBytes<T>(path: string, blob: Blob): Promise<ApiResult<T>> {
    const tokens = this.storage.get();
    try {
      const res = await this.timedFetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'content-type': blob.type || 'application/octet-stream',
          'idempotency-key': requestId(),
          ...(tokens ? { authorization: `Bearer ${tokens.accessToken}` } : {}),
        },
        body: blob,
      });
      return this.toResult<T>(res);
    } catch {
      return { ok: false, error: { kind: 'network', message: 'network request failed' } };
    }
  }

  private async timedFetch(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
    const headers: Record<string, string> = { ...options.headers };
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    if (MUTATING.has(method)) headers['idempotency-key'] = requestId();

    const attempt = async (): Promise<ApiResult<T>> => {
      const tokens = this.storage.get();
      const withAuth = tokens ? { ...headers, authorization: `Bearer ${tokens.accessToken}` } : headers;
      let res: Response;
      try {
        res = await this.timedFetch(`${this.baseUrl}${path}`, {
          method,
          headers: withAuth,
          body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        });
      } catch {
        return { ok: false, error: { kind: 'network', message: 'network request failed' } satisfies ApiError };
      }
      return this.toResult<T>(res);
    };

    const first = await attempt();
    if (first.ok || first.error.status !== 401) return first;

    // A 401 with no stored session is a normal auth failure (e.g. a bad login) —
    // surface the server's message rather than trying to refresh/logging out.
    if (!this.storage.get()) return first;

    const refreshed = await this.refreshOnce();
    if (!refreshed) return this.loggedOut();

    const second = await attempt();
    if (second.ok || second.error.status !== 401) return second;
    return this.loggedOut();
  }

  private refreshOnce(): Promise<boolean> {
    this.refreshInFlight ??= this.doRefresh().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  private async doRefresh(): Promise<boolean> {
    const tokens = this.storage.get();
    if (!tokens) return false;
    let res: Response;
    try {
      res = await this.timedFetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });
    } catch {
      return false;
    }
    if (!res.ok) return false;
    const next = (await res.json()) as TokenPair;
    // preserve the persistence choice: rewrite wherever the tokens currently live
    const remembered = localStorage.getItem('mykurda_tokens') !== null;
    persistTokens(next, remembered);
    return true;
  }

  private loggedOut<T>(): ApiResult<T> {
    this.storage.clear();
    this.onLogout();
    return { ok: false, error: { kind: 'unauthorized', message: 'session expired', status: 401 } };
  }

  private async toResult<T>(res: Response): Promise<ApiResult<T>> {
    if (res.ok) {
      const data = res.status === 204 ? (undefined as T) : ((await res.json()) as T);
      return { ok: true, data };
    }
    let envelope: { code?: string; message?: string; requestId?: string } = {};
    try {
      envelope = (await res.json()) as typeof envelope;
    } catch {
      // non-JSON error body
    }
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after'));
      return {
        ok: false,
        error: {
          kind: 'rate_limited',
          code: envelope.code ?? 'RATE_LIMITED',
          message: envelope.message ?? 'too many requests',
          retryAfterSec: Number.isFinite(retryAfter) ? retryAfter : undefined,
          requestId: envelope.requestId,
          status: 429,
        },
      };
    }
    const kind: ApiError['kind'] = res.status === 401 ? 'unauthorized' : res.status >= 500 ? 'server' : 'client';
    return {
      ok: false,
      error: {
        kind,
        code: envelope.code,
        message: envelope.message ?? `request failed (${res.status})`,
        requestId: envelope.requestId,
        status: res.status,
      },
    };
  }
}

/** Friendly, human copy for an ApiError — used by forms and error states. */
export function describeError(error: ApiError): string {
  switch (error.kind) {
    case 'network':
      return 'Can’t reach MyKurda right now. Check your connection and try again.';
    case 'rate_limited':
      return error.retryAfterSec
        ? `Too many attempts. Try again in ${error.retryAfterSec}s.`
        : 'Too many attempts. Please wait a moment and try again.';
    case 'unauthorized':
      // a bad login carries the server's own message; only mid-session
      // refresh-failures fall back to the generic session-expired copy
      return error.message && error.message !== 'session expired'
        ? error.message
        : 'Your session has expired. Please sign in again.';
    case 'server':
      return 'Something went wrong on our end. Please try again shortly.';
    default:
      return error.message || 'Something went wrong.';
  }
}

/** Build a client bound to browser storage. `onLogout` re-renders the app. */
export function createApiClient(onLogout: () => void): { client: ApiClient; storage: TokenStorage } {
  const storage = createTokenStorage();
  return { client: new ApiClient(API_URL, storage, onLogout), storage };
}

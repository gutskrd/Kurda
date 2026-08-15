import type { ApiError, ApiResult, TokenPair, TokenStorage } from './types';

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface ApiClientOptions {
  baseUrl: string;
  storage: TokenStorage;
  /** Called when the session is unrecoverable (refresh failed). */
  onLogout: () => void;
  fetchFn?: FetchLike;
  /** Injectable for tests. */
  idGenerator?: () => string;
  /**
   * Per-request timeout in ms. Without one, a request to an unreachable API
   * (e.g. a device build pointed at a dead URL) hangs indefinitely and the UI
   * spins forever with no error. On timeout the request aborts and surfaces as
   * a `network` failure — the offline banner + retry recover from there.
   */
  timeoutMs?: number;
}

// 30s rather than a snappier timeout because a free-tier host (e.g. Render)
// cold-starts on the first request after idle, which can take 20-40s. A shorter
// timeout would abort a legitimate wake-up.
const DEFAULT_TIMEOUT_MS = 30_000;

interface RequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * A unique id for the Idempotency-Key header. Uses `crypto.randomUUID` when the
 * runtime has it (browsers, Node 19+), but falls back to a non-crypto UUID on
 * React Native / Hermes, which has NO global `crypto` — there, `crypto.randomUUID()`
 * throws a TypeError before the request even fires, silently killing every
 * POST/PUT/PATCH/DELETE (e.g. sign-in). The key only needs uniqueness for
 * server-side dedup, not cryptographic strength, so Math.random is fine.
 */
export function generateRequestId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Typed API client (KUR-012).
 *
 * - attaches the access token to every request
 * - on 401: refreshes once (single-flight across concurrent requests),
 *   replays the original request, and logs out if refresh fails or the
 *   replay 401s again
 * - every mutating request carries an Idempotency-Key generated BEFORE
 *   the first attempt; the post-refresh replay reuses the same key, so
 *   the server can dedupe and the call can never double-apply
 * - network failures and 429s come back as typed results, never throws
 */
export class ApiClient {
  private readonly fetchFn: FetchLike;
  private readonly idGenerator: () => string;
  private readonly timeoutMs: number;
  private refreshInFlight: Promise<boolean> | null = null;

  constructor(private readonly opts: ApiClientOptions) {
    this.fetchFn = opts.fetchFn ?? ((url, init) => fetch(url, init));
    this.idGenerator = opts.idGenerator ?? generateRequestId;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * fetch with an abort-on-timeout so an unreachable host fails fast (rejects,
   * caught as a network error) instead of hanging the request forever.
   */
  private async timedFetch(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchFn(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  get<T>(path: string, options?: RequestOptions): Promise<ApiResult<T>> {
    return this.request('GET', path, options);
  }
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResult<T>> {
    return this.request('POST', path, { ...options, body });
  }
  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResult<T>> {
    return this.request('PUT', path, { ...options, body });
  }
  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResult<T>> {
    return this.request('PATCH', path, { ...options, body });
  }
  delete<T>(path: string, options?: RequestOptions): Promise<ApiResult<T>> {
    return this.request('DELETE', path, options);
  }

  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
    const headers: Record<string, string> = { ...options.headers };
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    if (MUTATING.has(method)) headers['idempotency-key'] = this.idGenerator();

    const attempt = async (): Promise<ApiResult<T> | 'unauthorized'> => {
      const tokens = await this.opts.storage.get();
      const withAuth = tokens
        ? { ...headers, authorization: `Bearer ${tokens.accessToken}` }
        : headers;

      let res: Response;
      try {
        res = await this.timedFetch(`${this.opts.baseUrl}${path}`, {
          method,
          headers: withAuth,
          body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        });
      } catch {
        return {
          ok: false,
          error: { kind: 'network', message: 'network request failed' } satisfies ApiError,
        };
      }

      if (res.status === 401) return 'unauthorized';
      return this.toResult<T>(res);
    };

    const first = await attempt();
    if (first !== 'unauthorized') return first;

    const refreshed = await this.refreshOnce();
    if (!refreshed) {
      return this.loggedOut();
    }

    // replay reuses the identical headers (same Idempotency-Key)
    const second = await attempt();
    if (second !== 'unauthorized') return second;
    return this.loggedOut();
  }

  /** Single-flight: concurrent 401s wait on one refresh call. */
  private refreshOnce(): Promise<boolean> {
    this.refreshInFlight ??= this.doRefresh().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  private async doRefresh(): Promise<boolean> {
    const tokens = await this.opts.storage.get();
    if (!tokens) return false;
    let res: Response;
    try {
      res = await this.timedFetch(`${this.opts.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });
    } catch {
      return false;
    }
    if (!res.ok) return false;
    const next = (await res.json()) as TokenPair;
    await this.opts.storage.set(next);
    return true;
  }

  private async loggedOut<T>(): Promise<ApiResult<T>> {
    await this.opts.storage.clear();
    this.opts.onLogout();
    return {
      ok: false,
      error: { kind: 'unauthorized', message: 'session expired', status: 401 },
    };
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
      // non-JSON error body — envelope fields stay undefined
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

    return {
      ok: false,
      error: {
        kind: res.status >= 500 ? 'server' : 'client',
        code: envelope.code,
        message: envelope.message ?? `request failed (${res.status})`,
        requestId: envelope.requestId,
        status: res.status,
      },
    };
  }
}

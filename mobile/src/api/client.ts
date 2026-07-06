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
}

interface RequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

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
  private refreshInFlight: Promise<boolean> | null = null;

  constructor(private readonly opts: ApiClientOptions) {
    this.fetchFn = opts.fetchFn ?? ((url, init) => fetch(url, init));
    this.idGenerator = opts.idGenerator ?? (() => crypto.randomUUID());
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
        res = await this.fetchFn(`${this.opts.baseUrl}${path}`, {
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
      res = await this.fetchFn(`${this.opts.baseUrl}/auth/refresh`, {
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

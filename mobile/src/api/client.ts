import { ACCOUNT_HELD, isPictureRejection, isPlainPath, maintenanceNoticeOf, type MaintenanceNotice, type SuspendedErrorDetails } from '@kurda/shared';
import { suspendedDetails } from '../reports/suspension';
import { GUEST_ACCOUNT_CODE } from './errors';
import type { ApiError, ApiResult, TokenPair, TokenStorage } from './types';

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface ApiClientOptions {
  baseUrl: string;
  storage: TokenStorage;
  /** Called when the session is unrecoverable (refresh failed). */
  onLogout: () => void;
  /**
   * Called before `onLogout` when the refresh is refused because the account is suspended or banned (403
   * ACCOUNT_SUSPENDED). A ban revokes the session, so the next refresh is where the phone learns of it, and it
   * must land on the suspension screen with its reasons rather than the sign-in form.
   */
  onSuspended?: (details: SuspendedErrorDetails) => void;
  /**
   * Called when a response says Hevalo is under maintenance (503 MAINTENANCE, shared maintenance.ts), with the
   * notice to show. The session is untouched: the screen goes up over the app (maintenance/maintenance.ts) and
   * the call returns as a server error.
   */
  onMaintenance?: (notice: MaintenanceNotice) => void;
  /**
   * Called when a guest is refused something only a full account may do (403 GUEST_ACCOUNT). The app gates those
   * places before requesting, so this is the safety net for a route the gate missed or a new server refusal: it
   * opens the account offer instead of an alert. The call still returns the refusal.
   */
  onGuestRefused?: () => void;
  /**
   * Called when a refusal says the account is held while a person checks it (403 ACCOUNT_HELD), so every place that
   * posts or messages shows it before the next try, without waiting for `/me`. The call still returns the refusal.
   */
  onHeld?: () => void;
  /**
   * Called when a refusal says a parent switched this off or Hevalo is resting for a supervised teen (403
   * PARENTAL_BLOCKED or PARENTAL_PAUSED), so the app reads the teen's limits again. The call still returns the refusal.
   */
  onParental?: () => void;
  fetchFn?: FetchLike;
  /** Injectable for tests. */
  idGenerator?: () => string;
  /**
   * This install's id (auth/deviceId.ts), sent as `x-device-id` on every request, refresh and sign-out included:
   * the server budgets failed sign-ins per known device and alerts the owner about unknown ones. Null sends none.
   */
  deviceId?: () => Promise<string | null>;
  /**
   * Per-request timeout in ms. Without one, a request to an unreachable API hangs and the UI spins forever. On
   * timeout the request aborts and returns a `network` failure, which the offline banner and retry recover from.
   */
  timeoutMs?: number;
}

// 30 s because a free-tier host can take 20–40 s to cold-start after idle; a shorter timeout would abort a real wake-up.
const DEFAULT_TIMEOUT_MS = 30_000;

interface RequestOptions {
  body?: unknown;
  /**
   * Send these bytes as the body verbatim instead of JSON, for endpoints that take a file (a recording, a
   * picture). The caller sets `content-type`, which the server uses to choose a parser before checking the bytes.
   */
  rawBody?: ArrayBuffer;
  headers?: Record<string, string>;
  /**
   * Send with the session as it stands and never renew it, for the last request a session makes as it signs out:
   * a renewal finishing after sign-out would write a session back onto the phone. A 401 returns as the refusal it
   * is.
   */
  once?: boolean;
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** The result of asking for a new access token: a token, the session refused, or Hevalo unreachable. */
type Refresh = 'fresh' | 'refused' | 'unreachable';

/**
 * A unique id for the Idempotency-Key header. Uses `crypto.randomUUID` where available, but React Native/Hermes
 * has no global `crypto` and would throw before every mutating request, so it falls back to a Math.random UUID:
 * the key needs uniqueness for server-side dedup, not cryptographic strength.
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
 * Typed API client.
 *
 * - Attaches the access token and this install's device id to every request.
 * - On 401: refreshes once (single-flight across concurrent requests), replays the request, and logs out if the
 *   refresh is refused or the replay 401s again; a refresh that cannot reach Hevalo keeps the session and returns a
 *   network failure.
 * - Every mutating request gets an Idempotency-Key before its first attempt, reused by the post-refresh replay,
 *   so a
 *   call never applies twice.
 * - Network failures and 429s return typed results; nothing throws.
 * - A 503 MAINTENANCE passes its notice to `onMaintenance` and keeps the session.
 */
export class ApiClient {
  private readonly fetchFn: FetchLike;
  private readonly idGenerator: () => string;
  private readonly timeoutMs: number;
  private refreshInFlight: Promise<Refresh> | null = null;

  constructor(private readonly opts: ApiClientOptions) {
    this.fetchFn = opts.fetchFn ?? ((url, init) => fetch(url, init));
    this.idGenerator = opts.idGenerator ?? generateRequestId;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** Fetch that aborts on timeout, so an unreachable host fails fast as a network error. */
  private async timedFetch(url: string, init: RequestInit): Promise<Response> {
    const device = this.opts.deviceId ? await this.opts.deviceId().catch(() => null) : null;
    const headers = device ? { ...(init.headers as Record<string, string>), 'x-device-id': device } : init.headers;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchFn(url, { ...init, headers, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  /** Base URL, for calls that cannot go through `request()`, which JSON-encodes, such as binary uploads. */
  get baseUrl(): string {
    return this.opts.baseUrl;
  }

  /** The current access token for those calls; null when signed out. They cannot auto-refresh, so the caller retries on 401. */
  async getAccessToken(): Promise<string | null> {
    return (await this.opts.storage.get())?.accessToken ?? null;
  }

  /** Continue with a new access token and the same refresh token, as a password change returns after ending every other session. */
  async replaceAccessToken(accessToken: string): Promise<void> {
    const tokens = await this.opts.storage.get();
    if (tokens) await this.opts.storage.set({ ...tokens, accessToken });
  }

  get<T>(path: string, options?: RequestOptions): Promise<ApiResult<T>> {
    return this.request('GET', path, options);
  }
  /** POST a file's bytes as the body — the server sniffs what they really are. */
  postRaw<T>(path: string, bytes: ArrayBuffer, contentType: string): Promise<ApiResult<T>> {
    return this.request('POST', path, { rawBody: bytes, headers: { 'content-type': contentType } });
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
    // A link's parameter can turn a path into another endpoint's (shared `isPlainPath`); then nothing is sent.
    if (!isPlainPath(path)) return { ok: false, error: { kind: 'client', status: 404, code: 'NOT_FOUND', message: 'not found' } };
    const headers: Record<string, string> = { ...options.headers };
    // A raw body brings its own content-type; JSON is the default for everything else.
    if (options.body !== undefined && options.rawBody === undefined) {
      headers['content-type'] = 'application/json';
    }
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
          body:
            options.rawBody !== undefined
              ? options.rawBody
              : options.body !== undefined
                ? JSON.stringify(options.body)
                : undefined,
        });
      } catch {
        return {
          ok: false,
          error: { kind: 'network', message: 'network request failed' } satisfies ApiError,
        };
      }

      // Only a request that carried a token can have an expired one. A 401 without one is the endpoint's answer
      // (usually a wrong password), and its body says which, so do not discard it for a refresh.
      if (res.status === 401 && tokens && !options.once) return 'unauthorized';
      return this.toResult<T>(res);
    };

    const first = await attempt();
    if (first !== 'unauthorized') return first;

    const refreshed = await this.refreshOnce();
    // A refresh that did not reach Hevalo, or that it could not answer, says nothing about the session: keep it
    // and return the network failure.
    if (refreshed === 'unreachable') return { ok: false, error: { kind: 'network', message: 'network request failed' } satisfies ApiError };
    if (refreshed === 'refused') {
      return this.loggedOut();
    }

    // Replay reuses the identical headers (same Idempotency-Key).
    const second = await attempt();
    if (second !== 'unauthorized') return second;
    return this.loggedOut();
  }

  /**
   * Sign out on the server, revoking the stored refresh token's session so copies stop working. Resolves once the
   * token is read, without waiting on the network, and never throws: signing out locally must not depend on the
   * API.
   */
  async endSession(): Promise<void> {
    const tokens = await this.opts.storage.get();
    if (!tokens) return;
    void this.timedFetch(`${this.opts.baseUrl}/auth/logout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    }).catch(() => undefined);
  }

  /** Single-flight: concurrent 401s wait on one refresh call. */
  private refreshOnce(): Promise<Refresh> {
    this.refreshInFlight ??= this.doRefresh().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  private async doRefresh(): Promise<Refresh> {
    const tokens = await this.opts.storage.get();
    if (!tokens) return 'refused';
    let res: Response;
    try {
      res = await this.timedFetch(`${this.opts.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });
    } catch {
      // No network, or a server waking past the timeout: tapping a notification offline must not sign anybody out.
      return 'unreachable';
    }
    // Hevalo down, busy or rate-limiting has not refused the session; only its answer about the token counts.
    if (res.status >= 500 || res.status === 429) return 'unreachable';
    if (!res.ok) {
      if (res.status === 403) {
        const body = (await res.json().catch(() => null)) as { code?: string; details?: unknown } | null;
        const details = body?.code === 'ACCOUNT_SUSPENDED' ? suspendedDetails(body.details) : null;
        if (details) this.opts.onSuspended?.(details);
      }
      return 'refused';
    }
    const next = (await res.json().catch(() => null)) as TokenPair | null;
    if (!next) return 'unreachable';
    await this.opts.storage.set(next);
    return 'fresh';
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

    let envelope: { code?: string; message?: string; requestId?: string; details?: unknown; maintenance?: unknown } = {};
    try {
      envelope = (await res.json()) as typeof envelope;
    } catch {
      // non-JSON error body — envelope fields stay undefined.
    }

    // Maintenance: its notice goes up over the app. Only a 503 that carries one; a proxy's own 503 is an ordinary server error.
    if (res.status === 503) {
      const notice = maintenanceNoticeOf(envelope);
      if (notice) this.opts.onMaintenance?.(notice);
    }

    // A guest at a door only an account opens: the offer to make one goes up (auth/AccountGate).
    if (res.status === 403 && envelope.code === GUEST_ACCOUNT_CODE) this.opts.onGuestRefused?.();
    if (res.status === 403 && envelope.code === ACCOUNT_HELD) this.opts.onHeld?.();
    if (res.status === 403 && (envelope.code === 'PARENTAL_BLOCKED' || envelope.code === 'PARENTAL_PAUSED')) this.opts.onParental?.();

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
          // A lock names its own wait here too (LOCKED's retryAfterSec).
          ...(envelope.details !== undefined ? { details: envelope.details } : {}),
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
        ...(envelope.details !== undefined ? { details: envelope.details } : {}),
        // A refused picture's reason and review sit beside the code rather than in details.
        ...(res.status === 422 && isPictureRejection(envelope)
          ? { rejection: { code: envelope.code, message: envelope.message, reason: envelope.reason, reviewId: envelope.reviewId } }
          : {}),
      },
    };
  }
}

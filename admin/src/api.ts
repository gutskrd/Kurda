/**
 * The admin API client: attaches the session's bearer token, renews it when it runs out, and throws `ApiError` with
 * the server's error envelope on a refusal.
 */
import { isPlainPath } from '@kurda/shared';
import { deviceId } from './deviceId';

/**
 * Where the API lives. The console is served from its own origin, so production calls must be absolute (a relative
 * path fetches the app's own index.html); in dev the Vite proxy keeps them same-origin and the base stays empty.
 */
const DEFAULT_API_URL = 'https://kurda-api.onrender.com';

function readApiBase(): string {
  const fromEnv = import.meta.env.VITE_API_URL?.trim();
  // No trailing slash, so `${API_BASE}${path}` is always clean.
  if (fromEnv) return fromEnv.endsWith('/') ? fromEnv.slice(0, -1) : fromEnv;
  return import.meta.env.DEV ? '' : DEFAULT_API_URL;
}

export const API_BASE = readApiBase();

const TOKEN_KEY = 'kurda_admin_token';
const REFRESH_KEY = 'kurda_admin_refresh';
// "Remember me" keeps the session in localStorage; without it, sessionStorage forgets it when the browser closes.
const storedToken = (): string | null => localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
let token: string | null = storedToken();

/**
 * Keep the session: the access token every call carries, and the refresh token that renews it after its fifteen
 * minutes (`renewOnce`). Null forgets both here; `endSession` ends it on the server.
 */
export function setToken(next: string | null, persist = true, refresh: string | null = null): void {
  token = next;
  for (const key of [TOKEN_KEY, REFRESH_KEY]) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
  if (!next) return;
  const store = persist ? localStorage : sessionStorage;
  store.setItem(TOKEN_KEY, next);
  if (refresh) store.setItem(REFRESH_KEY, refresh);
}
export function getToken(): string | null {
  return token;
}
/**
 * The refresh token, read from storage each time: another tab may have renewed it, and presenting a replaced one looks
 * like theft and ends the session (auth/service.ts).
 */
export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY) ?? sessionStorage.getItem(REFRESH_KEY);
}

let renewing: Promise<boolean> | null = null;

/**
 * Renew the session once, however many calls found `expired` refused at once, and one tab at a time: two tabs sending
 * the same refresh token would look like theft. A tab that waited for the shared lock takes the token the other got.
 */
function renewOnce(expired: string): Promise<boolean> {
  renewing ??= withRenewLock(() => renew(expired)).finally(() => {
    renewing = null;
  });
  return renewing;
}

function withRenewLock(run: () => Promise<boolean>): Promise<boolean> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  // A browser without Web Locks renews unguarded, as the website does.
  return locks ? locks.request('kurda-admin-renew', run) : run();
}

async function renew(expired: string): Promise<boolean> {
  // Renewed already, by another tab or by this one's last turn with the lock.
  const stored = storedToken();
  if (stored && stored !== expired) {
    token = stored;
    return true;
  }
  const presented = getRefreshToken();
  if (!presented) return false;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-device-id': deviceId() },
      body: JSON.stringify({ refreshToken: presented }),
    });
  } catch {
    return false;
  }
  if (!res.ok) return false;
  const next = (await res.json().catch(() => null)) as { accessToken?: unknown; refreshToken?: unknown } | null;
  if (typeof next?.accessToken !== 'string' || typeof next.refreshToken !== 'string') return false;
  // Signed out (or in again) while this was on its way: that stands.
  if (getRefreshToken() !== presented) return false;
  // Renewed where the session already lives, so "Remember me" holds.
  setToken(next.accessToken, localStorage.getItem(TOKEN_KEY) !== null, next.refreshToken);
  return true;
}

/** Sign out on the server, ending the refresh token's session and its access tokens. Best effort; never throws. */
export async function endSession(refresh: string | null): Promise<void> {
  if (!refresh) return;
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-device-id': deviceId() },
      body: JSON.stringify({ refreshToken: refresh }),
    });
  } catch {
    // Offline: the session still ends here, and on the server when it runs out.
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** The envelope's `details`, when the API sent any (a refused story's problems, say). */
    readonly details?: unknown,
    /** The whole error envelope, for routes that put the specifics beside the message (`issues`, `missing`). */
    readonly body: Record<string, unknown> = {},
    /** Seconds the server asked to wait: a lockout says it in its details, the rate limiter only in Retry-After. */
    readonly retryAfterSec: number | null = null,
  ) {
    super(message);
  }

  /** The server's id for this request, for a bug report. */
  get requestId(): string | null {
    return typeof this.body.requestId === 'string' ? this.body.requestId : null;
  }
}

/** Calls whose 401 means "that was wrong" (a wrong password, a mistyped 2FA code), not "your session is over". */
const ANSWERS_401_ITSELF = ['/admin/auth/login', '/admin/auth/verify', '/admin/2fa/confirm'];

const answers401Itself = (path: string): boolean => ANSWERS_401_ITSELF.some((p) => path === p || path.startsWith(`${p}?`));

function sessionEnded(path: string): void {
  if (answers401Itself(path)) return;
  // The session is over and could not be renewed — drop it and bounce to the login screen.
  setToken(null);
  location.reload();
}

/**
 * One call with this session's token and this browser's device id. An expired token is renewed (`renewOnce`) and the
 * call made once more; only when that fails too does the 401 reach `read`, which ends the session.
 */
async function send(path: string, init: RequestInit = {}): Promise<Response> {
  // A path an id from the address turned into another endpoint's goes nowhere with this session.
  if (!isPlainPath(path)) throw new ApiError(404, 'NOT_FOUND', 'not found');
  const go = (): Promise<Response> =>
    fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        'x-device-id': deviceId(),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });
  const sentWith = token;
  const res = await go();
  if (res.status !== 401 || !sentWith || answers401Itself(path)) return res;
  if (!(await renewOnce(sentWith))) return res;
  return go();
}

/** The wait a refusal asks for, in whole seconds, or null. The API's CORS exposes Retry-After, and it never sends a date. */
function retryAfterOf(res: Response, data: Record<string, unknown>): number | null {
  const details = data.details as { retryAfterSec?: unknown } | undefined;
  const fromBody = typeof details?.retryAfterSec === 'number' ? details.retryAfterSec : NaN;
  const seconds = Number.isFinite(fromBody) && fromBody > 0 ? fromBody : Number(res.headers.get('retry-after'));
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
}

/** Read a response the way every call here does: refusals become an ApiError. */
async function read<T>(path: string, res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 401) {
    sessionEnded(path);
    throw new ApiError(401, String(data.code ?? 'UNAUTHENTICATED'), String(data.message ?? 'session expired'), data.details, data);
  }
  // A 2FA window that expired mid-session refuses every call; reloading lets the gate ask for a code again.
  if (res.status === 403 && (data.code === 'TOTP_REQUIRED' || data.code === 'TOTP_ENROLLMENT_REQUIRED')) {
    location.reload();
  }
  if (!res.ok) {
    // An older route answers { error: { code, message } } rather than the usual envelope.
    const inner = (typeof data.error === 'object' && data.error !== null ? data.error : data) as Record<string, unknown>;
    throw new ApiError(res.status, String(inner.code ?? 'ERROR'), String(inner.message ?? res.statusText), data.details, data, retryAfterOf(res, data));
  }
  return data as T;
}

export async function api<T>(
  path: string,
  opts: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const res = await send(path, {
    method: opts.method ?? 'GET',
    headers: opts.body ? { 'content-type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    ...(opts.signal ? { signal: opts.signal } : {}),
  });
  return read<T>(path, res);
}

/** Read a file the API sends (a recording's bytes) instead of JSON, with the same auth and errors as `api`. */
export async function apiFile(path: string, opts: { signal?: AbortSignal } = {}): Promise<ArrayBuffer> {
  const res = await send(path, opts.signal ? { signal: opts.signal } : {});
  if (!res.ok) return read<never>(path, res);
  return res.arrayBuffer();
}

/** Read a file the API sends as a Blob that keeps its type (a picture shown as a local copy), with the same auth and errors as `api`. */
export async function apiBlob(path: string, opts: { signal?: AbortSignal } = {}): Promise<Blob> {
  const res = await send(path, opts.signal ? { signal: opts.signal } : {});
  if (!res.ok) return read<never>(path, res);
  return res.blob();
}

/** Send raw bytes (a recording) instead of JSON, with the same auth and errors as `api`. */
export async function apiUpload<T>(path: string, body: Uint8Array, contentType: string, method = 'PUT'): Promise<T> {
  const res = await send(path, {
    method,
    headers: { 'content-type': contentType },
    body: body as BodyInit,
  });
  return read<T>(path, res);
}

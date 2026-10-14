/**
 * Thin admin API client (KUR-099 admin panel). Attaches the bearer token,
 * proxied same-origin to the api dev server (see vite.config). Throws `ApiError`
 * with the server's error envelope on non-2xx.
 */
/**
 * Where the API lives. The admin is served from its own origin (Cloudflare Pages)
 * while the API runs elsewhere, so in production these calls MUST be absolute —
 * a relative path just fetches the SPA's own index.html back. In dev the Vite
 * proxy keeps them same-origin, so the base stays empty there.
 */
const DEFAULT_API_URL = 'https://kurda-api.onrender.com';

function readApiBase(): string {
  const fromEnv = import.meta.env.VITE_API_URL?.trim();
  // no trailing slash, so `${API_BASE}${path}` is always clean
  if (fromEnv) return fromEnv.endsWith('/') ? fromEnv.slice(0, -1) : fromEnv;
  return import.meta.env.DEV ? '' : DEFAULT_API_URL;
}

export const API_BASE = readApiBase();

const TOKEN_KEY = 'kurda_admin_token';
// "Remember me" on → localStorage (persists across browser restarts);
// off → sessionStorage (cleared when the tab/browser closes).
let token: string | null = localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);

export function setToken(next: string | null, persist = true): void {
  token = next;
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  if (next) (persist ? localStorage : sessionStorage).setItem(TOKEN_KEY, next);
}
export function getToken(): string | null {
  return token;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** the envelope's `details`, when the API sent any (a refused story's problems, say) */
    readonly details?: unknown,
    /**
     * The whole error envelope. Some routes put what went wrong beside the
     * message rather than in `details` — a lesson's invalid exercises arrive
     * as `issues`, the recordings a publish is missing as `missing` — and
     * dropping them left the editor saying "invalid exercises" and nothing else.
     */
    readonly body: Record<string, unknown> = {},
  ) {
    super(message);
  }

  /** The server's id for this request, for a bug report. */
  get requestId(): string | null {
    return typeof this.body.requestId === 'string' ? this.body.requestId : null;
  }
}

/**
 * Calls whose 401 means "that was wrong", not "your session is over": a wrong
 * password at sign-in, a mistyped 2FA code. Treating those like an expired
 * session dropped the token and reloaded the page — the sign-in form lost its
 * error message, and a typo in the code signed the admin out.
 */
const ANSWERS_401_ITSELF = ['/auth/login', '/admin/auth/verify', '/admin/2fa/confirm'];

function sessionEnded(path: string): void {
  if (ANSWERS_401_ITSELF.some((p) => path === p || path.startsWith(`${p}?`))) return;
  // session expired/invalid — drop the token and bounce to the login screen
  setToken(null);
  location.reload();
}

/** Read a response the way every call here does: refusals become an ApiError. */
async function read<T>(path: string, res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 401) {
    sessionEnded(path);
    throw new ApiError(401, String(data.code ?? 'UNAUTHENTICATED'), String(data.message ?? 'session expired'), data.details, data);
  }
  // A 2FA window that expired mid-session turns every call into a 403. Reload so
  // the gate re-checks and shows the code prompt, rather than leaving a
  // workspace where nothing works and nothing explains why.
  if (res.status === 403 && (data.code === 'TOTP_REQUIRED' || data.code === 'TOTP_ENROLLMENT_REQUIRED')) {
    location.reload();
  }
  if (!res.ok) {
    // an older route answers { error: { code, message } } rather than the usual envelope
    const inner = (typeof data.error === 'object' && data.error !== null ? data.error : data) as Record<string, unknown>;
    throw new ApiError(res.status, String(inner.code ?? 'ERROR'), String(inner.message ?? res.statusText), data.details, data);
  }
  return data as T;
}

export async function api<T>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      ...(opts.body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return read<T>(path, res);
}

/**
 * Send raw bytes (a recording) rather than JSON. Same auth and error handling
 * as `api`, so an expired session or 2FA window behaves the same way.
 */
export async function apiUpload<T>(path: string, body: Uint8Array, contentType: string, method = 'PUT'): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'content-type': contentType, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body as BodyInit,
  });
  return read<T>(path, res);
}

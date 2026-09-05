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
  ) {
    super(message);
  }
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
  if (res.status === 401) {
    // session expired/invalid — drop the token and bounce to the login screen
    setToken(null);
    location.reload();
    throw new ApiError(401, 'UNAUTHENTICATED', 'session expired');
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  // A 2FA window that expired mid-session turns every call into a 403. Reload so
  // the gate re-checks and shows the code prompt, rather than leaving a
  // workspace where nothing works and nothing explains why.
  if (res.status === 403 && (data.code === 'TOTP_REQUIRED' || data.code === 'TOTP_ENROLLMENT_REQUIRED')) {
    location.reload();
  }
  if (!res.ok) {
    throw new ApiError(res.status, String(data.code ?? 'ERROR'), String(data.message ?? res.statusText));
  }
  return data as T;
}

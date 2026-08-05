/**
 * Thin admin API client (KUR-099 admin panel). Attaches the bearer token,
 * proxied same-origin to the api dev server (see vite.config). Throws `ApiError`
 * with the server's error envelope on non-2xx.
 */
let token: string | null = localStorage.getItem('kurda_admin_token');

export function setToken(next: string | null): void {
  token = next;
  if (next) localStorage.setItem('kurda_admin_token', next);
  else localStorage.removeItem('kurda_admin_token');
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
  const res = await fetch(path, {
    method: opts.method ?? 'GET',
    headers: {
      ...(opts.body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ApiError(res.status, String(data.code ?? 'ERROR'), String(data.message ?? res.statusText));
  }
  return data as T;
}

/**
 * A signed-in session for component tests, in place of `auth/AuthContext`: `useAuth()` answers with whatever the test
 * put in `testAuth`, including a client answered from a route table that records its calls.
 */
import type { ReactNode } from 'react';
import { vi } from 'vitest';
import type { ApiClient } from '../../api/client';
import type { ApiError, ApiResult } from '../../api/types';

type Handler = (body: unknown) => ApiResult<unknown> | Promise<ApiResult<unknown>>;

export interface FakeCall {
  method: string;
  path: string;
  body: unknown;
}

/** The reads the apps make once for both varieties (shared `readEveryDialect`). */
const BOTH_DIALECTS = new Set(['/games/availability', '/games/impostor/couch', '/games/who-am-i/couch']);

/**
 * A client answering `"METHOD /path"` from `routes` (an exact path, query included). A call with no route fails as a
 * server error would, so a missing route shows up instead of hanging. A read for both varieties with no route of its
 * own is answered from the routes for each variety, as the server answers it.
 */
export function fakeClient(routes: Record<string, Handler | ApiResult<unknown>> = {}): ApiClient & { calls: FakeCall[] } {
  const calls: FakeCall[] = [];
  const resolve = async (route: Handler | ApiResult<unknown>, body?: unknown): Promise<ApiResult<unknown>> => (typeof route === 'function' ? route(body) : route);
  const answer = async (method: string, path: string, body?: unknown): Promise<ApiResult<unknown>> => {
    calls.push({ method, path, body });
    const route = routes[`${method} ${path}`];
    const each = method === 'GET' && !route && BOTH_DIALECTS.has(path) ? ['kmr', 'ckb'].flatMap((d) => routes[`GET ${path}?dialect=${d}`] ?? []) : [];
    if (each.length > 0) {
      const answers = await Promise.all(each.map((r) => resolve(r)));
      const failed = answers.find((a) => !a.ok);
      return failed ?? { ok: true, data: { dialects: answers.map((a) => (a.ok ? a.data : null)) } };
    }
    if (!route) return { ok: false, error: { kind: 'server', message: `no route for ${method} ${path}`, status: 500 } };
    return resolve(route, body);
  };
  return {
    calls,
    baseUrl: 'http://api.test',
    get: vi.fn((path: string) => answer('GET', path)),
    post: vi.fn((path: string, body?: unknown) => answer('POST', path, body)),
    put: vi.fn((path: string, body?: unknown) => answer('PUT', path, body)),
    patch: vi.fn((path: string, body?: unknown) => answer('PATCH', path, body)),
    delete: vi.fn((path: string) => answer('DELETE', path)),
    getAccessToken: async () => 'token',
  } as unknown as ApiClient & { calls: FakeCall[] };
}

export const ok = <T,>(data: T): ApiResult<T> => ({ ok: true, data });
export const fail = (error: Partial<ApiError> & { code?: string; details?: unknown }): ApiResult<never> => ({
  ok: false,
  error: { kind: 'client', message: error.message ?? 'refused', status: 403, ...error },
});

export const testAuth: {
  client: ApiClient;
  /** `guest: true` for a test of what a guest sees; the stand-in's `isGuest` follows it. */
  user: { id: string; username: string; email: string; displayName: string | null; profilePhotoUrl: string | null; emailVerified: boolean; guest?: boolean };
  baseUrl: string;
  /** Reading the account again after something changed; a test can ask whether it was. */
  refreshUser: () => Promise<void>;
} = {
  client: fakeClient(),
  user: { id: 'me', username: 'rojda', email: 'r@example.com', displayName: null, profilePhotoUrl: null, emailVerified: true },
  baseUrl: 'http://api.test',
  refreshUser: vi.fn(async () => undefined),
};

export function useAuth() {
  return { ...testAuth, isGuest: testAuth.user.guest === true, status: 'signedIn' as const };
}

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  return <>{children}</>;
}

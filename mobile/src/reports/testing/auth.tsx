/**
 * A signed-in session for component tests, in place of `auth/AuthContext`.
 *
 * `useAuth()` answers with whatever the test put in `testAuth`: a user, and a
 * client whose calls are answered from a route table and recorded, so a test
 * can say what the server replies and then check what was sent.
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

/**
 * A client answering `"METHOD /path"` from `routes` (an exact path, query
 * included). A call with no route fails as a server error would, so a test
 * that forgot one finds out instead of hanging.
 */
export function fakeClient(routes: Record<string, Handler | ApiResult<unknown>> = {}): ApiClient & { calls: FakeCall[] } {
  const calls: FakeCall[] = [];
  const answer = async (method: string, path: string, body?: unknown): Promise<ApiResult<unknown>> => {
    calls.push({ method, path, body });
    const route = routes[`${method} ${path}`];
    if (!route) return { ok: false, error: { kind: 'server', message: `no route for ${method} ${path}`, status: 500 } };
    return typeof route === 'function' ? route(body) : route;
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
  user: { id: string; username: string; email: string; displayName: string | null; profilePhotoUrl: string | null; emailVerified: boolean };
  baseUrl: string;
} = {
  client: fakeClient(),
  user: { id: 'me', username: 'rojda', email: 'r@example.com', displayName: null, profilePhotoUrl: null, emailVerified: true },
  baseUrl: 'http://api.test',
};

export function useAuth() {
  return { ...testAuth, status: 'signedIn' as const };
}

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  return <>{children}</>;
}

/**
 * A fake API for the admin's tests: `fetch` answered by a list of routes, and
 * a record of every call (method, path, body) to assert on.
 */
import { vi } from 'vitest';

export interface Call {
  method: string;
  path: string;
  body: unknown;
  /**
   * The request's headers, names in lower case. Not one of the record's own
   * keys, so a test comparing whole calls compares method, path and body.
   */
  readonly headers: Record<string, string>;
}

export type Reply = { status?: number; body?: unknown; headers?: Record<string, string> };
export type Route = (call: Call) => Reply | undefined;

export function json(body: unknown, status = 200): Reply {
  return { status, body };
}

/** An API error envelope, as the server sends it. */
export function failure(status: number, code: string, message: string, details?: unknown): Reply {
  return { status, body: { code, message, ...(details !== undefined ? { details } : {}), requestId: 'req-1' } };
}

/** Install the fake. Routes are tried in order; the first that answers wins, and anything unanswered is a 404. */
export function fakeApi(...routes: Route[]): { calls: Call[]; use: (...more: Route[]) => void } {
  const calls: Call[] = [];
  const all = [...routes];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const url = new URL(String(input), 'http://admin.test');
      const call = {
        method: init.method ?? 'GET',
        path: `${url.pathname}${url.search}`,
        body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      } as Call;
      Object.defineProperty(call, 'headers', { value: Object.fromEntries(new Headers(init.headers).entries()), enumerable: false });
      calls.push(call);
      // newest routes first, so a test can override what it set up
      const reply = [...all].reverse().reduce<Reply | undefined>((found, route) => found ?? route(call), undefined) ?? failure(404, 'NOT_FOUND', 'route not found');
      return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
        status: reply.status ?? 200,
        headers: { 'content-type': 'application/json', ...reply.headers },
      });
    }),
  );
  return { calls, use: (...more) => all.push(...more) };
}

/** A route for one method and path (exact, or a test on the path). */
export function on(method: string, path: string | RegExp, reply: Reply | ((call: Call) => Reply)): Route {
  return (call) => {
    if (call.method !== method) return undefined;
    const match = typeof path === 'string' ? call.path === path : path.test(call.path);
    if (!match) return undefined;
    return typeof reply === 'function' ? reply(call) : reply;
  };
}

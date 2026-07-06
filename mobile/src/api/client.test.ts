import { describe, expect, it, vi } from 'vitest';
import { ApiClient } from './client';
import { apiBaseUrl } from './env';
import { MemoryTokenStorage } from './types';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function makeClient(fetchFn: ReturnType<typeof vi.fn>, tokens = true) {
  const storage = new MemoryTokenStorage();
  const onLogout = vi.fn();
  let seq = 0;
  const client = new ApiClient({
    baseUrl: 'https://api.test',
    storage,
    onLogout,
    fetchFn: fetchFn as never,
    idGenerator: () => `key-${++seq}`,
  });
  const ready = tokens
    ? storage.set({ accessToken: 'acc-1', refreshToken: 'ref-1' })
    : Promise.resolve();
  return { client, storage, onLogout, ready };
}

describe('ApiClient', () => {
  it('attaches the bearer token', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { hi: true }));
    const { client, ready } = makeClient(fetchFn);
    await ready;
    const res = await client.get<{ hi: boolean }>('/me');
    expect(res).toEqual({ ok: true, data: { hi: true } });
    expect(fetchFn.mock.calls[0]![1].headers.authorization).toBe('Bearer acc-1');
  });

  it('refreshes once on 401 and replays with the SAME idempotency key', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, {})) // original
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: 'acc-2', refreshToken: 'ref-2' })) // refresh
      .mockResolvedValueOnce(jsonResponse(201, { created: true })); // replay
    const { client, storage, ready } = makeClient(fetchFn);
    await ready;

    const res = await client.post<{ created: boolean }>('/lessons/1/answers', { a: 1 });
    expect(res.ok).toBe(true);

    const firstKey = fetchFn.mock.calls[0]![1].headers['idempotency-key'];
    const replayKey = fetchFn.mock.calls[2]![1].headers['idempotency-key'];
    expect(firstKey).toBe('key-1');
    expect(replayKey).toBe(firstKey); // no double-apply on the server
    expect(fetchFn.mock.calls[2]![1].headers.authorization).toBe('Bearer acc-2');
    expect((await storage.get())?.accessToken).toBe('acc-2');
  });

  it('logs out when refresh fails', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(401, { code: 'INVALID_REFRESH' }));
    const { client, storage, onLogout, ready } = makeClient(fetchFn);
    await ready;

    const res = await client.get('/me');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe('unauthorized');
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(await storage.get()).toBeNull();
  });

  it('logs out (no infinite loop) when the replay 401s again', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: 'acc-2', refreshToken: 'ref-2' }))
      .mockResolvedValueOnce(jsonResponse(401, {}));
    const { client, onLogout, ready } = makeClient(fetchFn);
    await ready;

    const res = await client.get('/me');
    expect(res.ok).toBe(false);
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledTimes(3); // no fourth attempt
  });

  it('shares one refresh across concurrent 401s (single-flight)', async () => {
    let refreshCalls = 0;
    const fetchFn = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith('/auth/refresh')) {
        refreshCalls++;
        await new Promise((r) => setTimeout(r, 20));
        return jsonResponse(200, { accessToken: 'acc-2', refreshToken: 'ref-2' });
      }
      const auth = (init.headers as Record<string, string>).authorization;
      return auth === 'Bearer acc-2' ? jsonResponse(200, { ok: 1 }) : jsonResponse(401, {});
    });
    const { client, ready } = makeClient(fetchFn);
    await ready;

    const [a, b, c] = await Promise.all([client.get('/a'), client.get('/b'), client.get('/c')]);
    expect(a.ok && b.ok && c.ok).toBe(true);
    expect(refreshCalls).toBe(1);
  });

  it('returns a typed network error instead of throwing', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('Network request failed'));
    const { client, ready } = makeClient(fetchFn);
    await ready;
    const res = await client.get('/me');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe('network');
  });

  it('returns a typed rate_limited result with retryAfterSec', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse(
        429,
        { code: 'RATE_LIMITED', message: 'too many requests', requestId: 'r1' },
        { 'retry-after': '17' },
      ),
    );
    const { client, ready } = makeClient(fetchFn);
    await ready;
    const res = await client.get('/spam');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.kind).toBe('rate_limited');
      expect(res.error.retryAfterSec).toBe(17);
      expect(res.error.requestId).toBe('r1');
    }
  });

  it('maps envelope codes on 4xx/5xx', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(409, { code: 'EMAIL_TAKEN', message: 'email already in use' }))
      .mockResolvedValueOnce(jsonResponse(500, { code: 'INTERNAL_ERROR', message: 'internal server error' }));
    const { client, ready } = makeClient(fetchFn);
    await ready;

    const conflict = await client.post('/auth/register', {});
    if (!conflict.ok) {
      expect(conflict.error.kind).toBe('client');
      expect(conflict.error.code).toBe('EMAIL_TAKEN');
    }
    const server = await client.get('/boom');
    if (!server.ok) expect(server.error.kind).toBe('server');
  });

  it('GET requests carry no idempotency key; mutations always do', async () => {
    const fetchFn = vi.fn().mockImplementation(async () => jsonResponse(200, {}));
    const { client, ready } = makeClient(fetchFn);
    await ready;
    await client.get('/a');
    await client.post('/b', {});
    expect(fetchFn.mock.calls[0]![1].headers['idempotency-key']).toBeUndefined();
    expect(fetchFn.mock.calls[1]![1].headers['idempotency-key']).toBeDefined();
  });
});

describe('apiBaseUrl', () => {
  it('maps each environment and honors overrides', () => {
    expect(apiBaseUrl('development')).toContain('localhost');
    expect(apiBaseUrl('staging')).toContain('staging');
    expect(apiBaseUrl('production')).toBe('https://api.kurda.app');
    expect(apiBaseUrl('development', 'http://10.0.2.2:3000')).toBe('http://10.0.2.2:3000');
  });
});

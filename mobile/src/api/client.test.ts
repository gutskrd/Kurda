import { describe, expect, it, vi } from 'vitest';
import { ApiClient, generateRequestId } from './client';
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

  it('sends nothing to a path a link’s parameter turned into another endpoint’s', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    const { client, ready } = makeClient(fetchFn);
    await ready;
    // hevalo://app/users/..%2F..%2Fgroups%2Fg1%2Fjoin hands the screen the id "../../groups/g1/join"
    for (const path of ['/users/../../groups/g1/join', '/users/%2E%2E/admin', '/users/..\\admin']) {
      const res = await client.post(path);
      expect(res, path).toEqual({ ok: false, error: { kind: 'client', status: 404, code: 'NOT_FOUND', message: 'not found' } });
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  /**
   * Signing in is a 401 on a request without a token; it must keep the server's code (a wrong password) rather
   * than read as an expired session.
   */
  it('surfaces a 401 from an unauthenticated request rather than calling it an expired session', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { code: 'INVALID_CREDENTIALS', message: 'invalid email or password' }));
    const { client, onLogout, ready } = makeClient(fetchFn, false);
    await ready;

    const res = await client.post('/auth/login', { email: 'a@b.c', password: 'wrong' });

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('INVALID_CREDENTIALS');
    expect(res.error.message).not.toBe('session expired');
    // No refresh was attempted, and nobody was signed out of a session they were never in.
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(onLogout).not.toHaveBeenCalled();
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
    expect(replayKey).toBe(firstKey); // No double-apply on the server.
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
    expect(fetchFn).toHaveBeenCalledTimes(3); // No fourth attempt.
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

  it('stamps a real idempotency key on POST even with no global crypto (Hermes)', async () => {
    // React Native/Hermes has no global crypto, and the default id generator must not throw (that broke every POST).
    const saved = (globalThis as { crypto?: unknown }).crypto;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).crypto;
    try {
      const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { ok: 1 }));
      const storage = new MemoryTokenStorage();
      const client = new ApiClient({ baseUrl: 'https://api.test', storage, onLogout: vi.fn(), fetchFn: fetchFn as never });
      const res = await client.post('/auth/oauth', { provider: 'apple', idToken: 't' });
      expect(res.ok).toBe(true);
      const key = fetchFn.mock.calls[0]![1].headers['idempotency-key'];
      expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).crypto = saved;
    }
  });

  it('generateRequestId returns a v4-shaped uuid', () => {
    expect(generateRequestId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('times out a hanging request as a network error (unreachable API)', async () => {
    // A fetch that never resolves but rejects when aborted, like an unreachable host; without the client timeout it would hang.
    const fetchFn = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    );
    const client = new ApiClient({
      baseUrl: 'https://api.test',
      storage: new MemoryTokenStorage(),
      onLogout: vi.fn(),
      fetchFn: fetchFn as never,
      timeoutMs: 20,
    });
    const res = await client.get('/slow');
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

  it('keeps how long a lock lasts, as the body says it', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse(429, { code: 'LOCKED', message: 'too many failed attempts', details: { retryAfterSec: 900 } }, { 'retry-after': '900' }));
    const { client } = makeClient(fetchFn, false);
    const res = await client.post('/auth/login', { email: 'a@b.c', password: 'x' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatchObject({ kind: 'rate_limited', code: 'LOCKED', retryAfterSec: 900, details: { retryAfterSec: 900 } });
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

  it('keeps a refusal’s details, which say until when', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(403, { code: 'MUTED', message: "you can't send messages right now", details: { until: '2026-10-20T10:00:00.000Z', scope: 'chat' } }),
      );
    const { client, ready } = makeClient(fetchFn);
    await ready;
    const res = await client.post('/chat/u/messages', { body: 'hi' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('MUTED');
    expect(res.error.details).toEqual({ until: '2026-10-20T10:00:00.000Z', scope: 'chat' });
  });

  it('keeps why a picture was refused and whether a person can be asked, and nothing of the kind otherwise', async () => {
    const refused = { code: 'IMAGE_REJECTED', message: 'this image was rejected by moderation', reason: 'other', reviewId: null, requestId: 'r1' };
    const fetchFn = vi.fn().mockResolvedValueOnce(jsonResponse(422, refused)).mockResolvedValueOnce(jsonResponse(422, { code: 'LETTER_LONG', message: 'too long' }));
    const { client, ready } = makeClient(fetchFn);
    await ready;
    const res = await client.post('/letters/threads/t1', { body: 'hi' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.rejection).toEqual({ code: 'IMAGE_REJECTED', message: 'this image was rejected by moderation', reason: 'other', reviewId: null });
    const other = await client.post('/letters/threads/t1', { body: 'hi' });
    expect(other.ok ? null : other.error.rejection).toBeUndefined();
  });

  /**
   * A ban revokes the session, so the phone learns of it at the next refresh, which must pass the reasons and
   * appeal token to the suspension screen before signing out.
   */
  it('passes a suspension on refresh to onSuspended, then signs out', async () => {
    const details = { until: null, policy: 'harassment', statement: 'Repeated bullying.', appealable: true, appealToken: 'appeal-1' };
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(403, { code: 'ACCOUNT_SUSPENDED', message: 'this account is suspended', details }));
    const storage = new MemoryTokenStorage();
    await storage.set({ accessToken: 'acc-1', refreshToken: 'ref-1' });
    const order: string[] = [];
    const onSuspended = vi.fn(() => order.push('suspended'));
    const client = new ApiClient({
      baseUrl: 'https://api.test',
      storage,
      onLogout: () => order.push('logout'),
      onSuspended,
      fetchFn: fetchFn as never,
    });
    const res = await client.get('/me');
    expect(res.ok).toBe(false);
    expect(onSuspended).toHaveBeenCalledWith(details);
    expect(order).toEqual(['suspended', 'logout']);
    expect(await storage.get()).toBeNull();
  });

  it('does not report a suspension for any other refused refresh', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(403, { code: 'ACCOUNT_DISABLED', message: 'disabled' }));
    const storage = new MemoryTokenStorage();
    await storage.set({ accessToken: 'acc-1', refreshToken: 'ref-1' });
    const onSuspended = vi.fn();
    const client = new ApiClient({ baseUrl: 'https://api.test', storage, onLogout: () => undefined, onSuspended, fetchFn: fetchFn as never });
    await client.get('/me');
    expect(onSuspended).not.toHaveBeenCalled();
  });

  /*
   * A guest refused something only an account may do (403 GUEST_ACCOUNT) is reported to the account gate; the
   * call still returns the refusal, and no other 403 is mistaken for it.
   */
  it('passes a guest’s refusal to onGuestRefused, and keeps the refusal, and no other 403', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(403, { code: 'GUEST_ACCOUNT', message: 'guest accounts cannot do this' }))
      .mockResolvedValueOnce(jsonResponse(403, { code: 'FORBIDDEN', message: 'not yours' }));
    const storage = new MemoryTokenStorage();
    await storage.set({ accessToken: 'acc-1', refreshToken: 'ref-1' });
    const onGuestRefused = vi.fn();
    const client = new ApiClient({ baseUrl: 'https://api.test', storage, onLogout: () => undefined, onGuestRefused, fetchFn: fetchFn as never });
    const first = await client.post('/friends/requests', { userId: 'u2' });
    expect(first).toMatchObject({ ok: false, error: { kind: 'client', code: 'GUEST_ACCOUNT', status: 403 } });
    expect(onGuestRefused).toHaveBeenCalledTimes(1);
    await client.delete('/library/posts/p1');
    expect(onGuestRefused).toHaveBeenCalledTimes(1);
    // The session is untouched: a guest refused is still signed in.
    expect(await storage.get()).toEqual({ accessToken: 'acc-1', refreshToken: 'ref-1' });
  });

  /* An account a person is checking (403 ACCOUNT_HELD) is reported at once, so the app shows it before /me is read again. */
  it('passes a held account’s refusal to onHeld, and keeps the refusal, and no other 403', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(403, { code: 'ACCOUNT_HELD', message: 'this account is held' }))
      .mockResolvedValueOnce(jsonResponse(403, { code: 'FORBIDDEN', message: 'not yours' }));
    const storage = new MemoryTokenStorage();
    await storage.set({ accessToken: 'acc-1', refreshToken: 'ref-1' });
    const onHeld = vi.fn();
    const client = new ApiClient({ baseUrl: 'https://api.test', storage, onLogout: () => undefined, onHeld, fetchFn: fetchFn as never });
    const first = await client.post('/chat/u2/messages', { body: 'Silav' });
    expect(first).toMatchObject({ ok: false, error: { kind: 'client', code: 'ACCOUNT_HELD', status: 403 } });
    expect(onHeld).toHaveBeenCalledTimes(1);
    await client.delete('/library/posts/p1');
    expect(onHeld).toHaveBeenCalledTimes(1);
    // Still signed in: a held account learns as usual.
    expect(await storage.get()).toEqual({ accessToken: 'acc-1', refreshToken: 'ref-1' });
  });

  /* A parent's switch or pause met at a write is reported, so the teen's limits are read again at once. */
  it('passes a parental refusal to onParental, and keeps the refusal', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(403, { code: 'PARENTAL_BLOCKED', message: 'switched off', details: { control: 'chat' } }))
      .mockResolvedValueOnce(jsonResponse(403, { code: 'PARENTAL_PAUSED', message: 'resting', details: { paused: 'bedtime', resumesAt: null } }))
      .mockResolvedValueOnce(jsonResponse(403, { code: 'FORBIDDEN', message: 'not yours' }));
    const storage = new MemoryTokenStorage();
    await storage.set({ accessToken: 'acc-1', refreshToken: 'ref-1' });
    const onParental = vi.fn();
    const client = new ApiClient({ baseUrl: 'https://api.test', storage, onLogout: () => undefined, onParental, fetchFn: fetchFn as never });
    const first = await client.post('/chat/u2/messages', { body: 'Silav' });
    expect(first).toMatchObject({ ok: false, error: { kind: 'client', code: 'PARENTAL_BLOCKED', status: 403, details: { control: 'chat' } } });
    await client.post('/letters', { body: 'Silav' });
    await client.delete('/library/posts/p1');
    expect(onParental).toHaveBeenCalledTimes(2);
  });

  it('ends the session on the server with the stored refresh token', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    const { client, storage, ready } = makeClient(fetchFn);
    await ready;

    await client.endSession();
    // sign-out clears the phone's copy straight after; the request already has the token.
    await storage.clear();

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://api.test/auth/logout');
    expect(JSON.parse(init.body as string)).toEqual({ refreshToken: 'ref-1' });
    expect(init.headers.authorization).toBeUndefined();
  });

  it('signs out on the phone even when the server cannot be reached', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('offline'));
    const { client, ready } = makeClient(fetchFn);
    await ready;
    await expect(client.endSession()).resolves.toBeUndefined();
  });

  it('has nothing to end when signed out', async () => {
    const fetchFn = vi.fn();
    const { client, ready } = makeClient(fetchFn, false);
    await ready;
    await client.endSession();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

/*
 * The server budgets failed sign-ins per known device and emails the owner about an unknown one, both from
 * x-device-id, so every request carries it, refresh and sign-out included.
 */
describe('the device id', () => {
  function withDevice(fetchFn: ReturnType<typeof vi.fn>, deviceId: () => Promise<string | null>) {
    const storage = new MemoryTokenStorage();
    const client = new ApiClient({ baseUrl: 'https://api.test', storage, onLogout: vi.fn(), fetchFn: fetchFn as never, deviceId });
    return { client, storage };
  }

  it('goes on every request, the refresh and its replay included', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: 'acc-2', refreshToken: 'ref-2' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const { client, storage } = withDevice(fetchFn, async () => 'device-1');
    await storage.set({ accessToken: 'acc-1', refreshToken: 'ref-1' });
    await client.get('/me');
    expect(fetchFn.mock.calls.map(([url]) => url)).toEqual(['https://api.test/me', 'https://api.test/auth/refresh', 'https://api.test/me']);
    for (const [, init] of fetchFn.mock.calls) expect(init.headers['x-device-id']).toBe('device-1');
  });

  it('goes on a sign-in, where there is no session yet', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(401, { code: 'INVALID_CREDENTIALS', message: 'invalid email or password' }));
    const { client } = withDevice(fetchFn, async () => 'device-1');
    await client.post('/auth/login', { email: 'a@b.c', password: 'x' });
    expect(fetchFn.mock.calls[0]![1].headers).toMatchObject({ 'x-device-id': 'device-1', 'content-type': 'application/json' });
  });

  it('goes on the sign-out', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    const { client, storage } = withDevice(fetchFn, async () => 'device-1');
    await storage.set({ accessToken: 'acc-1', refreshToken: 'ref-1' });
    await client.endSession();
    await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1));
    expect(fetchFn.mock.calls[0]![1].headers['x-device-id']).toBe('device-1');
  });

  it('is left off when there is none, and a failure to read it never stops a request', async () => {
    const fetchFn = vi.fn().mockImplementation(async () => jsonResponse(200, {}));
    await withDevice(fetchFn, async () => null).client.get('/a');
    await withDevice(fetchFn, () => Promise.reject(new Error('keystore'))).client.get('/b');
    expect(fetchFn).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchFn.mock.calls) expect(init.headers['x-device-id']).toBeUndefined();
  });
});

/**
 * Maintenance: every call but a few is answered 503 MAINTENANCE with a notice. The notice goes up over the app
 * and the session is left exactly as it was.
 */
describe('Hevalo offline for a while', () => {
  const notice = { title: 'Back soon', message: 'New lessons on the way.', pictureUrl: null, since: '2026-10-27T09:00:00.000Z', backBy: '2026-10-27T11:00:00.000Z' };
  const offline = (): Response => jsonResponse(503, { code: 'MAINTENANCE', message: 'Hevalo is offline for a while; try again later', maintenance: notice, requestId: 'r-1' });

  function offlineClient(fetchFn: ReturnType<typeof vi.fn>) {
    const storage = new MemoryTokenStorage();
    const onLogout = vi.fn();
    const onMaintenance = vi.fn();
    const client = new ApiClient({ baseUrl: 'https://api.test', storage, onLogout, onMaintenance, fetchFn: fetchFn as never });
    return { client, storage, onLogout, onMaintenance, ready: storage.set({ accessToken: 'acc-1', refreshToken: 'ref-1' }) };
  }

  it('hands the notice on, and keeps the session', async () => {
    const fetchFn = vi.fn().mockImplementation(async () => offline());
    const { client, storage, onLogout, onMaintenance, ready } = offlineClient(fetchFn);
    await ready;
    const res = await client.get('/me');
    expect(onMaintenance).toHaveBeenCalledWith(notice);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatchObject({ kind: 'server', code: 'MAINTENANCE', status: 503 });
    // Not an expired session: no refresh, nobody signed out, tokens untouched.
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(onLogout).not.toHaveBeenCalled();
    expect(await storage.get()).toEqual({ accessToken: 'acc-1', refreshToken: 'ref-1' });
  });

  it('hears of it on the replay after a refresh, which stays open, without signing out', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: 'acc-2', refreshToken: 'ref-2' }))
      .mockResolvedValueOnce(offline());
    const { client, storage, onLogout, onMaintenance, ready } = offlineClient(fetchFn);
    await ready;
    await client.post('/me/heartbeat');
    expect(onMaintenance).toHaveBeenCalledWith(notice);
    expect(onLogout).not.toHaveBeenCalled();
    expect(await storage.get()).toEqual({ accessToken: 'acc-2', refreshToken: 'ref-2' });
  });

  it('takes a 503 without a notice for the plain server error it is', async () => {
    const fetchFn = vi.fn().mockImplementation(async () => jsonResponse(503, { code: 'SERVICE_UNAVAILABLE', message: 'upstream down' }));
    const { client, onMaintenance, ready } = offlineClient(fetchFn);
    await ready;
    const res = await client.get('/me');
    expect(res.ok).toBe(false);
    expect(onMaintenance).not.toHaveBeenCalled();
  });
});

describe('replacing the access token', () => {
  /* What a password change hands back: this session carries on, its refresh token unchanged. */
  it('keeps the refresh token', async () => {
    const fetchFn = vi.fn().mockImplementation(async () => jsonResponse(200, {}));
    const { client, storage, ready } = makeClient(fetchFn);
    await ready;
    await client.replaceAccessToken('acc-new');
    expect(await storage.get()).toEqual({ accessToken: 'acc-new', refreshToken: 'ref-1' });
    await client.get('/me');
    expect(fetchFn.mock.calls[0]![1].headers.authorization).toBe('Bearer acc-new');
  });

  it('stores nothing when signed out', async () => {
    const { client, storage, ready } = makeClient(vi.fn(), false);
    await ready;
    await client.replaceAccessToken('acc-new');
    expect(await storage.get()).toBeNull();
  });
});

describe('apiBaseUrl', () => {
  it('maps each environment and honors overrides', () => {
    expect(apiBaseUrl('development')).toContain('localhost');
    expect(apiBaseUrl('staging')).toContain('staging');
    expect(apiBaseUrl('production')).toBe('https://kurda-api.onrender.com');
    expect(apiBaseUrl('development', 'http://10.0.2.2:3000')).toBe('http://10.0.2.2:3000');
  });
});

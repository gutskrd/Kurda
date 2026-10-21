// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, apiUpload, getRefreshToken, getToken, setToken } from './api';
import { failure, fakeApi, json, on, type Call } from './test/fetch';

let reload: ReturnType<typeof vi.fn>;

beforeEach(() => {
  reload = vi.fn();
  vi.stubGlobal('location', { ...window.location, reload, hash: '' });
  setToken('tok-1');
});

afterEach(() => {
  vi.unstubAllGlobals();
  setToken(null);
});

describe('the admin API client', () => {
  it('keeps a wrong password’s message, and the page, instead of treating it as an expired session', async () => {
    fakeApi(on('POST', '/auth/login', failure(401, 'INVALID_CREDENTIALS', 'invalid email or password')));
    const err = await api('/auth/login', { method: 'POST', body: { email: 'a@b.c', password: 'x' } }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe('invalid email or password');
    expect(reload).not.toHaveBeenCalled();
    expect(getToken()).toBe('tok-1');
  });

  it('does not sign an admin out for a mistyped 2FA code', async () => {
    fakeApi(on('POST', '/admin/auth/verify', failure(401, 'INVALID_CODE', 'invalid or expired code')));
    const err = (await api('/admin/auth/verify', { method: 'POST', body: { code: '000000' } }).catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe('INVALID_CODE');
    expect(reload).not.toHaveBeenCalled();
    expect(getToken()).toBe('tok-1');
  });

  it('still ends the session on any other 401', async () => {
    fakeApi(on('GET', '/admin/session', failure(401, 'UNAUTHENTICATED', 'token expired')));
    await expect(api('/admin/session')).rejects.toBeInstanceOf(ApiError);
    expect(reload).toHaveBeenCalledOnce();
    expect(getToken()).toBeNull();
  });

  it('keeps what a refusal says beside its message: a lesson’s issues, the recordings it is missing', async () => {
    fakeApi(
      on('PUT', '/admin/content/lessons/l1', {
        status: 422,
        body: { code: 'INVALID', message: 'invalid exercises', issues: [{ path: 'exercises[0].prompt', message: 'Required' }], requestId: 'r-7' },
      }),
    );
    const err = (await api('/admin/content/lessons/l1', { method: 'PUT', body: {} }).catch((e: unknown) => e)) as ApiError;
    expect(err.body.issues).toEqual([{ path: 'exercises[0].prompt', message: 'Required' }]);
    expect(err.requestId).toBe('r-7');
  });

  it('reads the older { error: { code, message } } envelope too', async () => {
    fakeApi(on('POST', '/admin/events/x/enabled', { status: 404, body: { error: { code: 'NOT_FOUND', message: 'no such event' } } }));
    const err = (await api('/admin/events/x/enabled', { method: 'POST', body: { enabled: true } }).catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('no such event');
  });

  it('keeps how long a refusal asks to wait: from a lockout’s details, else from Retry-After', async () => {
    fakeApi(
      on('POST', '/admin/auth/verify', failure(429, 'TOTP_LOCKED', 'too many wrong codes — try again later', { retryAfterSec: 286.4 })),
      on('POST', '/admin/2fa/confirm', { status: 429, body: { code: 'RATE_LIMITED', message: 'too many requests' }, headers: { 'retry-after': '90' } }),
      on('GET', '/admin/audit', failure(400, 'BAD', 'no')),
    );
    const locked = (await api('/admin/auth/verify', { method: 'POST', body: { code: '000000' } }).catch((e: unknown) => e)) as ApiError;
    expect(locked.code).toBe('TOTP_LOCKED');
    expect(locked.retryAfterSec).toBe(287);
    const limited = (await api('/admin/2fa/confirm', { method: 'POST', body: { code: '000000' } }).catch((e: unknown) => e)) as ApiError;
    expect(limited.retryAfterSec).toBe(90);
    const plain = (await api('/admin/audit').catch((e: unknown) => e)) as ApiError;
    expect(plain.retryAfterSec).toBeNull();
    // a lockout is not an ended session
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads for the 2FA prompt when the window runs out mid-session', async () => {
    fakeApi(on('GET', '/admin/economy/supply', failure(403, 'TOTP_REQUIRED', 'enter your 2FA code to continue')), on('GET', '/me', json({})));
    await expect(api('/admin/economy/supply')).rejects.toBeInstanceOf(ApiError);
    expect(reload).toHaveBeenCalledOnce();
  });
});

describe('keeping the session alive', () => {
  /** An API whose /admin/audit takes only the `good` token, and whose refresh hands out `next`. */
  function expiring(good: string, next: { accessToken: string; refreshToken: string } | null) {
    return fakeApi(
      on('GET', '/admin/audit', (call: Call) =>
        call.headers.authorization === `Bearer ${good}` ? json({ entries: [] }) : failure(401, 'UNAUTHENTICATED', 'token expired'),
      ),
      on('POST', '/auth/refresh', next ? json(next) : failure(401, 'INVALID_REFRESH', 'invalid refresh token')),
    );
  }

  it('renews an expired token and makes the call again, instead of sending the admin to sign in', async () => {
    setToken('old', true, 'ref-1');
    const fake = expiring('new', { accessToken: 'new', refreshToken: 'ref-2' });
    await expect(api('/admin/audit')).resolves.toEqual({ entries: [] });
    expect(fake.calls.find((c) => c.path === '/auth/refresh')!.body).toEqual({ refreshToken: 'ref-1' });
    expect(getToken()).toBe('new');
    expect(getRefreshToken()).toBe('ref-2');
    expect(reload).not.toHaveBeenCalled();
  });

  it('renews once for every call that found the token expired at the same moment', async () => {
    setToken('old', true, 'ref-1');
    const fake = expiring('new', { accessToken: 'new', refreshToken: 'ref-2' });
    await Promise.all([api('/admin/audit'), api('/admin/audit'), api('/admin/audit')]);
    expect(fake.calls.filter((c) => c.path === '/auth/refresh')).toHaveLength(1);
  });

  it('takes the token another tab already renewed, rather than renewing with a refresh token it replaced', async () => {
    setToken('old', true, 'ref-1');
    // the other tab renewed: storage holds its pair, this tab still the old token
    localStorage.setItem('kurda_admin_token', 'new');
    localStorage.setItem('kurda_admin_refresh', 'ref-2');
    const fake = expiring('new', null);
    await expect(api('/admin/audit')).resolves.toEqual({ entries: [] });
    expect(fake.calls.some((c) => c.path === '/auth/refresh')).toBe(false);
  });

  it('ends the session when it cannot be renewed', async () => {
    setToken('old', true, 'ref-1');
    expiring('new', null);
    await expect(api('/admin/audit')).rejects.toBeInstanceOf(ApiError);
    expect(reload).toHaveBeenCalledOnce();
    expect(getToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it('renews a session that is not remembered where it lives: this tab only', async () => {
    setToken('old', false, 'ref-1');
    expiring('new', { accessToken: 'new', refreshToken: 'ref-2' });
    await api('/admin/audit');
    expect(sessionStorage.getItem('kurda_admin_refresh')).toBe('ref-2');
    expect(localStorage.getItem('kurda_admin_token')).toBeNull();
  });

  it('renews for an upload too, sending the same bytes again', async () => {
    setToken('old', true, 'ref-1');
    const fake = fakeApi(
      on('PUT', '/admin/audio/letters/a', (call: Call) =>
        call.headers.authorization === 'Bearer new' ? json({ ok: true }) : failure(401, 'UNAUTHENTICATED', 'token expired'),
      ),
      on('POST', '/auth/refresh', json({ accessToken: 'new', refreshToken: 'ref-2' })),
    );
    await expect(apiUpload('/admin/audio/letters/a', new Uint8Array([1, 2, 3]), 'audio/wav')).resolves.toEqual({ ok: true });
    expect(fake.calls.filter((c) => c.path === '/admin/audio/letters/a')).toHaveLength(2);
  });

  it('renews holding the lock the console’s tabs share, and takes what a tab that held it before got', async () => {
    setToken('old', true, 'ref-1');
    const request = vi.fn(async (_name: string, run: () => Promise<boolean>) => {
      // the other tab held the lock first and renewed
      localStorage.setItem('kurda_admin_token', 'new');
      localStorage.setItem('kurda_admin_refresh', 'ref-2');
      return run();
    });
    vi.stubGlobal('navigator', { ...navigator, userAgent: navigator.userAgent, locks: { request } });
    const fake = expiring('new', null);
    await expect(api('/admin/audit')).resolves.toEqual({ entries: [] });
    expect(request).toHaveBeenCalledWith('kurda-admin-renew', expect.any(Function));
    // the refresh token it would have presented was already replaced: it is not sent
    expect(fake.calls.some((c) => c.path === '/auth/refresh')).toBe(false);
  });

  it("sends this browser's device id with every call, the same one each time", async () => {
    const fake = fakeApi(on('GET', '/admin/audit', json({})));
    await api('/admin/audit');
    await api('/admin/audit');
    const [first, second] = fake.calls.map((c) => c.headers['x-device-id']);
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(second).toBe(first);
  });
});

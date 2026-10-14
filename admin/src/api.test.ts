// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, getToken, setToken } from './api';
import { failure, fakeApi, json, on } from './test/fetch';

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

  it('reloads for the 2FA prompt when the window runs out mid-session', async () => {
    fakeApi(on('GET', '/admin/economy/supply', failure(403, 'TOTP_REQUIRED', 'enter your 2FA code to continue')), on('GET', '/me', json({})));
    await expect(api('/admin/economy/supply')).rejects.toBeInstanceOf(ApiError);
    expect(reload).toHaveBeenCalledOnce();
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { ApiClient, CODE_COPY, describeError } from './api';
import { createTokenStorage, persistTokens } from './tokenStorage';
import { englishOnly as t, translator } from '../i18n/I18nProvider';
import { fr } from '../i18n/fr';
import { de } from '../i18n/de';
import { ku } from '../i18n/ku';
import { ckb } from '../i18n/ckb';
import { en } from '../i18n/en';
import { deviceId } from './deviceId';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe('describeError', () => {
  it('gives friendly copy per error kind', () => {
    expect(describeError({ kind: 'network', message: 'x' }, t)).toMatch(/connection/i);
    expect(describeError({ kind: 'server', message: 'x' }, t)).toMatch(/our end/i);
    expect(describeError({ kind: 'rate_limited', message: 'x', retryAfterSec: 5 }, t)).toMatch(/5s/);
    expect(describeError({ kind: 'client', message: 'Email already taken' }, t)).toBe('Email already taken');
  });

  // Error sentences are read at the worst moment to be handed an unreadable language.
  it('says it in the reader’s language', () => {
    const french = translator(fr);
    expect(describeError({ kind: 'network', message: 'x' }, french)).toMatch(/connexion/i);
    expect(describeError({ kind: 'server', message: 'x' }, french)).toMatch(/de notre côté/i);
    expect(describeError({ kind: 'rate_limited', message: 'x', retryAfterSec: 5 }, french)).toMatch(/5 s/);
  });

  // A route the API lacks means a build newer than its server, not anything the reader did.
  it('says plainly when the server does not have something yet', () => {
    const missing = { kind: 'client' as const, code: 'NOT_FOUND', message: 'route not found', status: 404 };
    expect(describeError(missing, t)).toBe(t('error.notOnServer'));
    expect(describeError(missing, translator(fr))).toBe(fr['error.notOnServer']);
    // Any other NOT_FOUND keeps the server's own words.
    expect(describeError({ ...missing, message: 'no such image' }, t)).toBe('no such image');
  });

  it('still prefers the server’s own message over a generic translated one', () => {
    expect(describeError({ kind: 'client', message: 'Email already taken' }, translator(fr))).toBe(
      'Email already taken',
    );
  });

  // The exception: the server's English instruction to an unconfirmed account is the message that most needs translating.
  it('translates the not-activated refusal rather than passing it through', () => {
    const notActivated = {
      kind: 'client' as const,
      code: 'ACCOUNT_NOT_ACTIVATED',
      message: 'confirm your email address to use Hevalo',
      status: 403,
    };
    expect(describeError(notActivated, t)).toMatch(/activated/i);
    expect(describeError(notActivated, translator(fr))).toMatch(/activé/i);
  });
});

describe('ApiClient', () => {
  it('returns typed data on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, { hello: 'world' })),
    );
    const client = new ApiClient('https://api.test', createTokenStorage(), () => {});
    const res = await client.get<{ hello: string }>('/thing');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.hello).toBe('world');
  });

  it('maps an error envelope to a typed client error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(400, { code: 'VALIDATION_ERROR', message: 'bad input' })),
    );
    const client = new ApiClient('https://api.test', createTokenStorage(), () => {});
    const res = await client.get('/thing');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.kind).toBe('client');
      expect(res.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('surfaces a network failure without throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    const client = new ApiClient('https://api.test', createTokenStorage(), () => {});
    const res = await client.get('/thing');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe('network');
  });

  it('keeps the envelope’s details, so a refusal can say until when', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(403, { code: 'MUTED', message: 'no', details: { scope: 'chat', until: null } })),
    );
    const client = new ApiClient('https://api.test', createTokenStorage(), () => {});
    const res = await client.post('/chat/x/messages', { body: 'hi' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.details).toEqual({ scope: 'chat', until: null });
  });

  // A ban mid-session answers a bare ACCOUNT_DISABLED; the refresh carries the reasons and appeal token.
  it('finds out why when the account is suspended mid-session', async () => {
    persistTokens({ accessToken: 'a', refreshToken: 'r' }, true);
    const suspended = { until: null, policy: 'spam', statement: 'Spam.', appealable: true, appealToken: 'appeal' };
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith('/auth/refresh')
        ? jsonResponse(403, { code: 'ACCOUNT_SUSPENDED', message: 'suspended', details: suspended })
        : jsonResponse(403, { code: 'ACCOUNT_DISABLED', message: 'disabled' }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const onSuspended = vi.fn();
    const storage = createTokenStorage();
    const client = new ApiClient('https://api.test', storage, () => {}, onSuspended);

    const res = await client.get('/me');
    expect(res.ok).toBe(false);
    expect(onSuspended).toHaveBeenCalledWith(suspended);
    // The API ended the sessions; nothing is left to replay.
    expect(storage.get()).toBeNull();
  });

  // Maintenance answers 503 MAINTENANCE with the notice, which the first request to see it hands to the app.
  it('hands on the notice when Hevalo is offline', async () => {
    const maintenance = { title: 'Back soon', message: null, pictureUrl: 'https://cdn.test/a.png', since: '2026-10-27T08:00:00.000Z', backBy: null };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(503, { code: 'MAINTENANCE', message: 'Hevalo is offline for maintenance', maintenance, requestId: 'r1' })),
    );
    const onMaintenance = vi.fn();
    const client = new ApiClient('https://api.test', createTokenStorage(), () => {}, undefined, onMaintenance);

    const res = await client.get('/feed');
    expect(onMaintenance).toHaveBeenCalledWith(maintenance);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('MAINTENANCE');
      // In the reader's words, not the generic server error.
      expect(describeError(res.error, t)).toBe(en['maintenance.title']);
    }
  });

  it('takes no other 503 for Hevalo being offline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(503, { code: 'UNAVAILABLE', message: 'try later' })));
    const onMaintenance = vi.fn();
    const client = new ApiClient('https://api.test', createTokenStorage(), () => {}, undefined, onMaintenance);
    await client.get('/feed');
    expect(onMaintenance).not.toHaveBeenCalled();
  });

  it('never passes on a picture that is not https', async () => {
    const maintenance = { title: null, message: null, pictureUrl: 'http://cdn.test/a.png', since: '2026-10-27T08:00:00.000Z', backBy: null };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(503, { code: 'MAINTENANCE', message: 'offline', maintenance })));
    const onMaintenance = vi.fn();
    const client = new ApiClient('https://api.test', createTokenStorage(), () => {}, undefined, onMaintenance);
    await client.post('/feed/posts', { body: 'hi' });
    expect(onMaintenance).toHaveBeenCalledWith({ ...maintenance, pictureUrl: null });
  });

  it('sends a credential the caller passed, not the stored session', async () => {
    // The suspension screen reads with its appeal token; no other session may stand in for it.
    persistTokens({ accessToken: 'someone-else', refreshToken: 'r' }, true);
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);
    const client = new ApiClient('https://api.test', createTokenStorage(), () => {});
    await client.get('/me/standing', { headers: { authorization: 'Bearer appeal' } });
    await client.get('/me');
    expect((fetchMock.mock.calls[0]![1]!.headers as Record<string, string>).authorization).toBe('Bearer appeal');
    expect((fetchMock.mock.calls[1]![1]!.headers as Record<string, string>).authorization).toBe('Bearer someone-else');
  });

  it('ends the session on the server with the stored refresh token', async () => {
    persistTokens({ accessToken: 'a', refreshToken: 'the-refresh-token' }, true);
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const storage = createTokenStorage();
    const client = new ApiClient('https://api.test', storage, () => {});

    // Read before the caller clears storage, as sign-out does.
    const pending = client.endSession();
    storage.clear();
    await pending;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.test/auth/logout');
    expect(JSON.parse(init!.body as string)).toEqual({ refreshToken: 'the-refresh-token' });
    // The refresh token is the credential here; no access token rides along.
    expect((init!.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it('signs out locally even when the server cannot be reached', async () => {
    persistTokens({ accessToken: 'a', refreshToken: 'r' }, true);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    const client = new ApiClient('https://api.test', createTokenStorage(), () => {});
    await expect(client.endSession()).resolves.toBeUndefined();
  });

  it('attaches an Idempotency-Key to mutating requests', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);
    const client = new ApiClient('https://api.test', createTokenStorage(), () => {});
    await client.post('/thing', { a: 1 });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['idempotency-key']).toBeTruthy();
    expect(headers['content-type']).toBe('application/json');
  });

  it('gives up on a request when the caller aborts it', async () => {
    // A long-poll left waiting: the fetch ends only when its signal fires.
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new ApiClient('https://api.test', createTokenStorage(), () => {});
    const controller = new AbortController();
    const pending = client.get('/story-games/g1?v=3', { signal: controller.signal });
    controller.abort();
    const res = await pending;
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe('network');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not send a request whose signal has already been aborted', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
      return jsonResponse(200, {});
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new ApiClient('https://api.test', createTokenStorage(), () => {});
    const controller = new AbortController();
    controller.abort();
    const res = await client.get('/thing', { signal: controller.signal });
    expect(res.ok).toBe(false);
  });
});

describe('the sign-up, sign-in and confirmation refusals', () => {
  /** Every code the auth routes raise (api/src/auth/routes.ts and service.ts), whose server English is vague or technical. */
  const AUTH_CODES = [
    'WEAK_PASSWORD',
    'INVALID_USERNAME',
    'LOGIN_VERIFICATION_REQUIRED',
    'INVALID_CODE',
    'CODE_EXPIRED',
    'TOO_MANY_ATTEMPTS',
    'INVALID_TOKEN',
    'USERNAME_TAKEN',
    'REGISTRATION_FAILED',
    'INVALID_CREDENTIALS',
    'LOCKED',
    'INVALID_REFRESH',
    'REFRESH_REUSED',
    'REFRESH_EXPIRED',
    'SIGNUP_REJECTED',
    'ACCOUNT_DISABLED',
    'VALIDATION_ERROR',
  ];

  it('says every one of them from the catalogue, never the server’s English or the generic line', () => {
    for (const code of AUTH_CODES) {
      const said = describeError({ kind: 'client', code, message: 'raw server words', status: 400 }, t);
      expect(said, code).not.toBe('raw server words');
      expect(said, code).not.toBe(en['error.generic']);
    }
  });

  it('answers an address that may already have an account without saying whether it does', () => {
    const refused = { kind: 'client' as const, code: 'REGISTRATION_FAILED', message: 'unable to register with these details', status: 409 };
    const said = describeError(refused, t);
    expect(said).toBe(en['error.code.registrationFailed']);
    // Both ways on are named, and nothing confirms the address is registered.
    expect(said).toMatch(/sign in/i);
    expect(said).toMatch(/reset your password/i);
    expect(said).not.toMatch(/already (registered|in use|taken)/i);
    expect(describeError(refused, translator(fr))).toBe(fr['error.code.registrationFailed']);
  });

  it('says which password rule was missed', () => {
    const weak = (reason: string) => ({ kind: 'client' as const, code: 'WEAK_PASSWORD', message: 'x', details: { reason } });
    expect(describeError(weak('too-short'), t)).toBe('Use at least 8 characters for your password.');
    expect(describeError(weak('needs-number'), t)).toBe(en['error.code.passwordNeedsNumber']);
    expect(describeError(weak('needs-letter'), t)).toBe(en['error.code.passwordNeedsLetter']);
    // A rule this build does not know yet still says what a password needs.
    expect(describeError(weak('something-new'), t)).toBe(en['auth.passwordHint']);
  });

  it('says which username rule was missed', () => {
    const bad = (reason: string) => ({ kind: 'client' as const, code: 'INVALID_USERNAME', message: 'x', details: { reason } });
    expect(describeError(bad('too-short'), t)).toBe('Use at least 3 characters for your username.');
    expect(describeError(bad('edge-punctuation'), t)).toBe(en['error.code.usernameEdge']);
    expect(describeError(bad('double-punctuation'), t)).toBe(en['error.code.usernameSideBySide']);
    expect(describeError(bad('numbers-only'), t)).toBe(en['error.code.usernameLetter']);
    expect(describeError(bad('reserved'), t)).toBe(en['error.code.usernameUnavailable']);
    // An unknown reason gets the whole rule.
    expect(describeError(bad('something-newer'), t)).toBe(en['error.code.usernameChars']);
  });

  it('names the characters a username cannot have, and says spaces as spaces', () => {
    const chars = (list: unknown) => ({ kind: 'client' as const, code: 'INVALID_USERNAME', message: 'x', details: { reason: 'invalid-chars', chars: list } });
    expect(describeError(chars(['!', '?']), t)).toBe('“! ?” can’t be in a username.');
    expect(describeError(chars([' ', '@']), t)).toBe('“@” can’t be in a username.');
    expect(describeError(chars([' ']), t)).toBe(en['error.code.usernameSpaces']);
    // An older answer without the characters still says what may be used.
    expect(describeError(chars(undefined), t)).toBe(en['error.code.usernameChars']);
  });

  it('points at the email address when that is the field the server could not read', () => {
    const invalid = (path: string) => ({ kind: 'client' as const, code: 'VALIDATION_ERROR', message: 'request validation failed', details: [{ path: [path], message: 'Invalid' }] });
    expect(describeError(invalid('email'), t)).toBe(en['error.code.badEmail']);
    expect(describeError(invalid('username'), t)).toBe(en['error.code.checkDetails']);
  });
});

describe('CODE_COPY', () => {
  it('answers every mapped code from the catalogue rather than the server', () => {
    for (const [code, key] of Object.entries(CODE_COPY)) {
      const said = describeError({ kind: 'client', code, message: 'raw technical detail' }, t);
      expect(said, code).toBe(en[key]);
    }
  });

  it('says a wrong password in French, not in the API’s English', () => {
    const wrong = { kind: 'unauthorized' as const, code: 'INVALID_CREDENTIALS', message: 'invalid email or password' };
    expect(describeError(wrong, translator(fr))).toBe(fr['error.code.invalidCredentials']);
  });

  // Unmapped codes, some carrying several different messages, show the server's own sentence.
  it('falls through to the server message for a code it does not know', () => {
    expect(describeError({ kind: 'client', code: 'BAD_ROSTER', message: 'duplicate players in the roster' }, t)).toBe(
      'duplicate players in the roster',
    );
  });

  it('prefers a countdown to a sentence when the server sent one', () => {
    expect(describeError({ kind: 'rate_limited', code: 'RATE_LIMITED', message: 'x', retryAfterSec: 30 }, t)).toMatch(/30s/);
  });
});

describe('the sign-in protection refusals', () => {
  const locked = (retryAfterSec?: number, details?: unknown) => ({
    kind: 'rate_limited' as const,
    code: 'LOCKED',
    message: 'too many failed attempts — try again later',
    status: 429,
    ...(retryAfterSec !== undefined ? { retryAfterSec } : {}),
    ...(details !== undefined ? { details } : {}),
  });

  // Lockouts last from 15 minutes to a day, said in words rather than seconds.
  it('says how long a lockout lasts in words, not in seconds', () => {
    expect(describeError(locked(900), t, 'en')).toBe(en['error.code.lockedFor'].replace('{duration}', '15 minutes'));
    // 13.2 minutes left is "about 14 minutes".
    expect(describeError(locked(792), t, 'en')).toContain('about 14 minutes');
    expect(describeError(locked(792), t, 'en')).not.toMatch(/792|\ds\b/);
    expect(describeError(locked(2 * 3600), t, 'en')).toContain('about 2 hours');
    expect(describeError(locked(60), t, 'en')).toContain('about 1 minute ');
  });

  it('takes the wait from the details when there is no header', () => {
    const said = describeError({ ...locked(undefined, { retryAfterSec: 1800 }), kind: 'client' as const }, t, 'en');
    expect(said).toContain('about 30 minutes');
  });

  it('falls back to the plain sentence when it does not know how long', () => {
    expect(describeError(locked(), t, 'en')).toBe(en['error.code.locked']);
  });

  it('says the wait in the reader’s language, Kurdish from the catalogue', () => {
    expect(describeError(locked(900), translator(de), 'de')).toContain('etwa 15 Minuten');
    expect(describeError(locked(900), translator(ku), 'ku')).toContain('nêzîkî 15 xulek');
    expect(describeError(locked(3 * 3600), translator(ckb), 'ckb')).toContain('نزیکەی 3 کاتژمێر');
  });

  it('answers a sign-in that asks for a challenge calmly, whatever the reason', () => {
    for (const reason of ['attempts', 'network', 'surge']) {
      const said = describeError(
        { kind: 'client', code: 'CAPTCHA_REQUIRED', message: 'complete the challenge to sign in', status: 403, details: { captchaRequired: true, reason } },
        t,
      );
      expect(said, reason).toBe(en['error.code.captchaRequired']);
    }
    expect(en['error.code.captchaRequired']).toMatch(/wait a few minutes/);
    expect(en['error.code.captchaRequired']).toMatch(/reset your password/);
  });

  it('says a password from a data leak is not safe', () => {
    const breached = { kind: 'client' as const, code: 'PASSWORD_BREACHED', message: 'x', status: 400, details: { reason: 'breached' } };
    expect(describeError(breached, t)).toBe('This password has shown up in a data leak, so it isn’t safe. Choose a different one.');
    expect(describeError(breached, translator(ku))).toBe(ku['error.code.passwordBreached']);
  });

  it('says what went wrong changing a password, and ending a session', () => {
    const said = (code: string) => describeError({ kind: 'client', code, message: 'raw', status: 400 }, t);
    expect(said('WRONG_PASSWORD')).toBe('Your current password isn’t right.');
    expect(said('NO_PASSWORD')).toBe('Your account doesn’t have a password yet.');
    expect(said('SESSION_NOT_FOUND')).toBe('That device is already signed out.');
  });

  it('never says which of the email and the password was wrong', () => {
    const said = describeError({ kind: 'unauthorized', code: 'INVALID_CREDENTIALS', message: 'invalid email or password', status: 401 }, t);
    expect(said).toBe('That email or password isn’t right.');
  });
});

describe('the device id header', () => {
  it('goes with every request the client makes, the same on each', async () => {
    persistTokens({ accessToken: 'a', refreshToken: 'r' }, true);
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url.endsWith('/stale') ? jsonResponse(401, { code: 'UNAUTHORIZED', message: 'no' }) : jsonResponse(200, { accessToken: 'b', refreshToken: 'r2' }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new ApiClient('https://api.test', createTokenStorage(), () => {});
    await client.get('/thing');
    await client.post('/thing', { a: 1 });
    await client.delete('/me/sessions?except=current');
    await client.uploadBytes('/me/photo', new Blob(['x'], { type: 'image/png' }));
    await client.endSession();
    await client.get('/stale'); // A 401, so the refresh goes out too.

    const sent = fetchMock.mock.calls.map(([url, init]) => [url, (init!.headers as Record<string, string>)['x-device-id']]);
    expect(sent.map(([u]) => u)).toEqual(expect.arrayContaining(['https://api.test/auth/refresh', 'https://api.test/auth/logout']));
    for (const [url, id] of sent) expect(id, String(url)).toBe(deviceId());
    // A header, never part of an address.
    for (const [url] of sent) expect(String(url)).not.toContain(deviceId());
  });
});

describe('replacing the access token', () => {
  it('keeps the refresh token, and keeps it where it was', () => {
    persistTokens({ accessToken: 'old', refreshToken: 'keep-me' }, false);
    const storage = createTokenStorage();
    const client = new ApiClient('https://api.test', storage, () => {});
    client.replaceAccessToken('new');
    expect(storage.get()).toEqual({ accessToken: 'new', refreshToken: 'keep-me' });
    // A session that was not remembered stays unremembered.
    expect(localStorage.getItem('hevalo_tokens')).toBeNull();
    expect(sessionStorage.getItem('hevalo_tokens')).not.toBeNull();
  });

  it('does nothing when signed out', () => {
    const storage = createTokenStorage();
    new ApiClient('https://api.test', storage, () => {}).replaceAccessToken('new');
    expect(storage.get()).toBeNull();
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { ApiClient, CODE_COPY, describeError } from './api';
import { createTokenStorage, persistTokens } from './tokenStorage';
import { englishOnly as t, translator } from '../i18n/I18nProvider';
import { fr } from '../i18n/fr';
import { en } from '../i18n/en';

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

  /**
   * These are the sentences a person sees when something breaks, which is the
   * worst moment to be handed a language they do not read.
   */
  it('says it in the reader’s language', () => {
    const french = translator(fr);
    expect(describeError({ kind: 'network', message: 'x' }, french)).toMatch(/connexion/i);
    expect(describeError({ kind: 'server', message: 'x' }, french)).toMatch(/de notre côté/i);
    expect(describeError({ kind: 'rate_limited', message: 'x', retryAfterSec: 5 }, french)).toMatch(/5 s/);
  });

  /**
   * The server's own message is more specific than anything here — "Email
   * already taken" beats "Something went wrong" — so it still comes through as
   * it arrived. That it arrives in English is a gap in the API, not one this
   * function can close by discarding what it knows.
   */
  /**
   * A route the API does not have is a build newer than its server, not
   * anything the reader did: "route not found" is no sentence to show them.
   */
  it('says plainly when the server does not have something yet', () => {
    const missing = { kind: 'client' as const, code: 'NOT_FOUND', message: 'route not found', status: 404 };
    expect(describeError(missing, t)).toBe(t('error.notOnServer'));
    expect(describeError(missing, translator(fr))).toBe(fr['error.notOnServer']);
    // any other NOT_FOUND keeps the server's own words
    expect(describeError({ ...missing, message: 'no such image' }, t)).toBe('no such image');
  });

  it('still prefers the server’s own message over a generic translated one', () => {
    expect(describeError({ kind: 'client', message: 'Email already taken' }, translator(fr))).toBe(
      'Email already taken',
    );
  });

  /**
   * The exception to the rule above. An unconfirmed account is refused every
   * write by the server now, and its reply is a sentence in English telling
   * you what to do about it — which is the one kind of message that is worse
   * in a language the reader does not have.
   */
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

  /**
   * A ban that lands while someone is signed in answers every request with a
   * bare ACCOUNT_DISABLED. The refresh is where the reasons and the appeal
   * token are, so the client asks it once and hands them to the app.
   */
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
    // the API ended the sessions; nothing is left that could be replayed
    expect(storage.get()).toBeNull();
  });

  it('sends a credential the caller passed, not the stored session', async () => {
    // the suspension screen reads with its appeal token; any other session must not stand in for it
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

    // read before the caller clears storage, as sign-out does
    const pending = client.endSession();
    storage.clear();
    await pending;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.test/auth/logout');
    expect(JSON.parse(init!.body as string)).toEqual({ refreshToken: 'the-refresh-token' });
    // the refresh token is the credential here; no access token rides along
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
    // a long-poll left waiting: the fetch only ends when its signal fires
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

describe('CODE_COPY', () => {
  /**
   * Every 4xx the API raises carries an English message, and describeError
   * handed it straight to the reader — so a wrong password said "invalid email
   * or password" in all nine languages. These are the codes that now answer in
   * the reader's own.
   */
  it('answers every mapped code from the catalogue rather than the server', () => {
    for (const [code, key] of Object.entries(CODE_COPY)) {
      const said = describeError({ kind: 'client', code, message: 'raw technical detail' }, t);
      expect(said, code).toBe(en[key]);
    }
  });

  it('says a wrong password in French, not in the API\'s English', () => {
    const wrong = { kind: 'unauthorized' as const, code: 'INVALID_CREDENTIALS', message: 'invalid email or password' };
    expect(describeError(wrong, translator(fr))).toBe(fr['error.code.invalidCredentials']);
  });

  /**
   * 105 codes are not in the table, 17 of them carrying several different
   * messages apiece, so the code alone cannot say which. The server's own
   * sentence is the honest thing to show for those.
   */
  it('falls through to the server message for a code it does not know', () => {
    expect(describeError({ kind: 'client', code: 'BAD_ROSTER', message: 'duplicate players in the roster' }, t)).toBe(
      'duplicate players in the roster',
    );
  });

  it('prefers a countdown to a sentence when the server sent one', () => {
    expect(describeError({ kind: 'rate_limited', code: 'LOCKED', message: 'x', retryAfterSec: 30 }, t)).toMatch(/30s/);
  });
});

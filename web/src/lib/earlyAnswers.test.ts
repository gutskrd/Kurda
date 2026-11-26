import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTokenStorage } from './tokenStorage';
import { API_URL } from './config';

/** An access token whose payload says it runs out `inSeconds` from now; the signature is never read here. */
function token(inSeconds: number, who = 'u1'): string {
  const payload = btoa(JSON.stringify({ sub: who, exp: Math.floor(Date.now() / 1000) + inSeconds }));
  return `x.${payload.replace(/=+$/, '')}.y`;
}

const ok = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

async function fresh(): Promise<typeof import('./earlyAnswers')> {
  vi.resetModules();
  return import('./earlyAnswers');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('early answers', () => {
  it('asks the frame’s and the page’s first questions, with the session’s token', async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => ok({}));
    vi.stubGlobal('fetch', fetch);
    const { startEarlyAnswers } = await fresh();
    const access = token(900);
    startEarlyAnswers('/app/learn', access);
    const asked = fetch.mock.calls.map(([url]) => String(url).slice(API_URL.length));
    expect(asked).toEqual(expect.arrayContaining(['/me', '/me/social', '/chat/unread', '/courses', '/me/daily-goal']));
    expect(asked).not.toContain('/shop');
    expect(new Headers(fetch.mock.calls[0]![1]?.headers).get('authorization')).toBe(`Bearer ${access}`);
  });

  it('asks nothing for a visitor, outside the app, or with a token about to run out', async () => {
    const fetch = vi.fn(async () => ok({}));
    vi.stubGlobal('fetch', fetch);
    const { startEarlyAnswers } = await fresh();
    startEarlyAnswers('/app', undefined);
    startEarlyAnswers('/login', token(900));
    startEarlyAnswers('/app', token(30));
    startEarlyAnswers('/app', 'not-a-token');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('hands an answer over once, and only to a request with the same token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok({ n: 1 })));
    const { startEarlyAnswers, takeEarlyAnswer } = await fresh();
    const access = token(900);
    startEarlyAnswers('/app', access);
    expect(takeEarlyAnswer('/me/social', token(900, 'u2'))).toBeNull();
    expect(takeEarlyAnswer('/me/quests', access)).not.toBeNull();
    expect(takeEarlyAnswer('/me/quests', access)).toBeNull();
    expect(takeEarlyAnswer('/nowhere', access)).toBeNull();
  });

  it('lets an answer that has waited too long go, so the page asks afresh', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok({})));
    const { startEarlyAnswers, takeEarlyAnswer } = await fresh();
    const access = token(900);
    startEarlyAnswers('/app', access);
    // Let every answer arrive, then come back six seconds later.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const later = Date.now() + 6000;
    vi.spyOn(Date, 'now').mockReturnValue(later);
    expect(takeEarlyAnswer('/me', access)).toBeNull();
  });

  it('is what the client answers with, so the page’s request is not sent again', async () => {
    const fetch = vi.fn(async (url: string) => ok({ url: url.slice(API_URL.length) }));
    vi.stubGlobal('fetch', fetch);
    const { startEarlyAnswers } = await fresh();
    // The client from the same fresh set of modules, so it reads the same answers.
    const { ApiClient } = await import('./api');
    const access = token(900);
    const storage = createTokenStorage();
    storage.set({ accessToken: access, refreshToken: 'r' });
    startEarlyAnswers('/app/letters', access);
    const sent = fetch.mock.calls.length;
    const client = new ApiClient(API_URL, storage, () => undefined);
    const res = await client.get<{ url: string }>('/letters?landings=1');
    expect(res.ok && res.data.url).toBe('/letters?landings=1');
    expect(fetch).toHaveBeenCalledTimes(sent);
    // Asked again, it goes to the server.
    await client.get('/letters?landings=1');
    expect(fetch).toHaveBeenCalledTimes(sent + 1);
  });
});

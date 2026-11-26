import { describe, expect, it, vi } from 'vitest';
import { ApiClient } from './client';
import { FIRST_QUESTIONS, lastsAMinute } from './firstQuestions';
import { MemoryTokenStorage } from './types';

const ok = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

/** An access token whose payload says it runs out `inSeconds` from now; the signature is never read here. */
const token = (inSeconds: number): string =>
  `x.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + inSeconds })).replace(/=+$/, '')}.y`;

async function signedIn(fetchFn: ReturnType<typeof vi.fn>, accessToken: string) {
  const storage = new MemoryTokenStorage();
  await storage.set({ accessToken, refreshToken: 'ref-1' });
  return new ApiClient({ baseUrl: 'https://api.test', storage, onLogout: vi.fn(), fetchFn: fetchFn as never });
}

describe('the first questions, asked beside the session check', () => {
  it('are answered once from what was already asked, with the same token', async () => {
    const fetchFn = vi.fn(async (url: string, _init?: RequestInit) => ok({ url }));
    const access = token(900);
    const client = await signedIn(fetchFn, access);
    client.prefetch(FIRST_QUESTIONS, access);
    expect(fetchFn).toHaveBeenCalledTimes(FIRST_QUESTIONS.length);
    expect(fetchFn.mock.calls[0]![1]).toMatchObject({ method: 'GET', headers: { authorization: `Bearer ${access}` } });
    const res = await client.get<{ url: string }>('/me/social');
    expect(res).toEqual({ ok: true, data: { url: 'https://api.test/me/social' } });
    expect(fetchFn).toHaveBeenCalledTimes(FIRST_QUESTIONS.length);
    // A second ask is the screen's own.
    await client.get('/me/social');
    expect(fetchFn).toHaveBeenCalledTimes(FIRST_QUESTIONS.length + 1);
  });

  it('are not handed to a request sent with another token, nor once they have waited too long', async () => {
    const fetchFn = vi.fn(async () => ok({}));
    const access = token(900);
    const client = await signedIn(fetchFn, 'another-token');
    client.prefetch(['/me/quests'], access);
    await client.get('/me/quests');
    expect(fetchFn).toHaveBeenCalledTimes(2);

    const fresh = await signedIn(fetchFn, access);
    fresh.prefetch(['/me/league'], access);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const later = Date.now() + 6000;
    const now = vi.spyOn(Date, 'now').mockReturnValue(later);
    await fresh.get('/me/league');
    now.mockRestore();
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it('are asked only with a token that has more than a minute left', () => {
    expect(lastsAMinute(token(900))).toBe(true);
    expect(lastsAMinute(token(30))).toBe(false);
    expect(lastsAMinute('not-a-token')).toBe(false);
  });
});

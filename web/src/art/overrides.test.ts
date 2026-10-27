import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  ART_OVERRIDES_KEY,
  ART_OVERRIDES_STALE_MS,
  artOverride,
  artOverridesVersion,
  currentArtOverrides,
  parseArtOverrides,
  refreshArtOverrides,
  resetArtOverridesForTests,
  startArtOverrides,
  useArtOverride,
} from './overrides';
import { jsonResponse } from '../test/utils';

const AGIR = 'https://cdn.test/art/badge-agir.png';
const AGIR_ZER = 'https://cdn.test/art/badge-agir-zer.png';
const GIR = 'https://cdn.test/art/rank-gir.png';

/** What `GET /art/overrides` answers, and every request it was asked. */
function serve(answer: () => Promise<Response> | Response): Array<{ url: string; init?: RequestInit }> {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return answer();
    }),
  );
  return calls;
}

/** This browser's copy, as an earlier visit left it. */
function cached(version: string, overrides: Record<string, string>): void {
  localStorage.setItem(ART_OVERRIDES_KEY, JSON.stringify({ version, overrides }));
}

beforeEach(() => {
  resetArtOverridesForTests();
});

afterEach(() => {
  resetArtOverridesForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the list of replaced pictures', () => {
  it('has nothing in it before any list has arrived, so every slot draws its own art', () => {
    expect(currentArtOverrides()).toEqual({});
    expect(artOverridesVersion()).toBeNull();
    expect(artOverride('badge', 'agir', 'zer')).toBeNull();
  });

  it('asks the API once, without the session, and keeps a copy in this browser', async () => {
    // a signed-in browser: the list is public, so the token stays where it is
    localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'secret-access', refreshToken: 'secret-refresh' }));
    const calls = serve(() => jsonResponse(200, { version: 'v1', overrides: { 'badge:agir': AGIR, 'rank:gir': GIR } }));
    await refreshArtOverrides();

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toMatch(/\/art\/overrides$/);
    expect(calls[0]!.init?.method).toBe('GET');
    expect(JSON.stringify(calls[0]!.init?.headers ?? {})).not.toMatch(/authorization|secret-access/i);

    expect(artOverridesVersion()).toBe('v1');
    expect(artOverride('rank', 'gir')).toBe(GIR);
    expect(JSON.parse(localStorage.getItem(ART_OVERRIDES_KEY)!)).toEqual({ version: 'v1', overrides: { 'badge:agir': AGIR, 'rank:gir': GIR } });
  });

  it('finds a level’s own picture first, then the one for every level', async () => {
    serve(() => jsonResponse(200, { version: 'v1', overrides: { 'badge:agir': AGIR, 'badge:agir:zer': AGIR_ZER } }));
    await refreshArtOverrides();
    expect(artOverride('badge', 'agir', 'zer')).toBe(AGIR_ZER);
    expect(artOverride('badge', 'agir', 'ziv')).toBe(AGIR);
    expect(artOverride('badge', 'agir')).toBe(AGIR);
    expect(artOverride('badge', 'ders', 'zer')).toBeNull();
  });

  it('draws from this browser’s copy until the API answers', async () => {
    cached('v1', { 'rank:gir': GIR });
    let answer!: (res: Response) => void;
    serve(() => new Promise<Response>((resolve) => (answer = resolve)));
    const loading = refreshArtOverrides();
    expect(artOverride('rank', 'gir')).toBe(GIR);
    answer(jsonResponse(200, { version: 'v2', overrides: { 'rank:gir': 'https://cdn.test/art/rank-gir-2.png' } }));
    await loading;
    expect(artOverride('rank', 'gir')).toBe('https://cdn.test/art/rank-gir-2.png');
    expect(artOverridesVersion()).toBe('v2');
  });

  it.each([
    ['a server error', () => jsonResponse(500, { code: 'INTERNAL', message: 'boom' })],
    ['a route the server does not have yet', () => jsonResponse(404, { code: 'NOT_FOUND', message: 'route not found' })],
    ['no network', () => Promise.reject(new TypeError('failed to fetch'))],
    ['an answer that is not JSON', () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } })],
    ['an answer of the wrong shape', () => jsonResponse(200, { overrides: ['rank:gir'] })],
  ])('keeps the last good list after %s, and never throws', async (_what, answer) => {
    cached('v1', { 'rank:gir': GIR });
    serve(answer);
    await expect(refreshArtOverrides()).resolves.toBeUndefined();
    expect(artOverride('rank', 'gir')).toBe(GIR);
    expect(artOverridesVersion()).toBe('v1');
    expect(JSON.parse(localStorage.getItem(ART_OVERRIDES_KEY)!).version).toBe('v1');
  });

  it('changes nothing for the version it already has, and everything for a new one', async () => {
    cached('v1', { 'rank:gir': GIR });
    const before = currentArtOverrides();
    let version = 'v1';
    serve(() => jsonResponse(200, { version, overrides: version === 'v1' ? { 'rank:gir': GIR } : { 'league:kani': 'https://cdn.test/art/kani.png' } }));
    const { result } = renderHook(() => useArtOverride('rank', 'gir'));
    let renders = 0;
    renderHook(() => {
      renders++;
      return useArtOverride('league', 'kani');
    });
    const rendered = renders;

    await act(() => refreshArtOverrides());
    expect(currentArtOverrides()).toBe(before);
    expect(renders).toBe(rendered);

    version = 'v2';
    await act(() => refreshArtOverrides());
    // a list is replaced whole: a slot it no longer names draws its own art again
    expect(result.current).toBeNull();
    expect(artOverride('league', 'kani')).toBe('https://cdn.test/art/kani.png');
    expect(JSON.parse(localStorage.getItem(ART_OVERRIDES_KEY)!).version).toBe('v2');
  });

  it('draws the replacement in a component the moment the list arrives', async () => {
    serve(() => jsonResponse(200, { version: 'v1', overrides: { 'badge:agir:zer': AGIR_ZER } }));
    const { result } = renderHook(() => useArtOverride('badge', 'agir', 'zer'));
    expect(result.current).toBeNull();
    await act(() => refreshArtOverrides());
    expect(result.current).toBe(AGIR_ZER);
  });

  it('leaves out names that are not slots and pictures that are not web addresses', () => {
    const list = parseArtOverrides({
      version: 'v3',
      overrides: {
        'rank:gir': GIR,
        'nonsense': 'https://cdn.test/a.png',
        'rank:Gir!': 'https://cdn.test/b.png',
        'league:kani': 'javascript:alert(1)',
        'league:cem': '/relative/path.png',
        'frame:sterk': 42,
      },
    });
    expect(list).toEqual({ version: 'v3', overrides: { 'rank:gir': GIR } });
    expect(parseArtOverrides(null)).toBeNull();
    expect(parseArtOverrides({ version: 3, overrides: {} })).toBeNull();
    expect(parseArtOverrides({ version: 'v1', overrides: [] })).toBeNull();
  });

  it('starts with nothing when this browser’s copy is garbage', () => {
    localStorage.setItem(ART_OVERRIDES_KEY, '{not json');
    expect(currentArtOverrides()).toEqual({});
    expect(artOverridesVersion()).toBeNull();
  });

  it('works for the visit when storage refuses to be read or written', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    serve(() => jsonResponse(200, { version: 'v1', overrides: { 'rank:gir': GIR } }));
    expect(currentArtOverrides()).toEqual({});
    await refreshArtOverrides();
    expect(artOverride('rank', 'gir')).toBe(GIR);
  });

  it('asks once at the start, and again when the tab comes back only once the list is a quarter of an hour old', async () => {
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const calls = serve(() => jsonResponse(200, { version: 'v1', overrides: {} }));

    startArtOverrides();
    startArtOverrides();
    expect(calls).toHaveLength(1);
    await vi.waitFor(() => expect(artOverridesVersion()).toBe('v1'));

    // back after five minutes: the list is fresh enough
    now += 5 * 60_000;
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(calls).toHaveLength(1);

    // a quarter of an hour on, but still out of sight
    now += ART_OVERRIDES_STALE_MS;
    const state = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(calls).toHaveLength(1);

    // in view again: asked once, however many ways the page hears of it
    state.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
    expect(calls).toHaveLength(2);
  });
});

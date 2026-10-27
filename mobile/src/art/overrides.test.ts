/**
 * The list of uploaded pictures the app keeps: from the copy on the phone
 * until the server answers, the server's answer once it does, the last good
 * list whatever goes wrong after that, and asked for again when the app comes
 * back to the front after a quarter of an hour.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ArtOverridesResponse } from '@kurda/shared';
import type { DeviceStore } from '../keyboard/deviceStore';
import { fail, fakeClient, ok } from '../reports/testing/auth';
import { avatarAssetUrl, defaultAvatarKey, profilePictureUrl } from '../profile/cosmetics';
import {
  ART_OVERRIDES_KEY,
  ART_OVERRIDES_STALE_MS,
  artOverride,
  artOverrides,
  refreshArtOverrides,
  resetArtOverrides,
  restoreArtOverrides,
  startArtOverrides,
} from './overrides';

const CDN = 'https://media.hevalo.app/art';
const GIR = `${CDN}/rank-gir.png`;
const DERS = `${CDN}/badge-ders.png`;
const DERS_ZER = `${CDN}/badge-ders-zer.png`;

/** The phone's storage, kept in a map a test can read; `broken` makes every read and write fail, as a full disk would. */
function store(seed: ArtOverridesResponse | string | null = null, broken = false): DeviceStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  if (seed !== null) data.set(ART_OVERRIDES_KEY, typeof seed === 'string' ? seed : JSON.stringify(seed));
  return {
    data,
    get: async (k) => {
      if (broken) throw new Error('storage unavailable');
      return data.get(k) ?? null;
    },
    set: async (k, v) => {
      if (broken) throw new Error('storage unavailable');
      data.set(k, v);
    },
    remove: async (k) => {
      data.delete(k);
    },
  };
}

const answering = (body: ArtOverridesResponse) => fakeClient({ 'GET /art/overrides': ok(body) });

/** An app-state that the test moves to the front and back by hand. */
function appState() {
  const listeners = new Set<(state: 'active' | 'background' | 'inactive') => void>();
  return {
    addEventListener: (_type: 'change', listener: (state: 'active' | 'background' | 'inactive') => void) => {
      listeners.add(listener as never);
      return { remove: () => listeners.delete(listener as never) };
    },
    move: (state: 'active' | 'background' | 'inactive') => {
      for (const l of [...listeners]) l(state);
    },
    get listening() {
      return listeners.size;
    },
  };
}

afterEach(() => {
  resetArtOverrides();
});

describe('the list of uploaded pictures', () => {
  it('draws the art that ships until there is a list', () => {
    expect(artOverrides()).toEqual({});
    expect(artOverride('rank', 'gir')).toBeNull();
  });

  it('starts from the copy kept on the phone', async () => {
    await restoreArtOverrides(store({ version: 'v1', overrides: { 'rank:gir': GIR } }));
    expect(artOverride('rank', 'gir')).toBe(GIR);
  });

  it('takes the server’s answer, and keeps it on the phone for the next start', async () => {
    const phone = store();
    await refreshArtOverrides(answering({ version: 'v2', overrides: { 'rank:gir': GIR, 'badge:ders': DERS } }), phone);
    expect(artOverride('rank', 'gir')).toBe(GIR);
    expect(artOverride('badge', 'ders')).toBe(DERS);
    expect(JSON.parse(phone.data.get(ART_OVERRIDES_KEY)!)).toEqual({ version: 'v2', overrides: { 'rank:gir': GIR, 'badge:ders': DERS } });
  });

  it('looks a level’s own picture up first, then the one for every level', async () => {
    await refreshArtOverrides(answering({ version: 'v1', overrides: { 'badge:ders': DERS, 'badge:ders:zer': DERS_ZER } }), store());
    expect(artOverride('badge', 'ders', 'zer')).toBe(DERS_ZER);
    expect(artOverride('badge', 'ders', 'ziv')).toBe(DERS);
    expect(artOverride('badge', 'ders')).toBe(DERS);
    expect(artOverride('badge', 'agir', 'zer')).toBeNull();
    expect(artOverride('badge', null)).toBeNull();
  });

  it('keeps the last good list when the server cannot be reached, refuses, throws or answers nonsense', async () => {
    const phone = store();
    await refreshArtOverrides(answering({ version: 'v1', overrides: { 'rank:gir': GIR } }), phone);
    const offline = fakeClient({ 'GET /art/overrides': { ok: false, error: { kind: 'network', message: 'network request failed' } } });
    const refused = fakeClient({ 'GET /art/overrides': fail({ status: 500, kind: 'server' }) });
    const throwing = fakeClient({
      'GET /art/overrides': () => {
        throw new Error('boom');
      },
    });
    const nonsense = fakeClient({ 'GET /art/overrides': ok({ overrides: 'none' }) });
    for (const client of [offline, refused, throwing, nonsense]) {
      await expect(refreshArtOverrides(client, phone)).resolves.toBeUndefined();
      expect(artOverride('rank', 'gir')).toBe(GIR);
    }
    expect(JSON.parse(phone.data.get(ART_OVERRIDES_KEY)!).overrides).toEqual({ 'rank:gir': GIR });
  });

  it('carries on without a copy when the phone’s storage cannot be read or written', async () => {
    const broken = store(null, true);
    await expect(restoreArtOverrides(broken)).resolves.toBeUndefined();
    await expect(refreshArtOverrides(answering({ version: 'v1', overrides: { 'rank:gir': GIR } }), broken)).resolves.toBeUndefined();
    expect(artOverride('rank', 'gir')).toBe(GIR);
  });

  it('ignores a copy on the phone that cannot be read', async () => {
    await restoreArtOverrides(store('{not json'));
    expect(artOverrides()).toEqual({});
  });

  it('never lets an older copy on the phone replace what the server said', async () => {
    await refreshArtOverrides(answering({ version: 'v2', overrides: {} }), store());
    await restoreArtOverrides(store({ version: 'v1', overrides: { 'rank:gir': GIR } }));
    expect(artOverride('rank', 'gir')).toBeNull();
  });

  it('leaves out what is not a slot or not a picture the phone can load, and resolves a site path', async () => {
    await refreshArtOverrides(
      answering({
        version: 'v1',
        overrides: { 'rank:gir': GIR, 'not a slot': GIR, 'league:kani': 'javascript:alert(1)', 'frame:gir': 42 as never, 'event:newroz': '/art/newroz.webp' },
      }),
      store(),
    );
    expect(artOverrides()).toEqual({ 'rank:gir': GIR, 'event:newroz': 'https://hevalo.app/art/newroz.webp' });
  });

  it('a removed picture brings the art back', async () => {
    const phone = store();
    await refreshArtOverrides(answering({ version: 'v1', overrides: { 'rank:gir': GIR } }), phone);
    await refreshArtOverrides(answering({ version: 'v2', overrides: {} }), phone);
    expect(artOverride('rank', 'gir')).toBeNull();
    expect(JSON.parse(phone.data.get(ART_OVERRIDES_KEY)!)).toEqual({ version: 'v2', overrides: {} });
  });
});

describe('keeping the list while the app runs', () => {
  it('reads the copy, asks the server once, and asks again on coming back to the front only after a quarter of an hour', async () => {
    let now = 1_000_000;
    const client = answering({ version: 'v2', overrides: { 'rank:gir': GIR } });
    const app = appState();
    const stop = startArtOverrides(client, { store: store({ version: 'v1', overrides: { 'league:kani': `${CDN}/kani.png` } }), appState: app, now: () => now });

    await vi.waitFor(() => expect(client.calls).toHaveLength(1));
    await vi.waitFor(() => expect(artOverride('rank', 'gir')).toBe(GIR));
    expect(client.calls[0]).toMatchObject({ method: 'GET', path: '/art/overrides' });

    // back after five minutes: the list is fresh enough
    now += 5 * 60_000;
    app.move('active');
    // in the background nothing is asked
    now += ART_OVERRIDES_STALE_MS;
    app.move('background');
    expect(client.calls).toHaveLength(1);

    // back after more than a quarter of an hour since the answer
    app.move('active');
    await vi.waitFor(() => expect(client.calls).toHaveLength(2));

    stop();
    expect(app.listening).toBe(0);
  });

  it('asks again on coming back to the front when the first request failed', async () => {
    let calls = 0;
    const client = fakeClient({
      'GET /art/overrides': () => {
        calls += 1;
        return calls === 1 ? { ok: false, error: { kind: 'network', message: 'offline' } } : ok({ version: 'v1', overrides: { 'rank:gir': GIR } });
      },
    });
    const app = appState();
    const stop = startArtOverrides(client, { store: store(), appState: app, now: () => 5_000_000 });
    await vi.waitFor(() => expect(calls).toBe(1));
    expect(artOverride('rank', 'gir')).toBeNull();
    app.move('active');
    await vi.waitFor(() => expect(artOverride('rank', 'gir')).toBe(GIR));
    stop();
  });
});

describe('default profile pictures', () => {
  const UPLOADED = `${CDN}/avatar-03.png`;

  it('knows a default avatar by its address, as the API sends it or as a whole address', () => {
    expect(defaultAvatarKey('/cosmetics/avatars/default-03.png')).toBe('default-03');
    expect(defaultAvatarKey('https://hevalo.app/cosmetics/avatars/default-03.png')).toBe('default-03');
    expect(defaultAvatarKey('https://elsewhere.example/cosmetics/avatars/default-03.png')).toBeNull();
    expect(defaultAvatarKey('https://media.hevalo.app/profile/abc.webp')).toBeNull();
    expect(defaultAvatarKey(null)).toBeNull();
  });

  it('is the uploaded picture where an admin replaced it, and the one that ships otherwise', async () => {
    expect(avatarAssetUrl('default-03')).toBe('https://hevalo.app/cosmetics/avatars/default-03.png');
    await refreshArtOverrides(answering({ version: 'v1', overrides: { 'avatar:default-03': UPLOADED } }), store());
    expect(avatarAssetUrl('default-03')).toBe(UPLOADED);
    expect(avatarAssetUrl('default-04')).toBe('https://hevalo.app/cosmetics/avatars/default-04.png');
    expect(profilePictureUrl('/cosmetics/avatars/default-03.png')).toBe(UPLOADED);
    expect(profilePictureUrl('https://hevalo.app/cosmetics/avatars/default-03.png')).toBe(UPLOADED);
  });

  it('leaves somebody’s own photo alone', async () => {
    await refreshArtOverrides(answering({ version: 'v1', overrides: { 'avatar:default-03': UPLOADED } }), store());
    expect(profilePictureUrl('https://media.hevalo.app/profile/abc.webp')).toBe('https://media.hevalo.app/profile/abc.webp');
    expect(profilePictureUrl(null)).toBeNull();
  });
});

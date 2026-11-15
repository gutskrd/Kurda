// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The token's life on a phone: made at sign-in and once each time the app
 * starts (replacing the one before), kept in the place the widget reads it,
 * taken away from the server and the phone at sign-out, and the widget asked
 * to reload whenever what it shows may have changed.
 */

const native = vi.hoisted(() => {
  const platform = { OS: 'ios' as 'ios' | 'android' };
  const appState: { listener: ((state: string) => void) | null } = { listener: null };
  const keystore = new Map<string, string>();
  const notices: { shown: Array<(n: unknown) => void>; tapped: Array<(r: unknown) => void> } = { shown: [], tapped: [] };
  return { platform, appState, keystore, notices };
});

vi.mock('react-native', () => ({
  Platform: native.platform,
  AppState: {
    addEventListener: (_: string, listener: (state: string) => void) => {
      native.appState.listener = listener;
      return { remove: () => (native.appState.listener = null) };
    },
  },
  Linking: { openSettings: vi.fn() },
}));
vi.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => native.keystore.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => void native.keystore.set(key, value),
  deleteItemAsync: async (key: string) => void native.keystore.delete(key),
}));
vi.mock('expo-notifications', () => ({
  addNotificationReceivedListener: (fn: (n: unknown) => void) => {
    native.notices.shown.push(fn);
    return { remove: () => native.notices.shown.splice(native.notices.shown.indexOf(fn), 1) };
  },
  addNotificationResponseReceivedListener: (fn: (r: unknown) => void) => {
    native.notices.tapped.push(fn);
    return { remove: () => native.notices.tapped.splice(native.notices.tapped.indexOf(fn), 1) };
  },
}));
vi.mock('./android/task', () => ({ reloadAndroidWidget: vi.fn(async () => undefined), letterWidgetTask: vi.fn() }));

const auth = vi.hoisted(() => ({
  state: { status: 'signedIn' as 'restoring' | 'signedIn' | 'signedOut', isGuest: false, user: { emailVerified: true } as { emailVerified: boolean } | null },
  client: null as unknown,
}));
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ ...auth.state, client: auth.client, baseUrl: 'https://api.test' }),
}));
vi.mock('../i18n/I18nContext', () => ({ useI18n: () => ({ locale: 'ku', t: (k: string) => k, rtl: false }) }));

import { fakeClient, fail, ok, type FakeCall } from '../reports/testing/auth';
import { reloadAndroidWidget } from './android/task';
import { APP_GROUP, WIDGET_KEYS, WIDGET_KIND } from './contract';
import { LetterWidgetSync, isLetterNotice } from './LetterWidgetSync';
import { reloadLetterWidget, resetReloadClock } from './reload';
import { ensureWidgetToken, forgetWidgetToken, removeEveryWidget, resetTokenRun } from './tokens';

/** The App Group as the iPhone's ExtensionStorage module keeps it, and the reloads asked of WidgetKit. */
const group = new Map<string, string>();
const reloads: Array<string | undefined> = [];
const extensionStorage = {
  setString: (key: string, value: string, suite: string) => {
    expect(suite).toBe(APP_GROUP);
    group.set(key, value);
  },
  get: (key: string) => group.get(key) ?? null,
  remove: (key: string) => void group.delete(key),
  reloadWidget: (kind?: string) => void reloads.push(kind),
};

let tokens = 0;
function client(routes: Record<string, unknown> = {}) {
  return fakeClient({
    'POST /letters/widget/tokens': () => ok({ token: `hvw_token${++tokens}` }),
    'DELETE /letters/widget/tokens': ok(null),
    ...(routes as Record<string, never>),
  });
}

/** A fetch that records what the widget token's own requests were. */
function recordingFetch() {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(null, { status: 204 });
  });
  return { calls, fn };
}

const posts = (calls: FakeCall[]) => calls.filter((c) => c.method === 'POST' && c.path === '/letters/widget/tokens');

beforeEach(() => {
  (globalThis as { expo?: unknown }).expo = { modules: { ExtensionStorage: extensionStorage } };
  native.platform.OS = 'ios';
  group.clear();
  native.keystore.clear();
  reloads.length = 0;
  tokens = 0;
  resetTokenRun();
  resetReloadClock();
  vi.mocked(reloadAndroidWidget).mockClear();
});

afterEach(() => {
  cleanup();
  delete (globalThis as { expo?: unknown }).expo;
});

describe('this phone’s widget token', () => {
  it('is made at sign-in and left in the App Group with the server and the app’s language, and the widget reloads', async () => {
    const api = client();
    expect(await ensureWidgetToken({ client: api, apiBase: 'https://api.test', locale: 'ku' })).toBe('made');
    expect(posts(api.calls)).toEqual([{ method: 'POST', path: '/letters/widget/tokens', body: {} }]);
    expect(group.get(WIDGET_KEYS.token)).toBe('hvw_token1');
    expect(group.get(WIDGET_KEYS.apiBase)).toBe('https://api.test');
    expect(group.get(WIDGET_KEYS.locale)).toBe('ku');
    expect(reloads).toEqual([WIDGET_KIND]);
  });

  it('is made once a run, then kept; the next run replaces it with a new one', async () => {
    const api = client();
    await ensureWidgetToken({ client: api, apiBase: 'https://api.test', locale: 'ku' });
    expect(await ensureWidgetToken({ client: api, apiBase: 'https://api.test', locale: 'ku' })).toBe('kept');
    expect(posts(api.calls)).toHaveLength(1);
    // the app starts again: a fresh token, naming the old one so the server drops it
    resetTokenRun();
    expect(await ensureWidgetToken({ client: api, apiBase: 'https://api.test', locale: 'ku' })).toBe('made');
    expect(posts(api.calls)[1]!.body).toEqual({ replaces: 'hvw_token1' });
    expect(group.get(WIDGET_KEYS.token)).toBe('hvw_token2');
  });

  it('makes one token when asked twice at once, and the second ask still sets the app’s language', async () => {
    const api = client();
    const both = await Promise.all([
      ensureWidgetToken({ client: api, apiBase: 'https://api.test', locale: 'en' }),
      ensureWidgetToken({ client: api, apiBase: 'https://api.test', locale: 'ku' }),
    ]);
    expect(both).toEqual(['made', 'kept']);
    expect(posts(api.calls)).toHaveLength(1);
    expect(group.get(WIDGET_KEYS.locale)).toBe('ku');
  });

  it('follows the app into another language without a new token', async () => {
    const api = client();
    await ensureWidgetToken({ client: api, apiBase: 'https://api.test', locale: 'ku' });
    reloads.length = 0;
    expect(await ensureWidgetToken({ client: api, apiBase: 'https://api.test', locale: 'ckb' })).toBe('kept');
    expect(group.get(WIDGET_KEYS.locale)).toBe('ckb');
    expect(reloads).toEqual([WIDGET_KIND]);
    expect(posts(api.calls)).toHaveLength(1);
  });

  it('is replaced when the widget found it refused, and the widget’s note is cleared', async () => {
    const api = client();
    await ensureWidgetToken({ client: api, apiBase: 'https://api.test', locale: 'ku' });
    group.set(WIDGET_KEYS.rejected, '1');
    expect(await ensureWidgetToken({ client: api, apiBase: 'https://api.test', locale: 'ku' })).toBe('made');
    expect(posts(api.calls)[1]!.body).toEqual({ replaces: 'hvw_token1' });
    expect(group.has(WIDGET_KEYS.rejected)).toBe(false);
  });

  it('keeps a token that works when a new one cannot be had, and does not ask again at once', async () => {
    const working = client();
    await ensureWidgetToken({ client: working, apiBase: 'https://api.test', locale: 'ku' });
    resetTokenRun();
    const down = fakeClient({ 'POST /letters/widget/tokens': fail({ kind: 'network', status: undefined }) });
    expect(await ensureWidgetToken({ client: down, apiBase: 'https://api.test', locale: 'ku' }, { now: 1_000 })).toBe('kept');
    expect(group.get(WIDGET_KEYS.token)).toBe('hvw_token1');
    expect(await ensureWidgetToken({ client: down, apiBase: 'https://api.test', locale: 'ku' }, { now: 2_000 })).toBe('kept');
    expect(posts(down.calls)).toHaveLength(1);
    // with no token at all, it says it failed, and tries again half an hour on
    group.clear();
    expect(await ensureWidgetToken({ client: down, apiBase: 'https://api.test', locale: 'ku' }, { now: 3_000 })).toBe('failed');
    expect(posts(down.calls)).toHaveLength(1);
    expect(await ensureWidgetToken({ client: down, apiBase: 'https://api.test', locale: 'ku' }, { now: 31 * 60_000 })).toBe('failed');
    expect(posts(down.calls)).toHaveLength(2);
  });

  it('is taken away at sign-out with the token itself, from the server and the phone, and the widget reloads', async () => {
    await ensureWidgetToken({ client: client(), apiBase: 'https://api.test', locale: 'ku' });
    reloads.length = 0;
    const net = recordingFetch();
    expect(await forgetWidgetToken({ fetchFn: net.fn })).toBe(true);
    expect(net.calls).toHaveLength(1);
    expect(net.calls[0]!.url).toBe('https://api.test/letters/widget/tokens/current');
    expect(net.calls[0]!.init.method).toBe('DELETE');
    expect(net.calls[0]!.init.headers).toEqual({ authorization: 'Widget hvw_token1' });
    expect(group.has(WIDGET_KEYS.token)).toBe(false);
    expect(group.has(WIDGET_KEYS.apiBase)).toBe(false);
    expect(reloads).toEqual([WIDGET_KIND]);
    // nothing left: nothing to send, nothing to reload
    expect(await forgetWidgetToken({ fetchFn: net.fn })).toBe(false);
    expect(net.calls).toHaveLength(1);
  });

  it('is forgotten on the phone even when the server cannot be reached to remove it', async () => {
    await ensureWidgetToken({ client: client(), apiBase: 'https://api.test', locale: 'ku' });
    const offline = vi.fn(async () => {
      throw new TypeError('Network request failed');
    });
    expect(await forgetWidgetToken({ fetchFn: offline })).toBe(true);
    expect(group.has(WIDGET_KEYS.token)).toBe(false);
  });

  it('is never written to the log', async () => {
    const said = vi.spyOn(console, 'log');
    const warned = vi.spyOn(console, 'warn');
    const erred = vi.spyOn(console, 'error');
    await ensureWidgetToken({ client: client(), apiBase: 'https://api.test', locale: 'ku' });
    await forgetWidgetToken({ fetchFn: recordingFetch().fn });
    const all = [...said.mock.calls, ...warned.mock.calls, ...erred.mock.calls].flat().map(String).join(' ');
    expect(all).not.toContain('hvw_');
    said.mockRestore();
    warned.mockRestore();
    erred.mockRestore();
  });

  it('is kept in the app’s own keystore on Android, where the widget is the app’s own code', async () => {
    native.platform.OS = 'android';
    await ensureWidgetToken({ client: client(), apiBase: 'https://api.test', locale: 'tr' });
    expect(native.keystore.get(WIDGET_KEYS.token)).toBe('hvw_token1');
    expect(group.size).toBe(0);
    expect(reloadAndroidWidget).toHaveBeenCalledTimes(1);
  });

  it('can be taken off every phone, after which this phone gets a new one', async () => {
    const api = client();
    await ensureWidgetToken({ client: api, apiBase: 'https://api.test', locale: 'ku' });
    expect(await removeEveryWidget({ client: api, apiBase: 'https://api.test', locale: 'ku' })).toBe(true);
    expect(api.calls.some((c) => c.method === 'DELETE' && c.path === '/letters/widget/tokens')).toBe(true);
    // the old one is gone with the rest, so the new one replaces nothing
    expect(posts(api.calls)[1]!.body).toEqual({});
    expect(group.get(WIDGET_KEYS.token)).toBe('hvw_token2');
  });
});

describe('asking the widget to reload', () => {
  it('asks WidgetKit for the letter widget’s timeline on iPhone, and is quiet when coming back to the app often', () => {
    reloadLetterWidget();
    expect(reloads).toEqual([WIDGET_KIND]);
    reloadLetterWidget({ unlessWithinMs: 60_000 });
    expect(reloads).toHaveLength(1);
    reloadLetterWidget();
    expect(reloads).toHaveLength(2);
  });

  it('does nothing in a build without the widget', () => {
    delete (globalThis as { expo?: unknown }).expo;
    expect(() => reloadLetterWidget()).not.toThrow();
  });

  it('folds requests made while Android is drawing into one more after it', async () => {
    native.platform.OS = 'android';
    let finish: () => void = () => undefined;
    vi.mocked(reloadAndroidWidget).mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)));
    reloadLetterWidget();
    reloadLetterWidget();
    reloadLetterWidget();
    expect(reloadAndroidWidget).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    await act(async () => undefined);
    expect(reloadAndroidWidget).toHaveBeenCalledTimes(2);
  });
});

describe('keeping the widget in step with the app', () => {
  const settle = () => act(async () => new Promise((r) => setTimeout(r, 0)));

  beforeEach(() => {
    auth.state = { status: 'signedIn', isGuest: false, user: { emailVerified: true } };
    native.notices.shown.length = 0;
    native.notices.tapped.length = 0;
  });

  it('makes the token at sign-in and takes it away at sign-out, however the sign-out came', async () => {
    const api = client();
    auth.client = api;
    const net = recordingFetch();
    vi.stubGlobal('fetch', net.fn);
    const view = render(<LetterWidgetSync />);
    await settle();
    expect(group.get(WIDGET_KEYS.token)).toBe('hvw_token1');
    auth.state = { status: 'signedOut', isGuest: false, user: null };
    view.rerender(<LetterWidgetSync />);
    await settle();
    expect(group.has(WIDGET_KEYS.token)).toBe(false);
    expect(net.calls[0]!.url).toBe('https://api.test/letters/widget/tokens/current');
    vi.unstubAllGlobals();
  });

  it('gives a guest no token, and waits while the session is still being restored', async () => {
    const api = client();
    auth.client = api;
    auth.state = { status: 'restoring', isGuest: false, user: null };
    const view = render(<LetterWidgetSync />);
    await settle();
    auth.state = { status: 'signedIn', isGuest: true, user: { emailVerified: false } };
    view.rerender(<LetterWidgetSync />);
    await settle();
    expect(posts(api.calls)).toHaveLength(0);
    expect(group.size).toBe(0);
  });

  it('reloads the widget when a letter’s notification arrives or is tapped, and for nothing else', async () => {
    auth.client = client();
    render(<LetterWidgetSync />);
    await settle();
    reloads.length = 0;
    native.notices.shown.forEach((fn) => fn({ request: { content: { data: { kind: 'gift', giftId: 'g' } } } }));
    expect(reloads).toEqual([]);
    native.notices.shown.forEach((fn) => fn({ request: { content: { data: { kind: 'letter', threadId: 't1', fromUserId: 'u1' } } } }));
    expect(reloads).toEqual([WIDGET_KIND]);
    native.notices.tapped.forEach((fn) => fn({ notification: { request: { content: { data: { kind: 'letter', threadId: 't1' } } } } }));
    expect(reloads).toEqual([WIDGET_KIND, WIDGET_KIND]);
    expect(isLetterNotice(null)).toBe(false);
  });

  it('reloads the widget coming back to the app, at most every ten minutes', async () => {
    auth.client = client();
    render(<LetterWidgetSync />);
    await settle();
    resetReloadClock();
    reloads.length = 0;
    await act(async () => native.appState.listener?.('active'));
    await settle();
    expect(reloads).toEqual([WIDGET_KIND]);
    await act(async () => native.appState.listener?.('active'));
    await settle();
    expect(reloads).toEqual([WIDGET_KIND]);
  });
});

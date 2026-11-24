import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Settings } from '../pages/Settings';
import { renderApp, jsonResponse } from '../test/utils';
import { en } from '../i18n/en';

const me = { user: { id: '1', email: 'a@b.com', username: 'ada', displayName: null, emailVerified: true, bio: null, xp: 0, streak: { current: 0, longest: 0, freezes: 0, lastActiveOn: null }, profileVisibility: 'members', profilePhotoUrl: null, createdAt: '2026-01-01T00:00:00.000Z' } };

const realLocation = window.location;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
  Object.defineProperty(window, 'location', { value: realLocation, configurable: true, writable: true });
  Reflect.deleteProperty(navigator, 'storage');
});

/** A server whose copy of your data moves through the states it is told to, recording what was asked. */
function exportServer(states: Array<Record<string, unknown> | { error: string }>): ReturnType<typeof vi.fn> {
  let at = 0;
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/me/export') && init?.method === 'POST') {
      at = Math.min(at + 1, states.length - 1);
      return jsonResponse(202, { requested: true });
    }
    if (url.endsWith('/me/export')) {
      const state = states[at]!;
      if ('error' in state) return jsonResponse(503, { code: state.error, message: 'x' });
      return jsonResponse(200, state);
    }
    return jsonResponse(200, url.endsWith('/me') ? me : {});
  });
}

describe('Settings: storage and data', () => {
  it('asks for a copy, says it is being prepared, keeps asking after it, and offers it once it is ready', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const ready = { status: 'ready', requestedAt: '2026-11-20T09:00:00.000Z', downloadUrl: 'https://files.example/copy.json' };
    // Nothing yet; once asked for, it is still being made at the first look and ready at the next.
    let asked = false;
    let looks = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (!url.endsWith('/me/export')) return jsonResponse(200, url.endsWith('/me') ? me : {});
        if (init?.method === 'POST') {
          asked = true;
          return jsonResponse(202, { requested: true });
        }
        if (!asked) return jsonResponse(200, { status: 'none' });
        looks += 1;
        return jsonResponse(200, looks === 1 ? { status: 'pending', requestedAt: '2026-11-20T09:00:00.000Z' } : ready);
      }),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp(<Settings />, ['/app/settings/storage']);

    expect(await screen.findByText(en['settings.data.help'])).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: en['settings.data.request'] }));
    expect(await screen.findByText(en['settings.data.preparing'])).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_100);
    });
    expect(await screen.findByRole('button', { name: en['settings.data.download'] })).toBeInTheDocument();
    expect(screen.getByText('Made on November 20, 2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en['settings.data.again'] })).toBeInTheDocument();
  });

  it('downloads with a fresh link, which the browser saves as a file', async () => {
    const assign = vi.fn();
    Object.defineProperty(window, 'location', { value: { ...realLocation, assign }, configurable: true, writable: true });
    const fetchMock = exportServer([{ status: 'ready', requestedAt: '2026-11-20T09:00:00.000Z', downloadUrl: 'https://files.example/fresh.json' }]);
    vi.stubGlobal('fetch', fetchMock);
    renderApp(<Settings />, ['/app/settings/storage']);

    await userEvent.click(await screen.findByRole('button', { name: en['settings.data.download'] }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://files.example/fresh.json'));
    // The link is asked for again at the press, not taken from when the page opened.
    expect(fetchMock.mock.calls.filter(([url, init]) => String(url).endsWith('/me/export') && (init as RequestInit | undefined)?.method !== 'POST')).toHaveLength(2);
  });

  it('says so when a new copy the same day hands back the one already made', async () => {
    const ready = { status: 'ready', requestedAt: '2026-11-20T09:00:00.000Z', downloadUrl: 'https://files.example/copy.json' };
    vi.stubGlobal('fetch', exportServer([ready, ready]));
    renderApp(<Settings />, ['/app/settings/storage']);

    await userEvent.click(await screen.findByRole('button', { name: en['settings.data.again'] }));
    expect(await screen.findByText(en['settings.data.oncePerDay'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en['settings.data.download'] })).toBeInTheDocument();
  });

  it('says plainly when copies cannot be made right now', async () => {
    vi.stubGlobal('fetch', exportServer([{ error: 'EXPORT_NOT_AVAILABLE' }]));
    renderApp(<Settings />, ['/app/settings/storage']);
    expect(await screen.findByText(en['error.code.exportNotAvailable'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: en['settings.data.request'] })).not.toBeInTheDocument();
  });

  it('clears what only makes Hevalo faster, and keeps sign-in, preferences and drafts', async () => {
    vi.stubGlobal('fetch', exportServer([{ status: 'none' }]));
    const estimate = vi.fn().mockResolvedValueOnce({ usage: 2_400_000 }).mockResolvedValue({ usage: 300_000 });
    Object.defineProperty(navigator, 'storage', { value: { estimate }, configurable: true });
    localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'b' }));
    localStorage.setItem('hevalo_theme', 'light');
    localStorage.setItem('hevalo_letter_drafts', '{}');
    localStorage.setItem('hevalo.art-overrides.v1', JSON.stringify({ version: 'v1', overrides: {} }));
    sessionStorage.setItem('hevalo_recent_searches', JSON.stringify(['rojda']));
    renderApp(<Settings />, ['/app/settings/storage']);

    expect(await screen.findByText('2.4 MB')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: en['settings.cache.clear'] }));
    expect(await screen.findByText(en['settings.cache.cleared'])).toBeInTheDocument();
    expect(localStorage.getItem('hevalo.art-overrides.v1')).toBeNull();
    expect(sessionStorage.getItem('hevalo_recent_searches')).toBeNull();
    expect(localStorage.getItem('hevalo_tokens')).not.toBeNull();
    expect(localStorage.getItem('hevalo_theme')).toBe('light');
    expect(localStorage.getItem('hevalo_letter_drafts')).toBe('{}');
    // The size counts down to what is left, and says the final figure to a screen reader.
    expect(await screen.findByLabelText('300 kB')).toBeInTheDocument();
  });
});

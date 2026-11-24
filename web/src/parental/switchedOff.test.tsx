import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { OPEN_CONTROLS, type ParentalControls, type SupervisionState } from '@kurda/shared';
import { renderApp, jsonResponse } from '../test/utils';
import { Messages } from '../pages/Messages';
import { LettersPage } from '../letters/LettersPage';
import { LetterThreadPage } from '../letters/LetterThreadPage';
import { DmThread } from '../chat/DmThread';
import { en } from '../i18n/en';
import { SupervisionProvider } from './Supervision';
import { AppGate } from '../components/AppGate';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const supervision = (controls: Partial<ParentalControls>): SupervisionState => ({
  controls: { ...OPEN_CONTROLS, ...controls },
  minutesToday: 0,
  timeZone: 'UTC',
  paused: null,
  resumesAt: null,
});

/**
 * Signed in as a supervised teen, answering `routes` by path and anything else with an empty answer. Pages sit in the
 * app's gate, as in the app, so they open once the account is known.
 */
function teen(state: SupervisionState, routes: Record<string, () => Response> = {}): ReturnType<typeof vi.fn> {
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'b' }));
  const fetchMock = vi.fn(async (url: string) => {
    const path = new URL(url).pathname;
    if (routes[path]) return routes[path]!();
    if (path === '/me') return jsonResponse(200, { user: { id: 't', email: 't@b.c', username: 'roj', displayName: null, emailVerified: true, minor: true, supervision: state } });
    return jsonResponse(200, {});
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const asked = (fetchMock: ReturnType<typeof vi.fn>, prefix: string): number => fetchMock.mock.calls.filter(([url]) => new URL(String(url)).pathname.startsWith(prefix)).length;

describe('a part of Hevalo a parent switched off', () => {
  it('shows Messages as switched off, without reading a single conversation', async () => {
    const fetchMock = teen(supervision({ chat: false }));
    renderApp(<AppGate><Messages /></AppGate>, ['/app/messages']);

    expect(await screen.findByText(en['parental.off'])).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: en['chat.title'], level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: en['parental.seeControls'] })).toHaveAttribute('href', '/app/settings/parental');
    expect(asked(fetchMock, '/chat')).toBe(0);
  });

  it('shows an open conversation as switched off too, wherever it is open', async () => {
    const fetchMock = teen(supervision({ chat: false }));
    renderApp(<AppGate><DmThread otherId="u2" otherName="zana" onSent={() => undefined} /></AppGate>, ['/app/messages?to=u2']);
    expect(await screen.findByText(en['parental.off'])).toBeInTheDocument();
    expect(asked(fetchMock, '/chat')).toBe(0);
  });

  it('shows Letters and a correspondence as switched off, without reading them', async () => {
    const fetchMock = teen(supervision({ letters: false }));
    const { unmount } = renderApp(<AppGate><LettersPage /></AppGate>, ['/app/letters']);
    expect(await screen.findByText(en['parental.off'])).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: en['letters.title'], level: 1 })).toBeInTheDocument();
    unmount();

    renderApp(<AppGate><LetterThreadPage /></AppGate>, ['/app/letters/t1']);
    expect(await screen.findByText(en['parental.off'])).toBeInTheDocument();
    expect(asked(fetchMock, '/letters')).toBe(0);
  });

  it('turns to the calm line when reading meets a parent’s switch the app had not heard of, and stops asking', async () => {
    const fetchMock = teen(supervision({}), {
      '/chat/conversations': () => jsonResponse(403, { code: 'PARENTAL_BLOCKED', message: 'your parent turned this off', details: { control: 'chat' } }),
    });
    renderApp(
      <AppGate>
        <SupervisionProvider>
          <Messages />
        </SupervisionProvider>
      </AppGate>,
      ['/app/messages'],
    );
    expect(await screen.findByText(en['parental.off'])).toBeInTheDocument();
    const reads = asked(fetchMock, '/chat/conversations');
    expect(reads).toBeGreaterThan(0);
    // No error, and nothing asked again.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 300));
    await waitFor(() => expect(asked(fetchMock, '/chat/conversations')).toBe(reads));
  });
});

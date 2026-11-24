import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, screen } from '@testing-library/react';
import { useNavigate } from 'react-router-dom';
import { OPEN_CONTROLS, type SupervisionState } from '@kurda/shared';
import { renderApp, jsonResponse } from '../test/utils';
import { Composer } from '../chat/Composer';
import { en } from '../i18n/en';
import { BEAT_MS, PauseGate, SupervisionProvider, startUsageBeat } from './Supervision';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const supervision = (over: Partial<SupervisionState> = {}): SupervisionState => ({
  controls: { ...OPEN_CONTROLS, dailyLimitMinutes: 30, bedtime: { from: '21:00', to: '07:00' } },
  minutesToday: 12,
  timeZone: 'UTC',
  paused: null,
  resumesAt: null,
  ...over,
});
const account = (state: SupervisionState | null) => ({
  user: { id: 't', email: 't@b.com', username: 'roj', displayName: 'Roj', emailVerified: true, minor: true, supervision: state },
});

const BEDTIME = supervision({ paused: 'bedtime', resumesAt: '2099-01-02T07:00:00.000Z' });

/** Signed in as a teen, with /me answering `state` and each usage beat answering `beat`. */
function teenServer(state: SupervisionState | null, beat: () => SupervisionState | null = () => state): ReturnType<typeof vi.fn> {
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'b' }));
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith('/me/usage')) {
      const next = beat();
      return next ? jsonResponse(200, next) : new Response(null, { status: 204 });
    }
    return jsonResponse(200, url.endsWith('/me') ? account(state) : {});
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const beats = (fetchMock: ReturnType<typeof vi.fn>): unknown[] =>
  fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/me/usage')).map(([, init]) => JSON.parse(String((init as RequestInit).body)));

/** The app as the gate sees it, with a way to move between pages. */
function App(): React.JSX.Element {
  const navigate = useNavigate();
  return (
    <SupervisionProvider>
      <PauseGate>
        <p>The app</p>
        <button type="button" onClick={() => navigate('/app')}>
          Home
        </button>
      </PauseGate>
    </SupervisionProvider>
  );
}

describe('the usage beat', () => {
  it('counts only time the page is in view, once a minute', () => {
    vi.useFakeTimers();
    const beat = vi.fn();
    let visible: DocumentVisibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visible);
    const stop = startUsageBeat(beat);

    vi.advanceTimersByTime(BEAT_MS - 5_000);
    expect(beat).not.toHaveBeenCalled();
    visible = 'hidden';
    vi.advanceTimersByTime(10 * BEAT_MS);
    expect(beat).not.toHaveBeenCalled();
    visible = 'visible';
    vi.advanceTimersByTime(5_000);
    expect(beat).toHaveBeenCalledTimes(1);
    stop();
    vi.advanceTimersByTime(10 * BEAT_MS);
    expect(beat).toHaveBeenCalledTimes(1);
  });

  it('beats with the device’s time zone for a supervised teen, and stops when the server says supervision ended', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = teenServer(supervision(), () => null);
    renderApp(<App />, ['/app']);
    expect(await screen.findByText('The app')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(BEAT_MS + 6_000);
    });
    expect(beats(fetchMock)).toEqual([{ timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * BEAT_MS);
    });
    expect(beats(fetchMock)).toHaveLength(1);
  });

  it('never beats for anyone who is not supervised', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = teenServer(null);
    renderApp(<App />, ['/app']);
    expect(await screen.findByText('The app')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3 * BEAT_MS);
    });
    expect(beats(fetchMock)).toEqual([]);
  });
});

describe('the pause screen', () => {
  it('stands in for the app at bedtime, saying until when, with the way to see why and to sign out', async () => {
    teenServer(BEDTIME);
    renderApp(<App />, ['/app']);

    expect(await screen.findByRole('heading', { name: en['parental.pause.bedtimeTitle'] })).toBeInTheDocument();
    expect(screen.getByText('Your parent set Hevalo to rest until 7:00 AM.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en['parental.title'] })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en['settings.sessions.signOut'] })).toBeInTheDocument();
    expect(screen.queryByText('The app')).not.toBeInTheDocument();
  });

  it('says how much of the day was used when the limit is reached', async () => {
    teenServer(supervision({ paused: 'limit', minutesToday: 30, resumesAt: '2099-01-02T00:00:00.000Z' }));
    renderApp(<App />, ['/app']);
    expect(await screen.findByRole('heading', { name: en['parental.pause.limitTitle'] })).toBeInTheDocument();
    expect(screen.getByText('You’ve used today’s 30 minutes. Hevalo opens again at midnight.')).toBeInTheDocument();
  });

  it('leaves the teen’s own parental page open, so they can see what was set', async () => {
    teenServer(BEDTIME);
    renderApp(<App />, ['/app/settings/parental']);
    expect(await screen.findByText('The app')).toBeInTheDocument();
  });

  it('lets a lesson already open be finished, and comes once it is left', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let paused = false;
    teenServer(supervision(), () => (paused ? BEDTIME : supervision()));
    renderApp(<App />, ['/app/learn/lesson/l1']);
    expect(await screen.findByText('The app')).toBeInTheDocument();

    paused = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BEAT_MS + 6_000);
    });
    expect(screen.getByText('The app')).toBeInTheDocument();
    act(() => screen.getByRole('button', { name: 'Home' }).click());
    expect(await screen.findByRole('heading', { name: en['parental.pause.bedtimeTitle'] })).toBeInTheDocument();
  });

  it('comes at once when a write meets the pause, without waiting for the next beat', async () => {
    const fetchMock = teenServer(supervision());
    const answer = fetchMock.getMockImplementation() as (url: string, init?: RequestInit) => Promise<Response>;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
      init?.method === 'POST' && url.endsWith('/chat/send')
        ? jsonResponse(403, { code: 'PARENTAL_PAUSED', message: 'resting', details: { paused: 'bedtime', resumesAt: '2099-01-02T07:00:00.000Z' } })
        : answer(url, init),
    );
    const { client } = await import('../lib/api').then((m) => m.createApiClient(() => undefined));
    renderApp(<App />, ['/app']);
    expect(await screen.findByText('The app')).toBeInTheDocument();
    await act(async () => {
      await client.post('/chat/send', { text: 'hi' });
    });
    expect(await screen.findByRole('heading', { name: en['parental.pause.bedtimeTitle'] })).toBeInTheDocument();
  });

  it('does not let a lesson be opened once the pause has begun', async () => {
    teenServer(BEDTIME);
    renderApp(<App />, ['/app/learn/lesson/l1']);
    expect(await screen.findByRole('heading', { name: en['parental.pause.bedtimeTitle'] })).toBeInTheDocument();
  });
});

describe('what a parent switched off', () => {
  it('shows a calm note in place of the message box', async () => {
    teenServer(supervision({ controls: { ...OPEN_CONTROLS, chat: false } }));
    renderApp(<Composer value="" onChange={() => undefined} onSubmit={() => undefined} placeholder="Message" />);
    expect(await screen.findByText(en['parental.off'])).toBeInTheDocument();
    expect(screen.getByRole('link', { name: en['parental.seeControls'] })).toHaveAttribute('href', '/app/settings/parental');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});

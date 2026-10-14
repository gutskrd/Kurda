import { useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ExpectedGains, RatedState } from '@kurda/shared';
import { renderApp, jsonResponse } from '../test/utils';
import { en } from '../i18n/en';
import { LobbyRated, RatedBadge, RatedChoice, gain, loss, rememberedRated, shownRated, signed, useRatedChoice } from './rated';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const state = (over: Partial<RatedState> = {}): RatedState => ({ rated: true, counts: null, friendlyReason: null, damped: false, ...over });

function Choice({ open = false }: { open?: boolean }): React.JSX.Element {
  const [rated, setRated] = useRatedChoice('wordle-battle', open);
  return <RatedChoice value={rated} onChange={setRated} />;
}

const gains = (over: Partial<ExpectedGains> = {}): ExpectedGains => ({
  game: 'wordle-battle',
  lobbyId: 'l1',
  rated: true,
  wouldCount: true,
  friendlyReason: null,
  self: false,
  me: { points: 1160, tier: 'ciya', division: 1, placing: false },
  opponents: [
    { seat: 2, tier: 'ciya', division: 2, placing: false, win: 11, lose: -18 },
    { seat: 3, tier: null, division: null, placing: true, win: 8, lose: -20 },
  ],
  first: 12,
  last: -27,
  ...over,
});

describe('the Rated/Friendly badge', () => {
  it('says which in a word, with an icon, never by colour alone', () => {
    renderApp(
      <>
        <RatedBadge rated />
        <RatedBadge rated={false} />
      </>,
    );
    expect(screen.getByText('Rated')).toBeInTheDocument();
    expect(screen.getByText('Friendly')).toBeInTheDocument();
  });

  it('shows what the start decided once there is one, and the host’s choice before', () => {
    expect(shownRated(state())).toBe(true);
    expect(shownRated(state({ counts: false, friendlyReason: 'unverified' }))).toBe(false);
    expect(shownRated(state({ rated: false }))).toBe(false);
    expect(shownRated(undefined)).toBe(false);
  });

  it('writes a change with its sign, and never a loss as a gain', () => {
    expect(signed(24)).toBe('+24');
    expect(signed(-6)).toBe('−6');
    expect(signed(0)).toBe('0');
    expect(gain(-11)).toBe('+11');
    expect(loss(18)).toBe('−18');
    expect(loss(-18)).toBe('−18');
  });
});

describe('the setup sheet’s choice', () => {
  it('starts on Friendly among friends, and on Rated for a game open to everyone', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { preferences: {} })));
    renderApp(<Choice />);
    expect(screen.getByRole('radio', { name: /Friendly/ })).toBeChecked();
  });

  it('starts on the server’s memory of the host’s last choice', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { preferences: { 'wordle-battle': true } })));
    renderApp(<Choice />);
    await waitFor(() => expect(screen.getByRole('radio', { name: /Rated/ })).toBeChecked());
  });

  it('remembers a change on this device and on the server', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse(200, { preferences: {} }));
    vi.stubGlobal('fetch', fetchMock);
    renderApp(<Choice />);
    await userEvent.click(screen.getByRole('radio', { name: /Rated/ }));

    expect(rememberedRated('wordle-battle')).toBe(true);
    await waitFor(() => {
      const put = fetchMock.mock.calls.find(([url, init]) => String(url).includes('/ranks/preferences/wordle-battle') && init?.method === 'PUT');
      expect(JSON.parse(String(put![1]!.body))).toEqual({ rated: true });
    });
  });

  it('keeps the host’s own choice when who may join changes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { preferences: {} })));
    function Sheet(): React.JSX.Element {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen((o) => !o)}>
            switch who may join
          </button>
          <Choice open={open} />
        </>
      );
    }
    renderApp(<Sheet />);
    await userEvent.click(screen.getByRole('radio', { name: /Rated/ }));
    await userEvent.click(screen.getByRole('button', { name: 'switch who may join' }));
    await userEvent.click(screen.getByRole('button', { name: 'switch who may join' }));
    // back among friends, where the default is Friendly: the host chose Rated, and it stays
    expect(screen.getByRole('radio', { name: /Rated/ })).toBeChecked();
  });

  it('defaults an untouched sheet to Rated once the game is opened to everyone', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { preferences: {} })));
    function Sheet(): React.JSX.Element {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            open to everyone
          </button>
          <Choice open={open} />
        </>
      );
    }
    renderApp(<Sheet />);
    await userEvent.click(screen.getByRole('button', { name: 'open to everyone' }));
    expect(screen.getByRole('radio', { name: /Rated/ })).toBeChecked();
  });

  it('prefers this device’s memory to the server’s', () => {
    localStorage.setItem('hevalo.rated.wordle-battle', '0');
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { preferences: { 'wordle-battle': true } })));
    renderApp(<Choice open />);
    expect(screen.getByRole('radio', { name: /Friendly/ })).toBeChecked();
  });
});

describe('the lobby’s panel', () => {
  const seatName = (seat: number) => (seat === 2 ? 'baran' : `Player ${seat}`);

  it('gives the host the switch, and changes the lobby through the play layer', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url.includes('/ranks/expected') ? jsonResponse(200, gains()) : jsonResponse(200, { ok: true, rated: false }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderApp(<LobbyRated game="wordle-battle" lobbyId="l1" state={state()} isHost member playerCount={3} seatName={seatName} />);

    await userEvent.click(screen.getByRole('radio', { name: /Friendly/ }));
    await waitFor(() => {
      const put = fetchMock.mock.calls.find(([url]) => String(url).includes('/play/wordle-battle/l1/rated'));
      expect(JSON.parse(String(put![1]!.body))).toEqual({ rated: false });
    });
  });

  it('shows everyone what a win and a loss would do, per opponent, and for first and last place', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, gains())));
    renderApp(<LobbyRated game="wordle-battle" lobbyId="l1" state={state()} isHost={false} member playerCount={3} seatName={seatName} />);

    expect(await screen.findByText('Win ≈ +11 · Lose ≈ −18')).toBeInTheDocument();
    expect(screen.getByText('Win ≈ +8 · Lose ≈ −20')).toBeInTheDocument();
    expect(screen.getByText('First place ≈ +12 · Last place ≈ −27')).toBeInTheDocument();
    expect(screen.getByText('baran')).toBeInTheDocument();
    expect(screen.getByText('Çiya II')).toBeInTheDocument();
    expect(screen.getByText(en['ranks.placingShort'])).toBeInTheDocument();
    // no switch for a guest: the badge
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getByText('Rated')).toBeInTheDocument();
  });

  it('says why a Rated game would play as friendly, to the player it is about', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, gains({ wouldCount: false, friendlyReason: 'no-birth-month', self: true }))));
    renderApp(<LobbyRated game="wordle-battle" lobbyId="l1" state={state()} isHost={false} member playerCount={2} seatName={seatName} />);

    expect(await screen.findByText('This game will be friendly: add your birth month to play rated games.')).toBeInTheDocument();
    expect(screen.queryByText(/Win ≈/)).not.toBeInTheDocument();
  });

  it('asks nothing of a friendly lobby, or of someone not in it yet', async () => {
    const fetchMock = vi.fn(async (_url: string) => jsonResponse(200, gains()));
    vi.stubGlobal('fetch', fetchMock);
    const { unmount } = renderApp(
      <LobbyRated game="wordle-battle" lobbyId="l1" state={state({ rated: false })} isHost={false} member playerCount={2} seatName={seatName} />,
    );
    expect(screen.getByText('Friendly')).toBeInTheDocument();
    unmount();
    renderApp(<LobbyRated game="wordle-battle" lobbyId="l1" state={state()} isHost={false} member={false} playerCount={2} seatName={seatName} />);
    expect(screen.getByText('Rated')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/ranks/expected'))).toBe(false);
  });

  it('tells a joined player when the host changes it, and that leaving costs nothing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, gains())));
    function Lobby(): React.JSX.Element {
      // the lobby's next read, after the host changed it
      const [rated, setRated] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setRated(true)}>
            host changes it
          </button>
          <LobbyRated game="wordle-battle" lobbyId="l1" state={state({ rated })} isHost={false} member playerCount={2} seatName={seatName} />
        </>
      );
    }
    renderApp(<Lobby />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'host changes it' }));
    expect(await screen.findByRole('status')).toHaveTextContent(en['rated.nowRated']);
  });

  it('draws nothing for an API that sends no Rated state', () => {
    const { container } = renderApp(
      <LobbyRated game="wordle-battle" lobbyId="l1" state={undefined} isHost member playerCount={2} seatName={seatName} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

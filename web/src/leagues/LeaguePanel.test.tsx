import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LeaguePanel } from './LeaguePanel';
import { renderApp, jsonResponse } from '../test/utils';
import { en } from '../i18n/en';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

/** A cohort of `size`, ranked 1..size, with `selfRank` marked as the reader. */
function cohort(tier: string, size: number, selfRank: number) {
  return {
    tier,
    // far enough ahead that the countdown never reads as ended mid-test
    weekKey: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10),
    rank: selfRank,
    promoteCount: 10,
    demoteCount: 5,
    standings: Array.from({ length: size }, (_, i) => ({
      userId: `u${i + 1}`,
      username: `player${i + 1}`,
      weeklyXp: (size - i) * 10,
      rank: i + 1,
      isSelf: i + 1 === selfRank,
    })),
  };
}

const answer = (body: unknown) => vi.fn(async () => jsonResponse(200, body));

describe('LeaguePanel', () => {
  it('names the league it is showing, and when the week ends', async () => {
    vi.stubGlobal('fetch', answer(cohort('silver', 30, 12)));
    renderApp(<LeaguePanel />);

    expect(await screen.findByRole('heading', { name: 'Silver League' })).toBeInTheDocument();
    expect(screen.getByText(/Ends in/)).toBeInTheDocument();
  });

  /**
   * The zones, which are the whole reason this panel exists and are the thing
   * the phone shows as a coloured edge and nothing else. A row has to say where
   * it is going in words, or it says nothing to a screen reader.
   */
  it('names the tier above for the promotion zone and below for the demotion zone', async () => {
    vi.stubGlobal('fetch', answer(cohort('silver', 30, 12)));
    renderApp(<LeaguePanel />);
    await screen.findByRole('heading', { name: 'Silver League' });

    // top ten promote to Gold, bottom five drop to Bronze
    expect(screen.getAllByText('Gold League')).toHaveLength(10);
    expect(screen.getAllByText('Bronze League')).toHaveLength(5);
    // the fifteen in between are going nowhere and say so by saying nothing
    expect(screen.getAllByText(/League$/)).toHaveLength(1 + 10 + 5);
  });

  /**
   * The case the clamp exists for. Bronze is the bottom of the ladder, so its
   * bottom five are not going anywhere — a row promising a drop to Bronze from
   * Bronze is a promise about a move the server will never make.
   */
  it('promises no demotion out of the bottom tier', async () => {
    vi.stubGlobal('fetch', answer(cohort('bronze', 30, 28)));
    renderApp(<LeaguePanel />);
    await screen.findByRole('heading', { name: 'Bronze League' });

    expect(screen.getAllByText('Silver League')).toHaveLength(10);
    // the heading is the only other thing naming a league
    expect(screen.getAllByText(/League$/)).toHaveLength(1 + 10);
  });

  it('promises no promotion out of the top tier', async () => {
    vi.stubGlobal('fetch', answer(cohort('diamond', 30, 3)));
    renderApp(<LeaguePanel />);
    await screen.findByRole('heading', { name: 'Diamond League' });

    expect(screen.getAllByText('Obsidian League')).toHaveLength(5);
    expect(screen.getAllByText(/League$/)).toHaveLength(1 + 5);
  });

  it('marks the reader rather than repeating their name', async () => {
    vi.stubGlobal('fetch', answer(cohort('gold', 30, 4)));
    renderApp(<LeaguePanel />);
    await screen.findByRole('heading', { name: 'Gold League' });

    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.queryByText('player4')).not.toBeInTheDocument();
  });

  /**
   * Kurmancî puts the tier after the word for league — "Lîga Zîv", not "Zîv
   * League" — which is why the whole phrase is one key and not two joined at
   * the call site.
   *
   * Gold is `Zêrîn`, golden, and not `Zêr`, which is the currency. Asserting
   * the exact word is the point: this test caught that guess.
   */
  it('reads in the chosen language, in that language’s word order', async () => {
    localStorage.setItem('hevalo_locale', 'ku');
    vi.stubGlobal('fetch', answer(cohort('silver', 30, 12)));
    renderApp(<LeaguePanel />);

    expect(await screen.findByRole('heading', { name: 'Lîga Zîv' })).toBeInTheDocument();
    expect(screen.getAllByText('Lîga Zêrîn')).toHaveLength(10);
  });

  /**
   * A cohort too small to demote anybody. The server's rule, mirrored: nobody
   * should be told they are dropping out of a league of six.
   */
  it('promises no demotion in a cohort too small for it', async () => {
    vi.stubGlobal('fetch', answer(cohort('silver', 6, 6)));
    renderApp(<LeaguePanel />);
    await screen.findByRole('heading', { name: 'Silver League' });

    expect(screen.queryByText('Bronze League')).not.toBeInTheDocument();
  });

  /**
   * Out of the leagues — by choice, or a minor who has not chosen to join. No
   * ladder and no table, nothing that reads as missing out: one sentence, and
   * the way in.
   */
  it('shows no table to someone out of the leagues, and lets them join in one tap', async () => {
    let joined = false;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/me/league')) {
        return jsonResponse(200, joined ? cohort('bronze', 30, 30) : { ...cohort('bronze', 0, 0), optedOut: true });
      }
      if (url.endsWith('/me') && init?.method === 'PATCH') {
        joined = true;
        return jsonResponse(200, { user: { id: 'me', leaguesEnabled: true } });
      }
      return jsonResponse(200, { user: { id: 'me' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    renderApp(<LeaguePanel />);

    expect(await screen.findByRole('heading', { name: en['leagues.optedOut.title'] })).toBeInTheDocument();
    expect(screen.getByText(en['leagues.optedOut.body'])).toBeInTheDocument();
    expect(screen.queryByText(/Ends in/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: en['leagues.optedOut.join'] }));
    expect(await screen.findByRole('heading', { name: 'Bronze League' })).toBeInTheDocument();
    const patch = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH');
    expect(JSON.parse(String((patch![1] as RequestInit).body))).toEqual({ leaguesEnabled: true });
  });

  /*
   * It is an extra panel above a page that works without it, so a failure is
   * not the reader's problem to see — an error box here would push the
   * leaderboards down to report something they did not ask for.
   */
  it('shows nothing at all rather than an error over the leaderboards', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(500, { code: 'OOPS', message: 'no' })));
    const { container } = renderApp(<LeaguePanel />);
    // nothing to await: there is no success state coming
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });
});

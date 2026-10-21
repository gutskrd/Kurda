import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resolveGroup, type LeagueTier, type LeagueView } from '@kurda/shared';
import { LeaguePanel, weekEnds } from './LeaguePanel';
import { renderApp, jsonResponse } from '../test/utils';
import { en } from '../i18n/en';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

const GOAL = 150;

/**
 * A group of `size` in `tier`, XP falling down the table, the reader at
 * `selfRank` with `selfXp`; zones worked out by the shared rules, exactly as
 * the server does.
 */
function league(tier: LeagueTier, size: number, selfRank: number, over: Partial<LeagueView> = {}): LeagueView {
  const members = Array.from({ length: size }, (_, i) => ({ userId: `u${i + 1}`, tier, weeklyXp: (size - i) * 20 }));
  const standings = resolveGroup(members, GOAL);
  const me = standings[selfRank - 1] ?? { weeklyXp: 0, goalMet: false };
  return {
    mode: 'league',
    optedOut: false,
    joined: true,
    tier,
    weekKey: '2026-10-12',
    endsAt: '2026-10-19T00:00:00.000Z',
    weeklyXp: me.weeklyXp,
    goalXp: GOAL,
    goalMet: me.goalMet,
    safe: me.goalMet,
    rank: selfRank,
    groupSize: size,
    promoteCount: standings.filter((s) => s.zone === 'promotion').length,
    demoteCount: Math.floor(size * 0.15),
    standings: standings.map((s) => ({
      userId: s.userId,
      username: `player${s.rank}`,
      weeklyXp: s.weeklyXp,
      rank: s.rank,
      isSelf: s.rank === selfRank,
      tier: s.tier,
      zone: s.zone,
    })),
    lastWeek: null,
    recentWeeks: [],
    ...over,
  };
}

const answer = (body: unknown) => vi.fn(async () => jsonResponse(200, body));

describe('LeaguePanel', () => {
  it('names the league and its meaning, and says when the week closes in local time, without a countdown', async () => {
    vi.stubGlobal('fetch', answer(league('cem', 18, 12)));
    renderApp(<LeaguePanel />);

    expect(await screen.findByRole('heading', { name: 'Çem League' })).toBeInTheDocument();
    expect(screen.getByText('River')).toBeInTheDocument();
    expect(screen.getByText(`This week closes ${weekEnds('2026-10-19T00:00:00.000Z', 'en')}`)).toBeInTheDocument();
    expect(screen.queryByText(/Ends in/)).not.toBeInTheDocument();
    expect(screen.getByText('18 learners in your group')).toBeInTheDocument();
    // the emblem is labelled, not decoration
    expect(screen.getByRole('img', { name: 'Çem (River)' })).toBeInTheDocument();
  });

  /**
   * The zones are said in words and arrows, never by a colour alone: every row
   * moving says "Up" or "Down", and a line across the table names where.
   */
  it('marks the zones in words, with lines naming the league each leads to', async () => {
    vi.stubGlobal('fetch', answer(league('cem', 20, 12)));
    renderApp(<LeaguePanel />);
    await screen.findByRole('heading', { name: 'Çem League' });

    // the top quarter of twenty move up, the bottom 15% (who missed the goal) move down
    expect(screen.getAllByText(en['leagues.zone.up'])).toHaveLength(5);
    expect(screen.getAllByText(en['leagues.zone.down'])).toHaveLength(3);
    expect(screen.getByText('The top 5 move up to Gol League, with the weekly goal met')).toBeInTheDocument();
    expect(screen.getByText('From here, anyone short of the goal moves to Kanî League')).toBeInTheDocument();
  });

  it('never shows a way down from Dilop or Kanî, and says so', async () => {
    vi.stubGlobal('fetch', answer(league('kani', 20, 18)));
    renderApp(<LeaguePanel />);
    await screen.findByRole('heading', { name: 'Kanî League' });

    expect(screen.queryByText(en['leagues.zone.down'])).not.toBeInTheDocument();
    expect(screen.getByText('Nobody moves down from Kanî League.')).toBeInTheDocument();
  });

  it('gives Okyanûs’s top three the Pêla trophy instead of a way up', async () => {
    vi.stubGlobal('fetch', answer(league('okyanus', 20, 10)));
    renderApp(<LeaguePanel />);
    await screen.findByRole('heading', { name: 'Okyanûs League' });

    expect(screen.queryByText(en['leagues.zone.up'])).not.toBeInTheDocument();
    expect(screen.getAllByText(en['leagues.zone.trophy'])).toHaveLength(3);
  });

  it('says “Safe this week ✓” once the goal is met, and fills the ring', async () => {
    vi.stubGlobal('fetch', answer(league('cem', 20, 4)));
    renderApp(<LeaguePanel />);
    await screen.findByRole('heading', { name: 'Çem League' });

    expect(screen.getByText(en['leagues.safe'])).toBeInTheDocument();
    const ring = screen.getByRole('img', { name: /Weekly goal: 340 of 150 XP/ });
    expect(ring.className).toContain('is-met');
  });

  it('tells someone short of the goal how far it is, kindly', async () => {
    vi.stubGlobal('fetch', answer(league('cem', 20, 15)));
    renderApp(<LeaguePanel />);
    await screen.findByRole('heading', { name: 'Çem League' });

    expect(screen.getByText('30 XP to your weekly goal of 150.')).toBeInTheDocument();
    expect(screen.queryByText(en['leagues.safe'])).not.toBeInTheDocument();
  });

  it('marks the reader rather than repeating their name, and links the others to their profiles', async () => {
    vi.stubGlobal('fetch', answer(league('cem', 8, 4)));
    renderApp(<LeaguePanel />);
    await screen.findByRole('heading', { name: 'Çem League' });

    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.queryByText('player4')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'player1' })).toHaveAttribute('href', '/app/users/u1');
  });

  /**
   * A minor who chose to take part is a place in the table with no name for
   * anyone but their friends: the server sends no id or username, the row
   * says "A learner", and it is not a link.
   */
  it('shows a member the server does not name as a learner, keeping their place', async () => {
    const view = league('cem', 8, 1);
    for (const i of [2, 4]) Object.assign(view.standings[i]!, { userId: null, username: null });
    vi.stubGlobal('fetch', answer(view));
    const { container } = renderApp(<LeaguePanel />);
    await screen.findByRole('heading', { name: 'Çem League' });

    expect(screen.getAllByText(en['leagues.unnamed'])).toHaveLength(2);
    expect(container.querySelectorAll('.rank-row')).toHaveLength(8);
    expect(screen.queryByRole('link', { name: en['leagues.unnamed'] })).not.toBeInTheDocument();
  });

  it('asks someone not in a group yet to learn something, rather than showing an empty table', async () => {
    vi.stubGlobal('fetch', answer({ ...league('dilop', 0, 1), joined: false, standings: [], weeklyXp: 0, goalMet: false, safe: false }));
    const { container } = renderApp(<LeaguePanel />);
    await screen.findByRole('heading', { name: 'Dilop League' });

    expect(screen.getByText(en['leagues.joinHint'])).toBeInTheDocument();
    expect(container.querySelector('.rank-list')).toBeNull();
  });

  it('shows last week as its own card, a move down said as where you are now', async () => {
    vi.stubGlobal(
      'fetch',
      answer(
        league('gol', 20, 12, {
          lastWeek: {
            weekKey: '2026-10-05',
            mode: 'league',
            tier: 'derya',
            tierAfter: 'gol',
            outcome: 'demoted',
            rank: 18,
            groupSize: 20,
            weeklyXp: 40,
            goalXp: 150,
            goalMet: false,
            trophy: false,
            gems: 0,
          },
        }),
      ),
    );
    renderApp(<LeaguePanel />);
    const card = (await screen.findByRole('heading', { name: en['leagues.lastWeek'] })).closest('section')!;
    expect(within(card).getByText('This week you’re in Gol League.')).toBeInTheDocument();
    expect(within(card).getByText(/Place 18 of 20/)).toBeInTheDocument();
  });

  it('pays its respects to a promotion, with the Gems it brought', async () => {
    vi.stubGlobal(
      'fetch',
      answer(
        league('cem', 20, 12, {
          lastWeek: {
            weekKey: '2026-10-05',
            mode: 'league',
            tier: 'kani',
            tierAfter: 'cem',
            outcome: 'promoted',
            rank: 2,
            groupSize: 16,
            weeklyXp: 240,
            goalXp: 150,
            goalMet: true,
            trophy: false,
            gems: 10,
          },
        }),
      ),
    );
    renderApp(<LeaguePanel />);
    // celebrated once, as the league is first opened after the week that moved you up
    const moment = await screen.findByRole('dialog', { name: en['leagues.celebrate.up'] });
    expect(within(moment).getByRole('heading', { name: 'Çem League' })).toBeInTheDocument();
    await userEvent.click(within(moment).getByRole('button', { name: en['lesson.continue'] }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(localStorage.getItem('hevalo_league_celebrated')).toBe('2026-10-05');
    // and said on the card, where it stays
    expect(screen.getByText('You moved up to Çem League.')).toBeInTheDocument();
    expect(screen.getByText('+10 Gems')).toBeInTheDocument();
    expect(screen.getByText(en['leagues.result.goalMet'])).toBeInTheDocument();
  });

  it('does not celebrate the same week twice, nor a week that did not move you up', async () => {
    localStorage.setItem('hevalo_league_celebrated', '2026-10-05');
    const week = {
      weekKey: '2026-10-05',
      mode: 'league' as const,
      tier: 'kani' as const,
      tierAfter: 'cem' as const,
      outcome: 'promoted' as const,
      rank: 2,
      groupSize: 16,
      weeklyXp: 240,
      goalXp: 150,
      goalMet: true,
      trophy: false,
      gems: 10,
    };
    vi.stubGlobal('fetch', answer(league('cem', 20, 12, { lastWeek: week })));
    const seen = renderApp(<LeaguePanel />);
    expect(await screen.findByText('You moved up to Çem League.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    seen.unmount();

    localStorage.clear();
    vi.stubGlobal('fetch', answer(league('kani', 20, 12, { lastWeek: { ...week, tierAfter: 'kani', outcome: 'stayed' } })));
    renderApp(<LeaguePanel />);
    expect(await screen.findByText('You stayed in Kanî League.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  /**
   * Kurmancî puts the tier after the word for league — "Lîga Çem" — which is
   * why the whole phrase is one key, and the meaning is not repeated to a
   * reader who already reads the name.
   */
  it('reads in the chosen language, in that language’s word order', async () => {
    localStorage.setItem('hevalo_locale', 'ku');
    vi.stubGlobal('fetch', answer(league('cem', 20, 12)));
    renderApp(<LeaguePanel />);

    expect(await screen.findByRole('heading', { name: 'Lîga Çem' })).toBeInTheDocument();
    expect(screen.queryByText('River')).not.toBeInTheDocument();
  });

  /**
   * Personal mode — out of the leagues by choice, or a teen who has not
   * chosen: no group and no table, the same ring, this week against the last
   * ones, and the way in once, without anything that reads as missing out.
   */
  it('shows personal mode with the goal ring and recent weeks, and lets them join in one tap', async () => {
    let joined = false;
    const personal: LeagueView = {
      ...league('cem', 0, 1),
      mode: 'personal',
      optedOut: true,
      joined: false,
      tier: null,
      standings: [],
      weeklyXp: 85,
      goalMet: false,
      safe: false,
      recentWeeks: [
        { weekKey: '2026-09-28', xp: 170, goalMet: true },
        { weekKey: '2026-10-05', xp: 90, goalMet: false },
        { weekKey: '2026-10-12', xp: 85, goalMet: false },
      ],
    };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/me/league')) return jsonResponse(200, joined ? league('dilop', 10, 5) : personal);
      if (url.endsWith('/me') && init?.method === 'PATCH') {
        joined = true;
        return jsonResponse(200, { user: { id: 'me', leaguesEnabled: true } });
      }
      return jsonResponse(200, { user: { id: 'me' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { container } = renderApp(<LeaguePanel />);

    expect(await screen.findByRole('heading', { name: en['leagues.personal.title'] })).toBeInTheDocument();
    expect(screen.getByText('Last week: 90 XP')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Weekly goal: 85 of 150 XP/ })).toBeInTheDocument();
    expect(container.querySelectorAll('.league-week')).toHaveLength(3);
    expect(container.querySelector('.rank-list')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: en['leagues.optedOut.join'] }));
    expect(await screen.findByRole('heading', { name: 'Dilop League' })).toBeInTheDocument();
    const patch = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH');
    expect(JSON.parse(String((patch![1] as RequestInit).body))).toEqual({ leaguesEnabled: true });
  });

  /*
   * It is an extra panel above a page that works without it, so a failure is
   * not the reader's problem to see.
   */
  it('shows nothing at all rather than an error over the leaderboards', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(500, { code: 'OOPS', message: 'no' })));
    const { container } = renderApp(<LeaguePanel />);
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });
});

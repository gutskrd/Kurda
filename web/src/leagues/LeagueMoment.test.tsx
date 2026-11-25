import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LeagueWeekResult } from '@kurda/shared';
import { jsonResponse, renderApp } from '../test/utils';
import { en } from '../i18n/en';
import { LeagueMoment } from './LeagueMoment';

/*
 * The Share button on a good league week names the league and place and nothing of the people in the group. A week
 * that moved the learner down or kept them in place has no moment, so nothing to share.
 */

const SITE = window.location.origin;

const week = (over: Partial<LeagueWeekResult>): LeagueWeekResult => ({
  weekKey: '2026-10-05',
  mode: 'league',
  tier: 'kani',
  tierAfter: 'kani',
  outcome: 'stayed',
  rank: 9,
  groupSize: 16,
  weeklyXp: 240,
  goalXp: 150,
  goalMet: true,
  trophy: false,
  gems: 0,
  ...over,
});

/** A device with a share sheet, recording what it is handed. */
function sheet(): { share: ReturnType<typeof vi.fn>; said: () => string } {
  const share = vi.fn(async (_data: ShareData) => undefined);
  vi.stubGlobal('navigator', { ...navigator, share, clipboard: navigator.clipboard });
  return { share, said: () => (share.mock.calls[0]?.[0] as ShareData | undefined)?.text ?? '' };
}

beforeEach(() => {
  localStorage.setItem('hevalo_tokens', JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
  vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { user: { id: 'u-4471', username: 'rojda', emailVerified: true } })));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('sharing a league week', () => {
  it('offers one quiet Share under the way on of a promotion', async () => {
    renderApp(<LeagueMoment week={week({ outcome: 'promoted', tierAfter: 'cem', rank: 2, gems: 10 })} />);
    const moment = await screen.findByRole('dialog', { name: en['leagues.celebrate.up'] });
    const onward = within(moment).getByRole('button', { name: en['lesson.continue'] });
    const share = within(moment).getByRole('button', { name: 'Share' });
    expect(onward).toHaveClass('btn-primary');
    expect(share).toHaveClass('btn-secondary');
    expect(onward.compareDocumentPosition(share) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shares the league moved up to, and nothing of the group or of who moved', async () => {
    const { share, said } = sheet();
    renderApp(<LeagueMoment week={week({ outcome: 'promoted', tierAfter: 'cem', rank: 2, gems: 10 })} />);
    const moment = await screen.findByRole('dialog', { name: en['leagues.celebrate.up'] });
    await userEvent.click(within(moment).getByRole('button', { name: 'Share' }));
    expect(share).toHaveBeenCalledTimes(1);
    expect(said()).toBe(`I just moved up to the Çem League on Hevalo! 🏆\n${SITE}/win/league/cem?l=en`);
    // Not the group size, the XP or the account.
    for (const theirs of ['16', '240', 'rojda', 'u-4471', '/users/', '@']) expect(said()).not.toContain(theirs);
    // Sharing does not close the moment or mark the week seen.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(localStorage.getItem('hevalo_league_celebrated')).toBeNull();
  });

  it('shares a place in the first three of the top league, where nobody moves up', async () => {
    const { said } = sheet();
    renderApp(<LeagueMoment week={week({ tier: 'okyanus', tierAfter: 'okyanus', rank: 2, trophy: true })} />);
    const moment = await screen.findByRole('dialog', { name: en['leagues.celebrate.up'] });
    await userEvent.click(within(moment).getByRole('button', { name: 'Share' }));
    expect(said()).toBe(`I finished #2 in the Okyanûs League this week! 🏆\n${SITE}/win/league/okyanus?l=en`);
  });

  it('offers nothing to share where the place cannot be said', async () => {
    renderApp(<LeagueMoment week={week({ tier: 'okyanus', tierAfter: 'okyanus', rank: null, trophy: true })} />);
    const moment = await screen.findByRole('dialog', { name: en['leagues.celebrate.up'] });
    expect(within(moment).getByRole('button', { name: en['lesson.continue'] })).toBeInTheDocument();
    expect(within(moment).queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
  });

  it('offers no Share on bad news: a week that moved down, or one that simply stayed, is not staged at all', () => {
    for (const bad of [
      week({ outcome: 'demoted', tier: 'cem', tierAfter: 'kani', rank: 15 }),
      week({ outcome: 'demoted', tier: 'cem', tierAfter: 'kani', rank: 2 }),
      week({ outcome: 'stayed', rank: 9 }),
      week({ mode: 'personal', tier: null, tierAfter: null, outcome: null, rank: null }),
    ]) {
      const view = renderApp(<LeagueMoment week={bad} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument();
      view.unmount();
    }
  });
});

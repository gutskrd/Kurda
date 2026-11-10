import { afterEach, describe, expect, it, vi } from 'vitest';
// the fire as its props: which stage burns, whoever draws it
vi.mock('../components/Fire', () => import('../test/fireProbe'));
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { preloadCatalogue } from '../i18n/catalogues';
import { onLessonSound } from '../lib/sounds';
import type { StreakSummary } from '../lib/types';
import { jsonResponse, renderApp } from '../test/utils';
import { StreakSheet } from './StreakSheet';

/*
 * A streak that ended, in the streak's sheet on the website, as on the phone:
 * one calm sentence saying which streak and through which day it can be
 * brought back, one button with what that costs, and — once it is pressed —
 * the streak back, with the site's own celebration. The server decides
 * everything; the sheet sends a request with nothing in it and reads the answer.
 */

/** The offer ends as the 12th begins: the last day is the 11th. */
const UNTIL = '2026-11-12T00:00:00.000Z';
const LAST_DAY = new Intl.DateTimeFormat('en-US', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date('2026-11-11T23:59:00.000Z'));

const ended = (repair: StreakSummary['repair']): StreakSummary => ({
  current: 0,
  longest: 12,
  freezes: 0,
  lastActiveOn: '2026-11-07',
  daysLearned: 41,
  sessionsPerFreeze: 5,
  repair,
});
const paid = { days: 12, costGems: 50, free: false, until: UNTIL };
const back: StreakSummary = { current: 12, longest: 12, freezes: 0, lastActiveOn: '2026-11-09', daysLearned: 41, sessionsPerFreeze: 5, repair: null };

interface Sent {
  method: string;
  path: string;
  body: string | null;
}

/** A fetch that answers the wallet and the restore, and keeps what was sent. */
function api(routes: { gems?: () => number; repair?: () => Response }): Sent[] {
  const sent: Sent[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url, 'http://api.test').pathname;
      const method = init?.method ?? 'GET';
      sent.push({ method, path, body: typeof init?.body === 'string' ? init.body : null });
      if (path.endsWith('/me/wallet')) return jsonResponse(200, { balances: { zer: 0, gems: routes.gems?.() ?? 0 }, history: [] });
      if (path.endsWith('/me/streak/repair') && routes.repair) return routes.repair();
      return jsonResponse(200, {});
    }),
  );
  return sent;
}

const restoredAnswer = (): Response => jsonResponse(200, { restored: true, duplicate: false, days: 12, costGems: 50, free: false, gems: 30, streak: back });
const posts = (sent: Sent[]): Sent[] => sent.filter((s) => s.method === 'POST');

function open(streak: StreakSummary, onRestored?: (s: StreakSummary) => void): void {
  renderApp(<StreakSheet streak={streak} onClose={() => undefined} onRestored={onRestored} />);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe('a streak that can be restored', () => {
  it('says which streak ended and through which day, with the price on one button', async () => {
    const sent = api({ gems: () => 80 });
    open(ended(paid));
    const sheet = screen.getByRole('dialog', { name: 'Streak' });
    expect(within(sheet).getByText(`Your 12-day streak ended. You can bring it back until the end of ${LAST_DAY}.`)).toBeInTheDocument();
    const restore = within(sheet).getByRole('button', { name: 'Restore for 50 gems' });
    await waitFor(() => expect(sent.some((s) => s.path.endsWith('/me/wallet'))).toBe(true));
    expect(restore).toBeEnabled();
    // enough gems: nothing about the balance, nothing that hurries, and nothing to buy
    expect(within(sheet).queryByText(/^Your gems:/)).not.toBeInTheDocument();
    expect(within(sheet).queryByText(/hurry|lose|last chance|hours? left|minutes? left|buy|purchase/i)).not.toBeInTheDocument();
    // the streak's own story is all still there
    expect(within(sheet).getByRole('heading', { name: 'Finish a lesson to start a streak' })).toBeInTheDocument();
    expect(within(sheet).getByText('Longest streak').nextElementSibling).toHaveTextContent('12');
    expect(within(sheet).getByRole('heading', { name: 'How your fire grows' })).toBeInTheDocument();
  });

  it('offers nothing when there is nothing to restore', () => {
    api({});
    open(ended(null));
    expect(screen.queryByRole('button', { name: /^Restore/ })).not.toBeInTheDocument();
    expect(document.querySelector('.streak-repair')).toBeNull();
  });

  it('restores on one press: a request with nothing in it, then the streak back, celebrated and heard once', async () => {
    const sent = api({ gems: () => 80, repair: restoredAnswer });
    const heard: string[] = [];
    const stop = onLessonSound((s) => heard.push(s));
    const handed: StreakSummary[] = [];
    open(ended(paid), (s) => handed.push(s));
    await userEvent.click(await screen.findByRole('button', { name: 'Restore for 50 gems' }));

    const title = await screen.findByRole('heading', { name: 'Your 12-day streak is back' });
    // the headline takes the focus the button had, so it is read out
    expect(title).toHaveFocus();
    expect(screen.getByText('The days you missed are kept. It goes on with your next lesson.')).toBeInTheDocument();
    // the offer is gone, the fire is the restored streak's, and the numbers and the ladder are its own
    expect(screen.queryByRole('button', { name: /^Restore/ })).not.toBeInTheDocument();
    expect(screen.getAllByTestId('fire')[0]).toHaveAttribute('data-stage', 'campfire');
    expect(document.querySelector('.fire-rung.is-now')).toHaveTextContent('Campfire');
    // the celebration the site already has: its ring and its flecks, and the reward chime, once
    const moment = document.querySelector('.streak-restored')!;
    expect(moment).toHaveClass('celebrate', 'is-playing');
    expect(moment.querySelector('.celebrate-ring')).not.toBeNull();
    expect(moment.querySelectorAll('.celebrate-fleck').length).toBeGreaterThan(0);
    expect(heard).toHaveLength(1);
    stop();

    expect(posts(sent)).toEqual([{ method: 'POST', path: expect.stringMatching(/\/me\/streak\/repair$/), body: null }]);
    expect(handed).toEqual([back]);
  });

  it('brings the streak back with no ring and nothing thrown for a reader who asked for less motion', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), addEventListener: () => undefined, removeEventListener: () => undefined }));
    api({ gems: () => 80, repair: restoredAnswer });
    open(ended(paid));
    await userEvent.click(await screen.findByRole('button', { name: 'Restore for 50 gems' }));
    expect(await screen.findByRole('heading', { name: 'Your 12-day streak is back' })).toBeInTheDocument();
    const moment = document.querySelector('.streak-restored')!;
    expect(moment.querySelector('.celebrate-ring')).toBeNull();
    expect(moment.querySelectorAll('.celebrate-fleck')).toHaveLength(0);
  });

  it('shows the balance and where gems come from when they are short, and a button that cannot be pressed', async () => {
    const sent = api({ gems: () => 20 });
    open(ended(paid));
    expect(await screen.findByText('Your gems: 20')).toBeInTheDocument();
    expect(screen.getByText('Gems come from moving up a league, season rewards and events.')).toBeInTheDocument();
    const restore = screen.getByRole('button', { name: 'Restore for 50 gems' });
    expect(restore).toBeDisabled();
    // why it cannot be pressed is tied to it, for a screen reader
    expect(restore).toHaveAccessibleDescription(/Your gems: 20/);
    await userEvent.click(restore);
    expect(posts(sent)).toHaveLength(0);
  });

  it('says a Hevalo+ member’s restore is free, and asks for no balance', async () => {
    const sent = api({ repair: () => jsonResponse(200, { restored: true, duplicate: false, days: 12, costGems: 0, free: true, gems: 0, streak: back }) });
    open(ended({ days: 12, costGems: 0, free: true, until: UNTIL }));
    await userEvent.click(screen.getByRole('button', { name: 'Restore, free with Hevalo+' }));
    expect(await screen.findByRole('heading', { name: 'Your 12-day streak is back' })).toBeInTheDocument();
    expect(sent.some((s) => s.path.endsWith('/me/wallet'))).toBe(false);
  });

  it('reads the balance again when the server says the gems were short after all', async () => {
    let gems = 80;
    api({
      gems: () => gems,
      repair: () => {
        gems = 10; // spent somewhere else since the sheet opened
        return jsonResponse(402, { code: 'INSUFFICIENT_FUNDS', message: 'not enough Gems' });
      },
    });
    open(ended(paid));
    await userEvent.click(await screen.findByRole('button', { name: 'Restore for 50 gems' }));
    expect(await screen.findByText('Your gems: 10')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore for 50 gems' })).toBeDisabled();
    expect(screen.queryByRole('heading', { name: /is back$/ })).not.toBeInTheDocument();
  });

  it('says plainly when the streak can no longer be restored', async () => {
    api({ gems: () => 80, repair: () => jsonResponse(409, { code: 'RESTORE_EXPIRED', message: 'the days in which that streak could be restored have passed' }) });
    open(ended(paid));
    await userEvent.click(await screen.findByRole('button', { name: 'Restore for 50 gems' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This streak can no longer be brought back.');
  });

  it('says the offer in Sorani, right to left', async () => {
    localStorage.setItem('hevalo_locale', 'ckb');
    await preloadCatalogue();
    api({ gems: () => 80 });
    open(ended(paid));
    expect(document.documentElement.dir).toBe('rtl');
    expect(await screen.findByRole('button', { name: /^بە .+ گەوهەر بیگەڕێنەوە$/ })).toBeInTheDocument();
    expect(screen.getByText(/^زنجیرەی .+ ڕۆژەکەت کۆتایی هات\./)).toBeInTheDocument();
  });
});

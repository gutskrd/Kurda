import { afterEach, describe, expect, it, vi } from 'vitest';
// The fire as its props: which stage burns.
vi.mock('../components/Fire', () => import('../test/fireProbe'));
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { preloadCatalogue } from '../i18n/catalogues';
import { onLessonSound } from '../lib/sounds';
import type { StreakSummary } from '../lib/types';
import { todayView } from '../test/today';
import { jsonResponse, renderApp } from '../test/utils';
import { DailySheet } from './DailySheet';
import { useToday } from './today';

/*
 * Winning an ended streak back in the daily view, as on the phone: one sentence with today's sessions toward it, a
 * member's free restore as one button, then the streak back with the site's celebration. Nothing is bought. The server
 * decides; the view sends an empty request and reads the answer.
 */

/** The offer ends as the 21st begins: the last day is the 20th. */
const UNTIL = '2026-11-21T00:00:00.000Z';
const LAST_DAY = new Intl.DateTimeFormat('en-US', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date('2026-11-20T23:59:00.000Z'));

const ended = (repair: StreakSummary['repair']): StreakSummary => ({
  current: 0,
  longest: 12,
  freezes: 0,
  lastActiveOn: '2026-11-07',
  daysLearned: 41,
  sessionsPerFreeze: 5,
  repair,
});
const offer = (over: Partial<NonNullable<StreakSummary['repair']>> = {}): NonNullable<StreakSummary['repair']> => ({
  days: 12,
  free: false,
  sessionsToday: 1,
  sessionsNeeded: 3,
  until: UNTIL,
  ...over,
});
const back: StreakSummary = { current: 12, longest: 12, freezes: 0, lastActiveOn: '2026-11-09', daysLearned: 41, sessionsPerFreeze: 5, repair: null };

interface Sent {
  method: string;
  path: string;
  body: string | null;
}

/** A fetch that answers the daily view and the restore, and keeps what was sent. */
function api(routes: { repair?: () => Response; streak?: StreakSummary }): Sent[] {
  const sent: Sent[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url, 'http://api.test').pathname;
      const method = init?.method ?? 'GET';
      sent.push({ method, path, body: typeof init?.body === 'string' ? init.body : null });
      if (path.endsWith('/me/today')) return jsonResponse(200, todayView({ streak: routes.streak ?? ended(offer()) }));
      if (path.endsWith('/me/streak/repair') && routes.repair) return routes.repair();
      return jsonResponse(200, {});
    }),
  );
  return sent;
}

const restoredAnswer = (): Response => jsonResponse(200, { restored: true, duplicate: false, days: 12, free: true, streak: back });
const posts = (sent: Sent[]): Sent[] => sent.filter((s) => s.method === 'POST');

function Opened({ onRestored }: { onRestored?: (s: StreakSummary) => void }): React.JSX.Element {
  const today = useToday();
  return <DailySheet open today={today} onClose={() => undefined} onStreak={onRestored} />;
}

/** The daily view opened on the streak the fetch was given, once it has arrived. */
async function open(onRestored?: (s: StreakSummary) => void): Promise<() => void> {
  const view = renderApp(<Opened onRestored={onRestored} />);
  await waitFor(() => expect(document.querySelector('.week-row')).not.toBeNull());
  return view.unmount;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe('a streak that can be won back', () => {
  it('says which streak ended, what wins it back and through which day, with today’s sessions so far', async () => {
    api({});
    await open();
    const sheet = screen.getByRole('dialog', { name: 'Streak' });
    expect(
      within(sheet).getByText(`Your 12-day streak ended. Finish 3 lessons or practice sessions in one day, by the end of ${LAST_DAY}, to win it back.`),
    ).toBeInTheDocument();
    expect(within(sheet).getByLabelText('1 of 3 today')).toBeInTheDocument();
    // Nothing to press and nothing to buy, and nothing that hurries.
    expect(within(sheet).queryByRole('button', { name: /^Restore/ })).not.toBeInTheDocument();
    expect(within(sheet).queryByText(/gems|hurry|lose|last chance|hours? left|minutes? left|buy|purchase/i)).not.toBeInTheDocument();
    // The streak's own story is all still there.
    expect(within(sheet).getByRole('heading', { name: 'Finish a lesson to start a streak' })).toBeInTheDocument();
    expect(within(sheet).getByText('Longest streak').nextElementSibling).toHaveTextContent('12');
    expect(within(sheet).getByRole('heading', { name: 'How your fire grows' })).toBeInTheDocument();
  });

  it('offers nothing when there is nothing to win back', async () => {
    api({ streak: ended(null) });
    await open();
    expect(screen.queryByRole('button', { name: /^Restore/ })).not.toBeInTheDocument();
    expect(document.querySelector('.streak-repair')).toBeNull();
  });

  it('greets a streak won back by today’s learning once, with how it came back', async () => {
    api({ streak: { ...back, restored: { days: 12, on: '2026-11-18' } } });
    const close = await open();
    expect(await screen.findByRole('heading', { name: 'Your 12-day streak is back' })).toBeInTheDocument();
    expect(screen.getByText('You won it back with today’s learning. The days you missed are kept.')).toBeInTheDocument();
    close();
    await open();
    expect(screen.queryByRole('heading', { name: 'Your 12-day streak is back' })).not.toBeInTheDocument();
  });

  it('restores a member’s streak on one press: a request with nothing in it, then the streak back, celebrated and heard once', async () => {
    const sent = api({ streak: ended(offer({ free: true })), repair: restoredAnswer });
    const heard: string[] = [];
    const stop = onLessonSound((s) => heard.push(s));
    const handed: StreakSummary[] = [];
    await open((s) => handed.push(s));
    await userEvent.click(await screen.findByRole('button', { name: 'Restore, free with Hevalo+' }));

    const title = await screen.findByRole('heading', { name: 'Your 12-day streak is back' });
    // The headline takes the focus the button had, so it is read out.
    expect(title).toHaveFocus();
    expect(screen.getByText('The days you missed are kept. It goes on with your next lesson.')).toBeInTheDocument();
    // The offer is gone, the fire is the restored streak's, and the numbers and the ladder are its own.
    expect(screen.queryByRole('button', { name: /^Restore/ })).not.toBeInTheDocument();
    expect(screen.getAllByTestId('fire')[0]).toHaveAttribute('data-stage', 'campfire');
    expect(document.querySelector('.fire-step.is-now')).toHaveTextContent('Campfire');
    // The celebration the site already has: its ring and its flecks, and the reward chime, once.
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
    api({ streak: ended(offer({ free: true })), repair: restoredAnswer });
    await open();
    await userEvent.click(await screen.findByRole('button', { name: 'Restore, free with Hevalo+' }));
    expect(await screen.findByRole('heading', { name: 'Your 12-day streak is back' })).toBeInTheDocument();
    const moment = document.querySelector('.streak-restored')!;
    expect(moment.querySelector('.celebrate-ring')).toBeNull();
    expect(moment.querySelectorAll('.celebrate-fleck')).toHaveLength(0);
  });

  it('keeps the offer to win it back when this month’s free restore turns out to be used', async () => {
    api({ streak: ended(offer({ free: true })), repair: () => jsonResponse(409, { code: 'WIN_IT_BACK', message: 'win it back by learning' }) });
    await open();
    await userEvent.click(await screen.findByRole('button', { name: 'Restore, free with Hevalo+' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Restore/ })).not.toBeInTheDocument());
    expect(screen.getByLabelText('1 of 3 today')).toBeInTheDocument();
    expect(screen.queryByText(/win it back by learning/)).not.toBeInTheDocument();
  });

  it('says plainly when the streak can no longer be restored', async () => {
    api({
      streak: ended(offer({ free: true })),
      repair: () => jsonResponse(409, { code: 'RESTORE_EXPIRED', message: 'the days in which that streak could be restored have passed' }),
    });
    await open();
    await userEvent.click(await screen.findByRole('button', { name: 'Restore, free with Hevalo+' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This streak can no longer be brought back.');
    // Nothing left to press that could only fail again.
    expect(screen.queryByRole('button', { name: /^Restore/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/^Your 12-day streak ended/)).not.toBeInTheDocument();
  });

  it('says the offer in Sorani, right to left', async () => {
    localStorage.setItem('hevalo_locale', 'ckb');
    await preloadCatalogue();
    api({ streak: ended(offer({ free: true })) });
    await open();
    expect(document.documentElement.dir).toBe('rtl');
    expect(await screen.findByRole('button', { name: 'بیگەڕێنەوە، لەگەڵ Hevalo+ بەخۆڕاییە' })).toBeInTheDocument();
    expect(screen.getByText(/^زنجیرەی .+ ڕۆژەکەت کۆتایی هات\./)).toBeInTheDocument();
  });
});

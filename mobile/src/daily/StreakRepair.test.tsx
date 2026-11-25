// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
// The fire as its props: which stage burns, whoever draws it.
vi.mock('../theme/Fire', () => import('../theme/testing/fireProbe'));
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import { onHaptic, resetHaptics } from '../feedback/haptics';
import type { HapticEvent } from '../feedback/hapticPacing';
import { formatDay } from '../i18n/format';
import type { Streak } from '../streak/format';
import { DailySheet } from './DailySheet';
import { TODAY_PATH, todayView } from './testing/today';
import { useToday } from './today';

/*
 * An ended streak in the daily view: one sentence naming the streak, what wins it back and the last day, with today's
 * sessions as marks; a member's free restore as one button; and the streak back with the app's celebration, whether a
 * restore or the day's learning brought it. Nothing is bought. The server decides; the request has no body.
 */

// Full motion here, so the celebration is seen to play; one test asks for none.
patchReactNativeWeb();
afterEach(() => {
  cleanup();
  localStorage.removeItem('kurda_locale_v1');
});

Object.defineProperty(window, 'visualViewport', { value: { height: 800, width: 320, scale: 1 }, configurable: true });
window.dispatchEvent(new Event('resize'));

/** The offer ends as the 21st begins: the last day is the 20th. */
const UNTIL = '2026-11-21T00:00:00.000Z';
const LAST_DAY = formatDay(new Date('2026-11-20T23:59:00.000Z'), 'en');

const ended = (repair: Streak['repair']): Streak => ({
  current: 0,
  longest: 12,
  freezes: 0,
  lastActiveOn: '2026-11-07',
  daysLearned: 41,
  sessionsPerFreeze: 5,
  repair,
});
const offer = (over: Partial<NonNullable<Streak['repair']>> = {}): NonNullable<Streak['repair']> => ({
  days: 12,
  free: false,
  sessionsToday: 1,
  sessionsNeeded: 3,
  until: UNTIL,
  ...over,
});
const back: Streak = { current: 12, longest: 12, freezes: 0, lastActiveOn: '2026-11-09', daysLearned: 41, sessionsPerFreeze: 5, repair: null };
const restoredAnswer = ok({ restored: true, duplicate: false, days: 12, free: true, streak: back });

/** A client answering the daily view with `streak` (in English and in Soranî, whose weeks start on Saturday), and `more`. */
function routes(streak: Streak, more: Parameters<typeof fakeClient>[0] = {}) {
  const view = ok(todayView({ streak }));
  return fakeClient({ [TODAY_PATH]: view, 'GET /me/today?weekStart=6': view, ...more });
}

function Opened({ onRestored }: { onRestored?: (s: Streak) => void }): React.JSX.Element {
  const today = useToday();
  return <DailySheet visible today={today} onClose={() => undefined} onStreak={onRestored} />;
}

/** The daily view, once its answer is in. */
async function open(onRestored?: (s: Streak) => void) {
  const view = renderWithProviders(<Opened onRestored={onRestored} />);
  await screen.findByTestId('daily-week');
  return view;
}

/** Every buzz from here to the end of `run`. */
async function feeling(run: (felt: HapticEvent[]) => Promise<void>): Promise<void> {
  const felt: HapticEvent[] = [];
  resetHaptics();
  const stop = onHaptic((e) => felt.push(e));
  try {
    await run(felt);
  } finally {
    stop();
  }
}

describe('a streak that can be won back', () => {
  it('says which streak ended, what wins it back and through which day, with today’s sessions so far', async () => {
    testAuth.client = routes(ended(offer()));
    await open();
    expect(screen.getByText(`Your 12-day streak ended. Finish 3 lessons or practice sessions in one day, by the end of ${LAST_DAY}, to win it back.`)).toBeTruthy();
    expect(screen.getByLabelText('1 of 3 today')).toBeTruthy();
    // Nothing to press and nothing to buy: the day's learning wins it back, and nothing is said that hurries.
    expect(screen.queryByRole('button', { name: /^Restore/ })).toBeNull();
    expect(screen.queryByText(/gems|buy|purchase/i)).toBeNull();
    expect(screen.queryByText(/hurry|lose|last chance|hours? left|minutes? left/i)).toBeNull();
    // The streak's own story is still all there under it.
    expect(screen.getByText('A lesson today starts a streak')).toBeTruthy();
    expect(screen.getByLabelText('Longest streak: 12')).toBeTruthy();
    expect(screen.getByTestId('fire-steps')).toBeTruthy();
  });

  it('offers nothing when there is nothing to win back', async () => {
    testAuth.client = routes(ended(null));
    await open();
    expect(screen.queryByTestId('streak-repair')).toBeNull();
  });

  it('greets a streak won back by today’s learning once, with how it came back', async () => {
    const wonBack: Streak = { ...back, restored: { days: 12, on: '2026-11-18' } };
    testAuth.client = routes(wonBack);
    const first = await open();
    expect(await screen.findByRole('heading', { name: 'Your 12-day streak is back' })).toBeTruthy();
    expect(screen.getByText('You won it back with today’s learning. The days you missed are kept.')).toBeTruthy();
    expect(screen.queryByTestId('streak-repair')).toBeNull();
    first.unmount();

    // A second look the same day is the plain streak again.
    await open();
    expect(screen.queryByRole('heading', { name: 'Your 12-day streak is back' })).toBeNull();
  });

  it('restores a member’s streak on one tap: a request with nothing in it, then the streak back, celebrated and felt once', async () => {
    const client = routes(ended(offer({ free: true })), { 'POST /me/streak/repair': restoredAnswer });
    testAuth.client = client;
    const handed: Streak[] = [];
    await feeling(async (felt) => {
      await open((s) => handed.push(s));
      fireEvent.click(await screen.findByRole('button', { name: 'Restore, free with Hevalo+' }));
      expect(await screen.findByRole('heading', { name: 'Your 12-day streak is back' })).toBeTruthy();
      expect(screen.getByText('The days you missed are kept. It goes on with your next lesson.')).toBeTruthy();
      // The offer is gone, the fire is the restored streak's, and the numbers and the ladder are its own.
      expect(screen.queryByTestId('streak-repair')).toBeNull();
      expect(screen.getAllByTestId('fire')[0]!.dataset.stage).toBe('campfire');
      expect(screen.getByTestId('step-now').getAttribute('aria-label')).toBe('Campfire, from day 7, your fire now');
      // The celebration the app already has: its burst, and the success buzz, once.
      expect(screen.getByTestId('streak-restored-burst')).toBeTruthy();
      await waitFor(() => expect(felt).toEqual(['celebrate']));
    });
    const posts = client.calls.filter((c) => c.method === 'POST');
    expect(posts).toEqual([{ method: 'POST', path: '/me/streak/repair', body: undefined }]);
    expect(handed).toEqual([back]);
  });

  it('brings the streak back without anything thrown or travelling under Reduce Motion', async () => {
    patchReactNativeWeb({ reduceMotion: true });
    try {
      testAuth.client = routes(ended(offer({ free: true })), { 'POST /me/streak/repair': restoredAnswer });
      await feeling(async (felt) => {
        await open();
        fireEvent.click(await screen.findByRole('button', { name: 'Restore, free with Hevalo+' }));
        expect(await screen.findByRole('heading', { name: 'Your 12-day streak is back' })).toBeTruthy();
        await waitFor(() => expect(screen.queryByTestId('streak-restored-burst')).toBeNull());
        // Still felt: Reduce Motion is about what moves, not about the buzz.
        await waitFor(() => expect(felt).toEqual(['celebrate']));
      });
    } finally {
      patchReactNativeWeb();
    }
  });

  it('keeps the offer to win it back when this month’s free restore turns out to be used', async () => {
    testAuth.client = routes(ended(offer({ free: true })), {
      'POST /me/streak/repair': fail({ code: 'WIN_IT_BACK', status: 409, message: 'win it back by learning' }),
    });
    await feeling(async (felt) => {
      await open();
      fireEvent.click(await screen.findByRole('button', { name: 'Restore, free with Hevalo+' }));
      await waitFor(() => expect(screen.queryByRole('button', { name: /^Restore/ })).toBeNull());
      expect(felt).toEqual(['error']);
    });
    expect(screen.getByTestId('streak-repair')).toBeTruthy();
    expect(screen.getByLabelText('1 of 3 today')).toBeTruthy();
    expect(screen.queryByText(/win it back by learning/)).toBeNull();
  });

  it('says plainly when the streak can no longer be restored', async () => {
    testAuth.client = routes(ended(offer({ free: true })), {
      'POST /me/streak/repair': fail({ code: 'RESTORE_EXPIRED', status: 409, message: 'the days in which that streak could be restored have passed' }),
    });
    await open();
    fireEvent.click(await screen.findByRole('button', { name: 'Restore, free with Hevalo+' }));
    expect(await screen.findByText('This streak can no longer be brought back.')).toBeTruthy();
    // In the catalogue's words, not the server's, with nothing left to press that could only fail again.
    expect(screen.queryByText(/have passed/)).toBeNull();
    expect(screen.queryByRole('button', { name: /^Restore/ })).toBeNull();
    expect(screen.queryByText(/^Your 12-day streak ended/)).toBeNull();
  });

  it('says the offer in Sorani, right to left', async () => {
    localStorage.setItem('kurda_locale_v1', 'ckb');
    testAuth.client = routes(ended(offer({ free: true })));
    await open();
    expect(await screen.findByRole('button', { name: 'بیگەڕێنەوە، لەگەڵ Hevalo+ بەخۆڕاییە' })).toBeTruthy();
    const sentence = screen.getByText(/^زنجیرەی .+ ڕۆژەکەت کۆتایی هات\./);
    expect(getComputedStyle(sentence).textAlign).toBe('right');
  });
});

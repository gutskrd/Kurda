// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
// the fire as its props: which stage burns, whoever draws it
vi.mock('../theme/Fire', () => import('../theme/testing/fireProbe'));
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fail, fakeClient, ok, testAuth } from '../reports/testing/auth';
import { onHaptic, resetHaptics } from '../feedback/haptics';
import type { HapticEvent } from '../feedback/hapticPacing';
import { formatDay } from '../i18n/format';
import type { Streak } from './format';
import { StreakSheet } from './StreakSheet';

/*
 * A streak that ended, in the streak's sheet: one calm sentence saying which
 * streak and through which day it can be brought back, one button with what
 * that costs, and — once it is pressed — the streak back, with the app's own
 * celebration. The server decides everything; the sheet sends a request with
 * nothing in it and reads the answer.
 */

// full motion here, so the celebration is seen to play; one test asks for none
patchReactNativeWeb();
afterEach(() => {
  cleanup();
  localStorage.removeItem('kurda_locale_v1');
});

Object.defineProperty(window, 'visualViewport', { value: { height: 800, width: 320, scale: 1 }, configurable: true });
window.dispatchEvent(new Event('resize'));

/** The offer ends as the 12th begins: the last day is the 11th. */
const UNTIL = '2026-11-12T00:00:00.000Z';
const LAST_DAY = formatDay(new Date('2026-11-11T23:59:00.000Z'), 'en');

const ended = (repair: Streak['repair']): Streak => ({
  current: 0,
  longest: 12,
  freezes: 0,
  lastActiveOn: '2026-11-07',
  daysLearned: 41,
  sessionsPerFreeze: 5,
  repair,
});
const paid = { days: 12, costGems: 50, free: false, until: UNTIL };
const back: Streak = { current: 12, longest: 12, freezes: 0, lastActiveOn: '2026-11-09', daysLearned: 41, sessionsPerFreeze: 5, repair: null };
const restoredAnswer = ok({ restored: true, duplicate: false, days: 12, costGems: 50, free: false, gems: 30, streak: back });
const wallet = (gems: number) => ok({ balances: { zer: 0, gems }, history: [] });

function open(streak: Streak, onRestored?: (s: Streak) => void) {
  return renderWithProviders(<StreakSheet streak={streak} onClose={() => undefined} onRestored={onRestored} />);
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

describe('a streak that can be restored', () => {
  it('says which streak ended and through which day, with the price on one button', async () => {
    const client = fakeClient({ 'GET /me/wallet': wallet(80) });
    testAuth.client = client;
    open(ended(paid));
    expect(screen.getByText(`Your 12-day streak ended. You can bring it back until the end of ${LAST_DAY}.`)).toBeTruthy();
    const restore = screen.getByRole('button', { name: 'Restore for 50 gems' });
    await waitFor(() => expect(client.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['GET /me/wallet']));
    expect(restore.getAttribute('aria-disabled')).not.toBe('true');
    // enough gems: nothing about the balance, and nothing is said that hurries
    expect(screen.queryByText(/^Your gems:/)).toBeNull();
    expect(screen.queryByText(/hurry|lose|last chance|hours? left|minutes? left/i)).toBeNull();
    // the streak's own story is still all there under it
    expect(screen.getByText('A lesson today starts a streak')).toBeTruthy();
    expect(screen.getByLabelText('12 Longest streak')).toBeTruthy();
    expect(screen.getByTestId('fire-ladder')).toBeTruthy();
  });

  it('offers nothing when there is nothing to restore', () => {
    testAuth.client = fakeClient({});
    open(ended(null));
    expect(screen.queryByTestId('streak-repair')).toBeNull();
    cleanup();
    // an older server says nothing at all about restoring
    open({ current: 0, longest: 12, freezes: 0, lastActiveOn: '2026-11-07' });
    expect(screen.queryByTestId('streak-repair')).toBeNull();
  });

  it('restores on one tap: a request with nothing in it, then the streak back, celebrated and felt once', async () => {
    const client = fakeClient({ 'GET /me/wallet': wallet(80), 'POST /me/streak/repair': restoredAnswer });
    testAuth.client = client;
    const handed: Streak[] = [];
    await feeling(async (felt) => {
      open(ended(paid), (s) => handed.push(s));
      fireEvent.click(await screen.findByRole('button', { name: 'Restore for 50 gems' }));
      expect(await screen.findByRole('heading', { name: 'Your 12-day streak is back' })).toBeTruthy();
      expect(screen.getByText('The days you missed are kept. It goes on with your next lesson.')).toBeTruthy();
      // the offer is gone, the fire is the restored streak's, and the numbers and the ladder are its own
      expect(screen.queryByTestId('streak-repair')).toBeNull();
      expect(screen.getAllByTestId('fire')[0]!.dataset.stage).toBe('campfire');
      expect(screen.getByTestId('rung-now').getAttribute('aria-label')).toBe('Campfire, from day 7, your fire now');
      // the celebration the app already has: its burst, and the success buzz, once
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
      testAuth.client = fakeClient({ 'GET /me/wallet': wallet(80), 'POST /me/streak/repair': restoredAnswer });
      await feeling(async (felt) => {
        open(ended(paid));
        fireEvent.click(await screen.findByRole('button', { name: 'Restore for 50 gems' }));
        expect(await screen.findByRole('heading', { name: 'Your 12-day streak is back' })).toBeTruthy();
        await waitFor(() => expect(screen.queryByTestId('streak-restored-burst')).toBeNull());
        // still felt: Reduce Motion is about what moves, not about the buzz
        await waitFor(() => expect(felt).toEqual(['celebrate']));
      });
    } finally {
      patchReactNativeWeb();
    }
  });

  it('shows the balance and where gems come from when they are short, and a button that cannot be pressed', async () => {
    const client = fakeClient({ 'GET /me/wallet': wallet(20) });
    testAuth.client = client;
    open(ended(paid));
    expect(await screen.findByText('Your gems: 20')).toBeTruthy();
    expect(screen.getByText('Gems come from moving up a league, season rewards and events.')).toBeTruthy();
    const restore = screen.getByRole('button', { name: 'Restore for 50 gems' });
    expect(restore.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(restore);
    expect(client.calls.some((c) => c.method === 'POST')).toBe(false);
    // and nothing about buying any
    expect(screen.queryByText(/buy|purchase/i)).toBeNull();
  });

  it('says a Hevalo+ member’s restore is free, and asks for no balance', async () => {
    const client = fakeClient({ 'POST /me/streak/repair': ok({ restored: true, duplicate: false, days: 12, costGems: 0, free: true, gems: 0, streak: back }) });
    testAuth.client = client;
    open(ended({ days: 12, costGems: 0, free: true, until: UNTIL }));
    const restore = screen.getByRole('button', { name: 'Restore, free with Hevalo+' });
    expect(screen.queryByText(/^Your gems:/)).toBeNull();
    fireEvent.click(restore);
    expect(await screen.findByRole('heading', { name: 'Your 12-day streak is back' })).toBeTruthy();
    expect(client.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['POST /me/streak/repair']);
  });

  it('reads the balance again when the server says the gems were short after all', async () => {
    let gems = 80;
    const client = fakeClient({
      'GET /me/wallet': () => wallet(gems),
      'POST /me/streak/repair': () => {
        gems = 10; // spent somewhere else since the sheet opened
        return fail({ code: 'INSUFFICIENT_FUNDS', status: 402, message: 'not enough Gems' });
      },
    });
    testAuth.client = client;
    await feeling(async (felt) => {
      open(ended(paid));
      fireEvent.click(await screen.findByRole('button', { name: 'Restore for 50 gems' }));
      expect(await screen.findByText('Your gems: 10')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Restore for 50 gems' }).getAttribute('aria-disabled')).toBe('true');
      expect(felt).toEqual(['error']);
    });
    // the offer stays: it is still theirs to take once the gems are there
    expect(screen.getByTestId('streak-repair')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /is back$/ })).toBeNull();
  });

  it('says plainly when the streak can no longer be restored', async () => {
    testAuth.client = fakeClient({
      'GET /me/wallet': wallet(80),
      'POST /me/streak/repair': fail({ code: 'RESTORE_EXPIRED', status: 409, message: 'the days in which that streak could be restored have passed' }),
    });
    open(ended(paid));
    fireEvent.click(await screen.findByRole('button', { name: 'Restore for 50 gems' }));
    expect(await screen.findByText('This streak can no longer be brought back.')).toBeTruthy();
    // in the catalogue's words, not the server's, and with nothing left to press that could only fail again
    expect(screen.queryByText(/have passed/)).toBeNull();
    expect(screen.queryByRole('button', { name: /^Restore/ })).toBeNull();
    expect(screen.queryByText(/^Your 12-day streak ended/)).toBeNull();
  });

  it('says the offer in Sorani, right to left', async () => {
    localStorage.setItem('kurda_locale_v1', 'ckb');
    testAuth.client = fakeClient({ 'GET /me/wallet': wallet(80) });
    open(ended(paid));
    expect(await screen.findByRole('button', { name: /^بە .+ گەوهەر بیگەڕێنەوە$/ })).toBeTruthy();
    const sentence = screen.getByText(/^زنجیرەی .+ ڕۆژەکەت کۆتایی هات\./);
    expect(getComputedStyle(sentence).textAlign).toBe('right');
  });
});

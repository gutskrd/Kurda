// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../../reports/testing/stubs'));
vi.mock('../../auth/AuthContext', () => import('../../reports/testing/auth'));
// a badge earned meanwhile waits on the moment (badges/BadgeCelebrationHost.tsx)
vi.mock('@react-navigation/native', () => import('../../play/testing/navigation'));
// the fire as its props: how big it burns and what it grows from, whoever draws it
vi.mock('../../theme/Fire', () => import('../../theme/testing/fireProbe'));
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AccessibilityInfo } from 'react-native';
import { CELEBRATE_MS, FIRE_GREW_READ_MS, FIRE_GROW } from '@kurda/shared';
import { renderWithProviders } from '../../reports/testing/harness';
import { patchReactNativeWeb } from '../../reports/testing/rnWebPatches';
import { onHaptic, resetHaptics } from '../../feedback/haptics';
import { onSound, resetSounds } from '../../feedback/sounds';
import type { Streak } from '../types';
import { StreakMoment } from './StreakMoment';

patchReactNativeWeb({ reduceMotion: true });
beforeEach(() => {
  resetHaptics();
  resetSounds();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.removeItem('kurda_locale_v1');
});

// 2026-10-29 is a Thursday
const streak: Streak = {
  current: 6,
  longest: 9,
  freezes: 0,
  lastActiveOn: '2026-10-29',
  freezeProgress: 2,
  sessionsPerFreeze: 5,
  today: '2026-10-29',
  recent: [
    { date: '2026-10-24', kind: 'learned' },
    { date: '2026-10-26', kind: 'learned' },
    { date: '2026-10-27', kind: 'frozen' },
  ],
};

const show = (over: Partial<Streak> = {}, goalDone = false, onContinue = () => undefined) =>
  renderWithProviders(<StreakMoment streak={{ ...streak, ...over }} goalDone={goalDone} onContinue={onContinue} />);

/** the week's circles in the order they are laid out, by what each day was */
const days = () => within(screen.getByTestId('streak-week')).getAllByTestId(/^day-/).map((d) => d.getAttribute('data-testid'));

describe('the kept streak', () => {
  it('opens on the flame, felt and heard once, and a tap moves on to the streak itself', async () => {
    const felt: string[] = [];
    const heard: string[] = [];
    const stopFeel = onHaptic((e) => felt.push(e));
    const stopHear = onSound((f) => heard.push(String(f)));
    try {
      show();
      const flame = await screen.findByTestId('lesson-streak-flame');
      expect(flame.getAttribute('aria-label')).toBe('6 day streak');
      await waitFor(() => expect(felt).toEqual(['celebrate']));
      expect(heard).toHaveLength(1);
      fireEvent.click(flame);
      expect(await screen.findByRole('heading', { name: '6 day streak' })).toBeTruthy();
      expect(felt).toEqual(['celebrate']);
    } finally {
      stopFeel();
      stopHear();
    }
  });

  it('moves on by itself after a moment', async () => {
    show();
    expect(await screen.findByTestId('lesson-streak-flame')).toBeTruthy();
    expect(await screen.findByRole('heading', { name: '6 day streak' })).toBeTruthy();
  });

  it('lays out the week: learned, kept by a freeze, missed, today and the days ahead', async () => {
    show({ recent: [{ date: '2026-10-26', kind: 'learned' }, { date: '2026-10-27', kind: 'frozen' }] });
    fireEvent.click(await screen.findByTestId('lesson-streak-flame'));
    await screen.findByTestId('streak-week');
    // a Monday week in English; today not learned yet is a ring of its own
    expect(days()).toEqual(['day-learned', 'day-frozen', 'day-missed', 'day-today', 'day-ahead', 'day-ahead', 'day-ahead']);
    expect(screen.getByLabelText('This week: 1 of 7 days learned, 1 kept by a freeze')).toBeTruthy();
    expect(within(screen.getByTestId('week-2026-10-26')).getByText('Mo')).toBeTruthy();
    expect(screen.getByLabelText('2 of 5 sessions to your next freeze')).toBeTruthy();
  });

  it('leaves the week out when an older server did not say what today is', async () => {
    show({ today: undefined, recent: undefined });
    fireEvent.click(await screen.findByTestId('lesson-streak-flame'));
    expect(await screen.findByRole('heading', { name: '6 day streak' })).toBeTruthy();
    expect(screen.queryByTestId('streak-week')).toBeNull();
  });

  it('starts the week on Saturday in Kurdish', async () => {
    localStorage.setItem('kurda_locale_v1', 'ku');
    show({ recent: [...streak.recent!, { date: '2026-10-29', kind: 'learned' }] });
    fireEvent.click(await screen.findByTestId('lesson-streak-flame'));
    await screen.findByText('Ş');
    const columns = within(screen.getByTestId('streak-week')).getAllByTestId(/^week-/);
    expect(columns.map((c) => c.getAttribute('data-testid'))).toEqual([
      'week-2026-10-24',
      'week-2026-10-25',
      'week-2026-10-26',
      'week-2026-10-27',
      'week-2026-10-28',
      'week-2026-10-29',
      'week-2026-10-30',
    ]);
    expect(within(columns[0]!).getByText('Ş')).toBeTruthy();
    expect(days()).toEqual(['day-learned', 'day-missed', 'day-learned', 'day-frozen', 'day-missed', 'day-learned', 'day-ahead']);
  });

  it('reads the week from the right in Soranî, starting on Saturday', async () => {
    localStorage.setItem('kurda_locale_v1', 'ckb');
    show();
    fireEvent.click(await screen.findByTestId('lesson-streak-flame'));
    await screen.findByText('ش');
    const week = screen.getByTestId('streak-week');
    expect(getComputedStyle(week).flexDirection).toBe('row-reverse');
    expect(within(week).getAllByTestId(/^week-/)[0]!.getAttribute('data-testid')).toBe('week-2026-10-24');
  });

  it('has Hevalo welcome back somebody who missed days, and cheer a longest run', async () => {
    show({ current: 1, longest: 9 });
    fireEvent.click(await screen.findByTestId('lesson-streak-flame'));
    expect(await screen.findByText('Welcome back! A fresh start is still a great start.')).toBeTruthy();
    // leaning out of his window under his words, the fire burning in front of it: drawn after it, so over its corner
    const scene = within(screen.getByTestId('lesson-streak-day'));
    expect(scene.getByTestId('hevalo-window').compareDocumentPosition(scene.getByTestId('fire')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    cleanup();

    show({ current: 9, longest: 9 });
    fireEvent.click(await screen.findByTestId('lesson-streak-flame'));
    expect(await screen.findByText('9 days, a new record! Let’s see how far it goes.')).toBeTruthy();
  });

  it('says see you tomorrow once today’s goal is done, and goes on with it', async () => {
    const onContinue = vi.fn();
    show({}, true, onContinue);
    fireEvent.click(await screen.findByTestId('lesson-streak-flame'));
    fireEvent.click(await screen.findByRole('button', { name: 'See you tomorrow' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});

/** What a screen reader is told, in order. */
function listen(): string[] {
  const said: string[] = [];
  (AccessibilityInfo as unknown as { announceForAccessibility: (words: string) => void }).announceForAccessibility = (words) => said.push(words);
  return said;
}

describe('the day the fire grew', () => {
  const lands = FIRE_GROW.delayMs + FIRE_GROW.ms;

  it('grows the fire from yesterday, says what it grew into as it lands, felt then and only then, and stays to be read', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const said = listen();
    const felt: string[] = [];
    const heard: string[] = [];
    const stopFeel = onHaptic((e) => felt.push(e));
    const stopHear = onSound((f) => heard.push(String(f)));
    try {
      show({ current: 7, longest: 9 });
      const flame = await screen.findByTestId('lesson-streak-flame');
      const fire = within(flame).getByTestId('fire');
      expect(fire.dataset.stage).toBe('campfire');
      expect(fire.dataset.from).toBe('kindling');
      expect(said).toEqual(['7 day streak']);
      // its place is kept from the start, the words not said before the growth lands
      expect(screen.getByTestId('lesson-streak-grew').textContent).toBe('A week in, your fire is a campfire now.');
      await act(() => vi.advanceTimersByTimeAsync(lands - 50));
      expect(felt).toEqual([]);
      expect(heard).toEqual([]);
      await act(() => vi.advanceTimersByTimeAsync(50));
      expect(said).toEqual(['7 day streak', 'A week in, your fire is a campfire now.']);
      expect(felt).toEqual(['celebrate']);
      expect(heard).toHaveLength(1);
      // still there when another day would have moved on, until the line has been read
      await act(() => vi.advanceTimersByTimeAsync(FIRE_GREW_READ_MS - 100));
      expect(screen.getByTestId('lesson-streak-flame')).toBeTruthy();
      await act(() => vi.advanceTimersByTimeAsync(200));
      expect(screen.queryByTestId('lesson-streak-flame')).toBeNull();
      expect(screen.getByRole('heading', { name: '7 day streak' })).toBeTruthy();
      expect(felt).toEqual(['celebrate']);
    } finally {
      stopFeel();
      stopHear();
    }
  });

  it('says you lit your fire on the first day, grown from cold logs', async () => {
    listen();
    show({ current: 1, longest: 1, daysLearned: 1 });
    const flame = await screen.findByTestId('lesson-streak-flame');
    expect(within(flame).getByTestId('fire').dataset.from).toBe('cold');
    expect(screen.getByTestId('lesson-streak-grew').textContent).toBe('You lit your fire!');
  });

  it('is still felt once when tapped away before the growth lands', async () => {
    const felt: string[] = [];
    const stop = onHaptic((e) => felt.push(e));
    try {
      listen();
      show({ current: 30, longest: 30 });
      fireEvent.click(await screen.findByTestId('lesson-streak-flame'));
      expect(await screen.findByRole('heading', { name: '30 day streak' })).toBeTruthy();
      expect(felt).toEqual(['celebrate']);
    } finally {
      stop();
    }
  });

  it('burns at the fire of today on another day, growing from nothing, and moves on in a second and a half', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    listen();
    show({ current: 12 });
    const flame = await screen.findByTestId('lesson-streak-flame');
    expect(within(flame).getByTestId('fire').dataset.stage).toBe('campfire');
    expect(within(flame).getByTestId('fire').dataset.from).toBeUndefined();
    expect(screen.queryByTestId('lesson-streak-grew')).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(CELEBRATE_MS + 50));
    expect(screen.queryByTestId('lesson-streak-flame')).toBeNull();
  });
});

describe('the fire beside the window', () => {
  const stage = async (current: number): Promise<string | null> => {
    show({ current, longest: Math.max(current, 9) });
    fireEvent.click(await screen.findByTestId('lesson-streak-flame'));
    await screen.findByTestId('lesson-streak-day');
    const line = screen.queryByTestId('streak-stage')?.textContent ?? null;
    const fire = within(screen.getByTestId('lesson-streak-day')).getByTestId('fire').dataset.stage;
    cleanup();
    return `${fire}: ${line}`;
  };

  it('burns at the fire of today, its stage named under the streak with the next as a near goal', async () => {
    expect(await stage(1)).toBe('spark: Spark · a little flame at 3 days');
    expect(await stage(5)).toBe('kindling: Little flame · a campfire at 7 days');
    expect(await stage(12)).toBe('campfire: Campfire · a big fire at 14 days');
    expect(await stage(45)).toBe('bonfire: Bonfire · a blaze at 100 days');
    // at the biggest there is, simply its name
    expect(await stage(400)).toBe('newroz: Newroz fire');
  });

  it('names the stage in Sorani too', async () => {
    localStorage.setItem('kurda_locale_v1', 'ckb');
    show({ current: 12 });
    fireEvent.click(await screen.findByTestId('lesson-streak-flame'));
    expect((await screen.findByTestId('streak-stage')).textContent).toMatch(/^ئاگری کەمپ · ئاگرێکی گەورە لە ڕۆژی .+دا$/);
  });
});


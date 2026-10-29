// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('react-native-web'));
vi.mock('react-native-svg', () => import('../../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../../reports/testing/stubs'));
vi.mock('../../auth/AuthContext', () => import('../../reports/testing/auth'));
// a badge earned meanwhile waits on the moment (badges/BadgeCelebrationHost.tsx)
vi.mock('@react-navigation/native', () => import('../../play/testing/navigation'));
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
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
    // leaning out of his window under his words
    expect(within(screen.getByTestId('lesson-streak-day')).getByTestId('hevalo-window')).toBeTruthy();
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

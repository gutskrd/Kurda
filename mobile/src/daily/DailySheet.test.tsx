// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
vi.mock('../theme/Fire', () => import('../theme/testing/fireProbe'));
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { addDays, fireLevel } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { navigation } from '../play/testing/navigation';
import { onHaptic, resetHaptics } from '../feedback/haptics';
import type { HapticEvent } from '../feedback/hapticPacing';
import { DailySheet } from './DailySheet';
import { TODAY_PATH, fourDayView, todayView } from './testing/today';
import { useToday, type TodayView } from './today';

/* The daily view, as on the website: the fire and the streak, the week, today's Zêr, the week's numbers, the insights and the latest badge. */

patchReactNativeWeb({ reduceMotion: true });
afterEach(() => {
  cleanup();
  localStorage.removeItem('kurda_locale_v1');
  navigation.navigate.mockReset();
});

function Opened({ onLearn }: { onLearn?: () => void }): React.JSX.Element {
  const today = useToday();
  return <DailySheet visible today={today} onClose={() => undefined} onLearn={onLearn} />;
}

async function open(view: TodayView, more: Parameters<typeof fakeClient>[0] = {}, onLearn?: () => void) {
  const client = fakeClient({ [TODAY_PATH]: ok(view), ...more });
  testAuth.client = client;
  renderWithProviders(<Opened onLearn={onLearn} />);
  await screen.findByTestId('daily-week');
  return client;
}

describe('the daily view', () => {
  it('shows the fire with the streak large under it, and the week with the days learned', async () => {
    await open(fourDayView());
    expect(screen.getByLabelText('4 day streak')).toBeTruthy();
    expect(screen.getAllByTestId('fire')[0]!.dataset.stage).toBe(fireLevel(4).stage);
    const week = screen.getByTestId('daily-week');
    expect(week.getAttribute('aria-label')).toBe('This week: 3 of 7 days learned');
    expect(within(week).getAllByTestId('day-learned')).toHaveLength(3);
    expect(within(week).getAllByTestId('day-ahead')).toHaveLength(4);
    expect(week.textContent).toBe('MTWTFSS');
  });

  it('counts this week’s days, lessons, practice and XP from the server’s days', async () => {
    await open(fourDayView());
    for (const label of ['3 Days', '4 Lessons', '1 Practice', '85 XP']) expect(screen.getByLabelText(label)).toBeTruthy();
  });

  it('opens the insights as a step: this week against last by the same day, with every day’s numbers', async () => {
    await open(fourDayView());
    fireEvent.click(screen.getByRole('button', { name: '2 insights available' }));
    expect(await screen.findByText('50 more XP than by this day last week')).toBeTruthy();
    expect(screen.getByText('2 more lessons than by this day last week')).toBeTruthy();
    const chart = screen.getByTestId('insights-chart');
    expect(chart.getAttribute('aria-label')).toContain('Monday: 40 XP this week, 0 XP last week');
    expect(chart.getAttribute('aria-label')).toContain('Sunday: 30 XP last week');
    // Back to the view with the sheet’s ‹.
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByLabelText('4 day streak')).toBeTruthy();
  });

  it('offers no insights when neither week has anything, and says how a streak starts', async () => {
    await open(todayView());
    expect(screen.queryByRole('button', { name: /insights? available/ })).toBeNull();
    expect(screen.getByLabelText('A lesson today starts a streak')).toBeTruthy();
  });

  it('says a learner’s first week kindly rather than as a gain on nothing', async () => {
    await open(todayView({ days: { 8: { learned: true, lessons: 1, xp: 20 } }, streak: { current: 1, daysLearned: 1 } }));
    fireEvent.click(screen.getByRole('button', { name: 'One insight available' }));
    expect(await screen.findByText('Your first week: here is where it starts.')).toBeTruthy();
  });

  it('claims today’s Zêr on one tap, celebrated and felt once, and asks for the view again', async () => {
    let claimed = false;
    const felt: HapticEvent[] = [];
    resetHaptics();
    const stop = onHaptic((e) => felt.push(e));
    try {
      const client = await open(fourDayView(), {
        [TODAY_PATH]: () => ok(claimed ? fourDayView({ daily: { canClaim: false, learnedToday: true, alreadyClaimedToday: true, claimableDay: 3, reward: 20, cycleDay: 3 } }) : fourDayView()),
        'POST /rewards/daily/claim': () => {
          claimed = true;
          return ok({ claimed: true, cycleDay: 3, reward: 20, balance: 120 });
        },
      });
      expect(screen.getByText('Day 3 reward: +20 Zêr')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Claim' }));
      expect(await screen.findByText('+20 Zêr claimed!')).toBeTruthy();
      expect(screen.getByTestId('daily-zer-landed')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Claim' })).toBeNull();
      await waitFor(() => expect(felt).toEqual(['celebrate']));
      await waitFor(() => expect(client.calls.filter((c) => c.path === '/me/today?weekStart=1')).toHaveLength(2));
    } finally {
      stop();
    }
  });

  it('asks for a lesson first, with the way to Learn', async () => {
    const learn = vi.fn();
    await open(fourDayView({ daily: { canClaim: false, learnedToday: false, claimableDay: 3, reward: 20, cycleDay: 2 } }), {}, learn);
    expect(screen.getByText('Finish a lesson or a practice session to claim today’s +20 Zêr.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Go to Learn' }));
    expect(learn).toHaveBeenCalled();
  });

  it('says tomorrow once today’s Zêr is taken', async () => {
    await open(fourDayView({ daily: { canClaim: false, learnedToday: true, alreadyClaimedToday: true, claimableDay: 3, reward: 20, cycleDay: 3 } }));
    expect(screen.getByText('Come back tomorrow for more Zêr.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Claim' })).toBeNull();
  });

  it('shows the latest badge with its name and level, leading to every badge', async () => {
    await open(fourDayView({ badge: { key: 'ders', tier: 2, earnedAt: '2026-11-12T00:00:00.000Z' } }));
    fireEvent.click(screen.getByRole('button', { name: 'Earned a badge: Wane · Zîv' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Badges');
  });

  it('keeps the freezes, the fire’s stages and the longest streak quietly at the end', async () => {
    await open(fourDayView());
    expect(screen.getByLabelText('You have a freeze saved')).toBeTruthy();
    expect(screen.getByTestId('step-now').getAttribute('aria-label')).toBe('Little flame, from day 3, your fire now');
    expect(screen.getAllByTestId('step-ahead')).toHaveLength(5);
    expect(screen.getByLabelText('Longest streak: 9')).toBeTruthy();
  });

  it('asks for the week from Saturday in Sorani, and lays it out in reading order with the course’s day names', async () => {
    localStorage.setItem('kurda_locale_v1', 'ckb');
    const saturdays = fourDayView();
    const client = fakeClient({
      'GET /me/today?weekStart=6': ok({ ...saturdays, weekStart: 6, days: saturdays.days.map((d, i) => ({ ...d, date: addDays('2026-11-07', i) })) }),
    });
    testAuth.client = client;
    renderWithProviders(<Opened />);
    const week = await screen.findByTestId('daily-week');
    expect(week.textContent?.[0]).toBe('ش');
    expect(getComputedStyle(week).flexDirection).toBe('row-reverse');
  });
});

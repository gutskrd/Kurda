// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// the pull to refresh as a button: the web's RefreshControl draws nothing to pull
vi.mock('react-native', async () => {
  const rn = (await import('../play/testing/native')) as unknown as Record<string, unknown>;
  const { createElement, Fragment } = await import('react');
  const RefreshControl = ({ onRefresh, children }: { onRefresh: () => void; children?: React.ReactNode }) =>
    createElement(Fragment, null, createElement('button', { 'aria-label': 'Pull to refresh', onClick: onRefresh }), children);
  return { ...rn, RefreshControl };
});
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
// the reminder banner reads the phone's answer (push/ReminderNudge.tsx)
vi.mock('expo-notifications', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { AccessibilityInfo } from 'react-native';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { navigation } from '../play/testing/navigation';
import { LearnScreen } from './LearnScreen';
import { LEARN_VIEW_KEY } from './useLearnView';
import { onHaptic } from '../feedback/haptics';
import type { HapticEvent } from '../feedback/hapticPacing';
import { keptKey } from '../streak/kept';

patchReactNativeWeb({ reduceMotion: true });
beforeEach(() => {
  localStorage.clear();
  navigation.navigate.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const MAP = {
  course: { id: 'c1', title: 'Kurmancî' },
  units: [
    {
      unitId: 'u1',
      title: 'Unit 1',
      skills: [
        { skillId: 's1', level: 1, title: 'Silav', state: 'completed', strength: 100, hasGrammar: false, firstLessonId: 'l1' },
        { skillId: 's2', level: 1, title: 'Malbat', state: 'unlocked', strength: 0, hasGrammar: false, firstLessonId: 'l2' },
        { skillId: 's3', level: 1, title: 'Hejmar', state: 'locked', strength: 0, hasGrammar: false, firstLessonId: null },
      ],
    },
  ],
};

const STREAK = { current: 6, longest: 9, freezes: 0, lastActiveOn: null, daysLearned: 31 };

function client(streak: Record<string, unknown> = STREAK) {
  testAuth.client = fakeClient({
    'GET /courses': ok({ courses: [{ id: 'c1', slug: 'kmr', title: 'Kurmancî', dialect: 'kmr' }] }),
    'GET /courses/c1/map': ok(MAP),
    'GET /me/daily-goal': ok({ goal: 20, effectiveGoal: 20, earnedXp: 12, progress: 0.6, completed: false }),
    'GET /me': ok({ user: { streak } }),
    'GET /me/wallet': ok({ balances: { zer: 1240, gems: 3 } }),
    'GET /practice/due': ok({ due: 8, available: 20, open: null }),
    'GET /stories': ok({ stories: [{ slug: 'a' }] }),
    'GET /ranks/me': ok({ ranks: [], cooldownUntil: null, season: { id: '2026-Q4', name: 'payiz', year: 2026, startsAt: '', endsAt: '', daysLeft: 40 } }),
    'GET /play/invites': ok({ incoming: [], outgoing: [] }),
  });
}

const lessonsTab = () => screen.getByRole('button', { name: 'Lessons' });
const gamesTab = () => screen.getByRole('button', { name: 'Games' });

describe('Learn', () => {
  it('opens on Lessons, with one next step at the top', async () => {
    client();
    renderWithProviders(<LearnScreen />);
    expect(lessonsTab().getAttribute('aria-selected')).toBe('true');
    expect(gamesTab().getAttribute('aria-selected')).toBe('false');
    // the next open skill, how far the course has come, and one button
    expect(await screen.findByText('Malbat', { selector: '[role="heading"]' })).toBeTruthy();
    expect(screen.getByText('1 of 3 skills done')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Lesson', { lessonId: 'l2', courseId: 'c1' });
  });

  // the path comes straight after the next step and the tools; the week and the day's extras wait under it
  it('puts the path before the rest of today', async () => {
    client();
    renderWithProviders(<LearnScreen />);
    const path = await screen.findByRole('heading', { name: 'Course map' });
    const more = screen.getByRole('heading', { name: 'More for today' });
    expect(path.compareDocumentPosition(more) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Unit 1 trophy, not earned yet' }).compareDocumentPosition(more) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  /*
   * The corner of Learn says where today stands at a glance — the streak, the
   * day's goal, the Zêr — and each opens onto more.
   */
  it('says how today is going in the top corner, and opens each onto more', async () => {
    client();
    renderWithProviders(<LearnScreen />);
    const streak = await screen.findByRole('button', { name: 'Streak: 6 days' });
    expect(screen.getByRole('button', { name: '12 of 20 XP today' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '1,240 Zêr. Open the shop' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Shop');

    // the streak's whole story: the run, and the numbers that never go down
    fireEvent.click(streak);
    expect(await screen.findByText('Longest streak')).toBeTruthy();
    expect(screen.getByText('31')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' }).at(-1)!);

    // the day's goal, where it can be changed
    fireEvent.click(screen.getByRole('button', { name: '12 of 20 XP today' }));
    expect(await screen.findByText('Goal: 20 XP')).toBeTruthy();
  });

  it('keeps the practice tools one tap away, and says what is due for review', async () => {
    client();
    renderWithProviders(<LearnScreen />);
    // practice opens on its hub, the count of words due on its tile
    fireEvent.click(await screen.findByRole('button', { name: 'Practice, 8 words due' }));
    expect(navigation.navigate).toHaveBeenCalledWith('PracticeHub');
    fireEvent.click(screen.getByRole('button', { name: 'Dictionary, Look up any word' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Dictionary');
    fireEvent.click(screen.getByRole('button', { name: 'Alphabet, Every letter, and how it sounds' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Alphabet');
  });

  it('switches to the games, and remembers the choice on this device', async () => {
    client();
    renderWithProviders(<LearnScreen />);
    fireEvent.click(gamesTab());
    expect(gamesTab().getAttribute('aria-selected')).toBe('true');
    expect(await screen.findByTestId('game-wordle')).toBeTruthy();
    await waitFor(() => expect(localStorage.getItem(LEARN_VIEW_KEY)).toBe('games'));

    // the next time Learn opens, it opens where it was left
    cleanup();
    renderWithProviders(<LearnScreen />);
    await waitFor(() => expect(gamesTab().getAttribute('aria-selected')).toBe('true'));
  });

  /*
   * hevalo://play is the old Play tab's address. It arrives as `view: games`
   * and opens the games — without becoming the remembered choice, because
   * following a link is not choosing.
   */
  it('opens on Games for the old Play link, and lets the link go once it is shown', async () => {
    client();
    const shown = vi.fn();
    renderWithProviders(<LearnScreen view="games" onViewShown={shown} />);
    expect(gamesTab().getAttribute('aria-selected')).toBe('true');
    expect(await screen.findByTestId('game-battle')).toBeTruthy();
    expect(shown).toHaveBeenCalled();
    expect(localStorage.getItem(LEARN_VIEW_KEY)).toBeNull();
  });

  it('lists the games as cards that say who they are played with, one tap to open', async () => {
    client();
    renderWithProviders(<LearnScreen view="games" />);
    const battle = await screen.findByTestId('game-battle');
    expect(battle.getAttribute('aria-label')).toBe('Peyvok Battle, With friends. Race a friend to the same word.');
    fireEvent.click(battle);
    expect(navigation.navigate).toHaveBeenCalledWith('WordleBattle');
    // the rankings and the league, small, at the top
    fireEvent.click(screen.getByRole('button', { name: /^Ranks/ }));
    expect(navigation.navigate).toHaveBeenCalledWith('Ranks');
    fireEvent.click(screen.getByRole('button', { name: 'Leagues' }));
    expect(navigation.navigate).toHaveBeenCalledWith('League');
  });

  /*
   * A freeze spent by itself overnight is said once, on the next visit: what
   * happened, the freezes held, how the next is earned, and the next lesson.
   */
  it('says once that a freeze kept the streak, with the next lesson one tap away', async () => {
    const kept = { ...STREAK, maxFreezes: 1, lastActiveOn: '2026-10-27', freezeUsedOn: '2026-10-27', freezeProgress: 3, sessionsPerFreeze: 5 };
    client(kept);
    const felt: HapticEvent[] = [];
    const stop = onHaptic((event) => felt.push(event));
    const announce = vi.spyOn(AccessibilityInfo, 'announceForAccessibility');
    renderWithProviders(<LearnScreen />);
    const title = 'Your 6-day streak was kept by a freeze';
    expect(await screen.findByRole('heading', { name: title }, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByLabelText('Freezes: 0 of 1')).toBeTruthy();
    expect(screen.getByText('2 more lessons earn another freeze.')).toBeTruthy();
    expect(felt).toEqual(['celebrate']);
    expect(announce).toHaveBeenCalledWith(title);
    expect(localStorage.getItem(keptKey('me'))).toBe('2026-10-27');

    fireEvent.click(screen.getByRole('button', { name: 'Start a lesson' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Lesson', { lessonId: 'l2', courseId: 'c1' });
    stop();

    // the same kept day is not said again
    cleanup();
    renderWithProviders(<LearnScreen />);
    await screen.findByRole('button', { name: 'Continue' });
    await act(async () => new Promise((resolve) => setTimeout(resolve, 1600)));
    expect(screen.queryByRole('heading', { name: title })).toBeNull();
    }, 15_000);

  it('closes on Not now, and says nothing when no freeze was spent', async () => {
    client({ ...STREAK, lastActiveOn: '2026-10-27', freezeUsedOn: '2026-10-27', freezeProgress: 4, sessionsPerFreeze: 5 });
    renderWithProviders(<LearnScreen />);
    expect(await screen.findByText('One more lesson earns another freeze.', {}, { timeout: 3000 })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(screen.queryByText('One more lesson earns another freeze.')).toBeNull());
    expect(navigation.navigate).not.toHaveBeenCalled();

    cleanup();
    localStorage.clear();
    client();
    renderWithProviders(<LearnScreen />);
    await screen.findByRole('button', { name: 'Continue' });
    await act(async () => new Promise((resolve) => setTimeout(resolve, 1600)));
    expect(screen.queryByRole('button', { name: 'Start a lesson' })).toBeNull();
  }, 15_000);

  it('reads the course and the streak again when pulled down', async () => {
    client();
    renderWithProviders(<LearnScreen />);
    await screen.findByRole('button', { name: 'Continue' });
    await screen.findByRole('button', { name: 'Streak: 6 days' });
    const count = (path: string) => (testAuth.client as ReturnType<typeof fakeClient>).calls.filter((c) => c.path === path).length;
    const before = { map: count('/courses/c1/map'), me: count('/me') };
    fireEvent.click(screen.getByRole('button', { name: 'Pull to refresh' }));
    await waitFor(() => expect(count('/courses/c1/map')).toBe(before.map + 1));
    await waitFor(() => expect(count('/me')).toBe(before.me + 1));
  });
});

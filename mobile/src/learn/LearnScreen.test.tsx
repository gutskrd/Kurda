// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('@react-native-community/netinfo', () => import('../reports/testing/netinfo'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../reports/testing/harness';
import { patchReactNativeWeb } from '../reports/testing/rnWebPatches';
import { fakeClient, ok, testAuth } from '../reports/testing/auth';
import { navigation } from '../play/testing/navigation';
import { LearnScreen } from './LearnScreen';
import { LEARN_VIEW_KEY } from './useLearnView';

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

function client() {
  testAuth.client = fakeClient({
    'GET /courses': ok({ courses: [{ id: 'c1', slug: 'kmr', title: 'Kurmancî', dialect: 'kmr' }] }),
    'GET /courses/c1/map': ok(MAP),
    'GET /me/daily-goal': ok({ goal: 20, effectiveGoal: 20, earnedXp: 12, progress: 0.6, completed: false }),
    'GET /me': ok({ user: { streak: { current: 6, longest: 9, freezes: 0, lastActiveOn: null, daysLearned: 31 } } }),
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
});

// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoryGameView } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { navigation } from '../play/testing/navigation';
import { gameView } from './testing/views';
import { StoryGameScreen } from './StoryGameScreen';

// the game the screen is showing, set by each test
const game = vi.hoisted(() => ({ view: null as StoryGameView | null }));

vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
vi.mock('./useStoryGame', () => ({
  useStoryGame: () => ({
    view: game.view,
    gone: null,
    trouble: false,
    apply: () => null,
    refresh: () => undefined,
    serverNow: () => Date.now(),
  }),
}));
vi.mock('./game/useGameStory', () => ({ useGameStory: () => null }));

describe('StoryGameScreen', () => {
  afterEach(cleanup);

  it('names the screen in the app’s words, never the story’s title in the app’s voice', () => {
    game.view = gameView({ status: 'cancelled' }, { storyTitle: 'Nanê Germ', dialect: 'kurmanci' });
    renderWithProviders(<StoryGameScreen id="g1" onExit={() => undefined} />);
    expect(screen.getByText('Stories')).toBeTruthy();
    expect(screen.queryByText('Nanê Germ')).toBeNull();
  });

  it('goes back to the reader the check was opened from, on the story the results name, or on to the library', () => {
    game.view = gameView({
      mode: 'solo',
      status: 'finished',
      results: { storySlug: 'bajar', standings: [], me: { place: 1, score: 300, correct: 3, answered: 5, total: 5, xp: 9, learningCounted: true }, review: [] },
    });
    renderWithProviders(<StoryGameScreen id="g1" onExit={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back to the story' }));
    expect(navigation.popTo).toHaveBeenCalledWith('StoryReader', { slug: 'bajar' });
    fireEvent.click(screen.getByRole('button', { name: 'Another story' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Stories');
  });
});

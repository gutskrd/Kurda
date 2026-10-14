// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../reports/testing/harness';
import { gameView } from './testing/views';
import { StoryGameScreen } from './StoryGameScreen';

vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
vi.mock('./useStoryGame', () => ({
  useStoryGame: () => ({
    view: gameView({ status: 'cancelled' }, { storyTitle: 'Nanê Germ', dialect: 'kurmanci' }),
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
    renderWithProviders(<StoryGameScreen id="g1" onExit={() => undefined} />);
    expect(screen.getByText('Stories')).toBeTruthy();
    expect(screen.queryByText('Nanê Germ')).toBeNull();
  });
});

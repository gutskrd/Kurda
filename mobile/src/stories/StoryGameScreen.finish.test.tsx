// @vitest-environment jsdom
import { act, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoryGameView } from '@kurda/shared';
import { renderWithProviders } from '../reports/testing/harness';
import { onGameFinished, onResultsLeft, type GameFinish } from '../feedback/gameFinished';
import { gameView, player, standing } from './testing/views';
import { StoryGameScreen } from './StoryGameScreen';

vi.mock('react-native', () => import('../play/testing/native'));
vi.mock('react-native-svg', () => import('../reports/testing/svg'));
vi.mock('expo-secure-store', () => import('../reports/testing/stubs'));
vi.mock('expo-linear-gradient', () => import('../reports/testing/stubs'));
vi.mock('react-native-safe-area-context', () => import('../reports/testing/stubs'));
vi.mock('../auth/AuthContext', () => import('../reports/testing/auth'));
vi.mock('@react-navigation/native', () => import('../play/testing/navigation'));
/** the game the screen is showing, as the test moves it along */
const current = vi.hoisted(() => ({ view: null as StoryGameView | null }));
vi.mock('./useStoryGame', () => ({
  useStoryGame: () => ({
    view: current.view,
    gone: null,
    trouble: false,
    apply: () => null,
    refresh: () => undefined,
    serverNow: () => Date.now(),
  }),
}));
vi.mock('./game/useGameStory', () => ({ useGameStory: () => null }));
// the screens inside are under test elsewhere; this is about the rating box
vi.mock('./game/Reveal', () => ({ Reveal: () => null }));
vi.mock('./game/Results', () => ({ Results: () => null }));

const me = (gone = false) => player({ seat: 1, isMe: true, gone });
const finished = (place: number, mode: StoryGameView['mode'] = 'group', gone = false): StoryGameView =>
  gameView({
    status: 'finished',
    mode,
    players: [me(gone), player({ seat: 2 }), player({ seat: 3 })],
    results: {
      standings: [standing({ seat: 1, isMe: true, place }), standing({ seat: 2, place: 2 }), standing({ seat: 3, place: 3 })],
      me: { place, score: 300, correct: 3, answered: 5, total: 5, xp: 10, learningCounted: true },
      review: [],
    },
  });

describe('StoryGameScreen and the rating box', () => {
  afterEach(cleanup);

  function watch(): { heard: GameFinish[]; left: () => number; stop: () => void } {
    const heard: GameFinish[] = [];
    let leftCount = 0;
    const a = onGameFinished((f) => heard.push(f));
    const b = onResultsLeft(() => (leftCount += 1));
    return { heard, left: () => leftCount, stop: () => (a(), b()) };
  }

  it('hears of a game that finished while it was played here, a group’s first place as a win', () => {
    const w = watch();
    current.view = gameView({ status: 'reveal', mode: 'group', players: [me()] });
    const screen = renderWithProviders(<StoryGameScreen id="g1" onExit={() => undefined} />);
    act(() => {
      current.view = finished(1);
      screen.rerender(<StoryGameScreen id="g1" onExit={() => undefined} />);
    });
    expect(w.heard).toEqual([{ moment: 'won', gaveUp: false }]);
    // leaving the results closes a box that came with them
    expect(w.left()).toBe(0);
    screen.unmount();
    expect(w.left()).toBe(1);
    w.stop();
  });

  it('names no winner in a duo, and says a game this player left was given up', () => {
    const w = watch();
    current.view = gameView({ status: 'question', mode: 'duo', players: [me()] });
    const screen = renderWithProviders(<StoryGameScreen id="g1" onExit={() => undefined} />);
    act(() => {
      current.view = finished(1, 'duo', true);
      screen.rerender(<StoryGameScreen id="g1" onExit={() => undefined} />);
    });
    expect(w.heard).toEqual([{ moment: 'other', gaveUp: true }]);
    w.stop();
  });

  it('says nothing for a game opened already finished', () => {
    const w = watch();
    current.view = finished(1);
    renderWithProviders(<StoryGameScreen id="g1" onExit={() => undefined} />);
    expect(w.heard).toEqual([]);
    w.stop();
  });
});

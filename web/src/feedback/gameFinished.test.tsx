import { afterEach, describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  onGameFinished,
  onGameStarted,
  reportGameFinished,
  reportGameStarted,
  useGameFinished,
  type GameFinished,
} from './gameFinished';

const heard: GameFinished[] = [];
let stop = onGameFinished((e) => heard.push(e));

afterEach(() => {
  heard.length = 0;
  stop();
  stop = onGameFinished((e) => heard.push(e));
});

function Game({ round, finished, gaveUp }: { round: string | null; finished: boolean; gaveUp?: boolean }): null {
  useGameFinished('wordle', round, finished, gaveUp);
  return null;
}

describe('a game finishing', () => {
  it('is heard by every listener until it stops listening', () => {
    const more: GameFinished[] = [];
    const stopMore = onGameFinished((e) => more.push(e));
    reportGameFinished({ game: 'race' });
    stopMore();
    reportGameFinished({ game: 'rhyme', gaveUp: true });
    expect(more).toEqual([{ game: 'race' }]);
    expect(heard).toEqual([{ game: 'race' }, { game: 'rhyme', gaveUp: true }]);
  });

  it('is reported once, on the change from playing to finished', () => {
    const { rerender } = render(<Game round="g1" finished={false} />);
    rerender(<Game round="g1" finished={false} />);
    expect(heard).toEqual([]);
    rerender(<Game round="g1" finished />);
    rerender(<Game round="g1" finished />);
    expect(heard).toEqual([{ game: 'wordle', gaveUp: false }]);
  });

  /** a daily Wordle opened again after it was played is not a game just finished (map3-rating §2) */
  it('is not reported for a game that was already finished when it was opened', () => {
    const { rerender } = render(<Game round="daily" finished />);
    rerender(<Game round="daily" finished />);
    expect(heard).toEqual([]);
  });

  it('starts again for the next game', () => {
    const { rerender } = render(<Game round="g1" finished={false} />);
    rerender(<Game round="g1" finished />);
    rerender(<Game round="g2" finished={false} />);
    rerender(<Game round="g2" finished gaveUp />);
    expect(heard).toEqual([
      { game: 'wordle', gaveUp: false },
      { game: 'wordle', gaveUp: true },
    ]);
  });

  it('waits for a game to be on screen at all', () => {
    const { rerender } = render(<Game round={null} finished />);
    rerender(<Game round={null} finished={false} />);
    expect(heard).toEqual([]);
  });
});

describe('a round beginning', () => {
  it('is heard by every listener until it stops listening', () => {
    let starts = 0;
    const stopStarts = onGameStarted(() => starts++);
    reportGameStarted();
    stopStarts();
    reportGameStarted();
    expect(starts).toBe(1);
  });

  it('is reported for each new round seen unfinished — “Play again” on the same page', () => {
    let starts = 0;
    const stopStarts = onGameStarted(() => starts++);
    const { rerender } = render(<Game round="g1" finished={false} />);
    rerender(<Game round="g1" finished={false} />);
    expect(starts).toBe(1);
    rerender(<Game round="g1" finished />);
    rerender(<Game round="g2" finished={false} />);
    expect(starts).toBe(2);
    stopStarts();
  });

  it('is not reported for a finished game reopened', () => {
    let starts = 0;
    const stopStarts = onGameStarted(() => starts++);
    render(<Game round="daily" finished />);
    expect(starts).toBe(0);
    stopStarts();
  });
});

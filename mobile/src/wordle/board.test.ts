import { describe, expect, it } from 'vitest';
import {
  backspace,
  buildBoard,
  ENTER,
  DEL,
  KEYBOARD_ROWS,
  keyFeedback,
  MAX_ATTEMPTS,
  typeLetter,
  type Feedback,
  type ScoredGuess,
} from './board.js';

const guess = (letters: string, feedback: Feedback[]): ScoredGuess => ({
  letters: Array.from(letters),
  feedback,
});

describe('buildBoard', () => {
  it('renders a full grid: done rows, one active row, then empty rows', () => {
    const guesses = [guess('sêv', ['green', 'gray', 'yellow'])];
    const board = buildBoard(guesses, 3, ['a']);

    expect(board).toHaveLength(MAX_ATTEMPTS);
    expect(board[0]!.state).toBe('done');
    expect(board[0]!.cells.map((c) => c.letter)).toEqual(['s', 'ê', 'v']);
    expect(board[0]!.cells.map((c) => c.feedback)).toEqual(['green', 'gray', 'yellow']);

    expect(board[1]!.state).toBe('active');
    expect(board[1]!.cells.map((c) => c.letter)).toEqual(['a', '', '']);
    expect(board[1]!.cells.every((c) => c.feedback === null)).toBe(true);

    expect(board[2]!.state).toBe('empty');
  });

  it('sizes every row to the target length', () => {
    const board = buildBoard([], 5, []);
    expect(board.every((r) => r.cells.length === 5)).toBe(true);
  });

  it('has no active row once the game is finished', () => {
    const guesses = [guess('sêv', ['green', 'green', 'green'])];
    const board = buildBoard(guesses, 3, [], { finished: true });
    expect(board.some((r) => r.state === 'active')).toBe(false);
    expect(board[0]!.state).toBe('done');
    expect(board.slice(1).every((r) => r.state === 'empty')).toBe(true);
  });

  it('drops the active row when all attempts are used', () => {
    const guesses = Array.from({ length: MAX_ATTEMPTS }, () => guess('abc', ['gray', 'gray', 'gray']));
    const board = buildBoard(guesses, 3, ['x']);
    expect(board).toHaveLength(MAX_ATTEMPTS);
    expect(board.every((r) => r.state === 'done')).toBe(true);
  });
});

describe('Kurdish keyboard', () => {
  it('covers all 31 Kurmancî letters including Ç Ê Î Ş Û', () => {
    const letters = KEYBOARD_ROWS.flat().filter((k) => k !== ENTER && k !== DEL);
    expect(letters).toHaveLength(31);
    for (const special of ['ç', 'ê', 'î', 'ş', 'û']) {
      expect(letters).toContain(special);
    }
    // no duplicates
    expect(new Set(letters).size).toBe(31);
  });

  it('reads colour memory for a letter, ignoring control keys', () => {
    const kb: Record<string, Feedback> = { s: 'green', v: 'yellow' };
    expect(keyFeedback(kb, 's')).toBe('green');
    expect(keyFeedback(kb, 'v')).toBe('yellow');
    expect(keyFeedback(kb, 'z')).toBeNull();
    expect(keyFeedback(kb, ENTER)).toBeNull();
    expect(keyFeedback(kb, DEL)).toBeNull();
  });
});

describe('draft editing', () => {
  it('appends letters up to the target length, then stops', () => {
    let draft: string[] = [];
    draft = typeLetter(draft, 's', 3);
    draft = typeLetter(draft, 'ê', 3);
    draft = typeLetter(draft, 'v', 3);
    draft = typeLetter(draft, 'x', 3); // full — ignored
    expect(draft).toEqual(['s', 'ê', 'v']);
  });

  it('backspace removes the last letter', () => {
    expect(backspace(['s', 'ê', 'v'])).toEqual(['s', 'ê']);
    expect(backspace([])).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildShareText,
  gridRow,
  shareGrid,
  shareHeader,
  tileEmoji,
  TILES,
  TILES_HIGH_CONTRAST,
  type Feedback,
  type ShareInput,
} from './share.js';

const win: Feedback[][] = [
  ['gray', 'yellow', 'gray', 'gray', 'gray'],
  ['green', 'gray', 'yellow', 'gray', 'gray'],
  ['green', 'green', 'green', 'green', 'green'],
];

describe('tileEmoji', () => {
  it('maps feedback to the default palette', () => {
    expect(tileEmoji('green')).toBe(TILES.green);
    expect(tileEmoji('yellow')).toBe(TILES.yellow);
    expect(tileEmoji('gray')).toBe(TILES.gray);
  });

  it('uses the high-contrast palette when asked', () => {
    expect(tileEmoji('green', true)).toBe(TILES_HIGH_CONTRAST.green);
    expect(tileEmoji('yellow', true)).toBe(TILES_HIGH_CONTRAST.yellow);
    expect(TILES_HIGH_CONTRAST.green).not.toBe(TILES.green);
  });
});

describe('gridRow / shareGrid', () => {
  it('renders a row as its emoji string', () => {
    expect(gridRow(['green', 'gray', 'yellow'])).toBe('🟩⬜🟨');
  });

  it('joins rows with newlines', () => {
    const grid = shareGrid(win);
    expect(grid.split('\n')).toHaveLength(3);
    expect(grid.split('\n')[2]).toBe('🟩🟩🟩🟩🟩');
  });

  it('respects the high-contrast palette', () => {
    expect(gridRow(['green'], true)).toBe('🟧');
  });
});

describe('shareHeader', () => {
  const base: ShareInput = { rows: win, solved: true, maxAttempts: 6, mode: 'daily' };

  it('formats a solved daily with the puzzle number and guess count', () => {
    expect(shareHeader({ ...base, dayNumber: 123 })).toBe('Kurda Wordle #123 3/6');
  });

  it('includes a difficulty tag when given', () => {
    expect(shareHeader({ ...base, dayNumber: 123, difficulty: 'hard' })).toBe(
      'Kurda Wordle #123 (Hard) 3/6',
    );
  });

  it('marks practice games and omits the puzzle number', () => {
    expect(shareHeader({ ...base, mode: 'practice', dayNumber: 123 })).toBe('Kurda Wordle Practice 3/6');
  });

  it('shows X/max for a loss', () => {
    expect(shareHeader({ ...base, solved: false, dayNumber: 123 })).toBe('Kurda Wordle #123 X/6');
  });
});

describe('buildShareText', () => {
  it('is header + blank line + grid', () => {
    const text = buildShareText({ rows: win, solved: true, maxAttempts: 6, mode: 'daily', dayNumber: 7 });
    const [header, blank, ...gridLines] = text.split('\n');
    expect(header).toBe('Kurda Wordle #7 3/6');
    expect(blank).toBe('');
    expect(gridLines).toHaveLength(3);
  });

  it('is spoiler-safe — contains no alphabetic letters (no guessed words)', () => {
    const text = buildShareText({ rows: win, solved: false, maxAttempts: 6, mode: 'practice' });
    // only the fixed header words + tiles/counts; the grid itself has no letters
    const gridOnly = text.split('\n\n')[1] ?? '';
    expect(/[a-z]/i.test(gridOnly)).toBe(false);
  });
});

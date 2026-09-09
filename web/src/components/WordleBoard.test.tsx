import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KURMANCI_KEYS, KURMANCI_KEYS_NARROW, WordleBoard, WordleKeyboard } from './WordleBoard';

afterEach(() => {
  vi.restoreAllMocks();
});

/** Pretend the viewport does (or does not) match the narrow-keyboard query. */
function stubMatchMedia(matches: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

describe('the Kurmancî keyboard layouts', () => {
  it('the narrow layout has exactly the same letters as the wide one', () => {
    // the phone layout only re-splits the rows; losing or duplicating a letter
    // would make a word unplayable on mobile and be easy to miss by eye
    const wide = KURMANCI_KEYS.flat();
    const narrow = KURMANCI_KEYS_NARROW.flat();
    expect([...narrow].sort()).toEqual([...wide].sort());
    expect(new Set(narrow).size).toBe(narrow.length); // no duplicates
  });

  it('keeps the letters in the same order, only wrapped differently', () => {
    expect(KURMANCI_KEYS_NARROW.flat()).toEqual(KURMANCI_KEYS.flat());
  });

  it('no narrow row is wide enough to overflow a phone', () => {
    // 10 keys is what a standard phone keyboard fits; the wide layout's 13-key
    // row is what pushed its last key off the screen
    for (const row of KURMANCI_KEYS_NARROW) expect(row.length).toBeLessThanOrEqual(10);
    expect(Math.max(...KURMANCI_KEYS.map((r) => r.length))).toBeGreaterThan(10);
  });
});

describe('WordleKeyboard', () => {
  it('uses the wrapped layout on a narrow screen', () => {
    stubMatchMedia(true);
    render(<WordleKeyboard keyboard={{}} onPress={() => undefined} disabled={false} />);
    // Enter and Delete sit on the last row, so the row count is the tell
    expect(document.querySelectorAll('.wordle-krow')).toHaveLength(KURMANCI_KEYS_NARROW.length);
  });

  it('uses the full-width layout otherwise', () => {
    stubMatchMedia(false);
    render(<WordleKeyboard keyboard={{}} onPress={() => undefined} disabled={false} />);
    expect(document.querySelectorAll('.wordle-krow')).toHaveLength(KURMANCI_KEYS.length);
  });

  it('every letter is still pressable in the wrapped layout', async () => {
    stubMatchMedia(true);
    const onPress = vi.fn();
    render(<WordleKeyboard keyboard={{}} onPress={onPress} disabled={false} />);

    // û is on the wide layout's overflowing top row — the key that fell off
    await userEvent.click(screen.getByRole('button', { name: 'û' }));
    await userEvent.click(screen.getByRole('button', { name: 'p' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onPress.mock.calls.map(([k]) => k)).toEqual(['û', 'p', 'Backspace']);
  });
});

describe('WordleBoard', () => {
  /**
   * The cap used to be a number written straight into an inline `max-width`,
   * which no media query could reach — so a phone got the same 54px cells as a
   * desktop and six rows of them pushed the keyboard below the fold. The row
   * publishes its column count and the stylesheet does the arithmetic, which is
   * what lets the cell size shrink on a small screen.
   */
  it('publishes its column count so the stylesheet can size the cells', () => {
    render(<WordleBoard targetLength={8} guesses={[]} current="" totalRows={6} showCurrent />);
    const row = document.querySelector('.wordle-row') as HTMLElement;
    expect(row.style.getPropertyValue('--wordle-cols')).toBe('8');
    expect(row.style.gridTemplateColumns).toBe('repeat(8, 1fr)');
    // and nothing hard-codes a width any more
    expect(row.style.maxWidth).toBe('');
  });

  it('renders one cell per letter for every row', () => {
    render(<WordleBoard targetLength={5} guesses={[]} current="" totalRows={6} showCurrent />);
    expect(document.querySelectorAll('.wordle-cell')).toHaveLength(30);
  });
});

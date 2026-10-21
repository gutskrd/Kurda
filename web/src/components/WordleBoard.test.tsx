import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KURMANCI_ALPHABET } from '@kurda/shared';
import { WordleBoard, WordleKeyboard } from './WordleBoard';
import { ALPHABET_ROWS, BACKSPACE, ENTER, QWERTY_ROWS } from '../keyboard/wordleKeys';
import { KEYBOARD_PREFS_KEY, getKeyboardPrefs, resetKeyboardPrefsForTests } from '../keyboard/prefs';
import { renderApp } from '../test/utils';

beforeEach(() => resetKeyboardPrefsForTests());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const letters = (rows: readonly (readonly string[])[]): string[] => rows.flat().filter((k) => k !== ENTER && k !== BACKSPACE);

/*
 * The old layout put ê û î beside e u i: a 13-key top row that could not fit a
 * phone, wrapped differently below 560px, with the most easily confused pairs
 * side by side. Its tests pinned that layout; these pin the one that replaced
 * it (contract §K3): QWERTY, and ç ê î ş û as a row of their own.
 */
describe('the on-screen layouts', () => {
  it('both have all 31 letters, each once', () => {
    for (const rows of [QWERTY_ROWS, ALPHABET_ROWS]) {
      expect([...letters(rows)].sort()).toEqual([...KURMANCI_ALPHABET].sort());
    }
  });

  it('QWERTY keeps its rows, and puts ç ê î ş û on a fourth', () => {
    expect(QWERTY_ROWS[0]!.join('')).toBe('qwertyuiop');
    expect(QWERTY_ROWS[1]!.join('')).toBe('asdfghjkl');
    expect(QWERTY_ROWS[2]).toEqual([ENTER, 'z', 'x', 'c', 'v', 'b', 'n', 'm', BACKSPACE]);
    expect(QWERTY_ROWS[3]).toEqual(['ç', 'ê', 'î', 'ş', 'û']);
  });

  it('alphabet order is the alphabet, and no row is wider than a phone fits', () => {
    expect(letters(ALPHABET_ROWS)).toEqual([...KURMANCI_ALPHABET]);
    for (const rows of [QWERTY_ROWS, ALPHABET_ROWS]) {
      for (const row of rows) expect(row.length).toBeLessThanOrEqual(10);
    }
  });
});

describe('WordleKeyboard', () => {
  /** A browser answering these media queries (keyboard/device.ts asks which pointers there are and how wide it is). */
  const media = (matches: string[]): void => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: matches.includes(query), media: query, addEventListener() {}, removeEventListener() {} }));
  };

  it('is a desk keyboard beside a mouse or trackpad, and says the real keyboard works', () => {
    media(['(any-pointer: fine)']);
    renderApp(<WordleKeyboard keyboard={{}} onPress={() => {}} disabled={false} />);
    expect(document.querySelector('.wordle-keys')).toHaveClass('is-desktop');
    expect(screen.getByText('Type with your keyboard, or click the keys. ç ê î ş û are on the bottom row.')).toBeInTheDocument();
    // the same keys either way: only how they are drawn changes
    expect(document.querySelectorAll('.wordle-krow')).toHaveLength(4);
  });

  it('keeps the touch keys, and no keyboard hint, on a phone', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 14) Mobile');
    media(['(pointer: coarse)', '(max-width: 640px)']);
    renderApp(<WordleKeyboard keyboard={{}} onPress={() => {}} disabled={false} />);
    expect(document.querySelector('.wordle-keys')).not.toHaveClass('is-desktop');
    expect(screen.queryByText(/Type with your keyboard/)).not.toBeInTheDocument();
  });

  it('lays out QWERTY by default, with Delete as an icon that says what it does', async () => {
    const onPress = vi.fn();
    renderApp(<WordleKeyboard keyboard={{}} onPress={onPress} disabled={false} />);

    expect(document.querySelectorAll('.wordle-krow')).toHaveLength(4);
    await userEvent.click(screen.getByRole('button', { name: 'û' }));
    await userEvent.click(screen.getByRole('button', { name: 'p' }));
    await userEvent.click(screen.getByRole('button', { name: 'Backspace' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enter' }));
    expect(onPress.mock.calls.map(([k]) => k)).toEqual(['û', 'p', 'Backspace', 'Enter']);
    expect(screen.getByRole('button', { name: 'Backspace' }).querySelector('svg')).not.toBeNull();
  });

  it('switches to alphabet order, and remembers it on this device', async () => {
    renderApp(<WordleKeyboard keyboard={{}} onPress={() => undefined} disabled={false} />);

    await userEvent.click(screen.getByRole('radio', { name: 'Alphabet order' }));

    const firstRow = document.querySelector('.wordle-krow')!;
    expect(firstRow.textContent).toBe('abcçdeêfg');
    expect(getKeyboardPrefs().wordleLayout).toBe('alphabet');
  });

  it('starts in the layout this device chose', () => {
    localStorage.setItem(KEYBOARD_PREFS_KEY, JSON.stringify({ wordleLayout: 'alphabet' }));
    renderApp(<WordleKeyboard keyboard={{}} onPress={() => undefined} disabled={false} />);
    expect(screen.getByRole('radio', { name: 'Alphabet order' })).toHaveAttribute('aria-checked', 'true');
  });

  it('says each key’s colour in words', () => {
    renderApp(<WordleKeyboard keyboard={{ a: 'green', s: 'yellow', ê: 'gray' }} onPress={() => undefined} disabled={false} />);
    expect(screen.getByRole('button', { name: 'a, in the right place' })).toHaveClass('wordle-green');
    expect(screen.getByRole('button', { name: 's, in the word, in another place' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ê, not in the word' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'q' })).toBeInTheDocument();
  });

  it('does not take the focus on a click, so a Space typed next does not press the key again', () => {
    renderApp(<WordleKeyboard keyboard={{}} onPress={() => undefined} disabled={false} />);
    for (const name of ['e', 'ç', 'Enter', 'Backspace']) {
      // fireEvent returns false when the default (focusing the button) was prevented
      expect(fireEvent.mouseDown(screen.getByRole('button', { name }))).toBe(false);
    }
  });

  it('disables its keys rather than hiding them from a screen reader', () => {
    renderApp(<WordleKeyboard keyboard={{}} onPress={() => undefined} disabled />);
    expect(document.querySelector('[aria-hidden="true"] button')).toBeNull();
    expect(screen.getByRole('button', { name: 'q' })).toBeDisabled();
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
    renderApp(<WordleBoard targetLength={8} guesses={[]} current="" totalRows={6} showCurrent />);
    const row = document.querySelector('.wordle-row') as HTMLElement;
    expect(row.style.getPropertyValue('--wordle-cols')).toBe('8');
    expect(row.style.gridTemplateColumns).toBe('repeat(8, 1fr)');
    // and nothing hard-codes a width any more
    expect(row.style.maxWidth).toBe('');
  });

  it('renders one cell per letter for every row', () => {
    renderApp(<WordleBoard targetLength={5} guesses={[]} current="" totalRows={6} showCurrent />);
    expect(document.querySelectorAll('.wordle-cell')).toHaveLength(30);
  });

  it('says how each scored letter scored, not only which letter it is', () => {
    renderApp(
      <WordleBoard
        targetLength={3}
        guesses={[{ letters: ['k', 'a', 'r'], feedback: ['green', 'yellow', 'gray'] }]}
        current="se"
        totalRows={3}
        showCurrent
      />,
    );
    expect(screen.getByRole('group', { name: 'Guess 1' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'k, in the right place' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'a, in the word, in another place' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'r, not in the word' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 's' })).toBeInTheDocument();
  });
});

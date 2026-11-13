import { useCallback, useEffect, useRef, useState } from 'react';
import type { LetterFeedback } from '../lib/types';
import { playsMotion } from '../lib/motion';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { BackspaceIcon } from './icons';
import { BACKSPACE, ENTER, wordleRows } from '../keyboard/wordleKeys';
import { useKeyboardPrefs, type WordleLayout } from '../keyboard/prefs';
import { useKeyboardKind } from '../keyboard/device';

/**
 * How wide the board is allowed to get is a CSS question, not a JS one.
 *
 * It used to be a number here, written straight into an inline `max-width` —
 * which no media query can reach, so a phone got the same 54px cells as a
 * desktop and six rows of them pushed the keyboard below the fold. The row
 * publishes its column count instead and the stylesheet does the arithmetic,
 * which lets `--wordle-cell-max` shrink on a small screen.
 */
const COLS_VAR = '--wordle-cols';

/** What a colour means, said in words for whoever cannot see it. */
const STATE_KEY: Record<LetterFeedback, MessageKey> = {
  green: 'games.wordle.state.green',
  yellow: 'games.wordle.state.yellow',
  gray: 'games.wordle.state.gray',
};

interface Row {
  letters: string[];
  feedback: LetterFeedback[];
}

/**
 * How a judged row turns over, in the stylesheet's numbers (styles/motion.css,
 * `.wordle-row.is-judged`): each tile a beat after the one before, turning
 * edge-on and back with its colour changed while it is edge-on; and on the
 * word found, a pop along the row once the last tile is down.
 */
const REVEAL = { stepMs: 75, flipMs: 440, popStepMs: 40, popMs: 280 };

/** How long a row of `cols` tiles takes to turn over — and, when it is the word, to pop after that. */
export function revealMs(cols: number, won: boolean): number {
  const turned = (cols - 1) * REVEAL.stepMs + REVEAL.flipMs;
  return won ? turned + (cols - 1) * REVEAL.popStepMs + REVEAL.popMs : turned;
}

/**
 * Holding back what follows a guess until its row has turned over: the result
 * of a game is said after the tiles have said it, not over them. `hold` starts
 * the wait for a row of that length; `revealing` is true while it lasts. For a
 * reader who asked for less motion, and wherever motion cannot be played, the
 * row is simply judged and nothing waits.
 */
export function useReveal(): { revealing: boolean; hold: (cols: number, won: boolean) => void } {
  const [revealing, setRevealing] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  const hold = useCallback((cols: number, won: boolean): void => {
    if (!playsMotion()) return;
    if (timer.current !== null) window.clearTimeout(timer.current);
    setRevealing(true);
    timer.current = window.setTimeout(() => setRevealing(false), revealMs(cols, won));
  }, []);
  return { revealing, hold };
}

/**
 * The guess grid: scored rows, then the in-progress row, then blanks.
 *
 * What a guess does is shown on the row it was typed in, the way the answers
 * of a lesson are. A guess the game will not take — too short, not a word —
 * shakes its row once (`refusals` counts them; the words under the board say
 * why). A guess that is judged turns its tiles over one after another, each
 * taking its colour while it is edge-on; only a row judged while the board is
 * on the screen does, so a game opened again part-way is simply drawn. And
 * the word found pops along its row after the last tile has turned.
 */
export function WordleBoard({
  targetLength,
  guesses,
  current,
  totalRows,
  showCurrent,
  refusals = 0,
}: {
  targetLength: number;
  guesses: Row[];
  current: string;
  totalRows: number;
  /** whether to render the typed-but-unsubmitted row */
  showCurrent: boolean;
  /** how many guesses have been turned away so far: each one shakes the row being typed */
  refusals?: number;
}): React.JSX.Element {
  const t = useT();
  // the row judged since the board was last drawn, if exactly one was: that one turns over
  const [seen, setSeen] = useState(guesses.length);
  const [judged, setJudged] = useState<number | null>(null);
  if (seen !== guesses.length) {
    setSeen(guesses.length);
    setJudged(guesses.length === seen + 1 ? guesses.length - 1 : null);
  }
  const currentLetters = Array.from(current);
  const rows: React.JSX.Element[] = [];
  for (let r = 0; r < totalRows; r++) {
    const done = guesses[r];
    const isCurrent = !done && showCurrent && r === guesses.length;
    const cells: React.JSX.Element[] = [];
    for (let c = 0; c < targetLength; c++) {
      let letter = '';
      let fb: LetterFeedback | 'empty' | 'typing' = 'empty';
      if (done) {
        letter = done.letters[c] ?? '';
        fb = done.feedback[c] ?? 'gray';
      } else if (isCurrent) {
        letter = currentLetters[c] ?? '';
        fb = letter ? 'typing' : 'empty';
      }
      // a scored letter says how it scored, not only which letter it is
      const label =
        fb === 'green' || fb === 'yellow' || fb === 'gray'
          ? t('games.wordle.letterState', { letter, state: t(STATE_KEY[fb]) })
          : letter || t('games.wordle.emptyCell');
      cells.push(
        <div key={c} className={`wordle-cell wordle-${fb}`} role="img" aria-label={label} style={{ '--i': c } as React.CSSProperties}>
          {letter}
        </div>,
      );
    }
    const fresh = r === judged && !!done;
    const found = fresh && done.feedback.length > 0 && done.feedback.every((f) => f === 'green');
    // a refusal shakes the row being typed. The row has to stay the same element (its tiles turn over where they
    // stand when the guess is taken), so each refusal shakes it anew by taking the other of two names for one shake
    const refused = isCurrent && refusals > 0 ? ` is-refused ${refusals % 2 === 1 ? 'is-shake-a' : 'is-shake-b'}` : '';
    rows.push(
      // the row fills the width available and caps at its natural size, so an
      // 8-letter target shrinks to fit a phone instead of running off both edges
      <div
        className={`wordle-row${fresh ? ' is-judged' : ''}${found ? ' is-found' : ''}${refused}`}
        key={r}
        role="group"
        aria-label={t('games.wordle.guessNumber', { n: r + 1 })}
        style={
          {
            gridTemplateColumns: `repeat(${targetLength}, 1fr)`,
            [COLS_VAR]: targetLength,
          } as React.CSSProperties
        }
      >
        {cells}
      </div>,
    );
  }
  return (
    <div className="wordle-board" role="group" aria-label={t('games.wordle.guesses')}>
      {rows}
    </div>
  );
}

const LAYOUT_LABEL: Record<WordleLayout, MessageKey> = {
  qwerty: 'keyboard.wordle.qwerty',
  alphabet: 'keyboard.wordle.alphabet',
};

/**
 * The on-screen Kurmancî keyboard, each letter tinted by the best that is
 * known of it, in the layout this device chose (QWERTY or alphabet order).
 *
 * Every key is a real button with a name that says its colour in words. The
 * rows stretch to the full width the screen has: on a phone the ten-key
 * QWERTY row is the widest, and ç ê î ş û get a row of their own, as the
 * biggest keys on the board.
 *
 * Beside a real keyboard (keyboard/device.ts) the same keys are drawn the way
 * a desk keyboard is: a row no wider than the board needs, keys of one size,
 * ç ê î ş û as ordinary keys under the rest, and a line saying the keyboard
 * in front of you works — the on-screen one is there for the colours and the
 * five letters a Latin keyboard may not have.
 */
export function WordleKeyboard({
  keyboard,
  onPress,
  disabled,
}: {
  keyboard: Record<string, LetterFeedback>;
  onPress: (key: string) => void;
  disabled: boolean;
}): React.JSX.Element {
  const t = useT();
  const [prefs, setPrefs] = useKeyboardPrefs();
  const desktop = useKeyboardKind() === 'desktop';
  const rows = wordleRows(prefs.wordleLayout);
  /*
   * A click or tap does not move the focus onto the key. Left there, the next
   * Space on the physical keyboard pressed that key again — a second "e" after
   * a clicked one. Tab still reaches every key, and Space and Enter still press
   * the one it is on.
   */
  const keepFocus = (e: React.MouseEvent): void => e.preventDefault();
  return (
    <div className={desktop ? 'wordle-keys is-desktop' : 'wordle-keys'}>
      <div className={`wordle-keyboard wordle-keyboard-${prefs.wordleLayout}`} role="group" aria-label={t('games.wordle.keyboard')}>
        {rows.map((row, i) => (
          <div className={`wordle-krow${i === rows.length - 1 ? ' wordle-krow-last' : ''}`} key={i}>
            {row.map((k) => {
              if (k === ENTER) {
                return (
                  <button key={k} type="button" className="wordle-key wordle-key-wide" onMouseDown={keepFocus} onClick={() => onPress(ENTER)} disabled={disabled}>
                    {t('games.wordle.enter')}
                  </button>
                );
              }
              if (k === BACKSPACE) {
                return (
                  <button
                    key={k}
                    type="button"
                    className="wordle-key wordle-key-wide"
                    onMouseDown={keepFocus}
                    onClick={() => onPress(BACKSPACE)}
                    disabled={disabled}
                    aria-label={t('games.wordle.backspace')}
                  >
                    <BackspaceIcon size={22} />
                  </button>
                );
              }
              const fb = keyboard[k];
              return (
                <button
                  key={k}
                  type="button"
                  className={`wordle-key wordle-${fb ?? 'key'}`}
                  onMouseDown={keepFocus}
                  onClick={() => onPress(k)}
                  disabled={disabled}
                  aria-label={fb ? t('games.wordle.letterState', { letter: k, state: t(STATE_KEY[fb]) }) : k}
                >
                  {k}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {desktop && <p className="wordle-type-hint">{t('games.wordle.typeHint')}</p>}
      <div className="wordle-layout" role="radiogroup" aria-label={t('keyboard.wordle.title')}>
        {(['qwerty', 'alphabet'] as const).map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={prefs.wordleLayout === l}
            className={`wordle-layout-option${prefs.wordleLayout === l ? ' is-on' : ''}`}
            onClick={() => setPrefs({ wordleLayout: l })}
          >
            {t(LAYOUT_LABEL[l])}
          </button>
        ))}
      </div>
    </div>
  );
}

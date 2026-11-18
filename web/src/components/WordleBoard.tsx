import { useCallback, useEffect, useRef, useState } from 'react';
import type { LetterFeedback } from '../lib/types';
import { playsMotion } from '../lib/motion';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { BackspaceIcon } from './icons';
import { BACKSPACE, ENTER, wordleRows } from '../keyboard/wordleKeys';
import { useKeyboardPrefs, type WordleLayout } from '../keyboard/prefs';
import { useKeyboardKind } from '../keyboard/device';

/** The row publishes its column count and the stylesheet sizes the cells, so media queries can shrink them on a phone. */
const COLS_VAR = '--wordle-cols';

/** What each colour means, in words for screen readers. */
const STATE_KEY: Record<LetterFeedback, MessageKey> = {
  green: 'games.wordle.state.green',
  yellow: 'games.wordle.state.yellow',
  gray: 'games.wordle.state.gray',
};

interface Row {
  letters: string[];
  feedback: LetterFeedback[];
}

/** How a judged row turns over, matching `.wordle-row.is-judged` in styles/motion.css: a staggered flip, then a pop on a win. */
const REVEAL = { stepMs: 75, flipMs: 440, popStepMs: 40, popMs: 280 };

/** How long a row of `cols` tiles takes to turn over, plus the pop on a win. */
export function revealMs(cols: number, won: boolean): number {
  const turned = (cols - 1) * REVEAL.stepMs + REVEAL.flipMs;
  return won ? turned + (cols - 1) * REVEAL.popStepMs + REVEAL.popMs : turned;
}

/**
 * Holds back a guess's result until its row has turned over. `hold` starts the wait for a row; `revealing` is true
 * while it lasts. Nothing waits where motion is off.
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
 * The guess grid: scored rows, the row being typed, then blanks. A refused guess shakes its row (`refusals` counts
 * them). A row judged while the board is on screen turns its tiles over in turn, and the found word pops; a game
 * reopened part-way is simply drawn.
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
  /** Whether to draw the typed but unsubmitted row. */
  showCurrent: boolean;
  /** How many guesses have been refused; each shakes the row being typed. */
  refusals?: number;
}): React.JSX.Element {
  const t = useT();
  // The row judged since the last draw, if exactly one was; only that one turns over.
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
      // A scored letter says how it scored, not only which letter it is.
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
    // The row must stay the same element (its tiles turn over in place), so each refusal alternates between two
    // class names for the same shake to restart it.
    const refused = isCurrent && refusals > 0 ? ` is-refused ${refusals % 2 === 1 ? 'is-shake-a' : 'is-shake-b'}` : '';
    rows.push(
      // Fills the width and caps at its natural size, so an 8-letter word shrinks to fit a phone.
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
 * The on-screen Kurmancî keyboard, each key tinted by what is known of its letter and named in words, in this device's
 * layout (QWERTY or alphabetical). On a phone the rows stretch to the screen and ç ê î ş û get their own row. Beside a
 * physical keyboard (keyboard/device.ts) it is drawn compact, with a line saying the physical keyboard works.
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
   * A click does not move focus onto the key; otherwise the next Space on a physical keyboard pressed it again. Tab
   * still reaches every key.
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

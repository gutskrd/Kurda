import type { LetterFeedback } from '../lib/types';
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

/** The guess grid: scored rows, then the in-progress row, then blanks. */
export function WordleBoard({
  targetLength,
  guesses,
  current,
  totalRows,
  showCurrent,
}: {
  targetLength: number;
  guesses: Row[];
  current: string;
  totalRows: number;
  /** whether to render the typed-but-unsubmitted row */
  showCurrent: boolean;
}): React.JSX.Element {
  const t = useT();
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
        <div key={c} className={`wordle-cell wordle-${fb}`} role="img" aria-label={label}>
          {letter}
        </div>,
      );
    }
    rows.push(
      // the row fills the width available and caps at its natural size, so an
      // 8-letter target shrinks to fit a phone instead of running off both edges
      <div
        className="wordle-row"
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

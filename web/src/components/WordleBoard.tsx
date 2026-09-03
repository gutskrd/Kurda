import type { LetterFeedback } from '../lib/types';

/**
 * Kurmancî (Hawar) alphabet laid out for an on-screen keyboard, so the special
 * letters ç ê î ş û are always reachable regardless of the physical keyboard.
 */
export const KURMANCI_KEYS: string[][] = [
  ['q', 'w', 'e', 'ê', 'r', 't', 'y', 'u', 'û', 'i', 'î', 'o', 'p'],
  ['a', 's', 'ş', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'ç', 'v', 'b', 'n', 'm'],
];

/** letters a–z plus the Kurdish diacritics, for physical-keyboard capture */
export const KURMANCI_LETTER_RE = /^[a-zêîûçş]$/;

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
      cells.push(
        <div key={c} className={`wordle-cell wordle-${fb}`} aria-label={letter || 'empty'}>
          {letter}
        </div>,
      );
    }
    rows.push(
      <div className="wordle-row" key={r} style={{ gridTemplateColumns: `repeat(${targetLength}, 1fr)` }}>
        {cells}
      </div>,
    );
  }
  return (
    <div className="wordle-board" aria-label="Guesses">
      {rows}
    </div>
  );
}

/** On-screen Kurmancî keyboard, tinted by each letter's best-known feedback. */
export function WordleKeyboard({
  keyboard,
  onPress,
  disabled,
}: {
  keyboard: Record<string, LetterFeedback>;
  onPress: (key: string) => void;
  disabled: boolean;
}): React.JSX.Element {
  return (
    <div className="wordle-keyboard" aria-hidden={disabled}>
      {KURMANCI_KEYS.map((row, i) => (
        <div className="wordle-krow" key={i}>
          {i === KURMANCI_KEYS.length - 1 && (
            <button className="wordle-key wordle-key-wide" onClick={() => onPress('Enter')} disabled={disabled}>
              Enter
            </button>
          )}
          {row.map((k) => (
            <button key={k} className={`wordle-key wordle-${keyboard[k] ?? 'key'}`} onClick={() => onPress(k)} disabled={disabled}>
              {k}
            </button>
          ))}
          {i === KURMANCI_KEYS.length - 1 && (
            <button className="wordle-key wordle-key-wide" onClick={() => onPress('Backspace')} disabled={disabled} aria-label="Delete">
              ⌫
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

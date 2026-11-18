import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { liftTile, placeTile, tileAnswer } from '@kurda/shared';
import { prefersReducedMotion } from '../lib/motion';
import { useT } from '../i18n/I18nProvider';
import { kurdishText } from './map';
import { TextAnswer } from './TextAnswer';
import { Tile } from './Tile';

/** How a translate or listening item is answered: word tiles, or typing. */
export type AnswerMode = 'tiles' | 'keys';

/** The learner's choice between the two, kept on this device. */
const MODE_KEY = 'hevalo_answer_mode';

function readMode(): AnswerMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'keys' ? 'keys' : 'tiles';
  } catch {
    return 'tiles';
  }
}

function writeMode(mode: AnswerMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Storage blocked: the choice lasts as long as the page.
  }
}

/** Tiles when the server sent a bank, unless the learner chose the keyboard on this device; the keyboard otherwise. */
export function useAnswerMode(bank: readonly string[] | undefined): [AnswerMode, (mode: AnswerMode) => void] {
  const [mode, setMode] = useState<AnswerMode>(readMode);
  const choose = useCallback((next: AnswerMode) => {
    setMode(next);
    writeMode(next);
  }, []);
  return [bank && bank.length > 0 ? mode : 'keys', choose];
}

/** How long a tile takes to fly to the line or back: the slow token (tokens.css). */
const FLY_MS = 280;
const FLY_EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
/** Arabic script: a Soranî bank runs right to left, a Latin one left to right, whatever the course. */
const ARABIC_SCRIPT = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;

/**
 * Animates tiles from their old to their new places (FLIP): the laid tile flies from the bank, a returned one flies
 * home, and the rest close up; a tile in flight restarts from where it is. Under reduced motion the moved tile fades in.
 */
function fly(tiles: ReadonlyMap<number, HTMLElement>, was: ReadonlyMap<number, DOMRect>, moved: number): void {
  const still = prefersReducedMotion();
  tiles.forEach((el, i) => {
    const from = was.get(i);
    if (!from || typeof el.animate !== 'function') return;
    el.getAnimations?.().forEach((a) => a.cancel());
    if (still) {
      if (i === moved) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120 });
      return;
    }
    const to = el.getBoundingClientRect();
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    el.classList.add('is-flying');
    const run = el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration: FLY_MS, easing: FLY_EASE });
    const landed = (): void => el.classList.remove('is-flying');
    run.onfinish = landed;
    run.oncancel = landed;
  });
}

/**
 * An answer built from word tiles (the exercise's `bank`): a tap lays a tile on the line, leaving a ghost in the bank,
 * and a tap on the line sends it home. Number keys lay or lift tiles, Backspace lifts the last, and a letter switches to
 * typing (`onType`). The answer is the line's words joined by spaces (`tileAnswer`).
 */
function TileLine({
  bank,
  placed,
  onPlaced,
  formId,
  label,
  dialect,
  locked,
  busy,
  verdict,
  onReady,
  onAnswer,
  onType,
}: {
  bank: readonly string[];
  placed: readonly number[];
  onPlaced: (next: number[]) => void;
  formId: string;
  label: string;
  dialect: string | null | undefined;
  locked: boolean;
  busy: boolean;
  verdict: 'right' | 'wrong' | null;
  onReady: (ready: boolean) => void;
  onAnswer: (answer: { text: string }, given: string) => void;
  onType: (letter: string) => void;
}): React.JSX.Element {
  const t = useT();
  const kurdish = kurdishText(dialect);
  const dir = bank.some((word) => ARABIC_SCRIPT.test(word)) ? 'rtl' : 'ltr';
  // Marked Kurdish only when it reads in the course's direction: a Soranî course's English answer is not Soranî.
  const lang = dir === kurdish.dir ? kurdish.lang : undefined;
  const [said, setSaid] = useState('');
  const tiles = useRef(new Map<number, HTMLButtonElement>());
  // Every tile's place before a move, which moved, where it was on the line, and whether it had focus.
  const before = useRef<{ rects: Map<number, DOMRect>; moved: number; at: number; focused: boolean } | null>(null);
  const off = locked || busy;

  useEffect(() => onReady(placed.length > 0), [placed.length, onReady]);

  const move = (next: number[], i: number, added: boolean): void => {
    before.current = {
      rects: new Map([...tiles.current].map(([k, el]) => [k, el.getBoundingClientRect()])),
      moved: i,
      at: placed.indexOf(i),
      focused: !!tiles.current.get(i) && tiles.current.get(i) === document.activeElement,
    };
    onPlaced(next);
    setSaid(t(added ? 'lesson.tiles.added' : 'lesson.tiles.removed', { word: bank[i] ?? '' }));
  };
  const place = (i: number): void => {
    if (!off && !placed.includes(i)) move(placeTile(placed, i), i, true);
  };
  const lift = (i: number): void => {
    if (!off && placed.includes(i)) move(liftTile(placed, i), i, false);
  };

  useLayoutEffect(() => {
    const was = before.current;
    before.current = null;
    if (!was) return;
    fly(tiles.current, was.rects, was.moved);
    if (!was.focused) return;
    // The keyboard continues from where it was: the next tile in the bank, or on the line.
    const free = bank.map((_, j) => j).filter((j) => !placed.includes(j));
    const next = was.at < 0 ? (free.find((j) => j > was.moved) ?? free.at(-1) ?? placed.at(-1)) : (placed[Math.min(was.at, placed.length - 1)] ?? was.moved);
    if (next !== undefined) tiles.current.get(next)?.focus();
  }, [placed, bank]);

  // The keys read the line as it is now, not as at setup.
  const keys = useRef({ place, lift, placed, onType });
  keys.current = { place, lift, placed, onType };
  useEffect(() => {
    if (off) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing || e.defaultPrevented) return;
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable], [role="dialog"]')) return;
      const now = keys.current;
      // The key's position, not what it types.
      const n = /^(?:Digit|Numpad)([1-9])$/.exec(e.code)?.[1];
      if (n && !e.shiftKey) {
        const i = Number(n) - 1;
        if (i >= bank.length) return;
        e.preventDefault();
        if (now.placed.includes(i)) now.lift(i);
        else now.place(i);
      } else if (e.key === 'Backspace') {
        const last = now.placed.at(-1);
        if (last === undefined) return;
        e.preventDefault();
        now.lift(last);
      } else if (e.key.length === 1 && /\p{L}/u.test(e.key)) {
        e.preventDefault();
        now.onType(e.key);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [off, bank.length]);

  const hold = (i: number) => (el: HTMLButtonElement | null) => {
    if (el) tiles.current.set(i, el);
    else tiles.current.delete(i);
  };
  const answer = tileAnswer(bank, placed);

  return (
    <form
      id={formId}
      className={`lesson-tiles${verdict ? ` is-${verdict}` : ''}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!off && answer) onAnswer({ text: answer }, answer);
      }}
    >
      <p className="sr-only" aria-live="polite">
        {said}
      </p>
      <div className="lesson-answer-line" role="group" aria-label={label} lang={lang} dir={dir}>
        {placed.map((i) => (
          <Tile key={i} ref={hold(i)} className="lesson-word-tile" state={verdict ?? 'idle'} disabled={off} onClick={() => lift(i)}>
            {bank[i]}
          </Tile>
        ))}
      </div>
      <div className="lesson-bank" role="group" aria-label={t('lesson.tiles.bank')} lang={lang} dir={dir}>
        {bank.map((word, i) =>
          placed.includes(i) ? (
            // Its old place is kept, so the bank never closes up.
            <span key={i} className="tile-ghost" aria-hidden="true">
              {word}
            </span>
          ) : (
            <Tile key={i} ref={hold(i)} className="lesson-word-tile" disabled={off} onClick={() => place(i)}>
              {word}
            </Tile>
          ),
        )}
      </div>
      {bank.length > 1 && (
        <p className={`lesson-hint lesson-hint--keys${locked ? ' is-spent' : ''}`} aria-hidden={locked || undefined}>
          {t('lesson.tiles.keys', { n: Math.min(9, bank.length) })}
        </p>
      )}
    </form>
  );
}

/**
 * A translate or listening answer: word tiles when there is a bank and the learner has not chosen the keyboard, else the
 * typed answer with its key bar, and a remembered way to switch. What the tiles built, and a letter typed over them,
 * carry over into the field.
 */
export function BuiltAnswer({
  bank,
  mode,
  onMode,
  formId,
  label,
  dialect,
  locked,
  busy,
  verdict,
  onReady,
  onAnswer,
  onText,
}: {
  bank: readonly string[] | undefined;
  mode: AnswerMode;
  onMode: (mode: AnswerMode) => void;
  formId: string;
  label: string;
  dialect: string | null | undefined;
  locked: boolean;
  busy: boolean;
  verdict: 'right' | 'wrong' | null;
  onReady: (ready: boolean) => void;
  onAnswer: (answer: { text: string }, given: string) => void;
  /** Hears the answer as it is built or typed, for a gap that shows it. */
  onText?: (text: string) => void;
}): React.JSX.Element {
  const t = useT();
  const [placed, setPlaced] = useState<number[]>([]);
  const [typed, setTyped] = useState('');
  useEffect(() => {
    if (mode === 'tiles' && bank) onText?.(tileAnswer(bank, placed));
  }, [mode, bank, placed, onText]);
  const toKeys = (letter = ''): void => {
    const built = bank ? tileAnswer(bank, placed) : '';
    setTyped(built && letter ? `${built} ${letter}` : built || letter);
    onMode('keys');
  };
  const answer =
    mode === 'tiles' && bank ? (
      <TileLine
        bank={bank}
        placed={placed}
        onPlaced={setPlaced}
        formId={formId}
        label={label}
        dialect={dialect}
        locked={locked}
        busy={busy}
        verdict={verdict}
        onReady={onReady}
        onAnswer={onAnswer}
        onType={toKeys}
      />
    ) : (
      <TextAnswer
        id={formId}
        label={label}
        initial={typed}
        dialect={dialect}
        locked={locked}
        busy={busy}
        verdict={verdict}
        onReady={onReady}
        onAnswer={onAnswer}
        onText={onText}
      />
    );
  if (!bank?.length) return answer;
  return (
    <div className="lesson-built">
      {answer}
      {/* Kept in place, unseen, once answered so nothing above the verdict moves. */}
      <button
        type="button"
        className={`lesson-mode${locked ? ' is-spent' : ''}`}
        disabled={locked}
        aria-hidden={locked || undefined}
        onClick={() => (mode === 'tiles' ? toKeys() : onMode('tiles'))}
      >
        {mode === 'tiles' ? t('lesson.tiles.useKeyboard') : t('lesson.tiles.useTiles')}
      </button>
    </div>
  );
}

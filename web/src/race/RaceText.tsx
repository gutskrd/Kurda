import { Fragment, memo, useMemo } from 'react';
import type { CharState, TypingComparison } from '@kurda/shared';

/**
 * The race's text, coloured as it is typed. Each word is a memoised piece, so a key press re-renders only the word
 * being typed. A Soranî word is coloured as a whole, since spans inside joined Arabic script can break the joins, and
 * the paragraph carries its `lang` and `dir`.
 */

interface WordRange {
  start: number;
  /** Exclusive; the spaces after the word belong to it, so they are coloured too. */
  end: number;
}

/** The text cut into words, each with the spaces that follow it. */
export function splitWords(chars: readonly string[]): WordRange[] {
  const words: WordRange[] = [];
  let start = 0;
  for (let i = 0; i < chars.length; i++) {
    const isSpace = chars[i] === ' ';
    const nextIsWord = i + 1 < chars.length && chars[i + 1] !== ' ';
    if (isSpace && nextIsWord) {
      words.push({ start, end: i + 1 });
      start = i + 1;
    }
  }
  if (chars.length > start) words.push({ start, end: chars.length });
  return words;
}

/** How a whole word reads, for the word-level colouring. */
export function wordState(states: readonly CharState[], hasExtra: boolean): 'pending' | 'ok' | 'accent' | 'wrong' | 'partial' {
  if (hasExtra || states.includes('wrong')) return 'wrong';
  if (states.every((s) => s === 'pending')) return 'pending';
  if (states.includes('pending')) return 'partial';
  return states.includes('accent') ? 'accent' : 'ok';
}

const CHAR_CLASS: Record<CharState, string> = {
  ok: ' race-ok',
  accent: ' race-accent',
  wrong: ' race-bad',
  pending: '',
};

interface WordProps {
  text: string;
  /** One letter per character, o(k), a(ccent), w(rong) or p(ending), so the memo compares a string. */
  states: string;
  /** Where the caret is in this word, or -1. */
  caret: number;
  /** Extra characters typed that the text does not have, by the offset in the word they come before. */
  extra: string;
  byWord: boolean;
}

const STATE_OF: Record<string, CharState> = { o: 'ok', a: 'accent', w: 'wrong', p: 'pending' };

const Word = memo(function Word({ text, states, caret, extra, byWord }: WordProps): React.JSX.Element {
  const chars = [...text];
  const extras = new Map<number, string>(extra ? (JSON.parse(extra) as Array<[number, string]>) : []);
  const charStates = [...states].map((s) => STATE_OF[s] ?? 'pending');
  if (byWord) {
    const state = wordState(charStates, extras.size > 0);
    return (
      <span className={`race-word race-word-${state}${caret >= 0 ? ' race-word-current race-cursor-word' : ''}`}>
        {text}
      </span>
    );
  }
  return (
    <span className={`race-word${caret >= 0 ? ' race-word-current' : ''}`}>
      {chars.map((ch, i) => (
        <Fragment key={i}>
          {extras.has(i) && <span className="race-extra">{extras.get(i)}</span>}
          <span className={`race-char${CHAR_CLASS[charStates[i] ?? 'pending']}${i === caret ? ' race-cursor' : ''}`}>
            {ch}
          </span>
        </Fragment>
      ))}
      {extras.has(chars.length) && <span className="race-extra">{extras.get(chars.length)}</span>}
    </span>
  );
});

const LETTER: Record<CharState, string> = { ok: 'o', accent: 'a', wrong: 'w', pending: 'p' };

export function RaceText({
  id,
  text,
  comparison,
  rtl,
  lang,
  finished,
}: {
  id: string;
  /** The text as the racer sees it (`displayTarget`). */
  text: string;
  comparison: TypingComparison | null;
  rtl: boolean;
  lang: 'ku' | 'ckb';
  finished: boolean;
}): React.JSX.Element {
  const chars = useMemo(() => [...text], [text]);
  const words = useMemo(() => splitWords(chars), [chars]);
  const caret = finished ? -1 : (comparison?.caret ?? 0);
  const extraAt = useMemo(() => {
    const m = new Map<number, string>();
    for (const e of comparison?.extra ?? []) m.set(e.before, e.text);
    return m;
  }, [comparison]);

  return (
    <p className={`race-text${rtl ? ' race-text-rtl' : ''}`} id={id} lang={lang} dir={rtl ? 'rtl' : 'ltr'}>
      {words.map((w, wi) => {
        const last = wi === words.length - 1;
        let states = '';
        for (let i = w.start; i < w.end; i++) states += LETTER[comparison?.chars[i] ?? 'pending'];
        const extras: Array<[number, string]> = [];
        for (let i = w.start; i < w.end + (last ? 1 : 0); i++) {
          const run = extraAt.get(i);
          if (run) extras.push([i - w.start, run]);
        }
        // A caret after the last character sits on the last word.
        const inWord = caret >= w.start && (caret < w.end || (last && caret === w.end));
        return (
          <Word
            key={w.start}
            text={chars.slice(w.start, w.end).join('')}
            states={states}
            caret={inWord ? caret - w.start : -1}
            extra={extras.length ? JSON.stringify(extras) : ''}
            byWord={rtl}
          />
        );
      })}
      {caret === chars.length && !rtl && chars.length > 0 && <span className="race-cursor race-cursor-end" aria-hidden />}
    </p>
  );
}

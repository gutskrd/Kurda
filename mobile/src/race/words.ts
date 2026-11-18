import type { CharState, TypingComparison } from '@kurda/shared';

/**
 * The race text split into words for drawing. Each word re-renders only when something in it changes, so a
 * keystroke redraws one or two words instead of every character (thousands of Text nodes lag cheap Android
 * phones). Words are also the unit a Soranî line breaks and joins at, right to left.
 */
export interface RaceWord {
  /** Index of the word's first character in the text (code points). */
  start: number;
  /** The word's characters, its trailing spaces included. */
  chars: string[];
}

/** Words with the spaces that follow them, so the words put back together are the text. */
export function splitWords(text: string): RaceWord[] {
  const chars = [...text];
  const words: RaceWord[] = [];
  let i = 0;
  while (i < chars.length) {
    const start = i;
    while (i < chars.length && chars[i] !== ' ') i++;
    while (i < chars.length && chars[i] === ' ') i++;
    words.push({ start, chars: chars.slice(start, i) });
  }
  return words;
}

/** One word's current look, as plain values, so a word can tell when it has not changed. */
export interface WordView {
  /** One letter per character: o(k), a(ccent forgiven), w(rong), p(ending). */
  states: string;
  /** The caret's place within the word, or -1. */
  caret: number;
  /** Characters typed that the text does not have, before the word's character at `at`. */
  extra: Array<{ at: number; text: string }>;
}

const CODE: Record<CharState, string> = { ok: 'o', accent: 'a', wrong: 'w', pending: 'p' };

/** How one word looks given the comparison so far. `last` marks the text's last word, which also shows what was typed past the end. */
export function wordView(word: RaceWord, cmp: TypingComparison | null, finished: boolean, last = false): WordView {
  const end = word.start + word.chars.length;
  let states = '';
  for (let i = word.start; i < end; i++) states += CODE[cmp?.chars[i] ?? 'pending'];
  const caret = cmp && !finished && cmp.caret >= word.start && cmp.caret < end ? cmp.caret - word.start : -1;
  const extra = (cmp?.extra ?? [])
    .filter((x) => x.before >= word.start && (x.before < end || (last && x.before === end)))
    .map((x) => ({ at: x.before - word.start, text: x.text }));
  return { states, caret, extra };
}

/** The word the caret is in (the last word once the text is all typed). */
export function caretWord(words: readonly RaceWord[], caret: number): number {
  for (let w = words.length - 1; w >= 0; w--) if (caret >= words[w]!.start) return w;
  return 0;
}

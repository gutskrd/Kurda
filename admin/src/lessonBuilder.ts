/**
 * A lesson from a list of words: the quick way to a complete lesson. The
 * editor writes the words and phrases once, each Kurdish beside its meaning,
 * and gets the exercises a lesson is made of, from easy to hard: meet them
 * (match the pairs), recognise them (what does it mean?), recall them
 * (translate into Kurdish), hear them (listen and type) and say them. Every
 * exercise made is an ordinary one, edited like any other afterwards. Pure,
 * so it is tested without a browser.
 */
import { lessonAudioKey, normalizeKurdish } from '@kurda/shared';
import type { Exercise } from './lessons';

export interface WordPair {
  ku: string;
  en: string;
}

/** The most words one build takes: past this, it is two lessons. */
export const MAX_WORDS = 12;
/** A match-pairs card's limit, and so a word's. */
const WORD_MAX = 120;
/** Pairs on one match-pairs board: more is hard to scan on a phone. */
const BOARD = 5;

/** Between a word and its meaning: "=", a tab, or a dash with spaces round it. */
const SEPARATOR = /\s*=\s*|\t+|\s+[-–—]\s+/;

/** The words in what the editor typed, one per line, and what is wrong with any of them. */
export function parseWords(text: string): { pairs: WordPair[]; problems: string[] } {
  const pairs: WordPair[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const at = SEPARATOR.exec(line);
    const ku = at ? normalizeKurdish(line.slice(0, at.index)) : '';
    const en = at ? normalizeKurdish(line.slice(at.index + at[0].length)) : '';
    if (!ku || !en) {
      problems.push(`Line ${i + 1}: write it as Kurdish = meaning, like “Silav = Hello”.`);
      return;
    }
    if (ku.length > WORD_MAX || en.length > WORD_MAX) {
      problems.push(`Line ${i + 1} is longer than ${WORD_MAX} characters: keep each to a word or a short phrase.`);
      return;
    }
    const key = lessonAudioKey(ku);
    if (seen.has(key)) {
      problems.push(`Line ${i + 1}: “${ku}” is already in the list.`);
      return;
    }
    seen.add(key);
    pairs.push({ ku, en });
  });
  if (pairs.length > MAX_WORDS) problems.push(`Use at most ${MAX_WORDS} words: a lesson with more is two lessons.`);
  return { pairs: pairs.slice(0, MAX_WORDS), problems };
}

export type BuildKind = 'match' | 'meaning' | 'translate' | 'listen' | 'speak';

export const BUILD_KINDS: ReadonlyArray<{ key: BuildKind; label: string; hint: string }> = [
  { key: 'match', label: 'Match the pairs', hint: 'Meet the words: Kurdish on one side, meanings on the other.' },
  { key: 'meaning', label: 'What does it mean?', hint: 'One question a word: its meaning among the others’.' },
  { key: 'translate', label: 'Translate into Kurdish', hint: 'One a word: the meaning shown, the Kurdish typed.' },
  { key: 'listen', label: 'Listen and type', hint: 'Up to three: a recording is heard and written down. Each needs a recording before the lesson is published.' },
  { key: 'speak', label: 'Say it aloud', hint: 'Up to three: the learner says it, beside the native recording.' },
];

/** At most this many listening and speaking items: they are slower, and each needs a recording. */
const AUDIO_ITEMS = 3;

/** An answer as it is written, and as it is likely typed: without the closing mark or the commas. */
function accepted(ku: string): string[] {
  const bare = ku.replace(/[.!?…؟]+$/u, '').trim();
  const plain = bare.replace(/[,،]/g, '').replace(/\s+/g, ' ').trim();
  return [...new Set([ku, bare, plain].filter(Boolean))];
}

/** The other meanings, as wrong answers: the nearest in the list, so they differ from build to build of the same words. */
function distractors(pairs: readonly WordPair[], i: number): string[] {
  const own = pairs[i]!.en.toLowerCase();
  const others: string[] = [];
  for (let step = 1; step < pairs.length && others.length < 2; step++) {
    const en = pairs[(i + step) % pairs.length]!.en;
    if (en.toLowerCase() !== own && !others.includes(en)) others.push(en);
  }
  return others;
}

/** The longest phrases first: they are the ones worth hearing and saying. */
function forAudio(pairs: readonly WordPair[]): WordPair[] {
  return [...pairs].sort((a, b) => b.ku.length - a.ku.length).slice(0, AUDIO_ITEMS);
}

/**
 * The exercises for `pairs`, in the order a learner meets them: the pairs
 * first, then each word recognised, then recalled, then heard, then said. The
 * right answer is written first; the server shows answers in a different order
 * to every learner.
 */
export function buildExercises(pairs: readonly WordPair[], kinds: ReadonlySet<BuildKind>): Exercise[] {
  const out: Array<Pick<Exercise, 'type' | 'payload'>> = [];
  if (kinds.has('match') && pairs.length >= 2) {
    const boards = Math.ceil(pairs.length / BOARD);
    const size = Math.ceil(pairs.length / boards);
    for (let b = 0; b < boards; b++) {
      const board = pairs.slice(b * size, (b + 1) * size);
      // a board of one is no matching: it joins the one before
      if (board.length < 2) continue;
      out.push({ type: 'match_pairs', payload: { pairs: board.map((p) => ({ left: p.ku, right: p.en })) } });
    }
  }
  if (kinds.has('meaning') && pairs.length >= 2) {
    pairs.forEach((p, i) => {
      out.push({ type: 'multiple_choice', payload: { say: p.ku, prompt: `“${p.ku}” tê çi wateyê?`, options: [p.en, ...distractors(pairs, i)], correctIndex: 0 } });
    });
  }
  if (kinds.has('translate')) {
    for (const p of pairs) out.push({ type: 'translate', payload: { prompt: p.en, accepted: accepted(p.ku) } });
  }
  if (kinds.has('listen')) {
    for (const p of forAudio(pairs)) out.push({ type: 'listening', payload: { prompt: 'Type what you hear.', accepted: accepted(p.ku) } });
  }
  if (kinds.has('speak')) {
    for (const p of forAudio(pairs)) out.push({ type: 'speaking', payload: { prompt: `Say it aloud: “${p.ku}” (${p.en})`, reference: p.ku } });
  }
  return out.map((ex, i) => ({ position: i + 1, ...ex }));
}

/** How many exercises each kind makes for `pairs`, for the builder's checkboxes. */
export function buildCounts(pairs: readonly WordPair[]): Record<BuildKind, number> {
  const count = (kind: BuildKind): number => buildExercises(pairs, new Set([kind])).length;
  return { match: count('match'), meaning: count('meaning'), translate: count('translate'), listen: count('listen'), speak: count('speak') };
}

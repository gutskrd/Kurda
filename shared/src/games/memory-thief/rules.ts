/**
 * The Memory Thief: how long a passage is studied, how many of its words the
 * thief takes, how they are given back, and the shapes a round travels in.
 *
 * The passages are approved ones — published stories, a paragraph at a time,
 * a few lines of a published lesson conversation, published `passage` rows —
 * and the words that vanish are approved too: a story's glossary terms, or
 * words the published lessons teach, each with the meaning an approved source
 * gives it. Nothing here writes Kurdish; what is decided here is only how hard
 * a round is.
 *
 * Easier rounds give longer to study and take fewer words, and the words are
 * given back from tiles with a few decoys among them; at the advanced
 * difficulty they are typed, with the key bar, and graded as lessons grade a
 * typed answer: a slip of a mark (ê for e, ێ for ی) is accepted as a typo.
 */
import type { SpeakerId } from '../../lipsync/speakers.js';
import type { Meanings } from '../content.js';
import type { GameDifficulty } from '../solo.js';

/** Passages in one round: each is studied and restored, which takes longer than a sentence. */
export const MEMORY_ROUND_PASSAGES = 5;

/** Words a passage may have to be one: fewer is no memory test, more than a screen holds is a wall. */
export const MEMORY_PASSAGE_WORDS = { min: 12, max: 90 } as const;

/** Lines of a conversation taken as one passage. */
export const MEMORY_CONVERSATION_LINES = { min: 3, max: 4 } as const;

/** Words the thief takes, by difficulty (always within 2–6): a passage needs at least `min` words worth taking. */
export const MEMORY_HIDDEN: Readonly<Record<GameDifficulty, { min: number; max: number }>> = {
  beginner: { min: 2, max: 3 },
  intermediate: { min: 3, max: 4 },
  advanced: { min: 4, max: 6 },
};

/** Tiles that are none of the vanished words, by difficulty; advanced types instead. */
export const MEMORY_DECOYS: Readonly<Record<GameDifficulty, number>> = { beginner: 2, intermediate: 3, advanced: 0 };

/** How the vanished words are given back. */
export type MemoryAnswerMode = 'tiles' | 'type';

export function memoryAnswerMode(difficulty: GameDifficulty): MemoryAnswerMode {
  return difficulty === 'advanced' ? 'type' : 'tiles';
}

/** Seconds to study, by difficulty: a little to settle in, then some for every word, within bounds. */
const STUDY: Readonly<Record<GameDifficulty, { base: number; perWord: number; min: number; max: number }>> = {
  beginner: { base: 15, perWord: 1, min: 20, max: 75 },
  intermediate: { base: 10, perWord: 0.7, min: 15, max: 55 },
  advanced: { base: 6, perWord: 0.5, min: 12, max: 40 },
};

/** How long a passage of so many words is studied at a difficulty, in whole seconds. */
export function studySeconds(words: number, difficulty: GameDifficulty): number {
  const s = STUDY[difficulty];
  return Math.round(Math.min(s.max, Math.max(s.min, s.base + Math.max(0, words) * s.perWord)));
}

/** Where the vanished words came from, which the explanation after a passage names. */
export type MemoryWhy = 'glossary' | 'vocabulary';
export const MEMORY_WHY: readonly MemoryWhy[] = ['glossary', 'vocabulary'];

// ---------- what the apps are sent ----------

/**
 * A piece of the passage as the restore phase lays it out: text as written,
 * a gap (numbered from 0; a word that vanished from two places is the same
 * gap twice), or, in a conversation, the start of a line (by its place in
 * `speakers`).
 */
export type MemoryPart = { text: string } | { gap: number } | { line: number };

/** An answer: the word given back to each gap, by its number; an empty string for a gap left empty. */
export interface MemoryThiefAnswer {
  gaps: string[];
}

/** After a wrong first try: which gaps are still wrong (never the words that go there). */
export interface MemoryThiefHint {
  wrong: number[];
}

/** How a gap's word was given back: right, right but for a mark (typed only), or not. */
export type MemoryVerdict = 'right' | 'typo' | 'wrong';

/** Once a passage is done: every vanished word in place, what it means, and what was given back for it. */
export interface MemoryThiefCorrection {
  words: Array<{ gap: number; term: string; meanings: Partial<Meanings> | null; given: string | null; verdict: MemoryVerdict }>;
}

/** A conversation's lines say who speaks each one; a story's passage has one unspoken line. */
export type MemorySpeakers = Array<SpeakerId | null>;

/** The passage as it is studied, line by line, before anything is known of what will vanish. */
export function memoryTextLines(text: string): MemoryStudyPiece[][] {
  return text.split('\n').map((line) => [{ text: line }]);
}

/** A piece of a line as the study phase shows it: text as written, or a word that is about to vanish (and its gap). */
export type MemoryStudyPiece = { text: string } | { gap: number; word: string };

/**
 * The passage line by line with every word that will vanish in its place, for
 * the words to lift off as the study ends: `parts` laid over `text`. A gap's
 * word is what the line has where the gap stands — up to the next space, less
 * the punctuation that closes it, as the server cut it. Without the text (a
 * round come back to after its words vanished, which is never sent the
 * passage again) every gap's word is empty. Pure; both apps stage the same
 * lines from it.
 */
export function memoryStudyLines(text: string | null, parts: readonly MemoryPart[]): MemoryStudyPiece[][] {
  if (text === null) {
    const out: MemoryStudyPiece[][] = [];
    let line = -1;
    for (const part of parts) {
      if ('line' in part) out[(line = part.line)] = [];
      else (out[line] ??= []).push('text' in part ? { text: part.text } : { gap: part.gap, word: '' });
    }
    return out.map((l) => l ?? []);
  }
  const lines = text.split('\n');
  const out: MemoryStudyPiece[][] = [];
  let line = -1;
  let at = 0;
  for (const part of parts) {
    if ('line' in part) {
      line = part.line;
      at = 0;
      out[line] = [];
      continue;
    }
    const here = lines[line] ?? '';
    const pieces = (out[line] ??= []);
    if ('text' in part) {
      pieces.push({ text: part.text });
      at += part.text.length;
    } else {
      const run = /^\S*/u.exec(here.slice(at))![0];
      const word = run.replace(/[^\p{L}\p{N}]+$/u, '');
      pieces.push({ gap: part.gap, word });
      at += word.length;
    }
  }
  return out.map((l) => l ?? []);
}

/**
 * Everything about an answer that is not about where the lesson is: the
 * learner's draft and its wire shape, the match-pairs taps, the Kurdish key
 * bar, the letter-by-letter comparison feedback shows, and what kind of slip a
 * typed miss was. Pure, and shared by the browser and the phone for the reason
 * `lesson-player.ts` is.
 */
import { answerKey, foldDiacritics, foldLetter } from './kurdish-text.js';
import type { ExerciseType, SelfRating } from './lesson-player.js';

// ---------- drafts ----------

/** A pair the learner matched, sent to the server for grading. */
export interface MatchPair {
  left: string;
  right: string;
}

/**
 * The learner's in-progress answer, keyed by exercise type. The player holds
 * this locally; `encodeAnswer` turns it into the server's wire shape (graded
 * server-side — the client never knows the correct answer).
 */
export type DraftAnswer =
  | { type: 'multiple_choice'; choice: number | null }
  /** the answer to the question after the conversation, chosen as a multiple-choice answer is */
  | { type: 'conversation'; choice: number | null }
  | { type: 'translate'; text: string }
  | { type: 'listening'; text: string }
  | { type: 'writing'; text: string }
  /**
   * whether a take has been recorded (it stays on the device), and how the
   * learner rated it beside the model
   */
  | { type: 'speaking'; recorded: boolean; selfRating?: SelfRating | null }
  | { type: 'match_pairs'; matches: MatchPair[] };

export function emptyDraft(type: ExerciseType): DraftAnswer {
  switch (type) {
    case 'multiple_choice':
    case 'conversation':
      return { type, choice: null };
    case 'translate':
    case 'listening':
    case 'writing':
      return { type, text: '' };
    case 'speaking':
      return { type, recorded: false };
    case 'match_pairs':
      return { type, matches: [] };
  }
}

/** True once the draft has enough input to submit. */
export function isDraftComplete(draft: DraftAnswer, pairCount: number): boolean {
  switch (draft.type) {
    case 'multiple_choice':
    case 'conversation':
      return draft.choice !== null;
    case 'translate':
    case 'listening':
    case 'writing':
      return draft.text.trim().length > 0;
    case 'speaking':
      // recorded and rated: the rating is the answer, the take never leaves
      // the device
      return draft.recorded && Boolean(draft.selfRating);
    case 'match_pairs':
      return draft.matches.length === pairCount;
  }
}

/** Encode a draft into the request body the answers endpoint expects. */
export function encodeAnswer(draft: DraftAnswer): unknown {
  switch (draft.type) {
    case 'multiple_choice':
    case 'conversation':
      return { choice: draft.choice };
    case 'translate':
    case 'listening':
    case 'writing':
      return { text: draft.text.trim() };
    case 'speaking':
      return draft.selfRating ? { selfRating: draft.selfRating } : {};
    case 'match_pairs':
      return { matches: draft.matches };
  }
}

// ---------- a spoken answer ----------

/** Recordings shorter than this are almost certainly a slipped tap. */
export const MIN_RECORDING_MS = 1000;
/** A plausible clip has at least this many bytes; fewer is a silent or failed capture. */
export const MIN_RECORDING_BYTES = 800;

/**
 * Why a recording is not worth uploading, or null when it is: too short to be
 * an attempt, or too small to hold any sound. Checked before the upload is
 * spent, on the phone and in the browser alike.
 */
export function recordingProblem({ durationMs, byteSize }: { durationMs: number; byteSize: number }): 'tooShort' | 'silent' | null {
  if (durationMs < MIN_RECORDING_MS) return 'tooShort';
  if (byteSize < MIN_RECORDING_BYTES) return 'silent';
  return null;
}

// ---------- match pairs ----------

/** Transient state of the match-pairs interaction. */
export interface MatchState {
  matches: MatchPair[];
  /** a left card awaiting its right, or null */
  selectedLeft: string | null;
}

export const emptyMatch: MatchState = { matches: [], selectedLeft: null };

export function isLeftMatched(state: MatchState, left: string): boolean {
  return state.matches.some((m) => m.left === left);
}

export function isRightMatched(state: MatchState, right: string): boolean {
  return state.matches.some((m) => m.right === right);
}

/**
 * Tap a left card: matched → unmatch it; already selected → deselect;
 * otherwise select it (waiting for a right card).
 */
export function tapLeft(state: MatchState, left: string): MatchState {
  if (isLeftMatched(state, left)) {
    return { matches: state.matches.filter((m) => m.left !== left), selectedLeft: null };
  }
  return { ...state, selectedLeft: state.selectedLeft === left ? null : left };
}

/**
 * Tap a right card: matched → unmatch it; else if a left is selected, form
 * the pair; else nothing (no left chosen yet).
 */
export function tapRight(state: MatchState, right: string): MatchState {
  if (isRightMatched(state, right)) {
    return { ...state, matches: state.matches.filter((m) => m.right !== right) };
  }
  if (state.selectedLeft === null) return state;
  return {
    matches: [...state.matches, { left: state.selectedLeft, right }],
    selectedLeft: null,
  };
}

// ---------- the Kurdish key bar ----------

/** The Kurmancî letters a Latin keyboard lacks (KUR-037). */
export const KURMANJI_KEYS = ['ê', 'î', 'û', 'ç', 'ş'] as const;

/**
 * The Soranî letters an Arabic or Persian keyboard lacks, or types as a
 * different character that only looks the same.
 */
export const SORANI_KEYS = ['ڕ', 'ڵ', 'ێ', 'ۆ', 'ە', 'ی', 'ک', 'گ', 'چ', 'پ', 'ژ', 'ڤ'] as const;

/** Whether a course's `dialect` is Soranî, which is written in Arabic script. */
export function isSoraniDialect(dialect: string | null | undefined): boolean {
  const d = (dialect ?? '').trim().toLowerCase();
  return d === 'sorani' || d === 'soranî' || d === 'ckb' || d === 'central kurdish';
}

/** The letters a key bar offers for a course's variety of Kurdish. */
export function typingKeys(dialect: string | null | undefined): readonly string[] {
  return isSoraniDialect(dialect) ? SORANI_KEYS : KURMANJI_KEYS;
}

/** Whether text is written in the Arabic script (Soranî), so it is set right to left. */
export function isArabicScript(text: string): boolean {
  return /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/.test(text);
}

export interface Selection {
  start: number;
  end: number;
}

/**
 * Insert `insert` into `text` at the current selection, replacing any
 * selected range. Returns the new text and the caret position after it.
 */
export function insertAtSelection(text: string, selection: Selection, insert: string): { text: string; caret: number } {
  const start = Math.max(0, Math.min(selection.start, text.length));
  const end = Math.max(start, Math.min(selection.end, text.length));
  const next = text.slice(0, start) + insert + text.slice(end);
  return { text: next, caret: start + insert.length };
}

// ---------- the learner's answer beside the right one ----------

/** A run of letters, and whether it differs from the other answer. */
export interface DiffSegment {
  text: string;
  differs: boolean;
}

/** The letter as grading reads it: case and keyboard variants do not make it different. */
function letterOf(ch: string): string {
  return foldLetter(ch.toLowerCase());
}

/** Join consecutive letters with the same flag into one segment. */
function segments(chars: string[], differs: boolean[]): DiffSegment[] {
  const out: DiffSegment[] = [];
  chars.forEach((ch, i) => {
    const last = out[out.length - 1];
    if (last && last.differs === differs[i]) last.text += ch;
    else out.push({ text: ch, differs: differs[i]! });
  });
  return out;
}

/**
 * The learner's answer and the right one, each split into the letters they
 * share and the ones they do not, so feedback can mark exactly what to fix:
 * "sev" against "sêv" marks the e in one and the ê in the other.
 *
 * The shared letters are a longest common subsequence, compared as grading
 * compares them (case and a Soranî keyboard's variant letters do not count
 * as different). Answers are a sentence at most, so the quadratic table is a
 * few thousand cells.
 */
export function letterDiff(given: string, expected: string): { given: DiffSegment[]; expected: DiffSegment[] } {
  const a = Array.from(given.normalize('NFC'));
  const b = Array.from(expected.normalize('NFC'));
  const ka = a.map(letterOf);
  const kb = b.map(letterOf);
  // lcs[i][j] = length of the longest common subsequence of a[i..] and b[j..]
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] = ka[i] === kb[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const aDiffers = a.map(() => true);
  const bDiffers = b.map(() => true);
  for (let i = 0, j = 0; i < a.length && j < b.length; ) {
    if (ka[i] === kb[j]) {
      aDiffers[i] = false;
      bDiffers[j] = false;
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      i++;
    } else {
      j++;
    }
  }
  return { given: segments(a, aDiffers), expected: segments(b, bDiffers) };
}

// ---------- what kind of slip it was ----------

/**
 * A typed miss that is one thing, said in a line under the comparison:
 *   marks     — the same letters, only Kurmancî's marks differ ("s → ş");
 *   lookalike — Soranî: a letter written as the one it looks like without its
 *               mark ("ر → ڕ");
 *   order     — the right words, in another order;
 *   missing   — one word left out;
 *   extra     — one word too many.
 * Anything else is more than one slip, and the letters marked say it better.
 */
export type TypedHint =
  | { kind: 'marks'; pairs: Array<[string, string]> }
  | { kind: 'lookalike'; pairs: Array<[string, string]> }
  | { kind: 'order' }
  | { kind: 'missing'; word: string }
  | { kind: 'extra'; word: string };

/**
 * Soranî letters that are another letter with a mark: ڕ is ر with a small v
 * under it, ڵ is ل with one over it, ێ is ی with one under it, ۆ is و with one
 * over it, ڤ is ف with three dots; and the vowel ە is a stroke away from h in
 * many faces, and a Persian keyboard types one for the other. A keyboard's own
 * variants (ك for ک, ي for ی, `foldLetter`) are not here: grading reads them as
 * the same letter already (`answerKey`), so they are never a miss.
 */
const SORANI_MARKED: Record<string, string> = { 'ڕ': 'ر', 'ڵ': 'ل', 'ێ': 'ی', 'ۆ': 'و', 'ڤ': 'ف', 'ە': 'ھ' };

/** Punctuation, Latin and Arabic-script: it says nothing about which words were written. */
const PUNCTUATION = /[.,!?;:"'“”‘’()¡¿…—–\-؟،؛«»]/g;

/** An answer's words as written (for saying one back) and as grading reads them (for comparing). */
function wordsOf(text: string): { shown: string[]; keys: string[] } {
  const shown = text.normalize('NFC').replace(PUNCTUATION, ' ').trim().split(/\s+/).filter(Boolean);
  return { shown, keys: shown.map(answerKey) };
}

/** The letters that differ, place by place, in two texts of one length; each pair once. */
function letterPairs(given: string, expected: string): Array<[string, string]> {
  const a = Array.from(given);
  const b = Array.from(expected);
  const pairs = new Map<string, [string, string]>();
  a.forEach((ch, i) => {
    if (ch !== b[i]) pairs.set(`${ch}\u0000${b[i]}`, [ch, b[i]!]);
  });
  return [...pairs.values()];
}

/** Where `longer` has one word that `shorter` lacks, and is otherwise the same; -1 when it is not. */
function oneOut(longer: string[], shorter: string[]): number {
  let at = shorter.findIndex((word, i) => word !== longer[i]);
  if (at < 0) at = shorter.length;
  return longer.slice(at + 1).every((word, i) => word === shorter[at + i]) ? at : -1;
}

/**
 * What kind of slip a typed miss was (`TypedHint`), or null when it is more
 * than one thing or nothing at all. Words are compared as grading compares
 * them — case, punctuation and a keyboard's variant letters do not count —
 * and the first kind that fits is the one said.
 */
export function typedHint(given: string, expected: string, dialect?: string | null): TypedHint | null {
  const a = wordsOf(given);
  const b = wordsOf(expected);
  const ak = a.keys.join(' ');
  const bk = b.keys.join(' ');
  if (ak.length === 0 || ak === bk) return null;
  if (foldDiacritics(ak) === foldDiacritics(bk)) return { kind: 'marks', pairs: letterPairs(ak, bk) };
  const unmarked = (s: string): string => s.replace(/./gu, (ch) => SORANI_MARKED[ch] ?? ch);
  if ((isSoraniDialect(dialect) || isArabicScript(expected)) && unmarked(ak) === unmarked(bk)) return { kind: 'lookalike', pairs: letterPairs(ak, bk) };
  if (a.keys.length === b.keys.length && [...a.keys].sort().join(' ') === [...b.keys].sort().join(' ')) return { kind: 'order' };
  if (b.keys.length === a.keys.length + 1) {
    const at = oneOut(b.keys, a.keys);
    if (at >= 0) return { kind: 'missing', word: b.shown[at]! };
  }
  if (a.keys.length === b.keys.length + 1) {
    const at = oneOut(a.keys, b.keys);
    if (at >= 0) return { kind: 'extra', word: a.shown[at]! };
  }
  return null;
}

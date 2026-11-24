/**
 * Everything about an answer that is not about where the lesson is: the draft and its wire shape, match-pairs taps, the
 * Kurdish key bar, the comparison feedback shows (word by word, letters only inside a near miss), and the kind of slip
 * a typed miss was. Pure and shared by both apps, like `lesson-player.ts`.
 */
import { answerKey, foldDiacritics, foldLetter } from './kurdish-text.js';
import type { ExerciseType, SelfRating } from './lesson-player.js';

// ---------- drafts ----------

/** A pair the learner matched, sent to the server for grading. */
export interface MatchPair {
  left: string;
  right: string;
}

/** The learner's in-progress answer by exercise type; `encodeAnswer` gives the wire shape. The server grades, and the client never knows the answer. */
export type DraftAnswer =
  | { type: 'multiple_choice'; choice: number | null }
  /** the answer to the question after the conversation, chosen like a multiple-choice answer */
  | { type: 'conversation'; choice: number | null }
  | { type: 'translate'; text: string }
  | { type: 'listening'; text: string }
  | { type: 'writing'; text: string }
  /** whether a take was recorded (it stays on the device), and how the learner rated it beside the model */
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
      // Recorded and rated: the rating is the answer, and the take never leaves the device.
      return draft.recorded && Boolean(draft.selfRating);
    case 'match_pairs':
      return draft.matches.length === pairCount;
  }
}

/** The request body the answers endpoint expects for a draft. */
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

/** Why a recording is not worth uploading (too short to be an attempt, too small to hold sound), or null; checked before uploading. */
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

export function isLeftMatched(state: Pick<MatchState, 'matches'>, left: string): boolean {
  return state.matches.some((m) => m.left === left);
}

export function isRightMatched(state: Pick<MatchState, 'matches'>, right: string): boolean {
  return state.matches.some((m) => m.right === right);
}

/** Taps a left card: a matched one is unmatched, the selected one deselected, any other selected to await a right card. */
export function tapLeft(state: MatchState, left: string): MatchState {
  if (isLeftMatched(state, left)) {
    return { matches: state.matches.filter((m) => m.left !== left), selectedLeft: null };
  }
  return { ...state, selectedLeft: state.selectedLeft === left ? null : left };
}

/** Taps a right card: a matched one is unmatched; with a left selected the pair forms; otherwise nothing. */
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

/**
 * Which meaning each Kurdish card pairs with, by text, from a delivered exercise's `pairOf`. Null when the server sent
 * none or one that does not fit the cards; pairs are then made freely and graded together at Check.
 */
export function pairKey(lefts: readonly string[], rights: readonly string[], pairOf: readonly number[] | undefined): Map<string, string> | null {
  if (!pairOf || pairOf.length !== lefts.length) return null;
  const key = new Map<string, string>();
  for (let i = 0; i < lefts.length; i++) {
    const right = rights[pairOf[i]!];
    if (right === undefined) return null;
    key.set(lefts[i]!, right);
  }
  return key;
}

/** A card waiting for its partner while pairs are answered as made; either side may be picked first. */
export interface PickedCard {
  side: 'left' | 'right';
  text: string;
}

/** Pairs answered as they are made: those found so far, and a card waiting for its partner. */
export interface LiveMatchState {
  matches: MatchPair[];
  picked: PickedCard | null;
}

export const emptyLiveMatch: LiveMatchState = { matches: [], picked: null };

/** What a tap did: picked a card, let it go, made a right pair, tried a wrong one, or touched a spent card. */
export type LiveMatchOutcome = 'picked' | 'unpicked' | 'matched' | 'missed' | 'ignored';

/**
 * A tap while pairs are answered as made (`pairKey`): a matched card is spent; tapping the picked card lets it go; another
 * card on its side replaces it; a card on the other side tries the pair, kept if the key agrees, and nothing stays picked.
 * `pair` is the two cards just tried, for the screen to flash.
 */
export function tapLive(
  state: LiveMatchState,
  key: ReadonlyMap<string, string>,
  side: 'left' | 'right',
  text: string,
): { state: LiveMatchState; outcome: LiveMatchOutcome; pair?: MatchPair } {
  if (side === 'left' ? isLeftMatched(state, text) : isRightMatched(state, text)) return { state, outcome: 'ignored' };
  const picked = state.picked;
  if (picked && picked.side === side && picked.text === text) return { state: { ...state, picked: null }, outcome: 'unpicked' };
  if (!picked || picked.side === side) return { state: { ...state, picked: { side, text } }, outcome: 'picked' };
  const pair: MatchPair = side === 'left' ? { left: text, right: picked.text } : { left: picked.text, right: text };
  if (key.get(pair.left) === pair.right) return { state: { matches: [...state.matches, pair], picked: null }, outcome: 'matched', pair };
  return { state: { ...state, picked: null }, outcome: 'missed', pair };
}

// ---------- word tiles ----------

/*
 * An answer built from word tiles (a delivered exercise's `bank`): placed tiles are held by their bank index in the order
 * placed, so the same word twice in the bank stays two tiles.
 */

/** Lays a bank tile at the end of the line; one already there stays put. */
export function placeTile(placed: readonly number[], index: number): number[] {
  return placed.includes(index) ? [...placed] : [...placed, index];
}

/** Takes a tile off the line; the ones after it close up. */
export function liftTile(placed: readonly number[], index: number): number[] {
  return placed.filter((i) => i !== index);
}

/** The answer the line reads, sent like a typed one: its words joined by single spaces. */
export function tileAnswer(bank: readonly string[], placed: readonly number[]): string {
  return placed
    .map((i) => bank[i])
    .filter((w): w is string => w !== undefined)
    .join(' ');
}

// ---------- the Kurdish key bar ----------

/** The Kurmancî letters a Latin keyboard lacks. */
export const KURMANJI_KEYS = ['ê', 'î', 'û', 'ç', 'ş'] as const;

/** The Soranî letters an Arabic or Persian keyboard lacks, or types as a lookalike character. */
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

/** Whether text is in the Arabic script (Soranî), so it is set right to left. */
export function isArabicScript(text: string): boolean {
  return /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/.test(text);
}

export interface Selection {
  start: number;
  end: number;
}

/** Inserts `insert` at the selection, replacing any selected range; returns the new text and the caret after it. */
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

/** A letter as grading reads it: case and keyboard variants do not make it different. */
function letterOf(ch: string): string {
  return foldLetter(ch.toLowerCase());
}

/** Joins consecutive letters with the same flag into one segment. */
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
 * Both answers split into the letters they share and those they do not, so feedback marks exactly what to fix: "sev"
 * against "sêv" marks the e and the ê. The shared letters are a longest common subsequence compared as grading compares
 * (case and keyboard variants ignored); answers are a sentence at most, so the quadratic table stays small.
 */
export function letterDiff(given: string, expected: string): { given: DiffSegment[]; expected: DiffSegment[] } {
  const a = Array.from(given.normalize('NFC'));
  const b = Array.from(expected.normalize('NFC'));
  const ka = a.map(letterOf);
  const kb = b.map(letterOf);
  // lcs[i][j] is the length of the longest common subsequence of a[i..] and b[j..].
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

/** Words as an answer is written: letters, marks and digits, with an apostrophe inside a word kept in it ("I’m"). */
const WORD = /[\p{L}\p{M}\p{N}]+(?:['’ʼ][\p{L}\p{M}\p{N}]+)*/gu;

/** An answer cut into its words and what lies between them, keeping every character. */
function tokensOf(text: string): Array<{ text: string; word: boolean }> {
  const out: Array<{ text: string; word: boolean }> = [];
  let at = 0;
  for (const m of text.matchAll(WORD)) {
    if (m.index > at) out.push({ text: text.slice(at, m.index), word: false });
    out.push({ text: m[0], word: true });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at), word: false });
  return out;
}

/** A word as grading compares it, with every apostrophe alike. */
const wordKey = (word: string): string => answerKey(word).replace(/[’ʼ]/g, "'");

/** Length of the longest common subsequence of two sequences. */
function commonLength<T>(a: readonly T[], b: readonly T[]): number {
  let row = new Array<number>(b.length + 1).fill(0);
  for (let i = a.length - 1; i >= 0; i--) {
    const next = new Array<number>(b.length + 1).fill(0);
    for (let j = b.length - 1; j >= 0; j--) next[j] = a[i] === b[j] ? row[j + 1]! + 1 : Math.max(row[j]!, next[j + 1]!);
    row = next;
  }
  return row[0]!;
}

/**
 * Whether two stretches are one attempt at the same words, worth marking letter by letter: most of their letters agree
 * once Kurdish marks are folded ("sev" and "sêv", "başim" and "baş im"). Different words ("tea", "the") are not.
 */
function nearMiss(given: string, expected: string): boolean {
  const a = Array.from(foldDiacritics(answerKey(given)).replace(/[^\p{L}\p{N}]/gu, ''));
  const b = Array.from(foldDiacritics(answerKey(expected)).replace(/[^\p{L}\p{N}]/gu, ''));
  const longest = Math.max(a.length, b.length);
  return longest > 0 && commonLength(a, b) / longest >= 0.7;
}

/**
 * Both answers marked where they differ, word by word: words the two share are left plain, a word left out or added is
 * marked whole, and only a near miss of the same word is marked letter by letter (`letterDiff`), so "I’m drinking tea"
 * against "I’m drinking the tea." marks "the" and nothing else. Punctuation, which grading ignores, is never marked.
 */
export function answerDiff(given: string, expected: string): { given: DiffSegment[]; expected: DiffSegment[] } {
  const a = tokensOf(given.normalize('NFC'));
  const b = tokensOf(expected.normalize('NFC'));
  const aw = a.flatMap((t, i) => (t.word ? [i] : []));
  const bw = b.flatMap((t, i) => (t.word ? [i] : []));
  const ak = aw.map((i) => wordKey(a[i]!.text));
  const bk = bw.map((i) => wordKey(b[i]!.text));
  // Which tokens are marked, and the letter marks a near-missed stretch is drawn with instead.
  const aMarked = new Set<number>();
  const bMarked = new Set<number>();
  const aLetters = new Map<number, { to: number; segments: DiffSegment[] }>();
  const bLetters = new Map<number, { to: number; segments: DiffSegment[] }>();

  const settle = (ai: number, aj: number, bi: number, bj: number): void => {
    if (ai === aj && bi === bj) return;
    if (ai < aj && bi < bj) {
      const aFrom = aw[ai]!;
      const aTo = aw[aj - 1]!;
      const bFrom = bw[bi]!;
      const bTo = bw[bj - 1]!;
      const aText = a.slice(aFrom, aTo + 1).map((t) => t.text).join('');
      const bText = b.slice(bFrom, bTo + 1).map((t) => t.text).join('');
      if (nearMiss(aText, bText)) {
        const d = letterDiff(aText, bText);
        aLetters.set(aFrom, { to: aTo, segments: d.given });
        bLetters.set(bFrom, { to: bTo, segments: d.expected });
        return;
      }
    }
    for (let i = ai; i < aj; i++) aMarked.add(aw[i]!);
    for (let j = bi; j < bj; j++) bMarked.add(bw[j]!);
  };

  // The shared words, a longest common subsequence of word keys; the stretches between them are settled one by one.
  const lcs: number[][] = Array.from({ length: ak.length + 1 }, () => new Array<number>(bk.length + 1).fill(0));
  for (let i = ak.length - 1; i >= 0; i--) {
    for (let j = bk.length - 1; j >= 0; j--) lcs[i]![j] = ak[i] === bk[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
  }
  let i = 0;
  let j = 0;
  let gapA = 0;
  let gapB = 0;
  while (i < ak.length && j < bk.length) {
    if (ak[i] === bk[j]) {
      settle(gapA, i, gapB, j);
      i++;
      j++;
      gapA = i;
      gapB = j;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) i++;
    else j++;
  }
  settle(gapA, ak.length, gapB, bk.length);

  const draw = (tokens: Array<{ text: string; word: boolean }>, marked: Set<number>, letters: Map<number, { to: number; segments: DiffSegment[] }>): DiffSegment[] => {
    const out: DiffSegment[] = [];
    const push = (seg: DiffSegment): void => {
      const last = out[out.length - 1];
      if (last && last.differs === seg.differs) last.text += seg.text;
      else out.push({ ...seg });
    };
    for (let k = 0; k < tokens.length; k++) {
      const near = letters.get(k);
      if (near) {
        near.segments.forEach(push);
        k = near.to;
      } else {
        // The space between two marked words is marked with them, so they read as one stretch to fix.
        const between = !tokens[k]!.word && /^\s+$/.test(tokens[k]!.text) && marked.has(k - 1) && marked.has(k + 1);
        push({ text: tokens[k]!.text, differs: marked.has(k) || between });
      }
    }
    return out;
  };
  return { given: draw(a, aMarked, aLetters), expected: draw(b, bMarked, bLetters) };
}

// ---------- what kind of slip it was ----------

/**
 * A typed miss that is one thing, said under the comparison: `marks`, only Kurmancî's marks differ ("s → ş");
 * `lookalike`, a Soranî letter written as its unmarked lookalike ("ر → ڕ"); `order`, the right words in another order;
 * `missing`, one word left out; `extra`, one word too many. Anything else is more than one slip.
 */
export type TypedHint =
  | { kind: 'marks'; pairs: Array<[string, string]> }
  | { kind: 'lookalike'; pairs: Array<[string, string]> }
  | { kind: 'order' }
  | { kind: 'missing'; word: string }
  | { kind: 'extra'; word: string };

/**
 * Soranî letters that are another letter with a mark (ڕ ر, ڵ ل, ێ ی, ۆ و, ڤ ف), and ە, a stroke from h in many fonts and
 * swapped by Persian keyboards. Keyboard variants such as ك for ک are absent: grading already reads them as the same
 * letter (`answerKey`), so they are never a miss.
 */
const SORANI_MARKED: Record<string, string> = { 'ڕ': 'ر', 'ڵ': 'ل', 'ێ': 'ی', 'ۆ': 'و', 'ڤ': 'ف', 'ە': 'ھ' };

/** Latin and Arabic-script punctuation, which says nothing about which words were written. */
const PUNCTUATION = /[.,!?;:"'“”‘’()¡¿…—–\-؟،؛«»]/g;

/** An answer's words as written, for saying one back, and as grading reads them, for comparing. */
function wordsOf(text: string): { shown: string[]; keys: string[] } {
  const shown = text.normalize('NFC').replace(PUNCTUATION, ' ').trim().split(/\s+/).filter(Boolean);
  return { shown, keys: shown.map(answerKey) };
}

/** The letters that differ, place by place, between two texts of one length; each pair once. */
function letterPairs(given: string, expected: string): Array<[string, string]> {
  const a = Array.from(given);
  const b = Array.from(expected);
  const pairs = new Map<string, [string, string]>();
  a.forEach((ch, i) => {
    if (ch !== b[i]) pairs.set(`${ch}\u0000${b[i]}`, [ch, b[i]!]);
  });
  return [...pairs.values()];
}

/** Where `longer` has one word that `shorter` lacks and is otherwise the same; -1 when not. */
function oneOut(longer: string[], shorter: string[]): number {
  let at = shorter.findIndex((word, i) => word !== longer[i]);
  if (at < 0) at = shorter.length;
  return longer.slice(at + 1).every((word, i) => word === shorter[at + i]) ? at : -1;
}

/**
 * The kind of slip a typed miss was (`TypedHint`), or null when it is more than one thing or nothing. Words are compared as
 * grading compares them, ignoring case, punctuation and keyboard variants, and the first kind that fits is said.
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

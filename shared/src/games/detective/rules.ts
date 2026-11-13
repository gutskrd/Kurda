/**
 * Detective: how a case is played, from either side.
 *
 * A case file (`case_file` content) holds a title and an introduction in the
 * interface languages, the suspects, evidence cards whose Kurdish is reused
 * from published lessons and stories, the deduction steps whose answers
 * depend on understanding that Kurdish, the culprit and a solution that walks
 * back through the evidence. A round is one case: each deduction step is an
 * item, and the accusation is the last.
 *
 * What a card means is not on the board at first — understanding it is the
 * game. A card's meaning is found when a deduction it proves is made, or
 * bought with a hint; a hint can instead read the case's next written hint.
 * A case has DETECTIVE_HINTS of them and no more: that they run out is what
 * a hint costs. A case is played alone, so it pays no XP to take one from.
 */
import { isSpeakerId, type SpeakerId } from '../../lipsync/speakers.js';
import type { CaseFileContent, ContentOrigin, GameLevel, Meanings } from '../content.js';

/** Hints one case allows, whatever they are spent on. */
export const DETECTIVE_HINTS = 3;

/** A case's items in the order they are played: every deduction step, then the accusation. */
export type CaseItem = { kind: 'step'; step: number } | { kind: 'accuse' };

export function caseItems(c: Pick<CaseFileContent, 'steps'>): CaseItem[] {
  return [...c.steps.map((_, step): CaseItem => ({ kind: 'step', step })), { kind: 'accuse' }];
}

/** The evidence the accusation rests on: every step's, once each, in the order the steps use it. */
export function accusationEvidence(c: Pick<CaseFileContent, 'steps'>): string[] {
  return [...new Set(c.steps.flatMap((s) => s.evidence))];
}

/** Evidence no step points at: allowed (a red herring), but worth an editor's second look. */
export function unusedEvidence(c: Pick<CaseFileContent, 'steps' | 'evidence'>): string[] {
  const used = new Set(accusationEvidence(c));
  return c.evidence.map((e) => e.id).filter((id) => !used.has(id));
}

/** The character drawn as a suspect's portrait: the one the case names, else the one whose id the suspect has, else none. */
export function suspectPortrait(s: { id: string; portrait?: SpeakerId }): SpeakerId | null {
  if (s.portrait) return s.portrait;
  return isSpeakerId(s.id) ? s.id : null;
}

/**
 * The cards a hint may still translate: those not yet found (by a deduction
 * made) or translated, in the board's order.
 */
export function untranslated(c: Pick<CaseFileContent, 'evidence'>, known: ReadonlySet<string>): string[] {
  return c.evidence.map((e) => e.id).filter((id) => !known.has(id));
}

// ---------- what travels between the server and the apps ----------

/** An answer: an option of a step, or a suspect for the accusation, by its place. */
export interface DetectiveAnswer {
  choice: number;
}

/** After a wrong first try: the cards to read again, never the answer. */
export interface DetectiveHint {
  look: string[];
}

/** A deduction as the notebook keeps it. */
export interface NotebookEntry {
  step: number;
  prompt: Meanings;
  answer: Meanings;
  evidence: string[];
}

/** Once an item is done: the right answer, the cards it rests on with what they mean, and for the accusation the whole solution. */
export interface DetectiveCorrection {
  kind: 'step' | 'accuse';
  correctIndex: number;
  /** a step's deduction, for the notebook */
  entry: NotebookEntry | null;
  /** the cards it rests on, now found, with what each means */
  evidence: Array<{ id: string; meanings: Meanings }>;
  /** the accusation's: who did it, the solution, and every deduction it walks back through */
  culprit: string | null;
  solution: Meanings | null;
  walk: NotebookEntry[] | null;
}

/** POST /games/detective/sessions/:id/hints: spend a hint on a card's meaning, or (no card) on the next written hint. */
export interface DetectiveHintAsk {
  evidence?: string;
}

/**
 * A published line an editor can pick for a case's evidence (GET
 * /admin/game-content/lines), so the Kurdish is copied from where a person
 * approved it and never typed again: a conversation's line, a lesson's
 * sentence, a story's sentence.
 */
export interface PublishedLine {
  ku: string;
  /** what the lesson gives it to mean; a story's sentences have none, and the editor writes it */
  en: string | null;
  speaker: SpeakerId | null;
  /** the lesson-audio key its recording is (or would be) filed under */
  recording: string | null;
  origin: ContentOrigin;
  /** where it is from, for the picker's list: the conversation's or story's title */
  from: string | null;
  level: GameLevel;
}

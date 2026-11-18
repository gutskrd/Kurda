/**
 * Detective: how a case is played. A case file (`case_file` content) holds a title and introduction in the interface
 * languages, suspects, evidence cards with Kurdish reused from published lessons and stories, deduction steps that need
 * that Kurdish understood, the culprit and a solution walking back through the evidence. A round is one case: each step
 * an item, the accusation last. Understanding the cards is the game, so a card's meaning appears only once a deduction
 * proves it or a hint buys it; a hint can instead read the next written hint. A case has DETECTIVE_HINTS and no more,
 * which is their cost, since a solo case pays no XP to take from.
 */
import { isSpeakerId, type SpeakerId } from '../../lipsync/speakers.js';
import type { CaseFileContent, ContentOrigin, GameLevel, Meanings } from '../content.js';

/** Hints one case allows, whatever they are spent on. */
export const DETECTIVE_HINTS = 3;

/** The evidence the accusation rests on: every step's, once each, in the order the steps use it. */
export function accusationEvidence(c: Pick<CaseFileContent, 'steps'>): string[] {
  return [...new Set(c.steps.flatMap((s) => s.evidence))];
}

/** Evidence no step points at: allowed as a red herring, but worth an editor's second look. */
export function unusedEvidence(c: Pick<CaseFileContent, 'steps' | 'evidence'>): string[] {
  const used = new Set(accusationEvidence(c));
  return c.evidence.map((e) => e.id).filter((id) => !used.has(id));
}

/** The character drawn as a suspect's portrait: the one the case names, else the one whose id the suspect has, else none. */
export function suspectPortrait(s: { id: string; portrait?: SpeakerId }): SpeakerId | null {
  if (s.portrait) return s.portrait;
  return isSpeakerId(s.id) ? s.id : null;
}

// ---------- what travels between the server and the apps ----------

/** An answer: a step's option, or for the accusation a suspect, by its place. */
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

/** Once an item is done: the right answer, the cards it rests on with their meanings, and for the accusation the whole solution. */
export interface DetectiveCorrection {
  kind: 'step' | 'accuse';
  correctIndex: number;
  /** a step's deduction, for the notebook */
  entry: NotebookEntry | null;
  /** the cards it rests on, now found, with what each means */
  evidence: Array<{ id: string; meanings: Meanings }>;
  /** for the accusation: who did it, the solution and every deduction it walks back through */
  culprit: string | null;
  solution: Meanings | null;
  walk: NotebookEntry[] | null;
}

/**
 * A published line an editor can pick as evidence (GET /admin/game-content/lines), so the Kurdish is copied from where a
 * person approved it and never retyped: a conversation line, a lesson sentence or a story sentence.
 */
export interface PublishedLine {
  ku: string;
  /** what the lesson gives it to mean; story sentences have none, and the editor writes it */
  en: string | null;
  speaker: SpeakerId | null;
  /** the lesson-audio key its recording is, or would be, filed under */
  recording: string | null;
  origin: ContentOrigin;
  /** where it is from, for the picker: the conversation's or story's title */
  from: string | null;
  level: GameLevel;
}

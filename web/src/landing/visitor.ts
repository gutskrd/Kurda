import { useSyncExternalStore } from 'react';

/**
 * What a visitor tells the front page: who they are learning for, and which of its first words they have got right.
 * Kept in this browser only and never sent anywhere, so the page can speak to them without an account or any tracking.
 */

export const LEARNING_FOR = ['family', 'partner', 'children', 'self', 'curious'] as const;
export type LearningFor = (typeof LEARNING_FOR)[number];

export interface Visitor {
  learningFor: LearningFor | null;
  /** The page's first words this visitor has answered right, by their Kurdish. */
  words: readonly string[];
}

const KEY = 'hevalo_front_visitor';
const EMPTY: Visitor = { learningFor: null, words: [] };

function read(): Visitor {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Visitor> | null;
    if (!raw || typeof raw !== 'object') return EMPTY;
    const learningFor = LEARNING_FOR.includes(raw.learningFor as LearningFor) ? (raw.learningFor as LearningFor) : null;
    const words = Array.isArray(raw.words) ? raw.words.filter((w): w is string => typeof w === 'string').slice(0, 20) : [];
    return { learningFor, words };
  } catch {
    return EMPTY;
  }
}

let current: Visitor | null = null;
const listeners = new Set<() => void>();

function snapshot(): Visitor {
  current ??= read();
  return current;
}

function write(next: Visitor): void {
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Site data is blocked: the answer still holds for this visit.
  }
  listeners.forEach((f) => f());
}

function subscribe(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

export function useVisitor(): Visitor {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY);
}

export function chooseLearningFor(learningFor: LearningFor | null): void {
  write({ ...snapshot(), learningFor });
}

export function learnWord(word: string): void {
  const now = snapshot();
  if (!now.words.includes(word)) write({ ...now, words: [...now.words, word] });
}

/** For tests: forget what this browser was told. */
export function forgetVisitor(): void {
  current = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing kept
  }
  listeners.forEach((f) => f());
}

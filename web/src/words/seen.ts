import { useEffect, useMemo, useState } from 'react';
import { WORD_SET_IDS, wordSet, type AlphabetScript, type WordSetId } from '@kurda/shared';

/**
 * Which words of each set this reader has opened, per dialect — in this
 * browser only, never sent anywhere, as the alphabet keeps its letters
 * (pages/Alphabet.tsx). Seeing the ticks add up is the small, honest kind of
 * progress that keeps someone going, and storage that fails just means no
 * ticks. One key a set, so a set's ticks are its own.
 */
export const wordsSeenKey = (set: WordSetId): string => `hevalo_words_${set}_seen`;

type Seen = Record<AlphabetScript, string[]>;

const NONE: Seen = { kmr: [], ckb: [] };

/** What was stored, read tolerantly: anything that is not a list of ids counts as nothing opened. */
export function parseSeen(raw: string | null): Seen {
  try {
    const parsed = JSON.parse(raw ?? '{}') as Partial<Record<AlphabetScript, unknown>>;
    const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
    return { kmr: list(parsed.kmr), ckb: list(parsed.ckb) };
  } catch {
    return NONE;
  }
}

function readSeen(set: WordSetId): Seen {
  try {
    return parseSeen(localStorage.getItem(wordsSeenKey(set)));
  } catch {
    return NONE;
  }
}

/** The words of `set` opened in `dialect`, and a way to add one. */
export function useWordsSeen(set: WordSetId, dialect: AlphabetScript): [Set<string>, (id: string) => void] {
  const [all, setAll] = useState(() => readSeen(set));
  // another set has its own ticks
  useEffect(() => setAll(readSeen(set)), [set]);
  const mark = (id: string): void =>
    setAll((prev) => {
      if (prev[dialect].includes(id)) return prev;
      const next = { ...prev, [dialect]: [...prev[dialect], id] };
      try {
        localStorage.setItem(wordsSeenKey(set), JSON.stringify(next));
      } catch {
        // private mode or full storage: the ticks just do not persist
      }
      return next;
    });
  return [useMemo(() => new Set(all[dialect]), [all, dialect]), mark];
}

/** How many of a set's words were opened in either dialect, from what was stored: ids it no longer has do not count. */
export function countSeen(set: WordSetId, raw: string | null): number {
  const seen = parseSeen(raw);
  const opened = new Set([...seen.kmr, ...seen.ckb]);
  return wordSet(set).filter((w) => opened.has(w.id)).length;
}

/** Each set's count, as stored in this browser now. */
export function seenCounts(): Record<WordSetId, number> {
  const read = (set: WordSetId): string | null => {
    try {
      return localStorage.getItem(wordsSeenKey(set));
    } catch {
      return null;
    }
  };
  return Object.fromEntries(WORD_SET_IDS.map((set) => [set, countSeen(set, read(set))])) as Record<WordSetId, number>;
}

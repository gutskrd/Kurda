import { useMemo, useState } from 'react';
import { LATIN_LETTERS, SORANI_LETTERS, type AlphabetScript } from '@kurda/shared';

/**
 * Which letters this reader has opened, per alphabet — in this browser only,
 * never sent anywhere. Seeing the ticks add up is the small, honest kind of
 * progress that keeps someone going (and storage that fails just means no ticks).
 *
 * The alphabet page marks them; Letters and words (pages/Words.tsx) counts
 * them on the alphabet's card, so both read the one record.
 */
const SEEN_KEY = 'hevalo_alphabet_seen';

function readSeen(): Record<AlphabetScript, string[]> {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}') as Partial<Record<AlphabetScript, unknown>>;
    const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
    return { kmr: list(raw.kmr), ckb: list(raw.ckb) };
  } catch {
    return { kmr: [], ckb: [] };
  }
}

export function useSeen(script: AlphabetScript): [Set<string>, (id: string) => void] {
  const [all, setAll] = useState(readSeen);
  const mark = (id: string): void =>
    setAll((prev) => {
      if (prev[script].includes(id)) return prev;
      const next = { ...prev, [script]: [...prev[script], id] };
      try {
        localStorage.setItem(SEEN_KEY, JSON.stringify(next));
      } catch {
        // private mode or full storage: the ticks just do not persist
      }
      return next;
    });
  return [useMemo(() => new Set(all[script]), [all, script]), mark];
}

/** How many of `script`'s letters have been opened here, out of how many: ids the alphabet no longer has do not count. */
export function lettersSeen(script: AlphabetScript): { seen: number; total: number } {
  const letters = script === 'ckb' ? SORANI_LETTERS : LATIN_LETTERS;
  const opened = new Set(readSeen()[script]);
  return { seen: letters.filter((l) => opened.has(l.id)).length, total: letters.length };
}

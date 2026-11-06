import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { LATIN_LETTERS, SORANI_LETTERS, WORD_SET_IDS, wordSet, type AlphabetScript, type WordSetId } from '@kurda/shared';
import { SEEN_KEY, parseSeen, useSeen } from '../alphabet/seen';
import { deviceStore, type DeviceStore } from '../keyboard/deviceStore';

/**
 * Which words of each set this reader has opened, per dialect — on this phone
 * only, as the alphabet keeps its letters (alphabet/seen.ts), one key a set.
 */
export const wordsSeenKey = (set: WordSetId): string => `hevalo_words_${set}_seen_v1`;

/** The words of `set` opened in `dialect`, and a way to add one. */
export function useWordsSeen(set: WordSetId, dialect: AlphabetScript, store: DeviceStore = deviceStore): [ReadonlySet<string>, (id: string) => void] {
  return useSeen(dialect, store, wordsSeenKey(set));
}

/** How many of a set's words were opened in either dialect, from what was stored: ids it no longer has do not count. */
export function countSeen(set: WordSetId, raw: string | null): number {
  const seen = parseSeen(raw);
  const opened = new Set([...seen.kmr, ...seen.ckb]);
  return wordSet(set).filter((w) => opened.has(w.id)).length;
}

/** Each set's count, read again whenever the list of sets comes back into view (after a set was opened). */
export function useSeenCounts(store: DeviceStore = deviceStore): Partial<Record<WordSetId, number>> {
  const [counts, setCounts] = useState<Partial<Record<WordSetId, number>>>({});
  useFocusEffect(
    useCallback(() => {
      let live = true;
      void Promise.all(
        WORD_SET_IDS.map(async (set) => [set, countSeen(set, await store.get(wordsSeenKey(set)).catch(() => null))] as const),
      ).then((pairs) => {
        if (live) setCounts(Object.fromEntries(pairs));
      });
      return () => {
        live = false;
      };
    }, [store]),
  );
  return counts;
}

/** How many of `script`'s letters were opened in the alphabet, from what it stored: ids it no longer has do not count. */
export function countLetters(script: AlphabetScript, raw: string | null): number {
  const opened = new Set(parseSeen(raw)[script]);
  return (script === 'ckb' ? SORANI_LETTERS : LATIN_LETTERS).filter((l) => opened.has(l.id)).length;
}

/** The letters' card: how many of the alphabet's letters were opened, read again whenever the list comes back into view. */
export function useLettersSeen(script: AlphabetScript, store: DeviceStore = deviceStore): { seen: number; total: number } {
  const [seen, setSeen] = useState(0);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      void store
        .get(SEEN_KEY)
        .catch(() => null)
        .then((raw) => {
          if (live) setSeen(countLetters(script, raw));
        });
      return () => {
        live = false;
      };
    }, [store, script]),
  );
  return { seen, total: (script === 'ckb' ? SORANI_LETTERS : LATIN_LETTERS).length };
}

import { useCallback, useRef } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

/**
 * A list that keeps its place when its screen is returned to (the wall, the library, the pictures, saved posts).
 * Returning is the commonest action on these screens, so the list stays as it was and is refreshed silently by
 * re-reading the first page:
 *
 *   - a post already shown takes the read's version of itself, in place (a like from its own page, a new comment
 *     count)
 *   - nothing is removed, unless the read was the whole list (shorter than a page); then it is the list
 *   - a new post goes on top only while the list is at its top, where it pushes nothing in view; further down it
 *     waits until the list is back there (a pull, or a tab tap)
 *
 * A failed silent read shows nothing: what is shown is still true enough, and a pull retries properly. The
 * screen's first load, and loads for another filter or order, start from nothing and remain the screen's own.
 */

/**
 * A showing list refreshed from its re-read first page. `items` is what to show now; `waiting` holds new posts
 * kept back because the list was not at its top (`onTop` false).
 */
export function mergeFresh<T>(
  shown: readonly T[],
  fresh: readonly T[],
  { keyOf, pageSize, onTop }: { keyOf: (item: T) => string; pageSize: number; onTop: boolean },
): { items: T[]; waiting: T[] } {
  // Shorter than a page: the read is all there is, so it is the list.
  if (fresh.length < pageSize) return { items: [...fresh], waiting: [] };
  const read = new Map(fresh.map((i) => [keyOf(i), i]));
  const have = new Set(shown.map(keyOf));
  const kept = shown.map((i) => read.get(keyOf(i)) ?? i);
  const unseen = fresh.filter((i) => !have.has(keyOf(i)));
  return onTop ? { items: [...unseen, ...kept], waiting: [] } : { items: kept, waiting: unseen };
}

/** `arrived` on top of `shown`, leaving out any the list has taken on since. */
export function withOnTop<T>(shown: readonly T[], arrived: readonly T[], keyOf: (item: T) => string): T[] {
  const have = new Set(shown.map(keyOf));
  return [...arrived.filter((i) => !have.has(keyOf(i))), ...shown];
}

export function useQuietRefocus<T>(opts: {
  /** The list has had its first answer; until then the screen's own first load is under way. */
  loaded: boolean;
  /** The first page, read again; null when it could not be read. */
  readFirst: () => Promise<readonly T[] | null>;
  /** Which list this is (its filter, its order): an answer to the one before is let go. */
  list: unknown;
  keyOf: (item: T) => string;
  pageSize: number;
  /** Change the list shown, from what it holds now; not called while it is empty. */
  apply: (update: (shown: T[]) => T[]) => void;
  /** Come back to with nothing loaded: the first load failed, and is asked for again. */
  retry?: () => void;
}): {
  /** The list's own scroll, so new posts held back go on when it is at its top again. */
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** The list was read afresh (a pull, another filter), so nothing is held back for it any more. */
  forget: () => void;
} {
  const latest = useRef(opts);
  latest.current = opts;
  const atTop = useRef(true);
  const waiting = useRef<T[]>([]);

  useFocusEffect(
    useCallback(() => {
      const now = latest.current;
      if (!now.loaded) {
        now.retry?.();
        return;
      }
      let active = true;
      const asked = now.list;
      void now.readFirst().then((fresh) => {
        // Left again, not read, or answered after the reader chose another list: not this list's posts.
        if (!active || fresh === null || latest.current.list !== asked) return;
        const { keyOf, pageSize } = latest.current;
        latest.current.apply((shown) => {
          const merged = mergeFresh(shown, fresh, { keyOf, pageSize, onTop: atTop.current });
          waiting.current = merged.waiting;
          return merged.items;
        });
      });
      return () => {
        active = false;
      };
    }, []),
  );

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    atTop.current = e.nativeEvent.contentOffset.y <= 0;
    if (!atTop.current || waiting.current.length === 0) return;
    const arrived = waiting.current;
    waiting.current = [];
    latest.current.apply((shown) => withOnTop(shown, arrived, latest.current.keyOf));
  }, []);

  const forget = useCallback(() => {
    waiting.current = [];
  }, []);

  return { onScroll, forget };
}

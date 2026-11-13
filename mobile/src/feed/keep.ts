import { useCallback, useRef } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

/**
 * A list that keeps its place when its screen is come back to.
 *
 * The wall, the library, the pictures and the saved posts each asked for
 * their first page again whenever their screen came back into view, and put
 * it in place of whatever was there. Somebody forty posts down opened one,
 * came back, and found twenty posts and the top of the list — on Home, a grey
 * page first. Coming back is the commonest thing done on these screens, and
 * it has to cost nothing.
 *
 * So the list stays as it was, and is brought up to date behind the reader's
 * back: the first page is read again, quietly, and
 *
 *   - a post already shown takes what the read says of it, in its place (a
 *     like given on the post's own page, a new count of comments)
 *   - nothing is taken away, unless the read was the whole list (shorter than
 *     a page): then it is the list, and what it no longer holds is gone
 *   - a post that is new goes on top only while the list is at its top, where
 *     it pushes nothing the reader is looking at. Further down it waits until
 *     the list is back there — a pull, or a tap on the tab — and goes on then
 *
 * A quiet read that fails says nothing: what is shown is still true enough,
 * and a pull asks properly. The screen's own first load, and a load for
 * another way of reading the list (a filter, an order), stay the screen's:
 * those start from nothing, as they should.
 */

/**
 * A list that is showing, brought up to date with its first page read again.
 * `items` is what to show now; `waiting` the new posts held back because the
 * list was not at its top (`onTop` false).
 */
export function mergeFresh<T>(
  shown: readonly T[],
  fresh: readonly T[],
  { keyOf, pageSize, onTop }: { keyOf: (item: T) => string; pageSize: number; onTop: boolean },
): { items: T[]; waiting: T[] } {
  // shorter than a page: the read is all there is, so it is the list
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
  /** the list has had its first answer; until then the screen's own first load is the one under way */
  loaded: boolean;
  /** the first page, read again; null when it could not be read */
  readFirst: () => Promise<readonly T[] | null>;
  /** which list this is (its filter, its order): an answer to the one before is let go */
  list: unknown;
  keyOf: (item: T) => string;
  pageSize: number;
  /** change the list shown, from what it holds now; not called while it holds nothing */
  apply: (update: (shown: T[]) => T[]) => void;
  /** come back to with nothing loaded: the first load failed, and is asked for again */
  retry?: () => void;
}): {
  /** the list's own scroll, so new posts held back go on when it is at its top again */
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** the list was read afresh (a pull, another filter): nothing is held back for it any more */
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
        // left again, not read, or answered after the reader chose another list: not this list's posts
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

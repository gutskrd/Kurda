import { useEffect } from 'react';
import { useRail } from '../social/RailProvider';

/**
 * How many gifts are waiting to be opened — the badge on the Shop link.
 *
 * It was polled from `/me/gifts/unseen` every minute by every signed-in tab,
 * hidden or not, for a number that changes a few times a week. The count now
 * rides on `/me/social` (`unread.gifts`), which the rail already reads — on a
 * slower beat, paused while the tab is hidden — and arrivals and openings
 * ask it to look again at once. One request fewer per tab per minute.
 */

/**
 * Everyone currently showing the count.
 *
 * Opening a gift and showing the badge are different screens, so the one
 * that changes the count has no way to tell the one that draws it. Without
 * this the badge went on insisting you had unopened gifts after you had
 * opened them — which teaches people to ignore it.
 */
const watchers = new Set<() => void>();

/** Say that the gift count may have changed (one arrived, or was opened), so the badge looks again. */
export function giftsWereOpened(): void {
  for (const refresh of watchers) refresh();
}

export function useUnseenGifts(): number {
  const { data, refresh } = useRail();
  useEffect(() => {
    watchers.add(refresh);
    return () => {
      watchers.delete(refresh);
    };
  }, [refresh]);
  return data.unread.gifts ?? 0;
}

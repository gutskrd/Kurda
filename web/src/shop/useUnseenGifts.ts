import { useEffect } from 'react';
import { useRail } from '../social/RailProvider';

/** How many gifts are waiting to be opened, from the rail's `/me/social` answer (`unread.gifts`). */

/** The rail refreshers of every component showing the count, so opening a gift elsewhere can update it. */
const watchers = new Set<() => void>();

/** Reports that the gift count may have changed, so every registered count refreshes. */
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

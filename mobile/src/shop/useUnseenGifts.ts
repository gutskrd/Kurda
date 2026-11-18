import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { onBackFromBackground } from '../net/backFromBackground';

/**
 * How many gifts are waiting to be opened. A gift arrives on your own channel (`gift_received`, passed on by
 * GiftArrivals with `refreshGiftBadge`), and the count is read when the badge is first drawn, when the app returns from
 * the background, and when a gift arrives or is opened; no timer. It asks `/me/gifts/unseen` for one count rather than
 * the social summary.
 */

/**
 * Everyone currently showing the count: the screen that opens the gifts is not the one that draws the badge, so this
 * tells the badge when they were opened.
 */
const watchers = new Set<{ refresh: () => void; lower: (by: number | 'all') => void }>();

/** Say that the gift list has been read, so the badge stops claiming otherwise. */
export function giftsWereOpened(): void {
  for (const watcher of watchers) watcher.refresh();
}

/** Gifts seen here before the server has said so: the badge drops at once, and the next count read has the last word. */
export function giftsSeen(by: number | 'all'): void {
  for (const watcher of watchers) watcher.lower(by);
}

/** A gift arrived or was unwrapped: count again. */
export const refreshGiftBadge = giftsWereOpened;

export function useUnseenGifts(): number {
  const { client, user, isGuest } = useAuth();
  const [count, setCount] = useState(0);
  // A guest gets no gifts, and the count is refused to one: zero without asking.
  const signedIn = Boolean(user) && !isGuest;

  const refresh = useCallback(() => {
    if (!signedIn) return;
    void client.get<{ unseen?: number }>('/me/gifts/unseen').then((res) => {
      if (res.ok) setCount(res.data.unseen ?? 0);
    });
  }, [client, signedIn]);

  useEffect(() => {
    if (!signedIn) {
      setCount(0);
      return;
    }
    refresh();
    const watcher = { refresh, lower: (by: number | 'all') => setCount((n) => (by === 'all' ? 0 : Math.max(0, n - by))) };
    watchers.add(watcher);
    const stopListening = onBackFromBackground(AppState, refresh);
    return () => {
      watchers.delete(watcher);
      stopListening();
    };
  }, [signedIn, refresh]);

  return count;
}

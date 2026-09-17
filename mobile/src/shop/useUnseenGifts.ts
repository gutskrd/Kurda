import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';

/**
 * How many gifts are waiting to be opened.
 *
 * The phone grew a gift inbox before it grew any way to know there was
 * something in it: a gift landed, was owned, and said nothing until you
 * happened to open the Shop. A count on the way in is the smallest thing that
 * actually tells someone.
 *
 * Polled rather than pushed, the same way the browser does it. Gifts are rare
 * and a minute of latency on "you have a present" costs nothing — where a
 * socket for it would cost a connection.
 */
const POLL_MS = 60_000;

/**
 * Everyone currently showing the count.
 *
 * Opening the gifts and drawing the badge are two different screens, so the one
 * that clears it has no way to tell the one that draws it. Without this the
 * badge goes on insisting you have unopened gifts for up to a minute after you
 * have opened them — which teaches people to ignore it.
 */
const watchers = new Set<() => void>();

/** Say that the gift list has been read, so the badge stops claiming otherwise. */
export function giftsWereOpened(): void {
  for (const refresh of watchers) refresh();
}

export function useUnseenGifts(): number {
  const { client, user } = useAuth();
  const [count, setCount] = useState(0);
  const signedIn = Boolean(user);

  const refresh = useCallback(() => {
    if (!signedIn) return;
    // the count alone, not the list: this runs every minute, and the full list
    // joins shop_items and users for up to fifty rows to answer "any?"
    void client.get<{ unseen: number }>('/me/gifts/unseen').then((res) => {
      if (res.ok) setCount(res.data.unseen ?? 0);
    });
  }, [client, signedIn]);

  useEffect(() => {
    if (!signedIn) {
      setCount(0);
      return;
    }
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    watchers.add(refresh);
    return () => {
      clearInterval(timer);
      watchers.delete(refresh);
    };
  }, [signedIn, refresh]);

  return count;
}

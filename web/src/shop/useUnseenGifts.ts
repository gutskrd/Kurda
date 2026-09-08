import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';

/**
 * How many gifts are waiting to be opened.
 *
 * The API records a notification when a gift arrives, but the web app has no
 * inbox screen to show one — so without this the gift would land silently in
 * the recipient's inventory and the notification would go nowhere. A count on
 * the Shop link is the smallest thing that actually tells someone.
 *
 * Polled rather than pushed: gifts are rare, and a minute of latency on "you
 * have a present" costs nothing.
 */
const POLL_MS = 60_000;

/**
 * Everyone currently showing the count.
 *
 * Opening the gifts and showing the badge are two different screens, so the one
 * that clears the badge has no way to tell the one that draws it. Without this
 * the badge went on insisting you had unopened gifts for up to a minute after
 * you had opened them — which teaches people to ignore it.
 */
const watchers = new Set<() => void>();

/** Say that the gift list has been read, so the badge stops claiming otherwise. */
export function giftsWereOpened(): void {
  for (const refresh of watchers) refresh();
}

export function useUnseenGifts(): number {
  const { client, status } = useAuth();
  const [count, setCount] = useState(0);
  const signedIn = status === 'signedIn';

  const refresh = useCallback(() => {
    if (!signedIn) return;
    void (async () => {
      // the count alone: polled by every signed-in tab every minute, so it does
      // not go and build the whole gift list with its joins to answer "any?"
      const res = await client.get<{ unseen: number }>('/me/gifts/unseen');
      if (res.ok) setCount(res.data.unseen ?? 0);
    })();
  }, [client, signedIn]);

  useEffect(() => {
    if (!signedIn) {
      setCount(0);
      return;
    }
    refresh();
    const t = setInterval(refresh, POLL_MS);
    watchers.add(refresh);
    return () => {
      clearInterval(t);
      watchers.delete(refresh);
    };
  }, [signedIn, refresh]);

  return count;
}

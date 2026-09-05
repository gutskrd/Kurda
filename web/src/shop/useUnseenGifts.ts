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

export function useUnseenGifts(): number {
  const { client, status } = useAuth();
  const [count, setCount] = useState(0);
  const signedIn = status === 'signedIn';

  const refresh = useCallback(() => {
    if (!signedIn) return;
    void (async () => {
      const res = await client.get<{ unseen: number }>('/me/gifts');
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
    return () => clearInterval(t);
  }, [signedIn, refresh]);

  return count;
}

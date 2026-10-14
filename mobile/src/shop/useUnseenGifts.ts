import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../auth/AuthContext';

/**
 * How many gifts are waiting to be opened.
 *
 * The phone grew a gift inbox before it grew any way to know there was
 * something in it: a gift landed, was owned, and said nothing until you
 * happened to open the Shop. A count on the way in is the smallest thing that
 * actually tells someone.
 *
 * It used to ask `/me/gifts/unseen` every minute, from every signed-in phone,
 * whether anything had arrived. Now a gift says so itself: it arrives on your
 * own channel (`gift_received`, which GiftArrivals passes on with
 * `refreshGiftBadge`), and the count is read from `/me/social` — the one
 * request the social panel already makes — when the badge is first drawn,
 * when the app comes back to the front, and when a gift arrives or is opened.
 * No timer.
 */

/**
 * Everyone currently showing the count.
 *
 * Opening the gifts and drawing the badge are two different screens, so the one
 * that clears it has no way to tell the one that draws it. Without this the
 * badge goes on insisting you have unopened gifts after you have opened them —
 * which teaches people to ignore it.
 */
const watchers = new Set<() => void>();

/** Say that the gift list has been read, so the badge stops claiming otherwise. */
export function giftsWereOpened(): void {
  for (const refresh of watchers) refresh();
}

/** A gift arrived or was unwrapped: count again. */
export const refreshGiftBadge = giftsWereOpened;

export function useUnseenGifts(): number {
  const { client, user } = useAuth();
  const [count, setCount] = useState(0);
  const signedIn = Boolean(user);

  const refresh = useCallback(() => {
    if (!signedIn) return;
    void client.get<{ unread?: { gifts?: number } }>('/me/social').then((res) => {
      if (res.ok) setCount(res.data.unread?.gifts ?? 0);
    });
  }, [client, signedIn]);

  useEffect(() => {
    if (!signedIn) {
      setCount(0);
      return;
    }
    refresh();
    watchers.add(refresh);
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      watchers.delete(refresh);
      foreground.remove();
    };
  }, [signedIn, refresh]);

  return count;
}

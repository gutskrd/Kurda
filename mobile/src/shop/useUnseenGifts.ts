import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { onBackFromBackground } from '../net/backFromBackground';

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
 * `refreshGiftBadge`), and the count is read when the badge is first drawn,
 * when the app comes back from the background (net/backFromBackground.ts),
 * and when a gift arrives or is opened. No timer.
 *
 * It is read from `/me/gifts/unseen`, which counts the gifts and nothing
 * else. It was read from `/me/social` for a while, the social panel's
 * summary, which reads the whole friend list with who is playing what, the
 * requests, the groups and the notifications to answer it — among the most
 * expensive requests the app makes, made at every start and every return to
 * the app for one number on a badge.
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
  const { client, user, isGuest } = useAuth();
  const [count, setCount] = useState(0);
  // a guest gets no gifts, and the count is refused to one: zero without asking
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
    watchers.add(refresh);
    const stopListening = onBackFromBackground(AppState, refresh);
    return () => {
      watchers.delete(refresh);
      stopListening();
    };
  }, [signedIn, refresh]);

  return count;
}

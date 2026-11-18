import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useRealtimeReconnect } from './RealtimeProvider';

/**
 * Merge the server's latest page into a thread on screen: shared messages take the server's copy (they may have
 * been read or deleted since), new ones are added, and the result stays oldest first. If the two do not overlap,
 * more arrived than one page holds, so the latest page becomes the thread and older messages page in from there,
 * never leaving a hidden gap.
 */
export function mergeLatest<T extends { id: string; createdAt: string }>(held: readonly T[], latest: readonly T[]): T[] {
  if (latest.length === 0) return [...held];
  const heldIds = new Set(held.map((m) => m.id));
  if (held.length > 0 && !latest.some((m) => heldIds.has(m.id))) return [...latest];
  const fresh = new Map(latest.map((m) => [m.id, m]));
  const merged = held.map((m) => fresh.get(m.id) ?? m);
  for (const m of latest) if (!heldIds.has(m.id)) merged.push(m);
  // ISO timestamps sort as text; a stable sort keeps same-instant messages in order.
  return merged.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
}

/**
 * Add a message to a thread once. It can arrive twice (a catch-up refetch then a live push, or a push and the
 * send's response), and a copy would show twice under one key.
 */
export function appendOnce<T extends { id: string }>(held: T[], message: T): T[] {
  return held.some((m) => m.id === message.id) ? held : [...held, message];
}

/**
 * Refetch a live thread whenever it may have missed something: each time the shared connection comes back (the
 * gateway does not replay undelivered events), and each time the screen is shown again after being covered (a
 * game started from this chat posted a card while the lobby was in front). Not on first show, which the screen's
 * own load covers.
 */
export function useCatchUp(refetch: () => void): void {
  const handler = useRef(refetch);
  handler.current = refetch;
  useRealtimeReconnect(() => handler.current());
  const shown = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (shown.current) handler.current();
      shown.current = true;
    }, []),
  );
}

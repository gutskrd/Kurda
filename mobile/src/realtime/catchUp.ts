import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useRealtimeReconnect } from './RealtimeProvider';

/**
 * A thread held on screen, brought up to date with the latest page the server
 * has: a message both have is replaced by the server's copy (it may have been
 * read or deleted since), a new one is added, and the whole stays oldest
 * first. When the two do not meet at all, more arrived than one page holds;
 * the latest page is then the thread, and older messages page in from there
 * as they would on a fresh open, so the thread never shows a hidden gap.
 */
export function mergeLatest<T extends { id: string; createdAt: string }>(held: readonly T[], latest: readonly T[]): T[] {
  if (latest.length === 0) return [...held];
  const heldIds = new Set(held.map((m) => m.id));
  if (held.length > 0 && !latest.some((m) => heldIds.has(m.id))) return [...latest];
  const fresh = new Map(latest.map((m) => [m.id, m]));
  const merged = held.map((m) => fresh.get(m.id) ?? m);
  for (const m of latest) if (!heldIds.has(m.id)) merged.push(m);
  // ISO timestamps sort as text; a stable sort keeps same-instant messages in order
  return merged.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
}

/**
 * A message added to a thread once. The same message can reach the screen
 * twice — read by a catch-up refetch and then pushed live, or both pushed and
 * returned by the send — and a second copy would show twice under one key.
 */
export function appendOnce<T extends { id: string }>(held: T[], message: T): T[] {
  return held.some((m) => m.id === message.id) ? held : [...held, message];
}

/**
 * Refetch a live thread whenever it may have missed something: each time the
 * shared connection comes back (the app was in the background, or the network
 * dropped — the gateway does not replay what it could not deliver), and each
 * time the screen is shown again after another one covered it (a game the
 * host started from this chat posted a card here while the lobby was in
 * front). Not on the first showing: the screen's own first load covers that.
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

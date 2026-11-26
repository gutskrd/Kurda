import { useEffect, useRef } from 'react';

/**
 * How long after it first appears a message still counts as arriving. The thread is a recycling list, so a row drawn
 * again later (scrolled away and back) must just appear.
 */
export const ARRIVE_WINDOW_MS = 700;

interface Arrival {
  id: string;
  senderId: string;
  pending?: string;
}

/**
 * The keys of messages that arrived since the thread opened, newest first as the inverted thread lists them: those
 * newer than everything already seen, written here (still on its way) or sent by someone else. The thread as it opened,
 * older history loaded above, and your own message coming back confirmed are not arrivals.
 */
export function freshKeys(newestFirst: readonly Arrival[], seen: ReadonlySet<string>, me: string | undefined, keyOf: (id: string) => string): string[] {
  const out: string[] = [];
  for (const m of newestFirst) {
    const key = keyOf(m.id);
    if (seen.has(key)) break;
    if (m.pending || m.senderId !== me) out.push(key);
  }
  return out;
}

/**
 * Whether a thread's row is arriving, so it rises in (MessageRow `arriving`), as on the website (web/src/chat/MessageList.tsx).
 * Nothing arrives in the first draw that has messages.
 */
export function useArrivals(newestFirst: readonly Arrival[], me: string | undefined, keyOf: (id: string) => string): (key: string) => boolean {
  const seen = useRef<Set<string> | null>(null);
  const since = useRef(new Map<string, number>());
  if (seen.current === null && newestFirst.length > 0) seen.current = new Set(newestFirst.map((m) => keyOf(m.id)));
  if (seen.current) {
    const now = Date.now();
    for (const key of freshKeys(newestFirst, seen.current, me, keyOf)) if (!since.current.has(key)) since.current.set(key, now);
  }
  useEffect(() => {
    for (const m of newestFirst) seen.current?.add(keyOf(m.id));
  });
  return (key) => {
    const at = since.current.get(key);
    return at !== undefined && Date.now() - at < ARRIVE_WINDOW_MS;
  };
}

import { useCallback, useRef, useState } from 'react';

/**
 * Messages sent and not yet answered by the server. A message appears in the thread as pending the moment it is
 * sent and gives way to the server's copy when that arrives; a refused one is removed, so nothing unaccepted
 * looks sent, and the screen restores the words to the field with the reason.
 *
 * Kept apart from the thread's own messages because those are replaced wholesale when the thread catches up after
 * a dropped connection (`mergeLatest`), which would drop a pending one. Shared by DMs and group threads.
 */
export interface Outgoing {
  /** Its own, on this phone only: never one of the server's ids. */
  id: string;
  body: string;
  /** When it was sent from here, so it sorts and reads as the newest. */
  createdAt: string;
}

export function useOutgoing(): {
  outgoing: Outgoing[];
  /** `body` is on its way: shown at once, and named by what this returns. */
  begin: (body: string) => string;
  /** The server answered for it, either way, so it is no longer pending. */
  settle: (id: string) => void;
  /** The server's copy of these words arrived another way (a room's echo) before the send was answered. */
  echoed: (body: string) => void;
} {
  const [outgoing, setOutgoing] = useState<Outgoing[]>([]);
  const count = useRef(0);
  const begin = useCallback((body: string): string => {
    count.current += 1;
    const id = `sending-${count.current}`;
    setOutgoing((list) => [...list, { id, body, createdAt: new Date().toISOString() }]);
    return id;
  }, []);
  const settle = useCallback((id: string): void => setOutgoing((list) => list.filter((m) => m.id !== id)), []);
  const echoed = useCallback((body: string): void => setOutgoing((list) => withoutFirst(list, body)), []);
  return { outgoing, begin, settle, echoed };
}

/** The list without the oldest message saying `body`: one echo answers one send, however many said the same. */
export function withoutFirst(list: readonly Outgoing[], body: string): Outgoing[] {
  const at = list.findIndex((m) => m.body === body);
  return at < 0 ? [...list] : [...list.slice(0, at), ...list.slice(at + 1)];
}

/** What the field holds after a refused send: the words that did not go, then whatever was typed meanwhile, so neither is lost. */
export function restoredDraft(refused: string, now: string): string {
  return now.trim() ? `${refused}\n${now}` : refused;
}

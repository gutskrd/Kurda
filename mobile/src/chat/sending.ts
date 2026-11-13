import { useCallback, useRef, useState } from 'react';

/**
 * Messages on their way: written and sent, and not yet answered by the server.
 *
 * A message used to leave the field and be nowhere at all until the server
 * had answered — a second on a slow connection, in which the thread looked as
 * though the send had not taken. Now it is in the thread the moment it is
 * sent, drawn as one still on its way, and gives its place to the server's
 * copy when that arrives. One that is refused is taken out again, so nothing
 * the server did not take is ever left looking sent; the screen puts the
 * words back in the field and says why, as it always did.
 *
 * Kept apart from the thread's own messages rather than among them, because
 * those are replaced whole when the thread catches up after a dropped
 * connection (`mergeLatest`), and a message still on its way would go with
 * them. The same in a chat with one friend and in a group's thread.
 */
export interface Outgoing {
  /** its own, on this phone only: never one of the server's ids */
  id: string;
  body: string;
  /** when it was sent from here, so it sorts and reads as the newest */
  createdAt: string;
}

export function useOutgoing(): {
  outgoing: Outgoing[];
  /** `body` is on its way: shown at once, and named by what this returns */
  begin: (body: string) => string;
  /** the server answered for it, either way: it is no longer on its way */
  settle: (id: string) => void;
  /** the server's copy of these words arrived by another road (a room's echo) before the send was answered */
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

/**
 * What the field holds after a send was refused: the words that did not go,
 * and after them whatever was typed while they were on their way — so neither
 * is lost.
 */
export function restoredDraft(refused: string, now: string): string {
  return now.trim() ? `${refused}\n${now}` : refused;
}

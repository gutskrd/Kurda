import { useCallback, useRef, useState } from 'react';

/**
 * Messages sent and not yet answered by the server, as on the website (web chat/useOutbox.ts). A message appears in
 * the thread as on its way the moment it is sent and gives way to the server's copy when that arrives. One the server
 * was not reached for stays, marked "Not sent", for Try again or Cancel; one it refused is removed, so nothing
 * unaccepted looks sent, and the screen restores the words to the field with the reason.
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
  /** The server was not reached: it waits for Try again or Cancel. */
  failed?: boolean;
}

export function useOutgoing(): {
  outgoing: Outgoing[];
  /** `body` is on its way: shown at once, and named by what this returns. */
  begin: (body: string) => string;
  /** The server answered for it, either way, so it is no longer pending; `as` is its id in the server's copy. */
  settle: (id: string, as?: string) => void;
  /** The server's copy of these words, `as`, arrived another way (a room's echo) before the send was answered. */
  echoed: (body: string, as: string) => void;
  /** The key a message's row is drawn under: one sent from here keeps the key it had on its way, so it is not redrawn. */
  keyOf: (id: string) => string;
  /** The server was not reached for `id`: it stays, marked as not sent. */
  hold: (id: string) => void;
  /** Try again: `id` is on its way once more; its words, or null if it is gone. */
  resend: (id: string) => string | null;
  /** Cancel: `id` leaves the thread; its words, for the field, or null if it is gone. */
  discard: (id: string) => string | null;
} {
  const [outgoing, setOutgoing] = useState<Outgoing[]>([]);
  const held = useRef(outgoing);
  held.current = outgoing;
  const count = useRef(0);
  const keys = useRef(new Map<string, string>());
  const begin = useCallback((body: string): string => {
    count.current += 1;
    const id = `sending-${count.current}`;
    setOutgoing((list) => [...list, { id, body, createdAt: new Date().toISOString() }]);
    return id;
  }, []);
  const settle = useCallback((id: string, as?: string): void => {
    if (as) keys.current.set(as, id);
    setOutgoing((list) => list.filter((m) => m.id !== id));
  }, []);
  const echoed = useCallback(
    (body: string, as: string): void =>
      setOutgoing((list) => {
        const first = list.find((m) => m.body === body);
        if (first) keys.current.set(as, first.id);
        return withoutFirst(list, body);
      }),
    [],
  );
  const keyOf = useCallback((id: string): string => keys.current.get(id) ?? id, []);
  const mark = (id: string, failed: boolean) => setOutgoing((list) => list.map((m) => (m.id === id ? { ...m, failed } : m)));
  const hold = useCallback((id: string): void => mark(id, true), []);
  const resend = useCallback((id: string): string | null => {
    const message = held.current.find((m) => m.id === id && m.failed);
    if (!message) return null;
    mark(id, false);
    return message.body;
  }, []);
  const discard = useCallback((id: string): string | null => {
    const message = held.current.find((m) => m.id === id);
    if (!message) return null;
    setOutgoing((list) => list.filter((m) => m.id !== id));
    return message.body;
  }, []);
  return { outgoing, begin, settle, echoed, keyOf, hold, resend, discard };
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

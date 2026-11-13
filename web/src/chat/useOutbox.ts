import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiError, ApiResult } from '../lib/types';

/**
 * A message the reader has sent that the server has not answered for yet, or
 * could not be reached for: drawn in the thread at once, in its place at the
 * end, and never as a sent one. `sending` is on its way; `failed` did not get
 * there and waits for "Try again" or to be taken back.
 */
export interface Unsent {
  /** its own, never the server's: `local:` and a count */
  id: string;
  body: string;
  createdAt: string;
  pending: 'sending' | 'failed';
}

/** Whether the server was not reached at all (as opposed to hearing the message and refusing it). */
const notReached = (error: ApiError): boolean => error.kind === 'network' || error.kind === 'server';

/**
 * What a thread has sent and not yet had answered — the part of a
 * conversation that is the reader's alone until the server has it.
 *
 * Send used to hold the words in the box and the button on "Sending…" until
 * the server replied, and only then show the message; a chat answers the
 * press itself. So a message goes into the thread the moment it is sent, a
 * little dimmed, the box is empty for the next one, and the server is told
 * behind that, one message at a time so two sent quickly arrive in the order
 * they were written. When it answers, `onDelivered` hands the thread the real
 * message and this one goes. When it cannot be reached the bubble stays,
 * marked as not sent, with a way to try again — it is never shown as sent.
 * When the server hears it and refuses it (moderation, a block, a limit),
 * that is not something trying again mends: the bubble goes and `onRefused`
 * is given why, and the words, to say so as the thread always has.
 */
export function useOutbox<T>({
  post,
  onDelivered,
  onRefused,
}: {
  post: (body: string) => Promise<ApiResult<T>>;
  onDelivered: (message: T) => void;
  onRefused: (error: ApiError, body: string) => void;
}): {
  unsent: Unsent[];
  send: (body: string) => void;
  retry: (id: string) => void;
  /** take a failed message back out of the thread; its words, for the box */
  discard: (id: string) => string | null;
} {
  const [unsent, setUnsent] = useState<Unsent[]>([]);
  const held = useRef<Unsent[]>([]);
  held.current = unsent;
  const count = useRef(0);
  // one at a time, in the order written
  const line = useRef<Promise<void>>(Promise.resolve());
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  // the thread's latest, read when an answer arrives: these are new functions on every render of the thread
  const hands = useRef({ post, onDelivered, onRefused });
  hands.current = { post, onDelivered, onRefused };

  const deliver = useCallback((id: string, body: string): void => {
    line.current = line.current.then(async () => {
      const res = await hands.current.post(body);
      if (!live.current) return;
      if (res.ok) {
        setUnsent((list) => list.filter((m) => m.id !== id));
        hands.current.onDelivered(res.data);
      } else if (notReached(res.error)) {
        setUnsent((list) => list.map((m) => (m.id === id ? { ...m, pending: 'failed' } : m)));
      } else {
        setUnsent((list) => list.filter((m) => m.id !== id));
        hands.current.onRefused(res.error, body);
      }
    });
  }, []);

  const send = useCallback(
    (body: string): void => {
      count.current += 1;
      const id = `local:${count.current}`;
      setUnsent((list) => [...list, { id, body, createdAt: new Date().toISOString(), pending: 'sending' }]);
      deliver(id, body);
    },
    [deliver],
  );

  const retry = useCallback(
    (id: string): void => {
      const message = held.current.find((m) => m.id === id);
      if (!message || message.pending !== 'failed') return;
      setUnsent((list) => list.map((m) => (m.id === id ? { ...m, pending: 'sending' } : m)));
      deliver(id, message.body);
    },
    [deliver],
  );

  const discard = useCallback((id: string): string | null => {
    const message = held.current.find((m) => m.id === id);
    if (!message) return null;
    setUnsent((list) => list.filter((m) => m.id !== id));
    return message.body;
  }, []);

  return { unsent, send, retry, discard };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiError, ApiResult } from '../lib/types';

/**
 * A message the server has not confirmed, shown at the end of the thread and never as sent: `sending` is on its way,
 * `failed` waits for a retry or removal.
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
 * A thread's unconfirmed messages. Each shows dimmed at once while the box clears, and is sent one at a time so order
 * is kept. On success `onDelivered` gets the real message; on a network failure it stays marked with a retry; a
 * refusal (moderation, a block, a limit) removes it and passes the reason and words to `onRefused`.
 */
export function useOutbox<T>({
  post,
  onDelivered,
  onRefused,
}: {
  post: (body: string) => Promise<ApiResult<T>>;
  /** The server's message, and the id it was shown under while on its way. */
  onDelivered: (message: T, id: string) => void;
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
        hands.current.onDelivered(res.data, id);
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

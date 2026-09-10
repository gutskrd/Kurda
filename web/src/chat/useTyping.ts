import { useCallback, useEffect, useRef, useState } from 'react';
import type { MessageKey } from '../i18n/en';

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/**
 * The two halves of a typing indicator.
 *
 * Sending is throttled rather than debounced: a ping goes out on the first
 * keystroke so the other side sees it immediately, then at most one more per
 * interval however fast you type. Debouncing would only tell them once you
 * PAUSED, which is the opposite of what the indicator is for.
 *
 * Receiving expires on its own. There is no "stopped typing" event — the sender
 * may close the tab, lose the connection, or simply stop — so an indicator that
 * relied on being switched off would stay on screen forever.
 */

/** At most one ping per this long, regardless of typing speed. */
const SEND_EVERY_MS = 3000;
/** Hide a name this long after their last ping. Comfortably over SEND_EVERY_MS. */
const EXPIRE_MS = 5000;

/** Returns a function to call on each keystroke; it throttles for you. */
export function useTypingSignal(send: () => void): () => void {
  const lastSent = useRef(0);
  const sendRef = useRef(send);
  sendRef.current = send;

  return useCallback(() => {
    const now = Date.now();
    if (now - lastSent.current < SEND_EVERY_MS) return;
    lastSent.current = now;
    sendRef.current();
  }, []);
}

/**
 * Names currently typing, each dropped automatically once its ping goes stale.
 *
 * `note(name)` records a ping. A single timer sweeps the whole map rather than
 * one timeout per person, so a busy group does not accumulate timers.
 */
export function useTypingWatch(): { typing: string[]; note: (name: string) => void } {
  const seen = useRef<Map<string, number>>(new Map());
  const [typing, setTyping] = useState<string[]>([]);

  const note = useCallback((name: string) => {
    seen.current.set(name, Date.now());
    setTyping([...seen.current.keys()]);
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      const cutoff = Date.now() - EXPIRE_MS;
      let changed = false;
      for (const [name, at] of seen.current) {
        if (at < cutoff) {
          seen.current.delete(name);
          changed = true;
        }
      }
      if (changed) setTyping([...seen.current.keys()]);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  return { typing, note };
}

/**
 * "zana is typing…", "zana and rojîn are typing…", "3 people are typing…"
 *
 * Three whole sentences rather than one built from parts: "and" sits between
 * the two names in English and after both of them in some languages, and the
 * verb agrees with the count. A sentence assembled from fragments here could
 * not survive translation, so each shape is its own key.
 */
export function typingLabel(names: readonly string[], t: Translate): string {
  if (names.length === 0) return '';
  if (names.length === 1) return t('chat.typing.one', { name: names[0]! });
  if (names.length === 2) return t('chat.typing.two', { first: names[0]!, second: names[1]! });
  return t('chat.typing.many', { count: names.length });
}

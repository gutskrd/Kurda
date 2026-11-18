import { useCallback, useEffect, useRef, useState } from 'react';
import type { MessageKey } from '../i18n/en';

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/**
 * Both halves of the typing indicator. Sending is throttled, not debounced, so the first keystroke pings at once.
 * Receiving expires by itself, since there is no stopped-typing event.
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

/** Names currently typing, dropped when their ping goes stale; `note(name)` records a ping, and one timer sweeps all. */
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

/** The typing line for one, two or more people, each a whole catalogue sentence so it translates naturally. */
export function typingLabel(names: readonly string[], t: Translate): string {
  if (names.length === 0) return '';
  if (names.length === 1) return t('chat.typing.one', { name: names[0]! });
  if (names.length === 2) return t('chat.typing.two', { first: names[0]!, second: names[1]! });
  return t('chat.typing.many', { count: names.length });
}

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TranslationKey } from '../i18n/translations';

/**
 * Both halves of a typing indicator and its sentence, against the same shapes as `web/src/chat/useTyping.ts` (a
 * copy, since `TranslationKey` differs between the apps).
 *
 * Sending is throttled, not debounced: a ping goes out on the first keystroke, then at most one per interval.
 * Debouncing would only report a pause, the opposite of the point. Receiving expires by itself, since there is no
 * "stopped typing" event (the sender may background the app or lose the connection).
 */

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** At most one ping per this long, regardless of typing speed. */
export const SEND_EVERY_MS = 3000;
/** Hide a name this long after their last ping. Comfortably over SEND_EVERY_MS. */
export const EXPIRE_MS = 5000;

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

/** Names currently typing, each dropped once its ping goes stale. One timer sweeps the map rather than a timeout per person. */
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
 * "zana is typing…", "zana and rojîn are typing…", "3 people are typing…": three whole sentences rather than one
 * built from parts, since word order and verb agreement differ by language (Kurmancî: `dinivîse` for one,
 * `dinivîsin` for more), so each shape is its own key.
 */
export function typingLabel(names: readonly string[], t: Translate): string {
  if (names.length === 0) return '';
  if (names.length === 1) return t('chat.typing.one', { name: names[0]! });
  if (names.length === 2) return t('chat.typing.two', { first: names[0]!, second: names[1]! });
  return t('chat.typing.many', { count: names.length });
}

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TranslationKey } from '../i18n/translations';

/**
 * The two halves of a typing indicator, and the sentence for it.
 *
 * Written against the same shapes as `web/src/chat/useTyping.ts`, and kept as
 * its own copy because `TranslationKey` differs between the apps. The reasoning
 * is the browser's and holds here:
 *
 * Sending is throttled rather than debounced. A ping goes out on the first
 * keystroke so the other side sees it immediately, then at most one more per
 * interval however fast you type. Debouncing would only tell them once you
 * *paused*, which is the opposite of what the indicator is for.
 *
 * Receiving expires on its own. There is no "stopped typing" event — the sender
 * may background the app, lose the connection, or simply stop — so an indicator
 * that relied on being switched off would stay on screen for good.
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

/**
 * Names currently typing, each dropped once its ping goes stale.
 *
 * One timer sweeps the whole map rather than a timeout per person, so a busy
 * group does not accumulate them.
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
 * Three whole sentences rather than one built from parts: "and" sits between the
 * two names in English and after both of them in some languages, and the verb
 * agrees with the count — Kurmancî says `dinivîse` for one and `dinivîsin` for
 * more. A sentence assembled from fragments could not survive translation, so
 * each shape is its own key.
 */
export function typingLabel(names: readonly string[], t: Translate): string {
  if (names.length === 0) return '';
  if (names.length === 1) return t('chat.typing.one', { name: names[0]! });
  if (names.length === 2) return t('chat.typing.two', { first: names[0]!, second: names[1]! });
  return t('chat.typing.many', { count: names.length });
}

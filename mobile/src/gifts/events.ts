import { useEffect, useRef } from 'react';
import type { GiftChatRef, GiftUserEvent } from '@kurda/shared';

/**
 * Gift events, passed on to whichever screen is open.
 *
 * `gift_received` and `gift_opened` arrive on the person's own channel, and
 * one listener takes them off it (GiftArrivals, mounted once). A chat that is
 * open needs them too — to swap in the recipient's own card, or to mark the
 * sender's bubble "Opened ✓" — so the listener hands each one on here rather
 * than every screen holding a channel of its own.
 */
type Listener = (event: GiftUserEvent) => void;
const listeners = new Set<Listener>();

export function emitGiftEvent(event: GiftUserEvent): void {
  for (const listen of [...listeners]) listen(event);
}

/** Hear gift events while mounted. The handler may change on every render. */
export function useGiftEvents(onEvent: Listener): void {
  const ref = useRef(onEvent);
  ref.current = onEvent;
  useEffect(() => {
    const listen: Listener = (e) => ref.current(e);
    listeners.add(listen);
    return () => {
      listeners.delete(listen);
    };
  }, []);
}

/**
 * The chat on screen right now, so a gift that arrives in it is not announced
 * twice: the wrapped present appearing in the thread is the announcement.
 */
let openChat: string | null = null;

export function chatKey(ref: GiftChatRef): string {
  return ref.kind === 'dm' ? `dm:${ref.userId}` : `group:${ref.groupId}`;
}

/** Mark a chat as the one on screen while the caller is mounted. */
export function useOpenChat(ref: GiftChatRef): void {
  const key = chatKey(ref);
  useEffect(() => {
    openChat = key;
    return () => {
      if (openChat === key) openChat = null;
    };
  }, [key]);
}

export function isChatOpen(ref: GiftChatRef): boolean {
  return openChat === chatKey(ref);
}

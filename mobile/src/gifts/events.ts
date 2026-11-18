import { useEffect, useRef } from 'react';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import type { GiftChatRef, GiftUserEvent } from '@kurda/shared';

/**
 * Gift events passed on to whichever screen is open: `gift_received` and `gift_opened` arrive on the person's own
 * channel and one listener takes them off it (GiftArrivals, mounted once). An open chat needs them too (to swap in the
 * recipient's card, or mark the sender's bubble "Opened ✓"), so the listener hands each on here.
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
 * The chat on screen now, so a gift arriving in it is not announced twice: the present appearing in the thread is the
 * announcement.
 */
let openChat: string | null = null;

function chatKey(ref: GiftChatRef): string {
  return ref.kind === 'dm' ? `dm:${ref.userId}` : `group:${ref.groupId}`;
}

/**
 * Mark a chat as on screen while the caller's screen is in front. Focus, not mount: a chat with a profile pushed over
 * it is still mounted but not on screen, and a gift there still gets its banner. Outside a navigator (a test) it counts
 * as in front while mounted.
 */
export function useOpenChat(ref: GiftChatRef): void {
  const key = chatKey(ref);
  const navigation = useNavigation() as Partial<Pick<NavigationProp<ParamListBase>, 'addListener' | 'isFocused'>> | undefined;
  useEffect(() => {
    const show = (): void => {
      openChat = key;
    };
    const hide = (): void => {
      if (openChat === key) openChat = null;
    };
    if (navigation?.isFocused?.() ?? true) show();
    const offFocus = navigation?.addListener?.('focus', show);
    const offBlur = navigation?.addListener?.('blur', hide);
    return () => {
      offFocus?.();
      offBlur?.();
      hide();
    };
  }, [key, navigation]);
}

export function isChatOpen(ref: GiftChatRef): boolean {
  return openChat === chatKey(ref);
}

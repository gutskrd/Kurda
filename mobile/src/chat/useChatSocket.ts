import { useCallback } from 'react';
import type { ChatMessageExtras } from '@kurda/shared';
import { useRealtimeListener } from '../realtime/RealtimeProvider';
import { isChatEvent } from '../realtime/events';

/** DM events pushed on the user channel (KUR-083). */
export interface ChatEvent {
  type: 'dm' | 'dm_read' | 'dm_typing' | 'dm_delivered';
  from?: string;
  by?: string;
  /** a gift or a game card has no text (`body` null) and says what it is in `kind` */
  message?: { id: string; senderId: string; body: string | null; createdAt: string } & Partial<ChatMessageExtras>;
}

/**
 * DM events — new messages, receipts and typing — as they arrive on your own
 * channel. Messages are *sent* over HTTP; this is receive-only.
 *
 * It rides the app's one shared connection (RealtimeProvider). It used to open
 * its own socket, which pushed the app-wide listener off the gateway every
 * time a chat was opened.
 */
export function useChatSocket(onEvent: (event: ChatEvent) => void): void {
  useRealtimeListener(
    useCallback(
      (event, room) => {
        if (isChatEvent(event, room)) onEvent(event as unknown as ChatEvent);
      },
      [onEvent],
    ),
  );
}

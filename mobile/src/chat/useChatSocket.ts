import { useCallback } from 'react';
import type { ChatMessageExtras } from '@kurda/shared';
import { useRealtimeListener } from '../realtime/RealtimeProvider';
import { isChatEvent } from '../realtime/events';

/** DM events pushed on the user channel. */
export interface ChatEvent {
  type: 'dm' | 'dm_read' | 'dm_typing' | 'dm_delivered';
  from?: string;
  by?: string;
  /** A gift or a game card has no text (`body` null) and says what it is in `kind`. */
  message?: { id: string; senderId: string; body: string | null; createdAt: string } & Partial<ChatMessageExtras>;
}

/**
 * DM events (new messages, receipts, typing) as they arrive on your own channel, over the shared connection
 * (RealtimeProvider). Receive-only; messages are sent over HTTP.
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

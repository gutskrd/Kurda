import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { ApiError, DmMessage } from '../lib/types';
import { useProfileModal } from '../profile/ProfileModal';
import { useMessages } from './MessagesProvider';
import { MessageList } from './MessageList';
import { Composer } from './Composer';
import { useStickyScroll } from './useStickyScroll';
import { useTypingSignal, useTypingWatch, typingLabel } from './useTyping';
import { ReadReceipt } from './ReadReceipt';
import { useRealtime, useRealtimeEvent } from '../realtime/RealtimeProvider';
import type { RealtimeEventEnvelope } from '../realtime/events';
import { Loading } from '../components/states';
import { ArrowIcon, CloseIcon } from '../components/icons';

// When the realtime socket is live it carries every message instantly, so polling
// is just a slow safety net. When it is NOT connected, we fall back to a brisk
// poll so chat still feels live for everyone.
const THREAD_POLL_LIVE = 20000;
const THREAD_POLL_FALLBACK = 4000;

/**
 * Oldest→newest by server timestamp, so the thread always reads top to bottom.
 *
 * Takes anything, because `ok` is about the status code and not the shape: a 200
 * whose body has no `messages` array used to spread `undefined` and throw here,
 * taking the whole conversation down rather than showing an empty one.
 */
function byTime<T extends { createdAt: string }>(msgs: readonly T[] | undefined | null): T[] {
  if (!Array.isArray(msgs)) return [];
  return [...msgs].sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
}

/** Map moderation/anti-bot server codes to human copy (server stays authoritative). */
export function sendError(err: ApiError): string {
  switch (err.code) {
    case 'TRUST_VELOCITY':
      return 'You’re sending messages too fast — please slow down.';
    case 'AUTO_MODERATED':
      return 'Your account has been restricted for spam-like activity.';
    case 'CHAT_MUTED':
      return 'You’re muted from chat.';
    case 'CONTENT_BLOCKED':
      return 'That message was blocked by moderation.';
    case 'NOT_FRIENDS':
      return 'You can only message people you’re friends with.';
    default:
      return describeError(err);
  }
}

/**
 * One direct conversation, wherever it is being shown.
 *
 * Lifted out of the Messages page so the social rail can dock the same
 * conversation beside itself. Two implementations would have meant two sets of
 * read receipts, typing signals and realtime subscriptions — and a message read
 * in one place still counting as unread in the other.
 *
 * `onClose` is what makes it a dock rather than a page: given one, the header
 * offers a close button instead of a link back to the conversation list.
 */
export function DmThread({
  otherId,
  otherName,
  onSent,
  onClose,
  className = '',
}: {
  otherId: string;
  otherName?: string;
  onSent: () => void;
  /** present when docked: closes the panel rather than navigating away */
  onClose?: () => void;
  className?: string;
}): React.JSX.Element {
  const { client, user } = useAuth();
  const { state } = useRealtime();
  const { openProfile } = useProfileModal();
  const { refreshUnread } = useMessages();
  const [messages, setMessages] = useState<DmMessage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  const { ref: scrollRef, atBottom, scrollToBottom } = useStickyScroll(messages);
  const { typing, note } = useTypingWatch();
  const signalTyping = useTypingSignal(
    useCallback(() => void client.post(`/chat/${otherId}/typing`).catch(() => undefined), [client, otherId]),
  );

  const load = useCallback(async () => {
    const res = await client.get<{ messages?: DmMessage[] }>(`/chat/${otherId}/messages`);
    if (res.ok) {
      // server order can vary; sort explicitly so it always reads oldest→newest
      setMessages(byTime(res.data?.messages));
    } else {
      setMessages((m) => m ?? []);
      setLoadError(describeError(res.error));
    }
  }, [client, otherId]);

  /**
   * Clear this conversation's unread badge and send the read receipt.
   *
   * Called on open AND on each arrival while open, otherwise the badge would pop
   * back up for a message already on screen.
   */
  const markRead = useCallback(async () => {
    await client.post(`/chat/${otherId}/read`).catch(() => undefined);
    refreshUnread();
    onSent();
  }, [client, otherId, refreshUnread, onSent]);

  useEffect(() => {
    setMessages(null);
    setLoadError(null);
    void load();
    void markRead();
    const t = setInterval(() => void load(), state === 'open' ? THREAD_POLL_LIVE : THREAD_POLL_FALLBACK);
    return () => clearInterval(t);
  }, [load, markRead, state]);

  // live receive: append a DM the moment it arrives from the person we're viewing
  const onDm = useCallback(
    (env: RealtimeEventEnvelope) => {
      const ev = env.event as { from?: unknown; message?: DmMessage };
      if (ev.from !== otherId || !ev.message?.id) return;
      setMessages((m) => {
        const list = m ?? [];
        if (list.some((x) => x.id === ev.message!.id)) return list; // dedupe vs. poll
        return [...list, ev.message!];
      });
      // it is on screen, so it is read — clear the badge instead of raising one
      void markRead();
    },
    [otherId, markRead],
  );
  useRealtimeEvent('dm', onDm);

  // they opened the thread, or their client acknowledged delivery: stamp our own
  // messages so the receipt updates without waiting for the next poll
  const stamp = useCallback(
    (field: 'deliveredAt' | 'readAt', from: string | undefined) => {
      if (from !== otherId) return;
      const now = new Date().toISOString();
      setMessages((m) =>
        (m ?? []).map((x) => (x.senderId === user?.id && !x[field] ? { ...x, [field]: now } : x)),
      );
    },
    [otherId, user?.id],
  );
  const onDelivered = useCallback(
    (env: RealtimeEventEnvelope) => stamp('deliveredAt', (env.event as { by?: string }).by),
    [stamp],
  );
  const onRead = useCallback(
    (env: RealtimeEventEnvelope) => stamp('readAt', (env.event as { by?: string }).by),
    [stamp],
  );
  useRealtimeEvent('dm_delivered', onDelivered);
  useRealtimeEvent('dm_read', onRead);

  const onTyping = useCallback(
    (env: RealtimeEventEnvelope) => {
      if ((env.event as { from?: string }).from !== otherId) return;
      note(otherName ?? 'They');
    },
    [otherId, otherName, note],
  );
  useRealtimeEvent('dm_typing', onTyping);

  async function send(): Promise<void> {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    setSendMsg(null);
    const res = await client.post<DmMessage>(`/chat/${otherId}/messages`, { body });
    setSending(false);
    if (res.ok) {
      setText('');
      setMessages((m) => [...(m ?? []), res.data]);
      scrollToBottom('smooth'); // your own message always brings you back down
      onSent();
    } else {
      setSendMsg(sendError(res.error));
    }
  }

  return (
    <div className={`chat-thread${className ? ` ${className}` : ''}`}>
      <header className="chat-thread-head">
        {onClose ? (
          <button type="button" className="chat-back" onClick={onClose} aria-label="Close this conversation">
            <CloseIcon size={16} />
          </button>
        ) : (
          <Link to="/app/messages" className="chat-back" aria-label="Back to conversations">
            <ArrowIcon size={18} />
          </Link>
        )}
        <button
          type="button"
          className="chat-thread-title"
          onClick={() => openProfile({ kind: 'user', userId: otherId, username: otherName })}
        >
          {otherName ?? 'Conversation'}
        </button>
      </header>

      <div className="chat-messages" ref={scrollRef}>
        {messages === null ? (
          <Loading />
        ) : messages.length === 0 ? (
          <p className="muted chat-hint">{loadError ?? 'No messages yet. Say hello!'}</p>
        ) : (
          <MessageList
            messages={messages}
            myId={user?.id}
            renderStatus={(m) => <ReadReceipt message={m} />}
            onOpenProfile={(userId, username) => openProfile({ kind: 'user', userId, username })}
          />
        )}
      </div>

      {typing.length > 0 && (
        <div className="chat-typing" aria-live="polite">
          <span className="chat-typing-dots" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          {typingLabel(typing)}
        </div>
      )}

      {!atBottom && messages !== null && messages.length > 0 && (
        <button type="button" className="chat-jump" onClick={() => scrollToBottom('smooth')}>
          Jump to latest ↓
        </button>
      )}

      {sendMsg && <div className="msg msg-error chat-senderr">{sendMsg}</div>}
      <Composer
        value={text}
        onChange={(next) => {
          setText(next);
          if (next) signalTyping();
        }}
        onSubmit={() => void send()}
        sending={sending}
        placeholder="Write a message…"
      />
    </div>
  );
}

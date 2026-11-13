import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { ApiError, DmMessage } from '../lib/types';
import { useProfileModal } from '../profile/ProfileModal';
import { useMessages } from './MessagesProvider';
import { MessageList } from './MessageList';
import { Composer } from './Composer';
import { useStickyScroll } from './useStickyScroll';
import { useOutbox, type Unsent } from './useOutbox';
import { useTypingSignal, useTypingWatch, typingLabel } from './useTyping';
import { ReadReceipt } from './ReadReceipt';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;
import { useRealtime, useRealtimeEvent } from '../realtime/RealtimeProvider';
import type { RealtimeEventEnvelope } from '../realtime/events';
import { ThreadSkeleton } from '../components/skeletons';
import { ArrowIcon, ChevronIcon } from '../components/icons';
import { CloseButton } from '../components/CloseButton';
import { ChatGameButton } from '../play/PlayButtons';
import { gameCardBody } from '../play/ChatGameCard';
import { SendError } from '../reports/SendError';
import { ReportSheet } from '../reports/ReportSheet';
import { useChatGifts } from '../gifts/useChatGifts';
import { pollWhileVisible } from '../lib/pollWhileVisible';
import { THREAD_POLL_FALLBACK, THREAD_POLL_LIVE } from './threadShared';

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

/** A message as the thread draws it: the server's, or one of the reader's own that is not sent yet. */
type Shown = DmMessage & { pending?: Unsent['pending'] };

/**
 * Map moderation/anti-bot server codes to human copy (server stays authoritative).
 * A limit on the account (a mute, the automatic chat pause) is not here: it is
 * said the same way on every send path, by reports/SendError.
 */
export function sendError(err: ApiError, t: Translate): string {
  switch (err.code) {
    case 'TRUST_VELOCITY':
      return t('chat.error.tooFast');
    case 'AUTO_MODERATED':
      return t('chat.error.restricted');
    case 'CONTENT_BLOCKED':
      return t('chat.error.blocked');
    case 'NOT_FRIENDS':
      return t('chat.error.notFriends');
    default:
      return describeError(err, t);
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
  const t = useT();
  const { state } = useRealtime();
  const { openProfile } = useProfileModal();
  const { refreshUnread } = useMessages();
  const [messages, setMessages] = useState<DmMessage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sendErr, setSendErr] = useState<ApiError | null>(null);
  /** the message being reported, while the report sheet is open */
  const [reporting, setReporting] = useState<DmMessage | null>(null);
  /** blocked from the report's done screen: the thread closes with the sheet */
  const [blockedHere, setBlockedHere] = useState(false);
  const navigate = useNavigate();

  /*
   * A message is in the thread the moment it is sent, and the box is empty
   * for the next one (chat/useOutbox.ts): the server is told behind that. One
   * it refuses — moderation, a block, a limit — leaves the thread, the reason
   * is said where it always was, and its words go back in the box if nothing
   * has been typed there since; one it could not be reached for stays, marked
   * as not sent, with a way to try again.
   */
  const outbox = useOutbox<DmMessage>({
    post: (body) => client.post<DmMessage>(`/chat/${otherId}/messages`, { body }),
    onDelivered: (message) => {
      setMessages((m) => {
        const list = m ?? [];
        return list.some((x) => x.id === message.id) ? list : [...list, message];
      });
      onSent();
    },
    onRefused: (error, body) => {
      setSendErr(error);
      setText((now) => now || body);
    },
  });
  // the thread as it is read: what the server has, then what is still the reader's alone
  const shown = useMemo<Shown[]>(
    () => [
      ...(messages ?? []),
      ...outbox.unsent.map((u) => ({
        id: u.id,
        senderId: user?.id ?? '',
        username: user?.username ?? '',
        avatarUrl: null,
        body: u.body,
        createdAt: u.createdAt,
        deliveredAt: null,
        readAt: null,
        pending: u.pending,
      })),
    ],
    [messages, outbox.unsent, user?.id, user?.username],
  );
  const { ref: scrollRef, atBottom, scrollToBottom } = useStickyScroll(shown);
  const { typing, note } = useTypingWatch();
  const signalTyping = useTypingSignal(
    useCallback(() => void client.post(`/chat/${otherId}/typing`).catch(() => undefined), [client, otherId]),
  );

  // gifts: the composer's button, the bubbles, and the moments around them
  const gifts = useChatGifts<DmMessage>({
    chat: useMemo(() => ({ kind: 'dm' as const, userId: otherId }), [otherId]),
    loadPeople: useCallback(
      async () => [{ userId: otherId, name: otherName ?? t('chat.thisPerson'), avatarUrl: null }],
      [otherId, otherName, t],
    ),
    setMessages,
    sendText: useCallback(
      async (body: string) => {
        const res = await client.post<DmMessage>(`/chat/${otherId}/messages`, { body });
        // the reveal that asked says why it did not go, where the reader is looking
        if (!res.ok) return res.error;
        setMessages((m) => [...(m ?? []), res.data]);
        onSent();
        return null;
      },
      [client, otherId, onSent],
    ),
    threadRef: scrollRef,
    onSentScroll: () => scrollToBottom('smooth'),
  });

  const load = useCallback(async () => {
    const res = await client.get<{ messages?: DmMessage[] }>(`/chat/${otherId}/messages`);
    if (res.ok) {
      // server order can vary; sort explicitly so it always reads oldest→newest
      setMessages(byTime(res.data?.messages));
    } else {
      setMessages((m) => m ?? []);
      setLoadError(describeError(res.error, t));
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
    return pollWhileVisible(() => void load(), state === 'open' ? THREAD_POLL_LIVE : THREAD_POLL_FALLBACK);
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
      note(otherName ?? t('chat.they'));
    },
    [otherId, otherName, note, t],
  );
  useRealtimeEvent('dm_typing', onTyping);

  function send(): void {
    const body = text.trim();
    if (!body) return;
    setSendErr(null);
    setText('');
    outbox.send(body);
    scrollToBottom('smooth'); // your own message always brings you back down
  }

  return (
    <div className={`chat-thread${className ? ` ${className}` : ''}`}>
      <header className="chat-thread-head">
        {/* a page goes back; a dock closes, and the two do not belong in the
            same corner — a × on the left reads as "back" and gets missed */}
        {!onClose && (
          <Link to="/app/messages" className="chat-back" aria-label={t('chat.backToConversations')}>
            <ArrowIcon size={18} />
          </Link>
        )}
        <button
          type="button"
          className="chat-thread-title"
          onClick={() => openProfile({ kind: 'user', userId: otherId, username: otherName })}
        >
          {otherName ?? t('chat.conversation')}
        </button>
        {onClose && <CloseButton className="chat-dock-close is-inline" label={t('chat.closeWith', { name: otherName ?? t('chat.thisPerson') })} onClick={onClose} />}
      </header>

      <div className="chat-messages" ref={scrollRef}>
        {messages === null && shown.length === 0 ? (
          <ThreadSkeleton />
        ) : shown.length === 0 ? (
          <p className="muted chat-hint">{loadError ?? t('chat.sayHello')}</p>
        ) : (
          <MessageList
            messages={shown}
            myId={user?.id}
            renderStatus={(m) => <ReadReceipt message={m} />}
            onOpenProfile={(userId, username) => openProfile({ kind: 'user', userId, username })}
            onReport={setReporting}
            renderBody={(m) => gifts.renderBody(m) ?? gameCardBody(m)}
            onRetry={(m) => outbox.retry(m.id)}
            // taken back: its words return to the box, unless something else has been typed there since
            onDiscard={(m) => {
              const words = outbox.discard(m.id);
              if (words) setText((now) => now || words);
            }}
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
          {typingLabel(typing, t)}
        </div>
      )}

      {!atBottom && messages !== null && messages.length > 0 && (
        <button type="button" className="chat-jump" onClick={() => scrollToBottom('smooth')}>
          {t('chat.jumpToLatest')}
          <ChevronIcon size={14} className="chat-jump-icon" />
        </button>
      )}

      {gifts.notice}
      <SendError error={sendErr} describe={(e) => sendError(e, t)} className="chat-senderr" />
      <ReportSheet
        open={reporting !== null}
        onClose={() => {
          setReporting(null);
          // a conversation with someone you have just blocked has nothing left
          // to send to; it goes once the done screen has been read and closed
          if (blockedHere) {
            onSent(); // the conversation list drops them
            if (onClose) onClose();
            else navigate('/app/messages');
          }
        }}
        target={{ targetType: 'dm_message', targetId: reporting?.id ?? '' }}
        block={{ userId: otherId, name: otherName ?? t('chat.thisPerson') }}
        onBlocked={() => setBlockedHere(true)}
      />
      <Composer
        value={text}
        onChange={(next) => {
          setText(next);
          if (next) signalTyping();
        }}
        onSubmit={send}
        placeholder={t('chat.writeAMessage')}
        tools={
          <>
            {gifts.button}
            <ChatGameButton target={{ kind: 'new', friend: { userId: otherId, name: otherName ?? t('chat.thisPerson') } }} />
          </>
        }
      />
      {gifts.overlays}
    </div>
  );
}

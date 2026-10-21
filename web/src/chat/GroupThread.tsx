import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { ApiError, GroupDetail, GroupMessage } from '../lib/types';
import { useProfileModal } from '../profile/ProfileModal';
import { useMessages } from './MessagesProvider';
import { MessageList } from './MessageList';
import { Composer } from './Composer';
import { ChatGameButton } from '../play/PlayButtons';
import { gameCardBody } from '../play/ChatGameCard';
import { useStickyScroll } from './useStickyScroll';
import { useTypingSignal, useTypingWatch, typingLabel } from './useTyping';
import { useRealtime, useRealtimeEvent, useRealtimeRoom } from '../realtime/RealtimeProvider';
import type { RealtimeEventEnvelope } from '../realtime/events';
import { sendError } from './DmThread';
import { byTime, THREAD_POLL_FALLBACK, THREAD_POLL_LIVE } from './threadShared';
import { ThreadSkeleton } from '../components/skeletons';
import { Modal } from '../components/Modal';
import { ArrowIcon, CloseIcon } from '../components/icons';
import { SendError } from '../reports/SendError';
import { ReportSheet } from '../reports/ReportSheet';
import { useChatGifts } from '../gifts/useChatGifts';
import { useT } from '../i18n/I18nProvider';
import { GroupAvatar } from '../groups/GroupAvatar';
import { GroupInfo } from '../groups/GroupInfo';

/**
 * A group conversation, as a page or as a dock beside the social rail.
 *
 * Lifted out of the Messages page so the rail can open one in place, the same
 * way it opens a direct message. `onClose` is what makes it a dock: given one,
 * the header closes rather than linking back to the list, because a dock has
 * nowhere to go back to.
 */
export function GroupThread({
  groupId,
  className,
  onClose,
}: {
  groupId: string;
  /** extra class for the docked variant */
  className?: string;
  /** given: this is a dock, and the header closes instead of going back */
  onClose?: () => void;
}): React.JSX.Element {
  const navigateAway = useNavigate();
  const { client, user } = useAuth();
  const t = useT();
  const { state } = useRealtime();
  const [name, setName] = useState<string>(t('groups.title'));
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [messages, setMessages] = useState<GroupMessage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState<ApiError | null>(null);
  /** the message being reported, while the report sheet is open */
  const [reporting, setReporting] = useState<GroupMessage | null>(null);
  const { refreshUnread } = useMessages();
  const { openProfile } = useProfileModal();
  const { ref: scrollRef, atBottom, scrollToBottom } = useStickyScroll(messages);
  const { typing, note } = useTypingWatch();
  const signalTyping = useTypingSignal(
    useCallback(() => void client.post(`/groups/${groupId}/chat/typing`).catch(() => undefined), [client, groupId]),
  );

  // join the live room for as long as this channel is open (ref-counted, cross-tab)
  useRealtimeRoom(`group:${groupId}`);

  // gifts: only ever between friends, so the picker offers your friends among
  // the members (the roster you can see, met with your friends list)
  const gifts = useChatGifts<GroupMessage>({
    chat: useMemo(() => ({ kind: 'group' as const, groupId }), [groupId]),
    loadPeople: useCallback(async () => {
      const [res, roster] = await Promise.all([
        client.get<{ friends: Array<{ userId: string; username: string; avatarUrl: string | null }> }>('/friends?limit=500'),
        // the roster as it is now: someone may have joined or left since the
        // thread opened, and the button can be pressed before it has loaded
        client.get<GroupDetail>(`/groups/${groupId}`).then((r) => (r.ok ? r.data.members : [])),
      ]);
      const friends = new Set((res.ok ? (res.data.friends ?? []) : []).map((f) => f.userId));
      return (roster ?? [])
        .filter((m) => m.userId !== user?.id && friends.has(m.userId))
        .map((m) => ({ userId: m.userId, name: m.username, avatarUrl: m.avatarUrl }));
    }, [client, groupId, user?.id]),
    setMessages,
    sendText: useCallback(
      async (body: string) => {
        const res = await client.post<GroupMessage>(`/groups/${groupId}/chat`, { body });
        // the reveal that asked says why it did not go, where the reader is looking
        if (!res.ok) return res.error;
        setMessages((m) => {
          const list = m ?? [];
          return list.some((x) => x.id === res.data.id) ? list : [...list, res.data];
        });
        return null;
      },
      [client, groupId],
    ),
    threadRef: scrollRef,
    onSentScroll: () => scrollToBottom('smooth'),
  });

  /** Clear this group's unread badge; on open and on each arrival while open. */
  const markRead = useCallback(async () => {
    await client.post(`/groups/${groupId}/chat/read`).catch(() => undefined);
    refreshUnread();
  }, [client, groupId, refreshUnread]);

  // fetching history also refreshes the server-side grant that authorizes the WS join
  const load = useCallback(async () => {
    const res = await client.get<{ messages: GroupMessage[] }>(`/groups/${groupId}/chat`);
    if (res.ok) setMessages(byTime(res.data.messages));
    else {
      setMessages((m) => m ?? []);
      setLoadError(describeError(res.error, t));
    }
  }, [client, groupId]);

  /** Group detail carries the roster + my role, which drives the members panel. */
  const loadDetail = useCallback(async () => {
    const r = await client.get<GroupDetail>(`/groups/${groupId}`);
    if (r.ok) {
      setDetail(r.data);
      // an answer without a name keeps the one already shown
      if (r.data.name) setName(r.data.name);
    }
  }, [client, groupId]);
  useEffect(() => {
    setMessages(null);
    setLoadError(null);
    void load();
    void loadDetail();
    void markRead();
    const timer = setInterval(() => void load(), state === 'open' ? THREAD_POLL_LIVE : THREAD_POLL_FALLBACK);
    return () => clearInterval(timer);
  }, [load, loadDetail, markRead, state]);

  const onGroupMsg = useCallback(
    (env: RealtimeEventEnvelope) => {
      const ev = env.event as { groupId?: unknown; message?: GroupMessage };
      if (ev.groupId !== groupId || !ev.message?.id) return;
      // a gift's card in the room is nobody's; yours may already have come
      const message = gifts.adopt(ev.message);
      setMessages((m) => {
        const list = m ?? [];
        if (list.some((x) => x.id === message.id)) return list;
        return [...list, message];
      });
      void markRead(); // it is on screen, so it counts as read
    },
    [gifts.adopt, groupId, markRead],
  );
  useRealtimeEvent('group_msg', onGroupMsg);

  const onDeleted = useCallback(
    (env: RealtimeEventEnvelope) => {
      const ev = env.event as { groupId?: unknown; id?: unknown };
      if (ev.groupId !== groupId || typeof ev.id !== 'string') return;
      setMessages((m) => (m ?? []).map((x) => (x.id === ev.id ? { ...x, deleted: true, body: '' } : x)));
    },
    [groupId],
  );
  useRealtimeEvent('group_msg_deleted', onDeleted);

  // the room includes us, so our own pings come back — ignore those
  const onTyping = useCallback(
    (env: RealtimeEventEnvelope) => {
      const ev = env.event as { groupId?: string; userId?: string; username?: string };
      if (ev.groupId !== groupId || !ev.username || ev.userId === user?.id) return;
      note(ev.username);
    },
    [groupId, user?.id, note],
  );
  useRealtimeEvent('group_typing', onTyping);

  async function send(): Promise<void> {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    setSendErr(null);
    const res = await client.post<GroupMessage>(`/groups/${groupId}/chat`, { body });
    setSending(false);
    if (res.ok) {
      setText('');
      setMessages((m) => {
        const list = m ?? [];
        if (list.some((x) => x.id === res.data.id)) return list;
        return [...list, res.data];
      });
      scrollToBottom('smooth');
    } else {
      setSendErr(res.error);
    }
  }

  // the group's real size; an older answer has only the roster to count
  const memberCount = detail?.memberCount ?? detail?.members?.length;

  return (
    <div className={`chat-thread${className ? ` ${className}` : ''}`}>
      <header className="chat-thread-head">
        {/* a page goes back to the list; a dock has no list to go back to */}
        {!onClose && (
          <Link to="/app/messages?group=" className="chat-back" aria-label={t('chat.backToGroups')}>
            <ArrowIcon size={18} />
          </Link>
        )}
        {/* the group's picture and name open its page: who is in it, and for the owner and admins, changing it */}
        <button type="button" className="ghead" aria-haspopup="dialog" title={t('groups.info')} onClick={() => setShowInfo(true)}>
          <GroupAvatar id={groupId} name={name} photoUrl={detail?.photoUrl} size={36} />
          <span className="ghead-text">
            <span className="ghead-name" dir="auto" aria-current="page">
              {name}
            </span>
            <span className="ghead-sub">
              {typeof memberCount === 'number' ? t('groups.memberCount', { count: memberCount }) : t('groups.members')}
            </span>
          </span>
        </button>
        {onClose && (
          <button type="button" className="chat-dock-close" onClick={onClose} aria-label={t('chat.closeWith', { name })}>
            <CloseIcon size={16} />
          </button>
        )}
      </header>

      <Modal open={showInfo} onClose={() => setShowInfo(false)} label={t('groups.info')}>
        {detail?.members && (
          <GroupInfo
            detail={detail}
            onChanged={loadDetail}
            // reloading the detail of a group you just left would only 403, so
            // leave it: a dock closes, a page goes back to the list
            onLeft={() => {
              setShowInfo(false);
              if (onClose) onClose();
              else navigateAway('/app/messages?group=');
            }}
          />
        )}
      </Modal>

      <div className="chat-messages" ref={scrollRef}>
        {messages === null ? (
          <ThreadSkeleton />
        ) : messages.length === 0 ? (
          <p className="muted chat-hint">{loadError ?? t('chat.sayHelloGroup')}</p>
        ) : (
          <MessageList
            messages={messages}
            myId={user?.id}
            onOpenProfile={(userId, username) => openProfile({ kind: 'user', userId, username })}
            onReport={setReporting}
            renderBody={(m) => gifts.renderBody(m) ?? gameCardBody(m)}
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
        </button>
      )}

      {gifts.notice}
      <SendError error={sendErr} describe={(e) => sendError(e, t)} className="chat-senderr" />
      <ReportSheet
        open={reporting !== null}
        onClose={() => setReporting(null)}
        target={{ targetType: 'group_message', targetId: reporting?.id ?? '' }}
        block={reporting ? { userId: reporting.senderId, name: reporting.username } : null}
        // an owner cannot leave (the server refuses), so is not offered it
        leaveGroup={detail && detail.myRole !== 'owner' ? { groupId, name } : null}
        onLeftGroup={() => (onClose ? onClose() : navigateAway('/app/messages?group='))}
      />
      <Composer
        value={text}
        onChange={(next) => {
          setText(next);
          if (next) signalTyping();
        }}
        onSubmit={() => void send()}
        sending={sending}
        placeholder={t('chat.messageTheGroup')}
        tools={
          <>
            {gifts.button}
            <ChatGameButton target={{ kind: 'group', groupId, groupName: name }} />
          </>
        }
      />
      {gifts.overlays}
    </div>
  );
}

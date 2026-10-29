import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { canModerateGroup, type GroupChatCleared } from '@kurda/shared';
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
import { pollWhileVisible } from '../lib/pollWhileVisible';
import { ThreadSkeleton } from '../components/skeletons';
import { Modal } from '../components/Modal';
import { ArrowIcon, CloseIcon, TrashIcon } from '../components/icons';
import { SendError } from '../reports/SendError';
import { ReportSheet } from '../reports/ReportSheet';
import { restrictionOf } from '../reports/restriction';
import { useChatGifts } from '../gifts/useChatGifts';
import { useLocale, useT } from '../i18n/I18nProvider';
import { GroupAvatar } from '../groups/GroupAvatar';
import { GroupInfo } from '../groups/GroupInfo';
import { GroupAsk } from '../groups/GroupAsk';
import { GroupOutside } from '../groups/GroupOutside';
import { ClearedLine, GroupWelcome, clearedWords } from '../groups/GroupWelcome';
import { AddFriendsSheet } from '../groups/AddFriendsSheet';
import { OptionsMenu } from '../groups/OptionsMenu';
import { announceGroupsChanged } from '../groups/groupsChanged';
import { isOutOfGroup, shownClear, sinceCleared, standingOf } from '../groups/standing';

/**
 * A group conversation, as a page or as a dock beside the social rail.
 *
 * Lifted out of the Messages page so the rail can open one in place, the same
 * way it opens a direct message. `onClose` is what makes it a dock: given one,
 * the header closes rather than linking back to the list, because a dock has
 * nowhere to go back to.
 *
 * An empty chat is never blank: it welcomes (groups/GroupWelcome). The
 * header's ⋯ clears the chat for you, and for the owner and admins for
 * everyone, each after a yes that says exactly what happens; a clear for
 * everyone, or a banned member's messages taken away, reaches every open
 * thread at once. Someone not in the group sees it from outside — Join, or
 * where a ban stands — and a reader taken out while the chat is open sees
 * that calmly in place of the chat at their next read or send.
 */
export function GroupThread({
  groupId,
  className,
  onClose,
  openInfo = false,
}: {
  groupId: string;
  /** extra class for the docked variant */
  className?: string;
  /** given: this is a dock, and the header closes instead of going back */
  onClose?: () => void;
  /** open on the group's own page (a notification about requests to come back links there) */
  openInfo?: boolean;
}): React.JSX.Element {
  const navigateAway = useNavigate();
  const { client, user } = useAuth();
  const t = useT();
  const locale = useLocale();
  const { state } = useRealtime();
  const [name, setName] = useState<string>(t('groups.title'));
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  /** the group has been asked for once, so an empty chat can say whose it is */
  const [detailTried, setDetailTried] = useState(false);
  const [showInfo, setShowInfo] = useState(openInfo);
  const [messages, setMessages] = useState<GroupMessage[] | null>(null);
  const [cleared, setCleared] = useState<GroupChatCleared | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState<ApiError | null>(null);
  /** the message being reported, while the report sheet is open */
  const [reporting, setReporting] = useState<GroupMessage | null>(null);
  /** a read or a send was refused because the reader was taken out while the chat was open */
  const [gone, setGone] = useState(false);
  /** the chat has been read as a member: a refusal after that means they were taken out */
  const inside = useRef(false);
  /** which clear is waiting for a yes */
  const [clearing, setClearing] = useState<'me' | 'everyone' | null>(null);
  const [clearBusy, setClearBusy] = useState(false);
  const [clearErr, setClearErr] = useState<string | null>(null);
  const [addingFriends, setAddingFriends] = useState(false);
  /** what just happened here, for a screen reader */
  const [said, setSaid] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const { refreshUnread } = useMessages();
  const { openProfile } = useProfileModal();
  const { ref: scrollRef, atBottom, scrollToBottom } = useStickyScroll(messages);
  const { typing, note } = useTypingWatch();
  const signalTyping = useTypingSignal(
    useCallback(() => void client.post(`/groups/${groupId}/chat/typing`).catch(() => undefined), [client, groupId]),
  );

  // join the live room for as long as this channel is open (ref-counted, cross-tab)
  useRealtimeRoom(`group:${groupId}`);

  /** Group detail carries the roster + my role, which drives the members panel, and where the reader stands. */
  const loadDetail = useCallback(async () => {
    const r = await client.get<GroupDetail>(`/groups/${groupId}`);
    setDetailTried(true);
    if (r.ok) {
      setDetail(r.data);
      // an answer without a name keeps the one already shown
      if (r.data.name) setName(r.data.name);
    }
  }, [client, groupId]);

  /** Not in the group any more: the group is read again for where the reader now stands. */
  const refusedOut = useCallback(() => {
    if (inside.current) {
      setGone(true);
      // the lists of groups on the page lose this one
      announceGroupsChanged();
    }
    inside.current = false;
    void loadDetail();
  }, [loadDetail]);

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
        if (!res.ok) {
          if (isOutOfGroup(res.error)) refusedOut();
          return res.error;
        }
        setMessages((m) => {
          const list = m ?? [];
          return list.some((x) => x.id === res.data.id) ? list : [...list, res.data];
        });
        return null;
      },
      [client, groupId, refusedOut],
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
    const res = await client.get<{ messages: GroupMessage[]; cleared?: GroupChatCleared }>(`/groups/${groupId}/chat`);
    if (res.ok) {
      inside.current = true;
      setCleared(res.data.cleared ?? null);
      setMessages(byTime(res.data.messages));
    } else if (isOutOfGroup(res.error)) {
      setMessages((m) => m ?? []);
      refusedOut();
    } else {
      setMessages((m) => m ?? []);
      setLoadError(describeError(res.error, t));
    }
  }, [client, groupId, refusedOut]);

  const standing = detail ? standingOf(detail) : null;
  const outside = gone || (standing !== null && standing.kind !== 'member');
  // the poll has nothing to read for someone outside the group
  const outsideRef = useRef(outside);
  outsideRef.current = outside;

  useEffect(() => {
    setMessages(null);
    setLoadError(null);
    void load();
    void loadDetail();
    void markRead();
    return pollWhileVisible(() => {
      if (!outsideRef.current) void load();
    }, state === 'open' ? THREAD_POLL_LIVE : THREAD_POLL_FALLBACK);
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

  // an owner or admin cleared the chat for everyone: every open view empties at once, and says who did it
  const onCleared = useCallback(
    (env: RealtimeEventEnvelope) => {
      const ev = env.event as { groupId?: unknown; at?: unknown; by?: unknown };
      if (ev.groupId !== groupId || typeof ev.at !== 'string') return;
      const everyone = { at: ev.at, by: typeof ev.by === 'string' ? ev.by : null };
      setCleared((c) => ({ forMe: c?.forMe ?? null, forEveryone: everyone }));
      setMessages((m) => (m ? sinceCleared(m, { forMe: null, forEveryone: everyone }) : m));
      setSaid(clearedWords(t, locale, everyone.by, everyone.at, everyone.by !== null && everyone.by === user?.username));
      refreshUnread();
    },
    [groupId, locale, refreshUnread, t, user?.username],
  );
  useRealtimeEvent('group_chat_cleared', onCleared);

  // somebody was banned with their messages: theirs go from every open view, as a deleted one does
  const onSenderWiped = useCallback(
    (env: RealtimeEventEnvelope) => {
      const ev = env.event as { groupId?: unknown; senderId?: unknown };
      if (ev.groupId !== groupId || typeof ev.senderId !== 'string') return;
      setMessages((m) => (m ?? []).map((x) => (x.senderId === ev.senderId ? { ...x, deleted: true, body: '' } : x)));
    },
    [groupId],
  );
  useRealtimeEvent('group_msgs_deleted', onSenderWiped);

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

  /** Send a message; whether it went. */
  async function post(body: string): Promise<boolean> {
    setSending(true);
    setSendErr(null);
    const res = await client.post<GroupMessage>(`/groups/${groupId}/chat`, { body });
    setSending(false);
    if (res.ok) {
      setMessages((m) => {
        const list = m ?? [];
        if (list.some((x) => x.id === res.data.id)) return list;
        return [...list, res.data];
      });
      scrollToBottom('smooth');
      return true;
    }
    if (isOutOfGroup(res.error)) refusedOut();
    else setSendErr(res.error);
    return false;
  }

  async function send(): Promise<void> {
    const body = text.trim();
    if (!body) return;
    if (await post(body)) setText('');
  }

  /** A greeting from the empty chat's card; then the box is where the conversation goes on. */
  async function greet(greeting: string): Promise<void> {
    if (await post(greeting)) rootRef.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
  }

  async function clear(scope: 'me' | 'everyone'): Promise<void> {
    setClearBusy(true);
    setClearErr(null);
    const res = await client.post<{ cleared?: GroupChatCleared }>(`/groups/${groupId}/chat/clear`, { for: scope });
    setClearBusy(false);
    if (!res.ok) {
      if (isOutOfGroup(res.error)) {
        setClearing(null);
        refusedOut();
      } else setClearErr(describeError(res.error, t));
      return;
    }
    setClearing(null);
    const now = res.data.cleared ?? null;
    if (now) setCleared(now);
    // what the server keeps from view goes from this one too (everything so far, when it did not say)
    setMessages((m) => (now ? sinceCleared(m ?? [], now) : []));
    setSaid(scope === 'me' ? t('groups.clear.doneMe') : t('groups.clear.doneEveryone'));
    refreshUnread();
    announceGroupsChanged();
  }

  // the group's real size; an older answer has only the roster to count
  const memberCount = detail?.memberCount ?? detail?.members?.length;
  const moderates = canModerateGroup(detail?.myRole ?? null);
  const shown = shownClear(cleared);
  // a send refused for a limit on the account, or a mute in this group: no greetings to tap
  const canPost = restrictionOf(sendErr) === null;
  // an invite-only group's owner or admin, alone in it: nobody else can be in it unless they are added
  const alone = detail !== null && detail.privacy === 'invite' && moderates && (memberCount ?? 0) <= 1;

  return (
    <div className={`chat-thread${className ? ` ${className}` : ''}`} ref={rootRef}>
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
        {detail && !outside && (
          <OptionsMenu
            className="ghead-menu"
            label={t('groups.chatOptions')}
            items={[
              { key: 'me', label: t('groups.clear.forMe'), icon: <TrashIcon size={18} />, run: () => setClearing('me') },
              ...(moderates
                ? [{ key: 'everyone', label: t('groups.clear.forEveryone'), icon: <TrashIcon size={18} />, danger: true, run: () => setClearing('everyone') }]
                : []),
            ]}
          />
        )}
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

      <Modal open={clearing !== null} onClose={() => setClearing(null)} label={clearing === 'everyone' ? t('groups.clear.forEveryone') : t('groups.clear.forMe')}>
        {clearing && (
          <GroupAsk
            title={clearing === 'me' ? t('groups.clear.meTitle') : t('groups.clear.everyoneTitle', { count: memberCount ?? 0 })}
            body={clearing === 'me' ? t('groups.clear.meBody') : t('groups.clear.everyoneBody')}
            action={clearing === 'me' ? t('groups.clear.meAction') : t('groups.clear.everyoneAction')}
            danger
            busy={clearBusy}
            error={clearErr}
            onCancel={() => setClearing(null)}
            onConfirm={() => void clear(clearing)}
          />
        )}
      </Modal>

      <div className="chat-messages" ref={scrollRef}>
        {messages === null || !detailTried ? (
          <ThreadSkeleton />
        ) : outside && detail ? (
          <GroupOutside
            detail={{ ...detail, id: groupId, name, memberCount: memberCount ?? 0 }}
            standing={standing && standing.kind !== 'member' ? standing : { kind: 'out' }}
            gone={gone}
            onChanged={async () => {
              setGone(false);
              await loadDetail();
              void load();
            }}
          />
        ) : (
          <>
            {shown?.kind === 'everyone' && <ClearedLine by={shown.by} at={shown.at} mine={shown.by !== null && shown.by === user?.username} />}
            {messages.length === 0 ? (
              loadError ? (
                <p className="muted chat-hint">{loadError}</p>
              ) : (
                <GroupWelcome
                  group={{ id: groupId, name, photoUrl: detail?.photoUrl }}
                  cleared={shown?.kind === 'me' ? shown : shown ? { kind: 'everyone' } : null}
                  canPost={canPost}
                  sending={sending}
                  onGreet={(greeting) => void greet(greeting)}
                  onAddFriends={alone ? () => setAddingFriends(true) : undefined}
                />
              )
            ) : (
              <MessageList
                messages={messages}
                myId={user?.id}
                onOpenProfile={(userId, username) => openProfile({ kind: 'user', userId, username })}
                onReport={setReporting}
                renderBody={(m) => gifts.renderBody(m) ?? gameCardBody(m)}
              />
            )}
          </>
        )}
      </div>
      <p className="sr-only" role="status">
        {said}
      </p>

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

      {!atBottom && !outside && messages !== null && messages.length > 0 && (
        <button type="button" className="chat-jump" onClick={() => scrollToBottom('smooth')}>
          {t('chat.jumpToLatest')}
        </button>
      )}

      {!outside && gifts.notice}
      {!outside && <SendError error={sendErr} describe={(e) => sendError(e, t)} className="chat-senderr" />}
      <ReportSheet
        open={reporting !== null}
        onClose={() => setReporting(null)}
        target={{ targetType: 'group_message', targetId: reporting?.id ?? '' }}
        block={reporting ? { userId: reporting.senderId, name: reporting.username } : null}
        // an owner cannot leave (the server refuses), so is not offered it
        leaveGroup={detail && detail.myRole !== 'owner' ? { groupId, name } : null}
        onLeftGroup={() => (onClose ? onClose() : navigateAway('/app/messages?group='))}
      />
      {!outside && (
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
      )}
      {gifts.overlays}
      {detail && (
        <AddFriendsSheet
          open={addingFriends}
          groupId={groupId}
          groupName={name}
          memberIds={new Set((detail.members ?? []).map((m) => m.userId))}
          onClose={() => setAddingFriends(false)}
          onAdded={() => void loadDetail()}
        />
      )}
    </div>
  );
}

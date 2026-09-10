import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { ApiError, GroupDetail, GroupMember, GroupMessage, GroupRole } from '../lib/types';
import { ConfirmButton } from '../components/ConfirmButton';
import { useProfileModal } from '../profile/ProfileModal';
import { useMessages } from './MessagesProvider';
import { MessageList } from './MessageList';
import { Composer } from './Composer';
import { useStickyScroll } from './useStickyScroll';
import { useTypingSignal, useTypingWatch, typingLabel } from './useTyping';
import { useRealtime, useRealtimeEvent, useRealtimeRoom } from '../realtime/RealtimeProvider';
import type { RealtimeEventEnvelope } from '../realtime/events';
import { sendError } from './DmThread';
import { byTime, THREAD_POLL_FALLBACK, THREAD_POLL_LIVE } from './threadShared';
import { Loading } from '../components/states';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { ArrowIcon, CloseIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import { Avatar } from '../components/Avatar';

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
  const [showMembers, setShowMembers] = useState(false);
  const [messages, setMessages] = useState<GroupMessage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  const { refreshUnread } = useMessages();
  const { openProfile } = useProfileModal();
  const { ref: scrollRef, atBottom, scrollToBottom } = useStickyScroll(messages);
  const { typing, note } = useTypingWatch();
  const signalTyping = useTypingSignal(
    useCallback(() => void client.post(`/groups/${groupId}/chat/typing`).catch(() => undefined), [client, groupId]),
  );

  // join the live room for as long as this channel is open (ref-counted, cross-tab)
  useRealtimeRoom(`group:${groupId}`);

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
      setLoadError(describeError(res.error));
    }
  }, [client, groupId]);

  /** Group detail carries the roster + my role, which drives the members panel. */
  const loadDetail = useCallback(async () => {
    const r = await client.get<GroupDetail>(`/groups/${groupId}`);
    if (r.ok) {
      setDetail(r.data);
      setName(r.data.name);
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
      setMessages((m) => {
        const list = m ?? [];
        if (list.some((x) => x.id === ev.message!.id)) return list;
        return [...list, ev.message!];
      });
      void markRead(); // it is on screen, so it counts as read
    },
    [groupId, markRead],
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
    setSendMsg(null);
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
      setSendMsg(sendError(res.error, t));
    }
  }

  return (
    <div className={`chat-thread${className ? ` ${className}` : ''}`}>
      <header className="chat-thread-head">
        {/* a page goes back to the list; a dock has no list to go back to */}
        {!onClose && (
          <Link to="/app/messages?group=" className="chat-back" aria-label={t('chat.backToGroups')}>
            <ArrowIcon size={18} />
          </Link>
        )}
        <span className="chat-thread-title" aria-current="page">
          {name}
        </span>
        <button type="button" className="chat-members-btn" onClick={() => setShowMembers(true)}>
          {detail?.members ? t('groups.memberCount', { count: detail.members.length }) : t('groups.members')}
        </button>
        {onClose && (
          <button type="button" className="chat-dock-close" onClick={onClose} aria-label={t('chat.closeWith', { name })}>
            <CloseIcon size={16} />
          </button>
        )}
      </header>

      <Modal open={showMembers} onClose={() => setShowMembers(false)} label={t('groups.membersOf')}>
        {detail?.members && (
          <GroupMembers
            detail={detail}
            onChanged={loadDetail}
            // reloading the detail of a group you just left would only 403, so
            // leave it: a dock closes, a page goes back to the list
            onLeft={() => (onClose ? onClose() : navigateAway('/app/messages?group='))}
          />
        )}
      </Modal>

      <div className="chat-messages" ref={scrollRef}>
        {messages === null ? (
          <Loading />
        ) : messages.length === 0 ? (
          <p className="muted chat-hint">{loadError ?? t('chat.sayHelloGroup')}</p>
        ) : (
          <MessageList
            messages={messages}
            myId={user?.id}
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
          {typingLabel(typing, t)}
        </div>
      )}

      {!atBottom && messages !== null && messages.length > 0 && (
        <button type="button" className="chat-jump" onClick={() => scrollToBottom('smooth')}>
          {t('chat.jumpToLatest')}
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
        placeholder={t('chat.messageTheGroup')}
      />
    </div>
  );
}

/** Higher rank = more power, mirroring the server's group role hierarchy. */
const ROLE_RANK: Record<GroupRole, number> = { member: 0, moderator: 1, owner: 2 };

/**
 * The group's roster and its admins. A group's creator is its owner; owners can
 * promote members to moderator (a group admin) or demote them, and owners and
 * moderators can remove anyone they outrank. This is entirely separate from
 * MyKurda staff roles — being a group admin grants nothing outside the group.
 * The server re-checks every action; this only mirrors the rules to hide buttons
 * that would be rejected.
 */
function GroupMembers({
  detail,
  onChanged,
  onLeft,
}: {
  detail: GroupDetail;
  onChanged: () => Promise<void>;
  onLeft: () => void;
}): React.JSX.Element {
  const { client, user } = useAuth();
  const t = useT();
  const { openProfile } = useProfileModal();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const myRole = detail.myRole;
  const canManage = (target: GroupMember): boolean =>
    myRole !== null &&
    (myRole === 'owner' || myRole === 'moderator') &&
    ROLE_RANK[myRole] > ROLE_RANK[target.role] &&
    target.userId !== user?.id;
  // only an owner changes roles; ownership itself moves via transfer, not setRole
  const canSetRole = myRole === 'owner';

  /*
   * No `confirm()` here any more. The destructive actions below are
   * ConfirmButtons instead: a browser dialog cannot be styled, lands outside the
   * page for a screen reader, and is blocked outright in some embedded browsers
   * — where it returns false and the action becomes quietly impossible.
   */
  async function act(key: string, run: () => Promise<{ ok: boolean; error?: ApiError }>): Promise<void> {
    setBusy(key);
    setError(null);
    const res = await run();
    setBusy(null);
    if (res.ok) await onChanged();
    else setError(res.error ? describeError(res.error) : t('chat.thatDidNotWork'));
  }

  const setRole = (m: GroupMember, role: 'moderator' | 'member'): Promise<void> =>
    act(`${m.userId}:role`, () => client.put(`/groups/${detail.id}/members/${m.userId}/role`, { role }));

  const remove = (m: GroupMember): Promise<void> =>
    act(`${m.userId}:remove`, () => client.delete(`/groups/${detail.id}/members/${m.userId}`));

  const transfer = (m: GroupMember): Promise<void> =>
    act(`${m.userId}:transfer`, () => client.post(`/groups/${detail.id}/transfer`, { userId: m.userId }));

  /**
   * Leaving is the one action here that is about you rather than someone else,
   * so it sits apart from the roster. The owner cannot leave — the server
   * refuses, since a group with no owner has nobody who can hand it on — so they
   * are told what to do instead of being given a button that fails.
   */
  async function leave(): Promise<void> {
    setBusy('leave');
    setError(null);
    const res = await client.post(`/groups/${detail.id}/leave`);
    setBusy(null);
    if (res.ok) onLeft();
    else setError(res.error ? describeError(res.error) : t('chat.thatDidNotWork'));
  }

  const ordered = [...detail.members].sort(
    (a, b) => ROLE_RANK[b.role] - ROLE_RANK[a.role] || a.username.localeCompare(b.username),
  );

  return (
    <div className="group-members">
      <h2 className="friend-heading" style={{ marginTop: 0 }}>{detail.name}</h2>
      <p className="muted">
        {t('groups.memberCount', { count: detail.members.length })}
        {myRole && (
          <>
            {' · '}
            {myRole === 'owner' ? t('groups.youAreTheOwner') : t('groups.youAreAnAdmin')}
          </>
        )}
      </p>
      {error && <div className="msg msg-error">{error}</div>}

      <ul className="group-member-list">
        {ordered.map((m) => (
          <li className="group-member" key={m.userId}>
            {/* the whole identity opens the profile — a roster you cannot click
                through is a dead end when you want to know who someone is */}
            <button
              type="button"
              className="group-member-who"
              onClick={() => openProfile({ kind: 'user', userId: m.userId, username: m.username })}
            >
              <Avatar url={m.avatarUrl} glyphSize={18} />
              <span className="chat-convo-body">
                <span className="chat-convo-name">
                  {m.username}
                  {m.userId === user?.id && <span className="group-joined-badge">{t('chat.you')}</span>}
                </span>
                <span className="chat-convo-last">
                  <span className={`member-role member-role-${m.role}`}>
                    {m.role === 'owner' ? t('groups.role.owner') : m.role === 'moderator' ? t('groups.role.admin') : t('groups.role.member')}
                  </span>
                </span>
              </span>
            </button>
            <span className="group-member-actions">
              {canSetRole && m.role === 'member' && m.userId !== user?.id && (
                <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void setRole(m, 'moderator')}>
                  {t('groups.makeAdmin')}
                </Button>
              )}
              {canSetRole && m.role === 'moderator' && (
                <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void setRole(m, 'member')}>
                  {t('groups.removeAdmin')}
                </Button>
              )}
              {canSetRole && m.role === 'moderator' && (
                <ConfirmButton
                  className="btn btn-ghost btn-sm"
                  label={t('groups.makeOwner')}
                  disabled={busy !== null}
                  title={t('groups.makeOwnerWarning', { name: m.username })}
                  onConfirm={() => transfer(m)}
                />
              )}
              {canManage(m) && (
                <ConfirmButton
                  className="btn btn-ghost btn-sm"
                  label={t('groups.remove')}
                  disabled={busy !== null}
                  title={t('groups.removeFrom', { name: m.username, group: detail.name })}
                  onConfirm={() => remove(m)}
                />
              )}
            </span>
          </li>
        ))}
      </ul>

      {myRole === 'owner' ? (
        <p className="muted group-leave-note">
          {t('groups.ownerCannotLeave', { group: detail.name })}
        </p>
      ) : (
        myRole !== null && (
          <div className="group-leave">
            <ConfirmButton
              className="btn btn-ghost btn-sm danger"
              label={t('groups.leave', { group: detail.name })}
              disabled={busy !== null}
              title={t('groups.leave', { group: detail.name })}
              onConfirm={leave}
            />
          </div>
        )
      )}
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { ApiError, Conversation, Group, GroupDetail, GroupMember, GroupMessage, GroupRole, MyGroup } from '../lib/types';
import { ConfirmButton } from '../components/ConfirmButton';
import { useProfileModal } from '../profile/ProfileModal';
import { useMessages } from '../chat/MessagesProvider';
import { MessageList } from '../chat/MessageList';
import { Composer } from '../chat/Composer';
import { useStickyScroll } from '../chat/useStickyScroll';
import { messagePreview } from '../chat/messagePreview';
import { useTypingSignal, useTypingWatch, typingLabel } from '../chat/useTyping';
import { DmThread, sendError } from '../chat/DmThread';
import { useRealtime, useRealtimeEvent, useRealtimeRoom } from '../realtime/RealtimeProvider';
import type { RealtimeEventEnvelope } from '../realtime/events';
import { Loading, ErrorState, EmptyState } from '../components/states';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { ArrowIcon } from '../components/icons';
import { Avatar } from '../components/Avatar';

// When the realtime socket is live it carries every message instantly, so polling
// is just a slow safety net. When it is NOT connected, we fall back to a brisk
// poll so chat still feels live for everyone.
const CONVO_POLL_LIVE = 30000;
const CONVO_POLL_FALLBACK = 5000;
const THREAD_POLL_LIVE = 20000;
const THREAD_POLL_FALLBACK = 4000;

/** Oldest→newest by server timestamp, so the thread always reads top to bottom. */
function byTime<T extends { createdAt: string }>(msgs: T[]): T[] {
  return [...msgs].sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
}


export function Messages(): React.JSX.Element {
  const [params] = useSearchParams();
  const activeId = params.get('to');
  const activeName = params.get('name') ?? undefined;
  const activeGroup = params.get('group');
  // the Groups tab is implied when a group is open, else it's a manual toggle
  const [tab, setTab] = useState<'direct' | 'groups'>(activeGroup ? 'groups' : 'direct');
  useEffect(() => {
    if (activeGroup) setTab('groups');
  }, [activeGroup]);
  // bump to refresh the direct list after the current user sends (their own send
  // isn't pushed back to them over realtime, so the preview would otherwise lag)
  const [dmRefresh, setDmRefresh] = useState(0);
  // stable identity: Thread depends on this inside an effect, so a new function
  // on each render would reset the thread and wipe what is on screen
  const onDmSent = useCallback(() => setDmRefresh((n) => n + 1), []);

  return (
    <div className={`container chat-page${activeId || activeGroup ? ' chat-active' : ''}`}>
      <div className="page-header">
        <span className="eyebrow">Peyam · Messages</span>
        <h1 className="page-title">Messages</h1>
      </div>

      <div className={`chat-layout${activeId || activeGroup ? ' has-active' : ''}`}>
        <aside className="chat-list" aria-label="Conversations">
          <div className="chat-tabs" role="tablist" aria-label="Chat type">
            <button
              role="tab"
              aria-selected={tab === 'direct'}
              className={`chip${tab === 'direct' ? ' active' : ''}`}
              onClick={() => setTab('direct')}
            >
              Direct
            </button>
            <button
              role="tab"
              aria-selected={tab === 'groups'}
              className={`chip${tab === 'groups' ? ' active' : ''}`}
              onClick={() => setTab('groups')}
            >
              Groups
            </button>
          </div>
          {tab === 'direct' ? <DirectList activeId={activeId} refreshKey={dmRefresh} /> : <GroupsList activeGroup={activeGroup} />}
        </aside>

        <section className="chat-thread-pane">
          {activeGroup ? (
            <GroupThread key={activeGroup} groupId={activeGroup} />
          ) : activeId ? (
            <DmThread key={activeId} otherId={activeId} otherName={activeName} onSent={onDmSent} />
          ) : (
            <div className="chat-empty">
              <p className="muted">Select a conversation to start chatting.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/** The list of 1:1 conversations. */
function DirectList({ activeId, refreshKey }: { activeId: string | null; refreshKey: number }): React.JSX.Element {
  const { client } = useAuth();
  const { state } = useRealtime();
  const [convos, setConvos] = useState<Conversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadedOnce = useRef(false);

  const loadConvos = useCallback(async () => {
    const res = await client.get<{ conversations: Conversation[] }>('/chat/conversations');
    if (res.ok) {
      setConvos(res.data.conversations ?? []);
      loadedOnce.current = true;
    } else if (!loadedOnce.current) {
      setError(describeError(res.error));
    }
  }, [client]);

  useEffect(() => {
    void loadConvos();
    const t = setInterval(() => void loadConvos(), state === 'open' ? CONVO_POLL_LIVE : CONVO_POLL_FALLBACK);
    return () => clearInterval(t);
  }, [loadConvos, refreshKey, state]);

  const onDm = useCallback(() => void loadConvos(), [loadConvos]);
  useRealtimeEvent('dm', onDm);
  useRealtimeEvent('dm_read', onDm);

  if (error && convos === null) return <ErrorState message={error} onRetry={() => void loadConvos()} />;
  if (convos === null) return <Loading />;
  if (convos.length === 0)
    return <EmptyState title="No messages yet" message="Message a friend from their profile to start a conversation." />;
  return (
    <>
      {convos.map((c) => (
        <Link
          key={c.userId}
          to={`/app/messages?to=${c.userId}&name=${encodeURIComponent(c.username)}`}
          className={`chat-convo${c.userId === activeId ? ' active' : ''}`}
        >
          <Avatar url={c.avatarUrl} online={c.online} />
          <span className="chat-convo-body">
            <span className="chat-convo-top">
              <span className="chat-convo-name">{c.username}</span>
              {c.unread > 0 && <span className="chat-unread">{c.unread}</span>}
            </span>
            <span className="chat-convo-last">
              {c.lastFromMe ? 'You: ' : ''}
              {messagePreview(c.lastMessage)}
            </span>
          </span>
        </Link>
      ))}
    </>
  );
}

/** The list of the caller's groups + a way to make or discover one. */
function GroupsList({ activeGroup }: { activeGroup: string | null }): React.JSX.Element {
  const { client } = useAuth();
  const [mine, setMine] = useState<MyGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const loadedOnce = useRef(false);

  const load = useCallback(async () => {
    const res = await client.get<{ groups: MyGroup[] }>('/me/groups');
    if (res.ok) {
      setMine(res.data.groups);
      loadedOnce.current = true;
    } else if (!loadedOnce.current) {
      setError(describeError(res.error));
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  // a new group message can change previews/unread — cheap to refresh the list
  const onGroupMsg = useCallback(() => void load(), [load]);
  useRealtimeEvent('group_msg', onGroupMsg);

  return (
    <>
      <div className="chat-list-actions">
        <Button size="sm" onClick={() => setCreating(true)}>
          New group
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDiscovering(true)}>
          Discover
        </Button>
      </div>

      {error && mine === null ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : mine === null ? (
        <Loading />
      ) : mine.length === 0 ? (
        <EmptyState title="No groups yet" message="Create a group or discover an open one to start a group chat." />
      ) : (
        mine.map((g) => (
          <Link
            key={g.id}
            to={`/app/messages?group=${g.id}`}
            className={`chat-convo${g.id === activeGroup ? ' active' : ''}`}
          >
            <span className="group-avatar" aria-hidden>
              {g.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="chat-convo-body">
              <span className="chat-convo-top">
                <span className="chat-convo-name">{g.name}</span>
              </span>
              <span className="chat-convo-last">
                {g.memberCount} member{g.memberCount === 1 ? '' : 's'}
                {g.privacy === 'invite' ? ' · invite-only' : ''}
              </span>
            </span>
          </Link>
        ))
      )}

      <Modal open={creating} onClose={() => setCreating(false)} label="New group">
        <CreateGroupForm
          onDone={() => {
            setCreating(false);
            void load();
          }}
        />
      </Modal>
      <Modal open={discovering} onClose={() => setDiscovering(false)} label="Discover groups">
        <DiscoverGroups
          mineIds={new Set((mine ?? []).map((g) => g.id))}
          onJoined={() => {
            setDiscovering(false);
            void load();
          }}
        />
      </Modal>
    </>
  );
}

/** Create a new group; the creator becomes owner and lands in its chat. */
function CreateGroupForm({ onDone }: { onDone: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [privacy, setPrivacy] = useState<'open' | 'invite'>('open');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (name.trim().length < 2) return;
    setBusy(true);
    setErr(null);
    const res = await client.post<{ id: string }>('/groups', {
      name: name.trim(),
      description: description.trim() || undefined,
      privacy,
    });
    setBusy(false);
    if (res.ok) {
      onDone();
      navigate(`/app/messages?group=${res.data.id}`);
    } else {
      setErr(res.error.code === 'TRUST_VELOCITY' ? 'New accounts can create fewer groups — this lifts as your account ages.' : describeError(res.error));
    }
  }

  return (
    <form className="compose" onSubmit={submit}>
      <h2 className="friend-heading" style={{ marginTop: 0 }}>New group</h2>
      {err && <div className="msg msg-error">{err}</div>}
      <div className="field">
        <label className="field-label" htmlFor="g-name">Name</label>
        <input id="g-name" className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kurmancî learners" />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="g-desc">Description <span className="muted">(optional)</span></label>
        <input id="g-desc" className="input" value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} placeholder="What's this group about?" />
      </div>
      <div className="field">
        <span className="field-label">Privacy</span>
        <div className="chat-tabs">
          <button type="button" className={`chip${privacy === 'open' ? ' active' : ''}`} onClick={() => setPrivacy('open')}>
            Open
          </button>
          <button type="button" className={`chip${privacy === 'invite' ? ' active' : ''}`} onClick={() => setPrivacy('invite')}>
            Invite-only
          </button>
        </div>
        <span className="field-hint">{privacy === 'open' ? 'Anyone can find and join.' : 'People join only when a member invites them.'}</span>
      </div>
      <Button type="submit" disabled={busy || name.trim().length < 2}>{busy ? 'Creating…' : 'Create group'}</Button>
    </form>
  );
}

/** Browse open groups and join one. */
function DiscoverGroups({ mineIds, onJoined }: { mineIds: Set<string>; onJoined: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await client.get<{ groups: Group[] }>('/groups');
    if (res.ok) setGroups(res.data.groups);
    else setError(describeError(res.error));
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  async function join(id: string): Promise<void> {
    setJoining(id);
    const res = await client.post(`/groups/${id}/join`);
    setJoining(null);
    if (res.ok) onJoined();
    else setError(describeError(res.error));
  }

  if (error && groups === null) return <ErrorState message={error} onRetry={() => void load()} />;
  if (groups === null) return <Loading />;
  // show open groups AND the caller's own (marked as already-in), rather than hiding them
  const open = groups.filter((g) => g.privacy === 'open' || mineIds.has(g.id));
  if (open.length === 0)
    return <EmptyState title="Nothing here yet" message="No groups to discover right now. Create your own to get started!" />;

  return (
    <div className="group-discover">
      {error && <div className="msg msg-error">{error}</div>}
      {open.map((g) => {
        const joined = mineIds.has(g.id);
        return (
          <div className="group-discover-row" key={g.id}>
            <span className="group-avatar" aria-hidden>{g.name.slice(0, 1).toUpperCase()}</span>
            <span className="chat-convo-body">
              <span className="chat-convo-name">
                {g.name}
                {joined && <span className="group-joined-badge">Joined</span>}
              </span>
              <span className="chat-convo-last">{g.description || `${g.memberCount} member${g.memberCount === 1 ? '' : 's'}`}</span>
            </span>
            {joined ? (
              <Link to={`/app/messages?group=${g.id}`} className="btn btn-secondary btn-sm" onClick={onJoined}>
                Open
              </Link>
            ) : (
              <Button size="sm" disabled={joining === g.id} onClick={() => void join(g.id)}>
                {joining === g.id ? 'Joining…' : 'Join'}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** A group chat channel — history, live messages over the `group:<id>` room, send. */
function GroupThread({ groupId }: { groupId: string }): React.JSX.Element {
  const navigateAway = useNavigate();
  const { client, user } = useAuth();
  const { state } = useRealtime();
  const [name, setName] = useState<string>('Group');
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
    const t = setInterval(() => void load(), state === 'open' ? THREAD_POLL_LIVE : THREAD_POLL_FALLBACK);
    return () => clearInterval(t);
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
      setSendMsg(sendError(res.error));
    }
  }

  return (
    <div className="chat-thread">
      <header className="chat-thread-head">
        <Link to="/app/messages?group=" className="chat-back" aria-label="Back to groups">
          <ArrowIcon size={18} />
        </Link>
        <span className="chat-thread-title" aria-current="page">
          {name}
        </span>
        <button type="button" className="chat-members-btn" onClick={() => setShowMembers(true)}>
          {detail?.members ? `${detail.members.length} members` : 'Members'}
        </button>
      </header>

      <Modal open={showMembers} onClose={() => setShowMembers(false)} label="Group members">
        {detail?.members && (
          <GroupMembers
            detail={detail}
            onChanged={loadDetail}
            // reloading the detail of a group you just left would only 403 —
            // go back to the list instead
            onLeft={() => navigateAway('/app/messages?group=')}
          />
        )}
      </Modal>

      <div className="chat-messages" ref={scrollRef}>
        {messages === null ? (
          <Loading />
        ) : messages.length === 0 ? (
          <p className="muted chat-hint">{loadError ?? 'No messages yet. Say hello to the group!'}</p>
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
        placeholder="Message the group…"
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
    else setError(res.error ? describeError(res.error) : 'That did not work.');
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
    else setError(res.error ? describeError(res.error) : 'That did not work.');
  }

  const ordered = [...detail.members].sort(
    (a, b) => ROLE_RANK[b.role] - ROLE_RANK[a.role] || a.username.localeCompare(b.username),
  );

  return (
    <div className="group-members">
      <h2 className="friend-heading" style={{ marginTop: 0 }}>{detail.name}</h2>
      <p className="muted">
        {detail.members.length} member{detail.members.length === 1 ? '' : 's'}
        {myRole && <> · you are {myRole === 'owner' ? 'the owner' : `a ${myRole}`}</>}
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
                  {m.userId === user?.id && <span className="group-joined-badge">You</span>}
                </span>
                <span className="chat-convo-last">
                  <span className={`member-role member-role-${m.role}`}>
                    {m.role === 'owner' ? 'Owner' : m.role === 'moderator' ? 'Admin' : 'Member'}
                  </span>
                </span>
              </span>
            </button>
            <span className="group-member-actions">
              {canSetRole && m.role === 'member' && m.userId !== user?.id && (
                <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void setRole(m, 'moderator')}>
                  Make admin
                </Button>
              )}
              {canSetRole && m.role === 'moderator' && (
                <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void setRole(m, 'member')}>
                  Remove admin
                </Button>
              )}
              {canSetRole && m.role === 'moderator' && (
                <ConfirmButton
                  className="btn btn-ghost btn-sm"
                  label="Make owner"
                  disabled={busy !== null}
                  title={`Make ${m.username} the owner — you become a moderator and cannot undo this yourself`}
                  onConfirm={() => transfer(m)}
                />
              )}
              {canManage(m) && (
                <ConfirmButton
                  className="btn btn-ghost btn-sm"
                  label="Remove"
                  disabled={busy !== null}
                  title={`Remove ${m.username} from ${detail.name}`}
                  onConfirm={() => remove(m)}
                />
              )}
            </span>
          </li>
        ))}
      </ul>

      {myRole === 'owner' ? (
        <p className="muted group-leave-note">
          You own {detail.name}. To leave, make someone else the owner first.
        </p>
      ) : (
        myRole !== null && (
          <div className="group-leave">
            <ConfirmButton
              className="btn btn-ghost btn-sm danger"
              label={`Leave ${detail.name}`}
              disabled={busy !== null}
              title={`Leave ${detail.name}`}
              onConfirm={leave}
            />
          </div>
        )
      )}
    </div>
  );
}

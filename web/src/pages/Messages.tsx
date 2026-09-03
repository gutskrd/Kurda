import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { ApiError, Conversation, DmMessage, Group, GroupMessage, MyGroup } from '../lib/types';
import { useProfileModal } from '../profile/ProfileModal';
import { useRealtimeEvent, useRealtimeRoom } from '../realtime/RealtimeProvider';
import type { RealtimeEventEnvelope } from '../realtime/events';
import { Loading, ErrorState, EmptyState } from '../components/states';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { ArrowIcon } from '../components/icons';
import { Avatar } from '../components/Avatar';
import { MessageBody } from '../components/GameInviteCard';

// Realtime delivers messages instantly; polling stays only as a safety net for
// events missed while the socket was down, so it can run far slower than before.
const CONVO_POLL_MS = 30000;
const THREAD_POLL_MS = 20000;

/** Map moderation/anti-bot server codes to human copy (server stays authoritative). */
function sendError(err: ApiError): string {
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

  return (
    <div className="container">
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
            <Thread key={activeId} otherId={activeId} otherName={activeName} onSent={() => setDmRefresh((n) => n + 1)} />
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
    const t = setInterval(() => void loadConvos(), CONVO_POLL_MS);
    return () => clearInterval(t);
  }, [loadConvos, refreshKey]);

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
              {c.lastMessage}
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
  const open = groups.filter((g) => g.privacy === 'open' && !mineIds.has(g.id));
  if (open.length === 0)
    return <EmptyState title="Nothing to join right now" message="No open groups you’re not already in. Create your own instead!" />;

  return (
    <div className="group-discover">
      {error && <div className="msg msg-error">{error}</div>}
      {open.map((g) => (
        <div className="group-discover-row" key={g.id}>
          <span className="group-avatar" aria-hidden>{g.name.slice(0, 1).toUpperCase()}</span>
          <span className="chat-convo-body">
            <span className="chat-convo-name">{g.name}</span>
            <span className="chat-convo-last">{g.description || `${g.memberCount} members`}</span>
          </span>
          <Button size="sm" disabled={joining === g.id} onClick={() => void join(g.id)}>
            {joining === g.id ? 'Joining…' : 'Join'}
          </Button>
        </div>
      ))}
    </div>
  );
}

function Thread({
  otherId,
  otherName,
  onSent,
}: {
  otherId: string;
  otherName?: string;
  onSent: () => void;
}): React.JSX.Element {
  const { client, user } = useAuth();
  const { openProfile } = useProfileModal();
  const [messages, setMessages] = useState<DmMessage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await client.get<{ messages: DmMessage[] }>(`/chat/${otherId}/messages`);
    if (res.ok) {
      // history returns newest-first; show oldest→newest
      setMessages([...res.data.messages].reverse());
    } else {
      setMessages((m) => m ?? []);
      setLoadError(describeError(res.error));
    }
  }, [client, otherId]);

  useEffect(() => {
    setMessages(null);
    setLoadError(null);
    void load();
    const t = setInterval(() => void load(), THREAD_POLL_MS);
    return () => clearInterval(t);
  }, [load]);

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
      onSent();
    },
    [otherId, onSent],
  );
  useRealtimeEvent('dm', onDm);

  useEffect(() => {
    const el = scrollRef.current;
    el?.scrollTo?.({ top: el.scrollHeight });
  }, [messages]);

  async function send(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setSending(true);
    setSendMsg(null);
    const res = await client.post<DmMessage>(`/chat/${otherId}/messages`, { body });
    setSending(false);
    if (res.ok) {
      setText('');
      setMessages((m) => [...(m ?? []), res.data]);
      onSent();
    } else {
      setSendMsg(sendError(res.error));
    }
  }

  return (
    <div className="chat-thread">
      <header className="chat-thread-head">
        <Link to="/app/messages" className="chat-back" aria-label="Back to conversations">
          <ArrowIcon size={18} />
        </Link>
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
          messages.map((m) => (
            <div key={m.id} className={`bubble${m.senderId === user?.id ? ' mine' : ''}`}>
              <MessageBody body={m.body} />
            </div>
          ))
        )}
      </div>

      {sendMsg && <div className="msg msg-error chat-senderr">{sendMsg}</div>}
      <form className="chat-compose" onSubmit={send}>
        <input
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write a message…"
          maxLength={2000}
          aria-label="Message"
        />
        <Button type="submit" disabled={sending || text.trim().length === 0}>
          {sending ? 'Sending…' : 'Send'}
        </Button>
      </form>
    </div>
  );
}

/** A group chat channel — history, live messages over the `group:<id>` room, send. */
function GroupThread({ groupId }: { groupId: string }): React.JSX.Element {
  const { client, user } = useAuth();
  const [name, setName] = useState<string>('Group');
  const [messages, setMessages] = useState<GroupMessage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // join the live room for as long as this channel is open (ref-counted, cross-tab)
  useRealtimeRoom(`group:${groupId}`);

  // fetching history also refreshes the server-side grant that authorizes the WS join
  const load = useCallback(async () => {
    const res = await client.get<{ messages: GroupMessage[] }>(`/groups/${groupId}/chat`);
    if (res.ok) setMessages(res.data.messages);
    else {
      setMessages((m) => m ?? []);
      setLoadError(describeError(res.error));
    }
  }, [client, groupId]);

  useEffect(() => {
    setMessages(null);
    setLoadError(null);
    void load();
    void client.get<{ name: string }>(`/groups/${groupId}`).then((r) => {
      if (r.ok) setName(r.data.name);
    });
    void client.post(`/groups/${groupId}/chat/read`).catch(() => undefined);
    const t = setInterval(() => void load(), THREAD_POLL_MS);
    return () => clearInterval(t);
  }, [load, client, groupId]);

  const onGroupMsg = useCallback(
    (env: RealtimeEventEnvelope) => {
      const ev = env.event as { groupId?: unknown; message?: GroupMessage };
      if (ev.groupId !== groupId || !ev.message?.id) return;
      setMessages((m) => {
        const list = m ?? [];
        if (list.some((x) => x.id === ev.message!.id)) return list;
        return [...list, ev.message!];
      });
    },
    [groupId],
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

  useEffect(() => {
    const el = scrollRef.current;
    el?.scrollTo?.({ top: el.scrollHeight });
  }, [messages]);

  async function send(e: React.FormEvent): Promise<void> {
    e.preventDefault();
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
      </header>

      <div className="chat-messages" ref={scrollRef}>
        {messages === null ? (
          <Loading />
        ) : messages.length === 0 ? (
          <p className="muted chat-hint">{loadError ?? 'No messages yet. Say hello to the group!'}</p>
        ) : (
          messages.map((m) => {
            const mine = m.senderId === user?.id;
            return (
              <div key={m.id} className={`bubble${mine ? ' mine' : ''}`}>
                {!mine && <span className="bubble-author">{m.username}</span>}
                {m.deleted ? <em className="muted">message deleted</em> : <MessageBody body={m.body} />}
              </div>
            );
          })
        )}
      </div>

      {sendMsg && <div className="msg msg-error chat-senderr">{sendMsg}</div>}
      <form className="chat-compose" onSubmit={send}>
        <input
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message the group…"
          maxLength={2000}
          aria-label="Message"
        />
        <Button type="submit" disabled={sending || text.trim().length === 0}>
          {sending ? 'Sending…' : 'Send'}
        </Button>
      </form>
    </div>
  );
}

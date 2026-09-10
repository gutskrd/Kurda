import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { Conversation, Group, MyGroup } from '../lib/types';
import { messagePreview } from '../chat/messagePreview';
import { useT } from '../i18n/I18nProvider';
import { DmThread } from '../chat/DmThread';
import { GroupThread } from '../chat/GroupThread';
import { useRealtime, useRealtimeEvent } from '../realtime/RealtimeProvider';
import { Loading, ErrorState, EmptyState } from '../components/states';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Avatar } from '../components/Avatar';

// When the realtime socket is live it carries every message instantly, so polling
// is just a slow safety net. When it is NOT connected, we fall back to a brisk
// poll so chat still feels live for everyone.
const CONVO_POLL_LIVE = 30000;
const CONVO_POLL_FALLBACK = 5000;



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
  const t = useT();
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
    const timer = setInterval(() => void loadConvos(), state === 'open' ? CONVO_POLL_LIVE : CONVO_POLL_FALLBACK);
    return () => clearInterval(timer);
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
              {messagePreview(c.lastMessage, t)}
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


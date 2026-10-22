import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { groupLimits, type LimitDetails } from '@kurda/shared';
import { useApiGet } from '../lib/useApi';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { limitText } from '../lib/limits';
import type { ApiError, Conversation, MyGroup, UserSummary } from '../lib/types';
import { messagePreview } from '../chat/messagePreview';
import { useLocale, useT } from '../i18n/I18nProvider';
import { DmThread } from '../chat/DmThread';
import { GroupThread } from '../chat/GroupThread';
import { useRealtime, useRealtimeEvent } from '../realtime/RealtimeProvider';
import { ErrorState, EmptyState } from '../components/states';
import { ConversationsSkeleton } from '../components/skeletons';
import { Button, LinkButton } from '../components/Button';
import { ChatsIcon, ChevronIcon, InviteIcon, NewMessageIcon } from '../components/icons';
import { SearchField } from '../components/SearchField';
import { Modal } from '../components/Modal';
import { Avatar } from '../components/Avatar';
import { SendError } from '../reports/SendError';
import { useArrival } from '../lib/motion';
import { GroupAvatar } from '../groups/GroupAvatar';
import { DiscoverGroups } from '../groups/DiscoverGroups';
import { useGroupsChanged } from '../groups/groupsChanged';

// When the realtime socket is live it carries every message instantly, so polling
// is just a slow safety net. When it is NOT connected, we fall back to a brisk
// poll so chat still feels live for everyone.
const CONVO_POLL_LIVE = 30000;
const CONVO_POLL_FALLBACK = 5000;



type Filter = 'all' | 'unread' | 'groups';

/** A group's unread count, as GET /me/groups/unread gives it. */
type GroupUnread = Record<string, number>;

/**
 * When a conversation last moved, as short as it can be said: "now", "5m",
 * "3h", a weekday within the week, a date after that. A list of names needs
 * the time to scan, not to read.
 */
function convoTime(iso: string, t: ReturnType<typeof useT>, locale: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const minutes = Math.max(0, Math.floor((now - then) / 60_000));
  if (minutes < 1) return t('time.justNow');
  if (minutes < 60) return t('time.minutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('time.hours', { count: hours });
  // a browser that has no names for this language's days would print English
  // ones; a count of days and a numeric date read the same in every language
  const named = Intl.DateTimeFormat.supportedLocalesOf([locale]).length > 0;
  const days = Math.floor(hours / 24);
  if (days < 7) return named ? new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(then) : t('time.daysAgo', { count: days });
  return new Intl.DateTimeFormat(named ? locale : 'en-GB', named ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'numeric' }).format(then);
}

/**
 * Messages (/app/messages): every conversation, with a person or a group, in
 * one list — and the friend requests waiting on you above them, because a
 * request is the one thing here that is waiting on you and must not sink
 * under the chatter.
 *
 * The list can be narrowed by name as you type (nothing is fetched for it:
 * it filters what is already here) and by All, Unread and Groups. A new
 * conversation starts from the button at the top, with a friend to choose.
 *
 * On a wide screen the open conversation sits beside the list; on a phone it
 * takes the whole screen, and the tab bar steps aside until you come back.
 */
export function Messages(): React.JSX.Element {
  const t = useT();
  const [params] = useSearchParams();
  const activeId = params.get('to');
  const activeName = params.get('name') ?? undefined;
  const activeGroup = params.get('group');
  // the Groups filter is implied when a group is open, else it's a manual choice
  const [filter, setFilter] = useState<Filter>(activeGroup ? 'groups' : 'all');
  useEffect(() => {
    if (activeGroup) setFilter('groups');
  }, [activeGroup]);
  const [query, setQuery] = useState('');
  const [composing, setComposing] = useState(false);
  // bump to refresh the direct list after the current user sends (their own send
  // isn't pushed back to them over realtime, so the preview would otherwise lag)
  const [dmRefresh, setDmRefresh] = useState(0);
  // stable identity: Thread depends on this inside an effect, so a new function
  // on each render would reset the thread and wipe what is on screen
  const onDmSent = useCallback(() => setDmRefresh((n) => n + 1), []);

  const filters: Array<{ key: Filter; label: string }> = [
    { key: 'all', label: t('chat.filter.all') },
    { key: 'unread', label: t('chat.filter.unread') },
    { key: 'groups', label: t('rail.groups') },
  ];

  return (
    <div className={`container chat-page${activeId || activeGroup ? ' chat-active' : ''}`}>
      <div className="page-header page-header-row">
        <h1 className="page-title">{t('chat.title')}</h1>
        <button
          type="button"
          className="icon-btn icon-btn-lg"
          aria-label={t('chat.newMessage')}
          title={t('chat.newMessage')}
          onClick={() => setComposing(true)}
        >
          <NewMessageIcon size={22} />
        </button>
      </div>

      <div className={`chat-layout${activeId || activeGroup ? ' has-active' : ''}`}>
        <aside className="chat-list" aria-label={t('chat.conversations')}>
          <SearchField
            icon
            className="chat-filter"
            inputClassName="chat-filter-input"
            value={query}
            onValueChange={setQuery}
            placeholder={t('chat.filter.search')}
            aria-label={t('chat.filter.search')}
            autoComplete="off"
          />
          <div className="chat-tabs" role="tablist" aria-label={t('chat.type')}>
            {filters.map((f) => (
              <button
                key={f.key}
                role="tab"
                type="button"
                aria-selected={filter === f.key}
                className={`chip${filter === f.key ? ' active' : ''}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <FriendRequestsRow />
          {filter === 'groups' ? (
            <GroupsList activeGroup={activeGroup} query={query} />
          ) : (
            <Conversations
              activeId={activeId}
              activeGroup={activeGroup}
              refreshKey={dmRefresh}
              unreadOnly={filter === 'unread'}
              query={query}
            />
          )}
        </aside>

        <section className="chat-thread-pane">
          {activeGroup ? (
            <GroupThread key={activeGroup} groupId={activeGroup} />
          ) : activeId ? (
            <DmThread key={activeId} otherId={activeId} otherName={activeName} onSent={onDmSent} />
          ) : (
            <div className="chat-empty">
              <div className="chat-empty-inner">
                <ChatsIcon size={32} />
                <p>{t('chat.pickAConversation')}</p>
                <Button variant="secondary" size="sm" onClick={() => setComposing(true)}>
                  <NewMessageIcon size={16} />
                  {t('chat.newMessage')}
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>

      <Modal open={composing} onClose={() => setComposing(false)} label={t('chat.newMessage')}>
        <NewMessage onChosen={() => setComposing(false)} />
      </Modal>
    </div>
  );
}

/**
 * "Friend requests (2)", above the conversations, while any are waiting.
 *
 * It opens Friends, where each can be accepted or declined with the person in
 * front of you. Nothing is drawn when there are none: an empty row is a row
 * that says nothing.
 */
function FriendRequestsRow(): React.JSX.Element | null {
  const t = useT();
  const { data } = useApiGet<{ requests: UserSummary[] }>('/friends/requests');
  const requests = data?.requests ?? [];
  if (requests.length === 0) return null;
  return (
    <Link to="/app/friends" className="chat-requests">
      <span className="chat-requests-icon" aria-hidden="true">
        <InviteIcon size={20} />
      </span>
      <span className="chat-convo-body">
        <span className="chat-convo-name">{t('chat.requests')}</span>
        <span className="chat-convo-last">
          {requests
            .slice(0, 3)
            .map((r) => r.displayName || r.username)
            .join(', ')}
        </span>
      </span>
      <span className="chat-unread">{requests.length}</span>
      <ChevronIcon size={16} className="list-row-go flip-rtl" />
    </Link>
  );
}

/** One conversation in the list, a person's or a group's. */
function ConvoRow({
  to,
  active,
  avatar,
  name,
  preview,
  when,
  unread,
}: {
  to: string;
  active: boolean;
  avatar: React.ReactNode;
  name: string;
  preview: React.ReactNode;
  when?: string;
  unread: number;
}): React.JSX.Element {
  const t = useT();
  return (
    <Link to={to} className={`chat-convo${active ? ' active' : ''}${unread > 0 ? ' is-unread' : ''}`} aria-current={active ? 'page' : undefined}>
      {avatar}
      <span className="chat-convo-body">
        <span className="chat-convo-top">
          {/* what people wrote and called themselves runs in its own direction */}
          <span className="chat-convo-name" dir="auto">{name}</span>
          {when && <span className="chat-convo-when">{when}</span>}
        </span>
        <span className="chat-convo-bottom">
          <span className="chat-convo-last" dir="auto">{preview}</span>
          {unread > 0 && (
            <span className="chat-unread" aria-label={t('nav.unreadCount', { count: unread })}>
              {unread}
            </span>
          )}
        </span>
      </span>
    </Link>
  );
}

/** Whether a name matches what is typed in the list's own search, ignoring case. */
const matches = (needle: string, ...names: Array<string | null | undefined>): boolean =>
  !needle || names.some((n) => (n ?? '').toLocaleLowerCase().includes(needle));

/** People first, newest on top; your groups after them; narrowed by name and by unread. */
function Conversations({
  activeId,
  activeGroup,
  refreshKey,
  unreadOnly,
  query,
}: {
  activeId: string | null;
  activeGroup: string | null;
  refreshKey: number;
  unreadOnly: boolean;
  query: string;
}): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const locale = useLocale();
  const { state } = useRealtime();
  const [convos, setConvos] = useState<Conversation[] | null>(null);
  const [groups, setGroups] = useState<MyGroup[]>([]);
  const [groupUnread, setGroupUnread] = useState<GroupUnread>({});
  const [error, setError] = useState<string | null>(null);
  const loadedOnce = useRef(false);

  const loadConvos = useCallback(async () => {
    const [res, mine, unread] = await Promise.all([
      client.get<{ conversations: Conversation[] }>('/chat/conversations'),
      client.get<{ groups: MyGroup[] }>('/me/groups'),
      client.get<{ unread: Array<{ groupId: string; unread: number }> }>('/me/groups/unread'),
    ]);
    if (mine.ok) setGroups(mine.data.groups ?? []);
    if (unread.ok) setGroupUnread(Object.fromEntries((unread.data.unread ?? []).map((g) => [g.groupId, g.unread])));
    if (res.ok) {
      setConvos(res.data.conversations ?? []);
      loadedOnce.current = true;
    } else if (!loadedOnce.current) {
      setError(describeError(res.error, t));
    }
  }, [client]);

  useEffect(() => {
    void loadConvos();
    const timer = setInterval(() => void loadConvos(), state === 'open' ? CONVO_POLL_LIVE : CONVO_POLL_FALLBACK);
    return () => clearInterval(timer);
  }, [loadConvos, refreshKey, state]);

  const onDm = useCallback(() => void loadConvos(), [loadConvos]);
  useGroupsChanged(onDm);
  const arriving = useArrival(convos !== null);
  useRealtimeEvent('dm', onDm);
  useRealtimeEvent('dm_read', onDm);
  useRealtimeEvent('group_msg', onDm);

  if (error && convos === null) return <ErrorState message={error} onRetry={() => void loadConvos()} />;
  if (convos === null) return <ConversationsSkeleton />;

  const needle = query.trim().toLocaleLowerCase();
  const people = convos.filter((c) => matches(needle, c.username) && (!unreadOnly || c.unread > 0));
  const rooms = groups.filter((g) => matches(needle, g.name) && (!unreadOnly || (groupUnread[g.id] ?? 0) > 0));

  if (convos.length === 0 && groups.length === 0)
    return (
      <EmptyState
        title={t('chat.noMessagesYet')}
        message={t('chat.noMessagesBody')}
        action={
          <LinkButton to="/app/search" size="sm" className="state-action">
            {t('rail.findPeople')}
          </LinkButton>
        }
      />
    );
  if (people.length === 0 && rooms.length === 0)
    return <p className="muted chat-list-none">{unreadOnly && !needle ? t('chat.allRead') : t('chat.noMatch')}</p>;

  return (
    // the first screenful of conversations rises in once, as the list arrives (styles/motion.css)
    <div className={arriving ? 'list-arrival rise-in' : 'list-arrival'}>
      {people.map((c) => (
        <ConvoRow
          key={c.userId}
          to={`/app/messages?to=${c.userId}&name=${encodeURIComponent(c.username)}`}
          active={c.userId === activeId}
          avatar={<Avatar url={c.avatarUrl} online={c.online} />}
          name={c.username}
          preview={
            <>
              {c.lastFromMe && t('chat.youPrefix')}
              {/* the message in its own direction, apart from "You:" in the page's */}
              <bdi>{messagePreview({ body: c.lastMessage, kind: c.lastKind }, t)}</bdi>
            </>
          }
          when={convoTime(c.lastAt, t, locale)}
          unread={c.unread}
        />
      ))}
      {rooms.map((g) => (
        <ConvoRow
          key={g.id}
          to={`/app/messages?group=${g.id}`}
          active={g.id === activeGroup}
          avatar={<GroupAvatar id={g.id} name={g.name} photoUrl={g.photoUrl} size={40} />}
          name={g.name}
          preview={t('groups.memberCount', { count: g.memberCount })}
          unread={groupUnread[g.id] ?? 0}
        />
      ))}
    </div>
  );
}

/**
 * Starting a conversation: a friend to write to, found by name.
 *
 * Only friends, as everywhere else that reaches somebody — the server would
 * refuse anyone else. With nobody yet, the way to find people instead.
 */
function NewMessage({ onChosen }: { onChosen: () => void }): React.JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useApiGet<{ friends: UserSummary[] }>('/friends?limit=500');
  const [q, setQ] = useState('');
  const friends = data?.friends ?? [];
  const needle = q.trim().toLocaleLowerCase();
  const visible = friends.filter((f) => matches(needle, f.username, f.displayName));

  return (
    <div className="new-message">
      <h2 className="friend-heading" style={{ marginTop: 0 }}>{t('chat.newMessage')}</h2>
      {loading && !data ? (
        <ConversationsSkeleton count={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : friends.length === 0 ? (
        <EmptyState
          title={t('rail.noFriendsYet')}
          message={t('chat.newMessage.noneBody')}
          action={
            <LinkButton to="/app/search" size="sm" className="state-action">
              {t('rail.findPeople')}
            </LinkButton>
          }
        />
      ) : (
        <>
          <SearchField
            icon
            value={q}
            onValueChange={setQ}
            placeholder={t('share.searchFriends')}
            aria-label={t('share.searchFriends')}
            autoComplete="off"
          />
          <ul className="list new-message-list">
            {visible.map((f) => (
              <li key={f.userId} className="list-row">
                <button
                  type="button"
                  className="list-row-main"
                  onClick={() => {
                    onChosen();
                    navigate(`/app/messages?to=${f.userId}&name=${encodeURIComponent(f.username)}`);
                  }}
                >
                  <Avatar url={f.avatarUrl} online={f.online} />
                  <span className="list-row-text">
                    <span className="list-row-title">{f.displayName || f.username}</span>
                    <span className="list-row-sub">@{f.username}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {visible.length === 0 && <p className="muted">{t('chat.noMatch')}</p>}
        </>
      )}
    </div>
  );
}

/** The list of the caller's groups + a way to make or discover one. */
function GroupsList({ activeGroup, query = '' }: { activeGroup: string | null; query?: string }): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const navigate = useNavigate();
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
      setError(describeError(res.error, t));
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  // the group limits, counted from the list the server sent, as it counts them
  const limits = groupLimits(mine ?? []);

  // a new group message can change previews/unread — cheap to refresh the list
  const onGroupMsg = useCallback(() => void load(), [load]);
  useRealtimeEvent('group_msg', onGroupMsg);
  // a group renamed, given a picture, joined or left somewhere on the page
  useGroupsChanged(onGroupMsg);

  return (
    <>
      <div className="chat-list-actions">
        <Button size="sm" onClick={() => setCreating(true)}>
          {t('groups.new')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDiscovering(true)}>
          {t('groups.discover')}
        </Button>
      </div>

      {error && mine === null ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : mine === null ? (
        <ConversationsSkeleton count={4} />
      ) : mine.length === 0 ? (
        <EmptyState title={t('groups.noGroupsYet')} message={t('groups.noGroupsBody')} />
      ) : (
        mine.filter((g) => matches(query.trim().toLocaleLowerCase(), g.name)).map((g) => (
          <Link
            key={g.id}
            to={`/app/messages?group=${g.id}`}
            className={`chat-convo${g.id === activeGroup ? ' active' : ''}`}
          >
            <GroupAvatar id={g.id} name={g.name} photoUrl={g.photoUrl} size={40} />
            <span className="chat-convo-body">
              <span className="chat-convo-top">
                <span className="chat-convo-name" dir="auto">{g.name}</span>
              </span>
              <span className="chat-convo-last">
                {t('groups.memberCount', { count: g.memberCount })}
                {g.privacy === 'invite' ? ` · ${t('groups.inviteGroup')}` : ''}
              </span>
            </span>
          </Link>
        ))
      )}

      <Modal open={creating} onClose={() => setCreating(false)} label={t('groups.new')}>
        <CreateGroupForm
          limit={limits.create}
          onDone={() => {
            setCreating(false);
            void load();
          }}
        />
      </Modal>
      <Modal open={discovering} onClose={() => setDiscovering(false)} label={t('groups.discover')}>
        <DiscoverGroups
          mineIds={new Set((mine ?? []).map((g) => g.id))}
          joinLimit={limits.join}
          onOpen={() => setDiscovering(false)}
          onJoined={(g) => {
            setDiscovering(false);
            void load();
            navigate(`/app/messages?group=${g.id}`);
          }}
          onNew={() => {
            setDiscovering(false);
            setCreating(true);
          }}
        />
      </Modal>
    </>
  );
}

/**
 * Create a new group; the creator becomes owner and lands in its chat. At a
 * group limit (`limit`) the form says which one and what makes room, and has
 * nothing to send, rather than letting the server refuse it.
 */
function CreateGroupForm({ onDone, limit }: { onDone: () => void; limit: LimitDetails | null }): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [privacy, setPrivacy] = useState<'open' | 'invite'>('open');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | ApiError | null>(null);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (name.trim().length < 2 || limit) return;
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
      setErr(res.error.code === 'TRUST_VELOCITY' ? t('groups.newAccountLimit') : res.error);
    }
  }

  return (
    <form className="compose" onSubmit={submit}>
      <h2 className="friend-heading" style={{ marginTop: 0 }}>{t('groups.new')}</h2>
      {limit && (
        <div className="msg" role="status" id="g-limit">
          {limitText(limit, t)}
        </div>
      )}
      <SendError error={err} />
      <div className="field">
        <label className="field-label" htmlFor="g-name">{t('groups.name')}</label>
        <input id="g-name" className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={t('groups.namePlaceholder')} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="g-desc">{t('groups.description')} <span className="muted">{t('groups.optional')}</span></label>
        <input id="g-desc" className="input" value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} placeholder={t('groups.descriptionPlaceholder')} />
      </div>
      <div className="field">
        <span className="field-label">{t('groups.privacy')}</span>
        <div className="chat-tabs">
          <button type="button" className={`chip${privacy === 'open' ? ' active' : ''}`} onClick={() => setPrivacy('open')}>
            {t('groups.open')}
          </button>
          <button type="button" className={`chip${privacy === 'invite' ? ' active' : ''}`} onClick={() => setPrivacy('invite')}>
            {t('groups.inviteOnlyOption')}
          </button>
        </div>
        <span className="field-hint">{privacy === 'open' ? t('groups.privacy.openHint') : t('groups.privacy.inviteHint')}</span>
      </div>
      <Button type="submit" disabled={busy || name.trim().length < 2 || limit !== null} aria-describedby={limit ? 'g-limit' : undefined}>
        {busy ? t('groups.creating') : t('groups.create')}
      </Button>
    </form>
  );
}

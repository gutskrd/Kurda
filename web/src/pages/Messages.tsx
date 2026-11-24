import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { groupLimits, unreadLabel, type LettersHome, type LimitDetails } from '@kurda/shared';
import { useApiGet, useMemoryOwner } from '../lib/useApi';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { lastAnswer, remember } from '../lib/apiMemory';
import { limitText } from '../lib/limits';
import type { ApiError, Conversation, MyGroup, UserSummary } from '../lib/types';
import { messagePreview } from '../chat/messagePreview';
import { PreviewIcon } from '../chat/PreviewIcon';
import { useLocale, useT, type Translate } from '../i18n/I18nProvider';
import { DmThread } from '../chat/DmThread';
import { GroupThread } from '../chat/GroupThread';
import { useRealtime, useRealtimeEvent } from '../realtime/RealtimeProvider';
import { ErrorState, EmptyState } from '../components/states';
import { ConversationsSkeleton } from '../components/skeletons';
import { Button, LinkButton } from '../components/Button';
import { ChatsIcon, ChevronIcon, InviteIcon, NewMessageIcon, UsersIcon } from '../components/icons';
import { SearchField } from '../components/SearchField';
import { Modal } from '../components/Modal';
import { Avatar } from '../components/Avatar';
import { SendError } from '../reports/SendError';
import { useArrival } from '../lib/motion';
import { GroupAvatar } from '../groups/GroupAvatar';
import { membersLine } from '../groups/memberCount';
import { announceGroupsChanged, useGroupsChanged } from '../groups/groupsChanged';
import { pollWhileVisible } from '../lib/pollWhileVisible';
import { BirdBadge } from '../letters/LetterParts';
import { LETTERS_HOME_PATH } from '../letters/useLettersHome';
import { HeldNotice, useAccountHeld } from '../reports/HeldNotice';
import { ParentalNote, ParentalOffPlace, useParentalOff } from '../parental/ParentalNote';

// With the realtime socket live, polling is only a slow safety net; without it a brisk poll keeps chat live. Neither
// runs while the tab is hidden.
const CONVO_POLL_LIVE = 30000;
const CONVO_POLL_FALLBACK = 5000;

type Filter = 'all' | 'unread' | 'groups';

/** A group's unread count, as GET /me/groups/unread gives it. */
type GroupUnread = Record<string, number>;

/** The list as last drawn, and its memory key (lib/apiMemory.ts). */
interface KeptList {
  convos: Conversation[];
  groups: MyGroup[];
  groupUnread: GroupUnread;
}
const LIST_MEMORY = 'messages:list';

/** When a conversation last moved, as short as possible: "now", "5m", "3h", a weekday within the week, then a date. */
function convoTime(iso: string, t: Translate, locale: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const minutes = Math.max(0, Math.floor((now - then) / 60_000));
  if (minutes < 1) return t('time.justNow');
  if (minutes < 60) return t('time.minutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('time.hours', { count: hours });
  // A browser without day names for this language would print English, so fall back to numbers.
  const named = Intl.DateTimeFormat.supportedLocalesOf([locale]).length > 0;
  const days = Math.floor(hours / 24);
  if (days < 7) return named ? new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(then) : t('time.daysAgo', { count: days });
  return new Intl.DateTimeFormat(named ? locale : 'en-GB', named ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'numeric' }).format(then);
}

/**
 * Messages (/app/messages): every conversation, personal or group, in one list, with waiting friend requests above it.
 * The list filters by name as you type (client-side) and by All, Unread and Groups. "New message" and "New group" sit at
 * the top; a new group opens with its add-friends sheet up, since adding friends is the only way anyone joins. On a wide
 * screen the open conversation sits beside the list; on a phone it takes the screen and the tab bar steps aside.
 */
export function Messages(): React.JSX.Element {
  const t = useT();
  // With chats switched off by a teen's parent the server refuses even reading them, so nothing is asked: the calm line
  // stands where the conversations would be, and letters keep their own way in.
  if (useParentalOff('chat')) {
    return (
      <div className="container chat-page">
        <div className="page-header">
          <h1 className="page-title">{t('chat.title')}</h1>
        </div>
        <LettersRow />
        <ParentalOffPlace />
      </div>
    );
  }
  return <Inbox />;
}

function Inbox(): React.JSX.Element {
  const t = useT();
  const [params] = useSearchParams();
  const activeId = params.get('to');
  const activeName = params.get('name') ?? undefined;
  const activeGroup = params.get('group');
  // An open group implies the Groups filter; otherwise it is a manual choice.
  const [filter, setFilter] = useState<Filter>(activeGroup ? 'groups' : 'all');
  useEffect(() => {
    if (activeGroup) setFilter('groups');
  }, [activeGroup]);
  const [query, setQuery] = useState('');
  const [composing, setComposing] = useState(false);
  const [creating, setCreating] = useState(false);
  // The group just made: its thread opens once with the add-friends sheet up.
  const [created, setCreated] = useState<string | null>(null);
  useEffect(() => {
    if (created && created === activeGroup) setCreated(null);
  }, [created, activeGroup]);
  const newGroup = useCallback(() => setCreating(true), []);
  // Bumped to refresh the list after you send, since your own sends are not pushed back over realtime.
  const [dmRefresh, setDmRefresh] = useState(0);
  // Stable identity: Thread depends on it inside an effect, and a new function each render would reset the thread.
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
        <span className="chat-head-actions">
          <Button variant="secondary" size="sm" className="chat-new-group" aria-haspopup="dialog" onClick={newGroup}>
            <UsersIcon size={16} />
            {t('groups.new')}
          </Button>
          <button
            type="button"
            className="icon-btn icon-btn-lg"
            aria-label={t('chat.newMessage')}
            title={t('chat.newMessage')}
            onClick={() => setComposing(true)}
          >
            <NewMessageIcon size={22} />
          </button>
        </span>
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
          <LettersRow />
          {filter === 'groups' ? (
            <GroupsList activeGroup={activeGroup} query={query} onNew={newGroup} />
          ) : (
            <Conversations
              activeId={activeId}
              activeGroup={activeGroup}
              refreshKey={dmRefresh}
              unreadOnly={filter === 'unread'}
              query={query}
              onNewGroup={newGroup}
            />
          )}
        </aside>

        <section className="chat-thread-pane">
          {activeGroup ? (
            <GroupThread key={activeGroup} groupId={activeGroup} openInfo={params.get('info') === 'requests'} addFriends={created === activeGroup} />
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
      <Modal open={creating} onClose={() => setCreating(false)} label={t('groups.new')}>
        <CreateGroupForm
          onCreated={(id) => {
            setCreating(false);
            setCreated(id);
            // The page's lists of groups gain this one.
            announceGroupsChanged();
          }}
        />
      </Modal>
    </div>
  );
}

/** "Friend requests (2)" above the conversations while any wait, opening Friends; nothing when there are none. */
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

/**
 * The way into letters by bird (letters/LettersPage.tsx) atop the conversations: your bird and what is new (a letter to
 * answer, your bird out), or what letters are.
 */
function LettersRow(): React.JSX.Element | null {
  // With letters switched off there is nothing to read here, so nothing is asked.
  return useParentalOff('letters') ? null : <LettersWay />;
}

function LettersWay(): React.JSX.Element | null {
  const t = useT();
  // Read as the window reads it: a plain read would mark letters as landed and use up a bird before the window shows it.
  const { data } = useApiGet<LettersHome>(LETTERS_HOME_PATH);
  // An answer without the shape (a server from before letters) draws no row.
  if (!data || !Array.isArray(data.penPals)) return null;
  const unread = data.penPals.reduce((n, p) => n + p.unread, 0);
  const waiting = data.penPals.find((p) => p.yourTurn);
  // A bird at your window comes first, then a pen pal's letter, then your own bird out.
  const visitor = data.visitor ?? null;
  const line = visitor
    ? t('letters.visitor.title', { name: visitor.person.name })
    : waiting
      ? t('letters.row.yourTurn', { name: waiting.person.name })
      : data.out
        ? t('letters.out.title')
        : t('letters.row.invite');
  return (
    // Gold only while a letter or bird waits on you; otherwise one quiet row.
    <Link to="/app/letters" className={`chat-requests chat-letters${visitor || waiting || unread > 0 ? ' is-waiting' : ''}`}>
      <BirdBadge bird={data.bird} size={48} />
      <span className="chat-convo-body">
        <span className="chat-convo-name">{t('letters.title')}</span>
        <span className="chat-convo-last">{line}</span>
      </span>
      {unread > 0 && <span className="chat-unread">{unread}</span>}
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
          {/* Names people chose run in their own direction. */}
          <span className="chat-convo-name" dir="auto">{name}</span>
          {when && <span className="chat-convo-when">{when}</span>}
        </span>
        <span className="chat-convo-bottom">
          <span className="chat-convo-last" dir="auto">{preview}</span>
          {unread > 0 && (
            <span className="chat-unread" aria-label={t('nav.unreadCount', { count: unreadLabel(unread) })}>
              {unreadLabel(unread)}
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

/** People first, newest on top, then your groups; filtered by name and unread. */
function Conversations({
  activeId,
  activeGroup,
  refreshKey,
  unreadOnly,
  query,
  onNewGroup,
}: {
  activeId: string | null;
  activeGroup: string | null;
  refreshKey: number;
  unreadOnly: boolean;
  query: string;
  /** Starts a group: offered where there is nothing yet, beside finding people. */
  onNewGroup: () => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const locale = useLocale();
  const { state } = useRealtime();
  // The list as last drawn in this tab (lib/apiMemory.ts), shown at once and refreshed behind.
  const who = useMemoryOwner();
  const [kept] = useState(() => (who ? (lastAnswer<KeptList>(who, LIST_MEMORY)?.data ?? null) : null));
  const [convos, setConvos] = useState<Conversation[] | null>(kept?.convos ?? null);
  const [groups, setGroups] = useState<MyGroup[]>(kept?.groups ?? []);
  const [groupUnread, setGroupUnread] = useState<GroupUnread>(kept?.groupUnread ?? {});
  const [error, setError] = useState<string | null>(null);
  const loadedOnce = useRef(kept !== null);

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
    return pollWhileVisible(() => void loadConvos(), state === 'open' ? CONVO_POLL_LIVE : CONVO_POLL_FALLBACK);
  }, [loadConvos, refreshKey, state]);

  // What the list holds now is what returning to Messages shows.
  useEffect(() => {
    if (who && convos !== null) remember<KeptList>(who, LIST_MEMORY, { convos, groups, groupUnread });
  }, [who, convos, groups, groupUnread]);

  const onDm = useCallback(() => void loadConvos(), [loadConvos]);
  useGroupsChanged(onDm);
  // Only a list that arrives rises in, once per tab; one from memory is simply there.
  const arriving = useArrival(convos !== null, 'messages');
  useRealtimeEvent('dm', onDm);
  useRealtimeEvent('dm_read', onDm);
  useRealtimeEvent('group_msg', onDm);
  // A chat cleared for everyone has nothing unread left.
  useRealtimeEvent('group_chat_cleared', onDm);

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
          <span className="state-action chat-empty-actions">
            <LinkButton to="/app/search" size="sm">
              {t('rail.findPeople')}
            </LinkButton>
            <Button variant="secondary" size="sm" aria-haspopup="dialog" onClick={onNewGroup}>
              {t('groups.new')}
            </Button>
          </span>
        }
      />
    );
  if (people.length === 0 && rooms.length === 0)
    return <p className="muted chat-list-none">{unreadOnly && !needle ? t('chat.allRead') : t('chat.noMatch')}</p>;

  return (
    // The first screenful rises in once as the list arrives (styles/motion.css).
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
              {/* A gift or game card shows the app's icon before its words. */}
              <PreviewIcon kind={c.lastKind} />
              {/* The message in its own direction, apart from "You:" in the page's. */}
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
          avatar={<GroupAvatar name={g.name} photoUrl={g.photoUrl} size={48} />}
          name={g.name}
          preview={membersLine(t, g.memberCount)}
          unread={groupUnread[g.id] ?? 0}
        />
      ))}
    </div>
  );
}

/** Starting a conversation with a friend found by name; only friends, as the server requires, else the way to find people. */
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

/** The caller's groups only, since groups are private; with none, the way to start one. */
function GroupsList({ activeGroup, query = '', onNew }: { activeGroup: string | null; query?: string; onNew: () => void }): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const [mine, setMine] = useState<MyGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  // A new group message can change previews and unread counts, so refresh.
  const onGroupMsg = useCallback(() => void load(), [load]);
  useRealtimeEvent('group_msg', onGroupMsg);
  // A group made, renamed, given a picture or left elsewhere on the page.
  useGroupsChanged(onGroupMsg);

  return (
    <>
      {error && mine === null ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : mine === null ? (
        <ConversationsSkeleton count={4} />
      ) : mine.length === 0 ? (
        <EmptyState
          title={t('groups.noGroupsYet')}
          message={t('groups.noGroupsBody')}
          action={
            <Button size="sm" className="state-action" aria-haspopup="dialog" onClick={onNew}>
              {t('groups.new')}
            </Button>
          }
        />
      ) : (
        mine.filter((g) => matches(query.trim().toLocaleLowerCase(), g.name)).map((g) => (
          <Link
            key={g.id}
            to={`/app/messages?group=${g.id}`}
            className={`chat-convo${g.id === activeGroup ? ' active' : ''}`}
          >
            <GroupAvatar name={g.name} photoUrl={g.photoUrl} size={48} />
            <span className="chat-convo-body">
              <span className="chat-convo-top">
                <span className="chat-convo-name" dir="auto">{g.name}</span>
              </span>
              <span className="chat-convo-last">{membersLine(t, g.memberCount)}</span>
            </span>
          </Link>
        ))
      )}
    </>
  );
}

/**
 * Starts a group with just a name (a description now or later); its maker owns it and goes to its chat, where the
 * caller opens the add-friends sheet (`onCreated`). At a group limit the form says which and what makes room instead of
 * sending, counting the caller's groups as the server does.
 */
function CreateGroupForm({ onCreated }: { onCreated: (id: string) => void }): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const navigate = useNavigate();
  const { data: mine } = useApiGet<{ groups: MyGroup[] }>('/me/groups');
  const limit: LimitDetails | null = groupLimits(mine?.groups ?? []).create;
  // Starting a group is joining one, which a held account waits for, and which a teen's parent may have switched off.
  const held = useAccountHeld();
  const chatOff = useParentalOff('chat');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | ApiError | null>(null);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (busy || name.trim().length < 2 || limit || held || chatOff) return;
    setBusy(true);
    setErr(null);
    const res = await client.post<{ id: string }>('/groups', {
      name: name.trim(),
      description: description.trim() || undefined,
    });
    setBusy(false);
    if (res.ok) {
      onCreated(res.data.id);
      navigate(`/app/messages?group=${res.data.id}`);
    } else {
      setErr(res.error.code === 'TRUST_VELOCITY' ? t('groups.newAccountLimit') : res.error);
    }
  }

  return (
    <form className="compose" onSubmit={submit}>
      <h2 className="friend-heading" style={{ marginTop: 0 }}>{t('groups.new')}</h2>
      {held ? (
        <HeldNotice />
      ) : chatOff ? (
        <ParentalNote />
      ) : (
        limit && (
          <div className="msg" role="status" id="g-limit">
            {limitText(limit, t)}
          </div>
        )
      )}
      <SendError error={err} />
      <div className="field">
        <label className="field-label" htmlFor="g-name">{t('groups.name')}</label>
        <input id="g-name" className="input" value={name} maxLength={60} autoFocus onChange={(e) => setName(e.target.value)} placeholder={t('groups.namePlaceholder')} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="g-desc">{t('groups.description')} <span className="muted">{t('groups.optional')}</span></label>
        <input id="g-desc" className="input" value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} placeholder={t('groups.descriptionPlaceholder')} />
      </div>
      <p className="field-hint">{t('groups.privateHint')}</p>
      <Button type="submit" disabled={busy || held || chatOff || name.trim().length < 2 || limit !== null} aria-describedby={limit && !held ? 'g-limit' : undefined}>
        {busy ? t('groups.creating') : t('groups.create')}
      </Button>
    </form>
  );
}

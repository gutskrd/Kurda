import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from '../components/Avatar';
import { ChatsIcon, CloseIcon, GameIcon, ChevronIcon } from '../components/icons';
import { DmThread } from '../chat/DmThread';
import { GroupThread } from '../chat/GroupThread';
import { RailStrip } from './RailStrip';
import { badgeLabel, elapsed, lastSeen } from './time';
import { useRail, useRailPresent } from './RailProvider';
import type { RailFriend, SocialRailData } from './useSocialRail';
import { RailToasts } from './RailToasts';
import { useT } from '../i18n/I18nProvider';

/**
 * What the dock beside the rail is showing.
 *
 * One slot, not two: opening a group while a person's chat is docked should
 * replace it, the way clicking another conversation does. Two docks would
 * overlap, since both are anchored to the same edge.
 */
export type DockTarget =
  | { kind: 'dm'; id: string; name: string }
  | { kind: 'group'; id: string; name: string };

/** Friends split the way you actually look for them. */
interface Buckets {
  playing: RailFriend[];
  online: RailFriend[];
  offline: RailFriend[];
}

function bucket(friends: RailFriend[]): Buckets {
  const playing: RailFriend[] = [];
  const online: RailFriend[] = [];
  const offline: RailFriend[] = [];
  for (const f of friends) {
    if (f.activity) playing.push(f);
    else if (f.online) online.push(f);
    else offline.push(f);
  }
  // the longest-running game first among players; most recently around first
  // among the rest, so the top of each list is the person most worth a message
  playing.sort((a, b) => new Date(a.activity!.since).getTime() - new Date(b.activity!.since).getTime());
  offline.sort((a, b) => (b.lastSeenAt ?? '').localeCompare(a.lastSeenAt ?? ''));
  return { playing, online, offline };
}

/**
 * The social rail: your people, down the side of the app.
 *
 * Modelled on the one every game client has, because it solves a real problem —
 * an invite that expires in two minutes is useless on a page you have to
 * navigate to. It is a fixed column on a wide screen and a drawer on a narrow
 * one, and the same component is both: one set of behaviour to get right.
 */
export function SocialRail(): React.JSX.Element | null {
  const { status } = useAuth();
  const t = useT();
  const present = useRailPresent();
  const { data, loading, arrivals, dismiss, refresh, open, setOpen, collapsed, setCollapsed } = useRail();
  /** the conversation docked beside the rail — a person or a group, if any */
  const [dock, setDock] = useState<DockTarget | null>(null);

  if (!present || status !== 'signedIn') return null;

  return (
    <>
      {/* the scrim only exists on narrow screens, where the rail is a drawer */}
      {open && <div className="rail-scrim" onClick={() => setOpen(false)} aria-hidden />}

      <aside
        className={`social-rail${open ? ' is-open' : ''}${collapsed ? ' is-collapsed' : ''}`}
        aria-label={t('rail.title')}
      >
        <div className="rail-head">
          {/* on a wide screen this collapses the column to the strip; the drawer
              has no room for it and hides it in CSS */}
          <button
            type="button"
            className="rail-fold"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? t('rail.expandPanel') : t('rail.collapsePanel')}
            aria-expanded={!collapsed}
            title={collapsed ? t('rail.expand') : t('rail.collapse')}
          >
            <ChevronIcon size={16} className={collapsed ? 'rail-fold-arrow' : 'rail-fold-arrow is-open'} />
          </button>
          <span className="rail-title">{t('rail.title')}</span>
          <button type="button" className="rail-close" onClick={() => setOpen(false)} aria-label={t('rail.closePanel')}>
            <CloseIcon size={18} />
          </button>
        </div>

        {/*
          * Both are rendered and CSS picks one. The folded state belongs to the
          * fixed column; a drawer that opened to a strip of icons would be a
          * narrow screen giving up its width for nothing. Choosing in JS would
          * mean a media query in two places that could disagree.
          */}
        <RailStrip data={data} onExpand={() => setCollapsed(false)} />
        <div className="rail-body">
          {loading ? <p className="rail-empty">{t('common.loading')}</p> : <RailContent data={data} onActed={refresh} onChat={setDock} />}
        </div>
      </aside>

      {/*
        A conversation docked beside the rail, on a wide screen only.

        The whole point of the rail is that reaching someone should not cost you
        the page you are on. Sending "good luck" should not mean leaving the wall
        you were reading, and on a narrow screen there is no room for two columns
        — so there it stays a link to the messages page.
      */}
      {/* the dock is anchored to the rail's edge, so it has to know which width
          the rail is currently at */}
      {dock?.kind === 'dm' && (
        <DmThread
          key={dock.id}
          className={`rail-chat${collapsed ? ' is-tight' : ''}`}
          otherId={dock.id}
          otherName={dock.name}
          onSent={refresh}
          onClose={() => setDock(null)}
        />
      )}
      {dock?.kind === 'group' && (
        <GroupThread
          key={dock.id}
          className={`rail-chat${collapsed ? ' is-tight' : ''}`}
          groupId={dock.id}
          onClose={() => setDock(null)}
        />
      )}

      <RailToasts arrivals={arrivals} onDismiss={dismiss} onOpen={() => setOpen(true)} />
    </>
  );
}

function RailContent({ data, onActed, onChat }: { data: SocialRailData; onActed: () => void; onChat?: (target: DockTarget) => void }): React.JSX.Element {
  const t = useT();
  const buckets = useMemo(() => bucket(data.friends), [data.friends]);
  const hasWaiting = data.challenges.length > 0 || data.requests.length > 0;

  return (
    <>
      {hasWaiting && (
        <Section title={t('rail.waitingOnYou')} count={data.challenges.length + data.requests.length}>
          {data.challenges.map((c) => (
            <ChallengeCard key={c.userId} who={c} onActed={onActed} />
          ))}
          {data.requests.map((r) => (
            <RequestCard key={r.userId} who={r} onActed={onActed} />
          ))}
        </Section>
      )}

      <Section title={t('rail.inAGame')} count={buckets.playing.length} hideWhenEmpty>
        {buckets.playing.map((f) => (
          <FriendRow key={f.userId} friend={f} onChat={onChat} />
        ))}
      </Section>

      <Section title={t('profile.online')} count={buckets.online.length}>
        {buckets.online.length === 0 ? (
          <p className="rail-empty">{t('rail.nobodyRightNow')}</p>
        ) : (
          buckets.online.map((f) => <FriendRow key={f.userId} friend={f} onChat={onChat} />)
        )}
      </Section>

      <Section title={t('rail.offline')} count={buckets.offline.length} collapsible defaultOpen={false} hideWhenEmpty>
        {buckets.offline.map((f) => (
          <FriendRow key={f.userId} friend={f} onChat={onChat} />
        ))}
      </Section>

      <Section title={t('rail.groups')} count={data.groups.length} hideWhenEmpty>
        {data.groups.map((g) => (
          <div key={g.id} className="rail-row rail-group">
            {/* the name goes to the page, for when you want the whole roster and
                the members panel; the bubble docks it, like a friend's does */}
            <Link to={`/app/messages?group=${g.id}`} className="rail-row-link">
              <span className="rail-group-mark" aria-hidden>{g.name.slice(0, 1).toUpperCase()}</span>
              <span className="rail-row-text">
                <span className="rail-row-name">{g.name}</span>
                <span className="rail-row-sub">{t('rail.members', { count: g.memberCount.toLocaleString() })}</span>
              </span>
            </Link>
            {g.unread > 0 && <span className="rail-badge">{badgeLabel(g.unread)}</span>}
            {onChat && (
              <button
                type="button"
                className="rail-friend-chat"
                aria-label={t('rail.messageWho', { name: g.name })}
                title={t('rail.messageWho', { name: g.name })}
                onClick={() => onChat({ kind: 'group', id: g.id, name: g.name })}
              >
                <ChatsIcon size={16} />
              </button>
            )}
          </div>
        ))}
      </Section>

      <Section title={t('rail.recent')} count={data.notifications.length} collapsible defaultOpen={false} hideWhenEmpty>
        <Notifications items={data.notifications} onActed={onActed} />
      </Section>

      {data.friends.length === 0 && (
        <p className="rail-empty">
          {t('rail.noFriendsYet')} <Link to="/app/friends" className="link">{t('rail.findPeople')}</Link>
        </p>
      )}
    </>
  );
}

function Section({
  title,
  count,
  children,
  collapsible = false,
  defaultOpen = true,
  hideWhenEmpty = false,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  hideWhenEmpty?: boolean;
}): React.JSX.Element | null {
  const [open, setOpen] = useState(defaultOpen);
  if (hideWhenEmpty && count === 0) return null;

  const head = (
    <>
      <span className="rail-section-name">{title}</span>
      <span className="rail-section-count">{count}</span>
    </>
  );

  return (
    <section className="rail-section">
      {collapsible ? (
        <button type="button" className="rail-section-head is-button" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <ChevronIcon size={14} className={open ? 'rail-chevron is-open' : 'rail-chevron'} />
          {head}
        </button>
      ) : (
        <div className="rail-section-head">{head}</div>
      )}
      {(!collapsible || open) && <div className="rail-section-body">{children}</div>}
    </section>
  );
}

/** One friend: who they are, and what they are doing about it. */
function FriendRow({ friend, onChat }: { friend: RailFriend; onChat?: (target: DockTarget) => void }): React.JSX.Element {
  // a live game needs a clock that moves; a static "4m" that never changes reads
  // as stale within a minute of looking at it
  const t = useT();
  const [, tick] = useState(0);
  useEffect(() => {
    if (!friend.activity) return;
    const timer = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, [friend.activity]);

  const state = friend.activity ? 'playing' : friend.online ? 'online' : 'offline';
  const sub = friend.activity
    ? `${friend.activity.game} · ${elapsed(friend.activity.since, t)}`
    : friend.online
      ? t('profile.online')
      : lastSeen(friend.lastSeenAt, t);

  const name = friend.displayName || friend.username;

  return (
    <div className="rail-row rail-friend">
      <Link to={`/app/users/${friend.userId}`} className="rail-friend-who">
        <span className="rail-avatar">
          <Avatar url={friend.avatarUrl} glyphSize={16} />
          <span className={`rail-dot is-${state}`} aria-hidden />
        </span>
        <span className="rail-row-text">
          <span className="rail-row-name">{name}</span>
          <span className={`rail-row-sub${friend.activity ? ' is-playing' : ''}`}>
            {friend.activity && <GameIcon size={12} />}
            {sub}
          </span>
        </span>
      </Link>

      {/*
        On a wide screen this docks the conversation beside the rail; on a narrow
        one there is no room for a second column, so it is a link to the messages
        page. Same button, two behaviours, chosen by whether a dock is offered.
      */}
      {onChat ? (
        <button
          type="button"
          className="rail-friend-chat"
          onClick={() => onChat({ kind: 'dm', id: friend.userId, name })}
          aria-label={t('rail.messageWho', { name })}
          title={t('rail.messageWho', { name })}
        >
          <ChatsIcon size={16} />
        </button>
      ) : (
        <Link
          to={`/app/messages?to=${friend.userId}&name=${encodeURIComponent(friend.username)}`}
          className="rail-friend-chat"
          aria-label={t('rail.messageWho', { name })}
          title={t('rail.messageWho', { name })}
        >
          <ChatsIcon size={16} />
        </Link>
      )}
    </div>
  );
}

/** A game invite, which expires — so it leads with Accept. */
function ChallengeCard({ who, onActed }: { who: RailFriend; onActed: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function respond(accept: boolean): Promise<void> {
    setBusy(true);
    const res = accept
      ? await client.post<{ roomId: string }>(`/challenges/${who.userId}/accept`)
      : await client.post(`/challenges/${who.userId}/decline`);
    setBusy(false);
    onActed();
    if (accept && res.ok) navigate('/app/games');
  }

  return (
    <div className="rail-card rail-card-in">
      <span className="rail-avatar">
        <Avatar url={who.avatarUrl} glyphSize={16} />
      </span>
      <span className="rail-row-text">
        <span className="rail-row-name">{who.displayName || who.username}</span>
        <span className="rail-row-sub">{t('rail.invitedYouToPlay')}</span>
      </span>
      <span className="rail-card-actions">
        <button type="button" className="rail-act is-yes" disabled={busy} onClick={() => void respond(true)}>
          Accept
        </button>
        <button type="button" className="rail-act" disabled={busy} onClick={() => void respond(false)}>
          Decline
        </button>
      </span>
    </div>
  );
}

function RequestCard({ who, onActed }: { who: RailFriend; onActed: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const [busy, setBusy] = useState(false);

  async function respond(accept: boolean): Promise<void> {
    setBusy(true);
    await client.post(`/friends/requests/${who.userId}/${accept ? 'accept' : 'decline'}`);
    setBusy(false);
    onActed();
  }

  return (
    <div className="rail-card rail-card-in">
      <span className="rail-avatar">
        <Avatar url={who.avatarUrl} glyphSize={16} />
      </span>
      <span className="rail-row-text">
        <span className="rail-row-name">{who.displayName || who.username}</span>
        <span className="rail-row-sub">{t('rail.wantsToBeFriends')}</span>
      </span>
      <span className="rail-card-actions">
        <button type="button" className="rail-act is-yes" disabled={busy} onClick={() => void respond(true)}>
          Accept
        </button>
        <button type="button" className="rail-act" disabled={busy} onClick={() => void respond(false)}>
          Decline
        </button>
      </span>
    </div>
  );
}

/**
 * The notification tail, and a way to be done with it.
 *
 * A notification you have read but cannot clear is a badge that never goes
 * away, so each one can be dismissed and the whole list can be cleared at once.
 * Dismissing marks it read on the server — there is no separate "ignored"
 * state, and inventing one would mean a second thing to keep in step.
 */
function Notifications({
  items,
  onActed,
}: {
  items: SocialRailData['notifications'];
  onActed: () => void;
}): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const [going, setGoing] = useState<Set<string>>(new Set());
  const unread = items.filter((n) => n.readAt === null).length;

  async function dismiss(id: string): Promise<void> {
    setGoing((prev) => new Set(prev).add(id));
    await client.post(`/me/notifications/${id}/read`);
    onActed();
  }

  async function dismissAll(): Promise<void> {
    await client.post('/me/notifications/read-all');
    onActed();
  }

  return (
    <>
      {items.map((n) => (
        <div
          key={n.id}
          className={`rail-note${n.readAt === null && !going.has(n.id) ? ' is-unread' : ''}`}
        >
          <span className="rail-note-title">{n.title}</span>
          {n.body && <span className="rail-note-body">{n.body}</span>}
          <span className="rail-note-foot">
            <time className="rail-note-when" dateTime={n.createdAt}>{lastSeen(n.createdAt, t)}</time>
            {n.readAt === null && !going.has(n.id) && (
              <button
                type="button"
                className="rail-note-dismiss"
                aria-label={t('rail.dismissWhat', { what: n.title })}
                onClick={() => void dismiss(n.id)}
              >
                <CloseIcon size={13} />
              </button>
            )}
          </span>
        </div>
      ))}

      {unread > 1 && (
        <button type="button" className="rail-note-clear" onClick={() => void dismissAll()}>
          Dismiss all
        </button>
      )}
    </>
  );
}

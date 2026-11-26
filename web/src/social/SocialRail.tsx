import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { unreadLabel } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from '../components/Avatar';
import { CloseButton } from '../components/CloseButton';
import { ChatsIcon, GameIcon, ChevronIcon } from '../components/icons';
import { RailStrip } from './RailStrip';
import { elapsed, lastSeen } from './time';
import { useRail, useRailPresent } from './RailProvider';
import { railEdits, toastsHere, type RailFriend, type SocialRailData } from './useSocialRail';
import { RailToasts } from './RailToasts';
import { RequestTicket } from './FriendTickets';
import { useT } from '../i18n/I18nProvider';
import { GroupAvatar } from '../groups/GroupAvatar';
import { useOptimisticSend, type ShownChange } from '../lib/optimistic';
import { lazyPart } from '../lib/lazyPart';

// The docked conversations load apart from the rail, and are fetched before anyone opens one (lib/lazyPart.ts).
const DmThread = lazyPart(() => import('../chat/DmThread').then((m) => m.DmThread));
const GroupThread = lazyPart(() => import('../chat/GroupThread').then((m) => m.GroupThread));

/** What the dock beside the rail shows: one slot, so opening another conversation replaces it. */
type DockTarget =
  | { kind: 'dm'; id: string; name: string }
  | { kind: 'group'; id: string; name: string };

/** Friends split by what they are doing. */
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
  // Players by longest-running game; the rest by most recently around.
  playing.sort((a, b) => new Date(a.activity!.since).getTime() - new Date(b.activity!.since).getTime());
  offline.sort((a, b) => (b.lastSeenAt ?? '').localeCompare(a.lastSeenAt ?? ''));
  return { playing, online, offline };
}

/**
 * The social rail: friends and groups down the side of the app, so short-lived invites are seen from any page. A fixed
 * column on a wide screen and a drawer on a narrow one, from the same component.
 */
export function SocialRail(): React.JSX.Element | null {
  const { status } = useAuth();
  const t = useT();
  const present = useRailPresent();
  const { data, loading, arrivals, dismiss, refresh, open, setOpen, collapsed, setCollapsed } = useRail();
  /** The conversation docked beside the rail, a person or a group, if any. */
  const [dock, setDock] = useState<DockTarget | null>(null);
  // A letter is not announced where it is already shown.
  const { pathname } = useLocation();
  const toasts = useMemo(() => toastsHere(arrivals, pathname), [arrivals, pathname]);

  if (!present || status !== 'signedIn') return null;

  return (
    <>
      {/* The scrim exists only on narrow screens, where the rail is a drawer. */}
      {open && <div className="rail-scrim" onClick={() => setOpen(false)} aria-hidden />}

      <aside
        className={`social-rail${open ? ' is-open' : ''}${collapsed ? ' is-collapsed' : ''}`}
        aria-label={t('rail.title')}
      >
        <div className="rail-head">
          {/* Collapses the column to the strip on a wide screen; the drawer hides it in CSS. */}
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
          <CloseButton className="rail-close is-inline" label={t('rail.closePanel')} onClick={() => setOpen(false)} />
        </div>

        {/* Both render and CSS picks one, so the breakpoint lives in one place; the drawer never folds. */}
        <RailStrip data={data} onExpand={() => setCollapsed(false)} />
        <div className="rail-body">
          {loading ? <p className="rail-empty">{t('common.loading')}</p> : <RailContent data={data} onActed={refresh} onChat={setDock} />}
        </div>
      </aside>

      {/* A conversation docked beside the rail on a wide screen, anchored to the rail's current edge. */}
      <Suspense fallback={null}>
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
      </Suspense>

      <RailToasts arrivals={toasts} onDismiss={dismiss} onOpen={() => setOpen(true)} />
    </>
  );
}

function RailContent({ data, onActed, onChat }: { data: SocialRailData; onActed: () => void; onChat?: (target: DockTarget) => void }): React.JSX.Element {
  const t = useT();
  const buckets = useMemo(() => bucket(data.friends), [data.friends]);
  // Requests answered elsewhere leave at once; one answered here stays for its ticket's moment.
  const answeringHere = useRef(new Set<string>());
  const waiting = data.requests.filter((r) => !r.answered || answeringHere.current.has(r.userId));
  // Game invites have their own banner (play/InviteBanner.tsx), so `challenges` is not drawn.
  const hasWaiting = waiting.length > 0;

  return (
    <>
      {hasWaiting && (
        <Section title={t('rail.waitingOnYou')} count={waiting.filter((r) => !r.answered).length}>
          {waiting.map((r) => (
            <RequestCard key={r.userId} who={r} here={answeringHere.current} onActed={onActed} />
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
            {/* The name opens the full page; the bubble docks the conversation. */}
            <Link to={`/app/messages?group=${g.id}`} className="rail-row-link">
              <GroupAvatar name={g.name} photoUrl={g.photoUrl} size={28} />
              <span className="rail-row-text">
                <span className="rail-row-name">{g.name}</span>
                <span className="rail-row-sub">{t('rail.members', { count: g.memberCount.toLocaleString() })}</span>
              </span>
            </Link>
            {g.unread > 0 && <span className="rail-badge">{unreadLabel(g.unread)}</span>}
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

      {data.friends.length === 0 && (
        <p className="rail-empty">
          {t('rail.noFriendsYet')} <Link to="/app/search" className="link">{t('rail.findPeople')}</Link>
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

/** One friend: who they are and what they are doing. */
function FriendRow({ friend, onChat }: { friend: RailFriend; onChat?: (target: DockTarget) => void }): React.JSX.Element {
  // A live game's elapsed time must keep ticking.
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

      {/* Docks the conversation when a dock is offered (wide screens); otherwise links to the messages page. */}
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

/**
 * A friend request waiting on you, as a friendship ticket (social/FriendTickets.tsx). The answer counts at once
 * everywhere (`railEdits.requestAnswered`); `here` keeps this ticket on the rail until its moment is over.
 */
function RequestCard({ who, here, onActed }: { who: RailFriend; here: Set<string>; onActed: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const { adjust } = useRail();
  const sendShown = useOptimisticSend();
  const answered = useRef<ShownChange | null>(null);
  return (
    <RequestTicket
      person={who}
      compact
      onAnswer={async (accept) => {
        here.add(who.userId);
        const change = adjust(railEdits.requestAnswered(who.userId));
        answered.current = change;
        const undo = (): void => {
          here.delete(who.userId);
          change.undo();
        };
        return (await sendShown(() => client.post(`/friends/requests/${who.userId}/${accept ? 'accept' : 'decline'}`), { undo })).ok;
      }}
      onSettled={() => {
        here.delete(who.userId);
        answered.current?.keep?.();
        onActed();
      }}
    />
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from '../components/Avatar';
import { CloseIcon, GameIcon, ChevronIcon } from '../components/icons';
import { badgeLabel, elapsed, lastSeen } from './time';
import { useRail, useRailPresent } from './RailProvider';
import type { RailFriend, SocialRailData } from './useSocialRail';
import { RailToasts } from './RailToasts';

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
  const present = useRailPresent();
  const { data, loading, arrivals, dismiss, refresh, open, setOpen } = useRail();

  if (!present || status !== 'signedIn') return null;

  return (
    <>
      {/* the scrim only exists on narrow screens, where the rail is a drawer */}
      {open && <div className="rail-scrim" onClick={() => setOpen(false)} aria-hidden />}

      <aside className={`social-rail${open ? ' is-open' : ''}`} aria-label="Social">
        <div className="rail-head">
          <span className="rail-title">Social</span>
          <button type="button" className="rail-close" onClick={() => setOpen(false)} aria-label="Close social panel">
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="rail-body">
          {loading ? <p className="rail-empty">Loading…</p> : <RailContent data={data} onActed={refresh} />}
        </div>
      </aside>

      <RailToasts arrivals={arrivals} onDismiss={dismiss} onOpen={() => setOpen(true)} />
    </>
  );
}

function RailContent({ data, onActed }: { data: SocialRailData; onActed: () => void }): React.JSX.Element {
  const buckets = useMemo(() => bucket(data.friends), [data.friends]);
  const hasWaiting = data.challenges.length > 0 || data.requests.length > 0;

  return (
    <>
      {hasWaiting && (
        <Section title="Waiting on you" count={data.challenges.length + data.requests.length}>
          {data.challenges.map((c) => (
            <ChallengeCard key={c.userId} who={c} onActed={onActed} />
          ))}
          {data.requests.map((r) => (
            <RequestCard key={r.userId} who={r} onActed={onActed} />
          ))}
        </Section>
      )}

      <Section title="In a game" count={buckets.playing.length} hideWhenEmpty>
        {buckets.playing.map((f) => (
          <FriendRow key={f.userId} friend={f} />
        ))}
      </Section>

      <Section title="Online" count={buckets.online.length}>
        {buckets.online.length === 0 ? (
          <p className="rail-empty">Nobody right now.</p>
        ) : (
          buckets.online.map((f) => <FriendRow key={f.userId} friend={f} />)
        )}
      </Section>

      <Section title="Offline" count={buckets.offline.length} collapsible defaultOpen={false} hideWhenEmpty>
        {buckets.offline.map((f) => (
          <FriendRow key={f.userId} friend={f} />
        ))}
      </Section>

      <Section title="Groups" count={data.groups.length} hideWhenEmpty>
        {data.groups.map((g) => (
          <Link key={g.id} to="/app/messages" className="rail-row rail-group">
            <span className="rail-group-mark" aria-hidden>{g.name.slice(0, 1).toUpperCase()}</span>
            <span className="rail-row-text">
              <span className="rail-row-name">{g.name}</span>
              <span className="rail-row-sub">{g.memberCount.toLocaleString()} members</span>
            </span>
            {g.unread > 0 && <span className="rail-badge">{badgeLabel(g.unread)}</span>}
          </Link>
        ))}
      </Section>

      <Section title="Recent" count={data.notifications.length} collapsible defaultOpen={false} hideWhenEmpty>
        {data.notifications.map((n) => (
          <div key={n.id} className={`rail-note${n.readAt === null ? ' is-unread' : ''}`}>
            <span className="rail-note-title">{n.title}</span>
            {n.body && <span className="rail-note-body">{n.body}</span>}
            <time className="rail-note-when" dateTime={n.createdAt}>{lastSeen(n.createdAt)}</time>
          </div>
        ))}
      </Section>

      {data.friends.length === 0 && (
        <p className="rail-empty">
          No friends yet. <Link to="/app/friends" className="link">Find people</Link>
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
function FriendRow({ friend }: { friend: RailFriend }): React.JSX.Element {
  // a live game needs a clock that moves; a static "4m" that never changes reads
  // as stale within a minute of looking at it
  const [, tick] = useState(0);
  useEffect(() => {
    if (!friend.activity) return;
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [friend.activity]);

  const state = friend.activity ? 'playing' : friend.online ? 'online' : 'offline';
  const sub = friend.activity
    ? `${friend.activity.game} · ${elapsed(friend.activity.since)}`
    : friend.online
      ? 'Online'
      : lastSeen(friend.lastSeenAt);

  return (
    <Link to={`/app/users/${friend.userId}`} className="rail-row rail-friend">
      <span className="rail-avatar">
        <Avatar url={friend.avatarUrl} glyphSize={16} />
        <span className={`rail-dot is-${state}`} aria-hidden />
      </span>
      <span className="rail-row-text">
        <span className="rail-row-name">{friend.displayName || friend.username}</span>
        <span className={`rail-row-sub${friend.activity ? ' is-playing' : ''}`}>
          {friend.activity && <GameIcon size={12} />}
          {sub}
        </span>
      </span>
    </Link>
  );
}

/** A game invite, which expires — so it leads with Accept. */
function ChallengeCard({ who, onActed }: { who: RailFriend; onActed: () => void }): React.JSX.Element {
  const { client } = useAuth();
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
        <span className="rail-row-sub">Invited you to play</span>
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
        <span className="rail-row-sub">Wants to be friends</span>
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

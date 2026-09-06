import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';

export interface LiveActivity {
  game: string;
  since: string;
}

export interface RailFriend {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  online: boolean;
  lastSeenAt: string | null;
  activity: LiveActivity | null;
}

export interface RailGroup {
  id: string;
  name: string;
  memberCount: number;
  unread: number;
}

export interface RailNotification {
  id: string;
  category: string;
  title: string;
  body: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface SocialRailData {
  friends: RailFriend[];
  requests: RailFriend[];
  challenges: RailFriend[];
  groups: RailGroup[];
  notifications: RailNotification[];
  unread: { notifications: number; groups: number; requests: number; challenges: number };
}

/** Something that just showed up, worth a toast. */
export interface Arrival {
  key: string;
  kind: 'challenge' | 'request' | 'notification';
  title: string;
  body: string;
  who: RailFriend | null;
}

const EMPTY: SocialRailData = {
  friends: [],
  requests: [],
  challenges: [],
  groups: [],
  notifications: [],
  unread: { notifications: 0, groups: 0, requests: 0, challenges: 0 },
};

/**
 * How often the rail asks what changed.
 *
 * A game invite expires in two minutes, so a slower poll would show invites that
 * are already dead. Realtime would be better and the gateway exists, but the web
 * client's socket is not merged yet — this is the honest interim, and the poll
 * stops entirely while the tab is hidden rather than billing a free-tier API for
 * a window nobody is looking at.
 */
const POLL_MS = 20_000;

/**
 * The rail's data, and what just arrived.
 *
 * Arrivals are computed by diffing against the previous answer rather than
 * trusting a flag from the server, because "new to this browser tab" is a client
 * question — the same invite is not new twice just because the poll ran again.
 * The first load never announces anything: everything is new on arrival, and a
 * burst of toasts for a backlog you already knew about is noise.
 */
export function useSocialRail(): {
  data: SocialRailData;
  loading: boolean;
  arrivals: Arrival[];
  dismiss: (key: string) => void;
  refresh: () => void;
} {
  const { client, status } = useAuth();
  const signedIn = status === 'signedIn';
  const [data, setData] = useState<SocialRailData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  /** ids already seen, so a toast fires once per thing rather than once per poll */
  const seen = useRef<Set<string> | null>(null);

  const refresh = useCallback(() => {
    if (!signedIn) return;
    void (async () => {
      const res = await client.get<SocialRailData>('/me/social');
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const next = { ...EMPTY, ...res.data };
      setData(next);
      setLoading(false);

      const keys = arrivalKeys(next);
      if (seen.current === null) {
        // first answer: adopt it silently
        seen.current = new Set(keys.map((a) => a.key));
        return;
      }
      const fresh = keys.filter((a) => !seen.current!.has(a.key));
      seen.current = new Set(keys.map((a) => a.key));
      if (fresh.length > 0) setArrivals((prev) => [...prev, ...fresh].slice(-3));
    })();
  }, [client, signedIn]);

  useEffect(() => {
    if (!signedIn) {
      setData(EMPTY);
      seen.current = null;
      return;
    }
    refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, POLL_MS);
    // coming back to the tab should show the truth immediately, not in 20s
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [signedIn, refresh]);

  const dismiss = useCallback((key: string) => {
    setArrivals((prev) => prev.filter((a) => a.key !== key));
  }, []);

  return { data, loading, arrivals, dismiss, refresh };
}

/** Everything in this answer that could be announced, with a stable key each. */
function arrivalKeys(data: SocialRailData): Arrival[] {
  const name = (f: RailFriend): string => f.displayName || f.username;
  return [
    ...data.challenges.map((c) => ({
      key: `challenge:${c.userId}`,
      kind: 'challenge' as const,
      title: 'Game invite',
      body: `${name(c)} wants to play`,
      who: c,
    })),
    ...data.requests.map((r) => ({
      key: `request:${r.userId}`,
      kind: 'request' as const,
      title: 'Friend request',
      body: `${name(r)} wants to be friends`,
      who: r,
    })),
    ...data.notifications
      .filter((n) => n.readAt === null)
      .map((n) => ({
        key: `note:${n.id}`,
        kind: 'notification' as const,
        title: n.title,
        body: n.body ?? '',
        who: null,
      })),
  ];
}

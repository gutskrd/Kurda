import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { socialNotification } from '../reports/notifications';

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

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
  /** the group's picture, when the server sends it; else its initials stand in */
  photoUrl?: string | null;
}

export interface RailNotification {
  id: string;
  category: string;
  title: string;
  body: string | null;
  createdAt: string;
  readAt: string | null;
  /** what it is about (`kind` and its fields): the words and the link are made from it */
  data?: Record<string, unknown> | null;
}

/** You, as the rail shows you: a face, a level ring, and what you can spend. */
export interface RailSelf {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  /** derived server-side from XP; `progress` is 0..1 toward the next level */
  level: { level: number; progress: number; xp: number; currentLevelXp: number; nextLevelXp: number };
  balances: { zer: number; gems: number };
}

export interface SocialRailData {
  /** null until the first read lands, and for a response from before this field */
  you: RailSelf | null;
  friends: RailFriend[];
  requests: RailFriend[];
  challenges: RailFriend[];
  groups: RailGroup[];
  notifications: RailNotification[];
  /** `gifts`: unopened gifts — the Shop badge (folded in here so nothing polls for it alone) */
  unread: { notifications: number; groups: number; requests: number; challenges: number; gifts?: number };
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
  you: null,
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
  /** nothing has arrived yet and the last ask failed: there is no list to show, only a way to ask again */
  failed: boolean;
  arrivals: Arrival[];
  dismiss: (key: string) => void;
  refresh: () => void;
} {
  const { client, status } = useAuth();
  const t = useT();
  const locale = useLocale();
  const signedIn = status === 'signedIn';
  const [data, setData] = useState<SocialRailData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  /** ids already seen, so a toast fires once per thing rather than once per poll */
  const seen = useRef<Set<string> | null>(null);

  const refresh = useCallback(() => {
    if (!signedIn) return;
    void (async () => {
      // asking again after a first answer that never came is loading again, not still failing
      if (seen.current === null) {
        setFailed(false);
        setLoading(true);
      }
      const res = await client.get<SocialRailData>('/me/social');
      if (!res.ok) {
        setLoading(false);
        // a failed poll after a good answer keeps the list it had; only a list
        // that never arrived is a failure worth saying
        setFailed(seen.current === null);
        return;
      }
      const next = { ...EMPTY, ...res.data };
      setData(next);
      setLoading(false);
      setFailed(false);

      const keys = arrivalKeys(next, t, locale);
      if (seen.current === null) {
        // first answer: adopt it silently
        seen.current = new Set(keys.map((a) => a.key));
        return;
      }
      const fresh = keys.filter((a) => !seen.current!.has(a.key));
      seen.current = new Set(keys.map((a) => a.key));
      if (fresh.length > 0) setArrivals((prev) => [...prev, ...fresh].slice(-3));
    })();
  }, [client, signedIn, t, locale]);

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

  return { data, loading, failed, arrivals, dismiss, refresh };
}

/** Everything in this answer that could be announced, with a stable key each. */
function arrivalKeys(data: SocialRailData, t: Translate, locale: string): Arrival[] {
  const name = (f: RailFriend): string => f.displayName || f.username;
  return [
    ...data.requests.map((r) => ({
      key: `request:${r.userId}`,
      kind: 'request' as const,
      title: t('rail.friendRequest'),
      body: t('rail.wantsToBeFriendsWith', { name: name(r) }),
      who: r,
    })),
    ...data.notifications
      // a gift arrives with its own banner, which opens it (gifts/GiftArrivals),
      // and so does a game invite, which can be answered there (play/InviteBanner)
      .filter((n) => n.readAt === null && n.data?.kind !== 'gift' && n.data?.kind !== 'play_invite')
      .map((n) => {
        // in the reader's words where the notification's data says what it is
        const view = socialNotification(n, t, locale);
        return {
          key: `note:${n.id}`,
          kind: 'notification' as const,
          title: view?.title ?? n.title,
          body: (view ? view.body : n.body) ?? '',
          who: null,
        };
      }),
  ];
}

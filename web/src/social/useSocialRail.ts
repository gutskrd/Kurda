import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { letterNoticeOf } from '@kurda/shared';
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
  /** The group's picture when the server sends one; otherwise its initials stand in. */
  photoUrl?: string | null;
}

export interface RailNotification {
  id: string;
  category: string;
  title: string;
  body: string | null;
  createdAt: string;
  readAt: string | null;
  /** What it is about (`kind` and its fields), from which the words and link are made. */
  data?: Record<string, unknown> | null;
}

/** The reader as the rail shows them: a face, a level ring and their balances. */
interface RailSelf {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  /** Derived server-side from XP; `progress` runs from 0 to 1 toward the next level. */
  level: { level: number; progress: number; xp: number; currentLevelXp: number; nextLevelXp: number };
  balances: { zer: number; gems: number };
}

export interface SocialRailData {
  /** Null until the first read lands, or when the response lacks it. */
  you: RailSelf | null;
  friends: RailFriend[];
  requests: RailFriend[];
  challenges: RailFriend[];
  groups: RailGroup[];
  notifications: RailNotification[];
  /** `gifts` counts unopened gifts for the Shop badge, so nothing polls for it separately. */
  unread: { notifications: number; groups: number; requests: number; challenges: number; gifts?: number };
}

/** Something that just showed up, worth a toast. */
export interface Arrival {
  key: string;
  kind: 'challenge' | 'request' | 'notification';
  title: string;
  body: string;
  who: RailFriend | null;
  /** For a letter's notification, its correspondence, or null when it names none. */
  letter?: { threadId: string | null };
}

/** The arrivals worth a toast at `pathname`; a letter is not announced on the letters page or in its own correspondence. */
export function toastsHere(arrivals: readonly Arrival[], pathname: string): Arrival[] {
  const path = pathname.replace(/\/+$/, '');
  return arrivals.filter((a) => !a.letter || (path !== '/app/letters' && (a.letter.threadId === null || path !== `/app/letters/${a.letter.threadId}`)));
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

/** How often the rail polls `/me/social`. A game invite expires in two minutes, so slower would show dead invites. */
const POLL_MS = 20_000;

/**
 * The rail's data, polled while the tab is visible, and what just arrived. Arrivals come from diffing against the
 * previous answer, since "new to this tab" is a client question; the first load announces nothing.
 */
export function useSocialRail(): {
  data: SocialRailData;
  loading: boolean;
  /** Nothing has arrived yet and the last request failed, so there is only a retry. */
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
  /** Ids already seen, so a toast fires once per thing rather than once per poll. */
  const seen = useRef<Set<string> | null>(null);

  const refresh = useCallback(() => {
    if (!signedIn) return;
    void (async () => {
      // Retrying after a first answer that never came is loading, not failing.
      if (seen.current === null) {
        setFailed(false);
        setLoading(true);
      }
      const res = await client.get<SocialRailData>('/me/social');
      if (!res.ok) {
        setLoading(false);
        // A failed poll after a good answer keeps the list; only a list that never arrived is a failure.
        setFailed(seen.current === null);
        return;
      }
      const next = { ...EMPTY, ...res.data };
      setData(next);
      setLoading(false);
      setFailed(false);

      const keys = arrivalKeys(next, t, locale);
      if (seen.current === null) {
        // The first answer is adopted silently.
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
    // Returning to the tab refetches at once rather than waiting for the next poll.
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
      // Gifts and game invites have their own banners (gifts/GiftArrivals, play/InviteBanner).
      .filter((n) => n.readAt === null && n.data?.kind !== 'gift' && n.data?.kind !== 'play_invite')
      .map((n) => {
        // In the reader's words where the notification's data says what it is.
        const view = socialNotification(n, t, locale);
        const letter = letterNoticeOf(n.data);
        return {
          key: `note:${n.id}`,
          kind: 'notification' as const,
          title: view?.title ?? n.title,
          body: (view ? view.body : n.body) ?? '',
          who: null,
          ...(letter ? { letter: { threadId: letter.threadId } } : {}),
        };
      }),
  ];
}

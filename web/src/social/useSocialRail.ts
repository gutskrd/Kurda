import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { Translate } from '../i18n/I18nProvider';
import { LETTERS_CHANGED, letterNoticeOf, noticePicture, type NoticePicture } from '@kurda/shared';
import { pageVisible } from '../lib/pollWhileVisible';
import { useRealtime, useRealtimeEvent } from '../realtime/RealtimeProvider';
import type { RealtimeEventEnvelope } from '../realtime/events';
import { socialNotification } from '../reports/notifications';
import type { ShownChange } from '../lib/optimistic';

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
  /** A request answered here that the server may not have yet; never sent by the server. */
  answered?: boolean;
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
  balances: { zer: number };
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
  /** What a notification is about, drawn (a badge, a league, a game, a letter), or null where nothing is. */
  picture?: NoticePicture | null;
}

/** The arrivals worth a toast at `pathname`; a letter is not announced on the letters page or in its own correspondence. */
export function toastsHere(arrivals: readonly Arrival[], pathname: string): Arrival[] {
  const path = pathname.replace(/\/+$/, '');
  return arrivals.filter((a) => !a.letter || (path !== '/app/letters' && (a.letter.threadId === null || path !== `/app/letters/${a.letter.threadId}`)));
}

/**
 * A change drawn on the rail before the server has it (lib/optimistic.ts). Each is applied to every read until one
 * begun after the server took the change, so it must give the same result on a read that already includes it.
 */
export type RailEdit = (data: SocialRailData) => SocialRailData;

/** The rail's optimistic changes, each safe to apply to a read that already has it. */
export const railEdits = {
  notificationRead:
    (id: string): RailEdit =>
    (d) => {
      if (!d.notifications.some((n) => n.id === id && n.readAt === null)) return d;
      const at = new Date().toISOString();
      return {
        ...d,
        notifications: d.notifications.map((n) => (n.id === id ? { ...n, readAt: at } : n)),
        unread: { ...d.unread, notifications: Math.max(0, d.unread.notifications - 1) },
      };
    },
  allNotificationsRead: (): RailEdit => (d) => {
    const at = new Date().toISOString();
    return { ...d, notifications: d.notifications.map((n) => (n.readAt === null ? { ...n, readAt: at } : n)), unread: { ...d.unread, notifications: 0 } };
  },
  notificationRemoved:
    (id: string): RailEdit =>
    (d) => {
      const gone = d.notifications.find((n) => n.id === id);
      if (!gone) return d;
      const unread = gone.readAt === null ? Math.max(0, d.unread.notifications - 1) : d.unread.notifications;
      return { ...d, notifications: d.notifications.filter((n) => n !== gone), unread: { ...d.unread, notifications: unread } };
    },
  /** Kept in the list, marked, so its ticket can show the answer; the count drops at once. */
  requestAnswered:
    (userId: string): RailEdit =>
    (d) => {
      if (!d.requests.some((r) => r.userId === userId && !r.answered)) return d;
      return {
        ...d,
        requests: d.requests.map((r) => (r.userId === userId ? { ...r, answered: true } : r)),
        unread: { ...d.unread, requests: Math.max(0, d.unread.requests - 1) },
      };
    },
  /** Blocked or unfriended: gone from friends and requests, and from the request count if they had asked. */
  personGone:
    (userId: string): RailEdit =>
    (d) => {
      const asked = d.requests.some((r) => r.userId === userId && !r.answered);
      if (!asked && !d.friends.some((f) => f.userId === userId) && !d.requests.some((r) => r.userId === userId)) return d;
      return {
        ...d,
        friends: d.friends.filter((f) => f.userId !== userId),
        requests: d.requests.filter((r) => r.userId !== userId),
        unread: { ...d.unread, requests: asked ? Math.max(0, d.unread.requests - 1) : d.unread.requests },
      };
    },
  /** Left: gone from the groups, its unread messages with it. */
  groupGone:
    (groupId: string): RailEdit =>
    (d) => {
      const group = d.groups.find((g) => g.id === groupId);
      if (!group) return d;
      return { ...d, groups: d.groups.filter((g) => g !== group), unread: { ...d.unread, groups: Math.max(0, d.unread.groups - group.unread) } };
    },
  groupRead:
    (groupId: string): RailEdit =>
    (d) => {
      const group = d.groups.find((g) => g.id === groupId);
      if (!group || group.unread === 0) return d;
      return {
        ...d,
        groups: d.groups.map((g) => (g === group ? { ...g, unread: 0 } : g)),
        unread: { ...d.unread, groups: Math.max(0, d.unread.groups - group.unread) },
      };
    },
};

interface HeldEdit {
  id: number;
  edit: RailEdit;
  /** When the server took it, or null while it is still on its way. */
  kept: number | null;
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

/** How often the rail polls `/me/social` while the realtime connection is down. */
const POLL_MS = 20_000;
/**
 * With the connection up, the longest the rail goes without a read, for what no event reports: friends coming online
 * (their heartbeat comes every two minutes) or starting a game, and purse or level changes from actions that do not
 * call `refresh`.
 */
const FALLBACK_MS = 2 * 60_000;
/** An event's read waits this long, so a burst is read once and the notification written just after its event is in it. */
const EVENT_DELAY_MS = 1_000;
/** Reads for events are at least this far apart, so a busy group chat costs no more than the old poll. */
const EVENT_GAP_MS = POLL_MS;
/** Writes that spend or earn Zêr, after which the purse in the top bar is read again at once. */
const PURSE_WRITES = ['/shop/', '/me/tree/', '/letters/bird', '/me/streak/', '/rewards/', '/me/quests/'];

/**
 * The rail's data and what just arrived. With the realtime connection up it is read again when an event could change
 * it, after a write that changes the purse, and otherwise every FALLBACK_MS; while the connection is down it polls every POLL_MS. Nothing is read while the
 * tab is hidden, and coming back reads at once. Arrivals come from diffing against the previous answer, since "new to
 * this tab" is a client question; the first load announces nothing.
 */
export function useSocialRail(): {
  data: SocialRailData;
  loading: boolean;
  /** Nothing has arrived yet and the last request failed, so there is only a retry. */
  failed: boolean;
  arrivals: Arrival[];
  dismiss: (key: string) => void;
  refresh: () => void;
  soon: () => void;
  /** Draws `edit` at once; `undo` takes it back, `keep` once the server has it (lib/optimistic.ts `ShownChange`). */
  adjust: (edit: RailEdit) => ShownChange;
} {
  const { client, status, user } = useAuth();
  const t = useT();
  const locale = useLocale();
  const signedIn = status === 'signedIn';
  const live = useRealtime().state === 'open';
  const [data, setData] = useState<SocialRailData>(EMPTY);
  const [edits, setEdits] = useState<HeldEdit[]>([]);
  const editCount = useRef(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  /** Ids already seen, so a toast fires once per thing rather than once per poll. */
  const seen = useRef<Set<string> | null>(null);
  /** When the last read began, which spaces event reads and holds off the fallback. */
  const lastRead = useRef(0);
  /** A read an event asked for, waiting its turn. */
  const eventRead = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Whether the connection was up when last looked at, to notice it coming back. */
  const wasLive = useRef(live);

  const refresh = useCallback(() => {
    if (!signedIn) return;
    const began = Date.now();
    lastRead.current = began;
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
      // A read begun after the server took a change already has it.
      setEdits((list) => (list.some((e) => e.kept !== null && e.kept < began) ? list.filter((e) => e.kept === null || e.kept >= began) : list));
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

  /** Asks for a read soon: one per burst, a moment after its first event, and never within EVENT_GAP_MS of the last. */
  const onEvent = useCallback(() => {
    if (eventRead.current !== null) return;
    const wait = Math.max(EVENT_DELAY_MS, lastRead.current + EVENT_GAP_MS - Date.now());
    eventRead.current = setTimeout(() => {
      eventRead.current = null;
      // A hidden tab reads when it is shown again instead.
      if (pageVisible()) refresh();
    }, wait);
  }, [refresh]);

  const me = user?.id;
  const onGroupMsg = useCallback(
    (env: RealtimeEventEnvelope) => {
      // Your own message, echoed back, changes none of your counts.
      if ((env.event as { message?: { senderId?: string } }).message?.senderId !== me) onEvent();
    },
    [onEvent, me],
  );

  // What can change the rail: requests and friends, gifts, game invites, badges, letters, and the groups' unread counts.
  useRealtimeEvent('friends_changed', onEvent);
  useRealtimeEvent('gift_received', onEvent);
  useRealtimeEvent('play_invite', onEvent);
  useRealtimeEvent('badge_unlocked', onEvent);
  useRealtimeEvent(LETTERS_CHANGED, onEvent);
  useRealtimeEvent('group_msg', onGroupMsg);
  useRealtimeEvent('group_msg_deleted', onEvent);
  useRealtimeEvent('group_msgs_deleted', onEvent);
  useRealtimeEvent('group_chat_cleared', onEvent);

  useEffect(() => {
    if (!signedIn) {
      setData(EMPTY);
      setEdits([]);
      seen.current = null;
      return;
    }
    refresh();
    // Returning to the tab refetches at once, since events that came while it was hidden were not read.
    const onVisible = (): void => {
      if (pageVisible()) refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      if (eventRead.current !== null) clearTimeout(eventRead.current);
      eventRead.current = null;
    };
  }, [signedIn, refresh]);

  useEffect(() => {
    if (!signedIn) return;
    const timer = setInterval(() => {
      if (!pageVisible()) return;
      // With the connection up this is only the fallback, so any read in the meantime puts it off.
      if (live && Date.now() - lastRead.current < FALLBACK_MS) return;
      refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [signedIn, live, refresh]);

  // Events sent while the connection was down are lost, so its return is read like an event.
  useEffect(() => {
    if (live && !wasLive.current) onEvent();
    wasLive.current = live;
  }, [live, onEvent]);

  useEffect(() => client.onWrite((path) => PURSE_WRITES.some((p) => path.startsWith(p)) && refresh()), [client, refresh]);

  const dismiss = useCallback((key: string) => {
    setArrivals((prev) => prev.filter((a) => a.key !== key));
  }, []);

  const adjust = useCallback(
    (edit: RailEdit): ShownChange => {
      editCount.current += 1;
      const id = editCount.current;
      setEdits((list) => [...list, { id, edit, kept: null }]);
      return {
        undo: () => setEdits((list) => list.filter((e) => e.id !== id)),
        keep: () => {
          const at = Date.now();
          setEdits((list) => list.map((e) => (e.id === id ? { ...e, kept: at } : e)));
          // The server's own copy takes over at the next read.
          onEvent();
        },
      };
    },
    [onEvent],
  );

  const shown = useMemo(() => edits.reduce((d, e) => e.edit(d), data), [data, edits]);

  return { data: shown, loading, failed, arrivals, dismiss, refresh, soon: onEvent, adjust };
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
          picture: noticePicture(n),
          ...(letter ? { letter: { threadId: letter.threadId } } : {}),
        };
      }),
  ];
}

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { useRealtimeListener, useRealtimeReconnect } from '../realtime/RealtimeProvider';
import { useUnseenGifts } from '../shop/useUnseenGifts';
import { messagesUnread } from './list';

/** What is waiting, by where it waits. */
export interface UnreadCounts {
  /** unread direct messages, summed over every conversation */
  chats: number;
  /** unread group messages, summed over every group */
  groups: number;
  /** friend requests waiting on an answer */
  requests: number;
  /** notifications not yet opened (the bell on Home) */
  notifications: number;
  /** gifts not yet unwrapped (the dot on Profile) */
  gifts: number;
}

interface UnreadValue {
  counts: UnreadCounts;
  /** the number on the Messages tab */
  messages: number;
  /** ask the server again; `soon` is a nudge that may be folded into one already on its way */
  refresh: (opts?: { soon?: boolean }) => void;
  /** a screen that has just loaded the same lists says what it found, so nothing is asked twice */
  report: (patch: Partial<Omit<UnreadCounts, 'gifts'>>) => void;
}

const EMPTY: UnreadCounts = { chats: 0, groups: 0, requests: 0, notifications: 0, gifts: 0 };

const UnreadContext = createContext<UnreadValue>({
  counts: EMPTY,
  messages: 0,
  refresh: () => undefined,
  report: () => undefined,
});

/**
 * How long a nudge waits before it asks, so a burst of them — three messages
 * arriving together, a quick hop across the tabs — becomes one round of
 * requests rather than one per event.
 */
const SETTLE_MS = 600;
/** A nudge within this long of the last answer is ignored: the counts are fresh. */
const FRESH_MS = 15_000;

/**
 * The badges' numbers, for the whole tab shell.
 *
 * Four cheap counts — unread direct messages, unread group messages, friend
 * requests, unopened notifications — read when the shell first appears, when
 * the app comes back to the front, when the realtime connection comes back,
 * when a direct message or a gift arrives on your own channel, and when a
 * screen that has just read something says so. No timer: a badge that is
 * wrong for a few seconds until you look is better than a phone asking the
 * server every minute whether anything happened.
 *
 * The gift count is the one the shop's badge already keeps (useUnseenGifts),
 * so the two cannot disagree.
 */
export function UnreadProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { client, user } = useAuth();
  const signedIn = Boolean(user);
  const gifts = useUnseenGifts();
  const [counts, setCounts] = useState<Omit<UnreadCounts, 'gifts'>>(EMPTY);
  const lastAnswer = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    if (!signedIn) return;
    void Promise.all([
      client.get<{ conversations: { unread: number }[] }>('/chat/conversations'),
      client.get<{ unread: { unread: number }[] }>('/me/groups/unread'),
      client.get<{ requests: unknown[] }>('/friends/requests'),
      client.get<{ count: number }>('/me/notifications/unread-count'),
    ]).then(([chats, groups, requests, notifications]) => {
      lastAnswer.current = Date.now();
      setCounts((prev) => ({
        chats: chats.ok ? chats.data.conversations.reduce((n, c) => n + Math.max(0, c.unread), 0) : prev.chats,
        groups: groups.ok ? groups.data.unread.reduce((n, g) => n + Math.max(0, g.unread), 0) : prev.groups,
        requests: requests.ok ? requests.data.requests.length : prev.requests,
        notifications: notifications.ok ? notifications.data.count : prev.notifications,
      }));
    });
  }, [client, signedIn]);

  const refresh = useCallback(
    (opts?: { soon?: boolean }) => {
      if (opts?.soon && Date.now() - lastAnswer.current < FRESH_MS) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(load, SETTLE_MS);
    },
    [load],
  );

  const report = useCallback((patch: Partial<Omit<UnreadCounts, 'gifts'>>) => {
    setCounts((prev) => ({ ...prev, ...patch }));
  }, []);

  useEffect(() => {
    if (!signedIn) {
      setCounts(EMPTY);
      return;
    }
    load();
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      foreground.remove();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [signedIn, load, refresh]);

  useRealtimeReconnect(refresh);
  useRealtimeListener(
    useCallback(
      (event, room) => {
        // a new direct message on your own channel; receipts and typing change no count
        if (room.startsWith('user:') && event.type === 'dm') refresh();
      },
      [refresh],
    ),
  );

  const value = useMemo<UnreadValue>(() => {
    const all = { ...counts, gifts };
    return {
      counts: all,
      messages: messagesUnread({ chats: [all.chats], groups: [all.groups], requests: all.requests }),
      refresh,
      report,
    };
  }, [counts, gifts, refresh, report]);

  return <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>;
}

export function useUnread(): UnreadValue {
  return useContext(UnreadContext);
}

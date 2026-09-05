import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useRealtimeEvent, useRealtimeRooms } from '../realtime/RealtimeProvider';
import type { RealtimeEventEnvelope } from '../realtime/events';
import type { Conversation, DmMessage, GroupMessage, MyGroup } from '../lib/types';
import { messagePreview, truncate } from './messagePreview';

/**
 * App-wide message awareness: unread counts and arrival notifications.
 *
 * Two things made this necessary. Direct messages already reached every page
 * (they are published to the recipient's own `user:<id>` room, which is joined
 * automatically), but nothing listened outside the Messages page. Group messages
 * did not arrive at all, because they go to a `group:<id>` room that was joined
 * only while that group's channel was open — so you could only be told about a
 * group message you were already looking at. This joins every group you belong
 * to for as long as you are signed in.
 *
 * A notification is deliberately NOT raised for a conversation you are currently
 * reading, nor for your own messages coming back from a room you are joined to.
 */

/** One arrival banner. */
export interface MessageToast {
  id: string;
  title: string;
  body: string;
  /** where clicking it takes you */
  to: string;
}

interface MessagesContextValue {
  /** Unread direct messages plus unread group messages. */
  unreadTotal: number;
  /** Re-read the counts (after opening or reading a conversation). */
  refreshUnread: () => void;
  toasts: MessageToast[];
  dismissToast: (id: string) => void;
}

const MessagesCtx = createContext<MessagesContextValue | null>(null);

/**
 * What consumers get with no provider mounted. Built at module scope on purpose:
 * created per call it would be a new object every render, so any effect
 * depending on refreshUnread would re-run forever.
 */
const NO_PROVIDER: MessagesContextValue = {
  unreadTotal: 0,
  refreshUnread: () => undefined,
  toasts: [],
  dismissToast: () => undefined,
};

/** How long an arrival banner stays before it disappears. */
const TOAST_MS = 6000;
/** Never stack more than this many; older ones drop off. */
const MAX_TOASTS = 3;
/** Counts are event-driven; this is only a safety net for missed events. */
const COUNT_POLL_MS = 60_000;

/** What a banner shows: a game invite reads as an invite, not as its URL. */
function preview(body: string): string {
  return truncate(messagePreview(body), 90);
}

export function MessagesProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { client, user, status } = useAuth();
  const signedIn = status === 'signedIn';
  const location = useLocation();
  const [groups, setGroups] = useState<MyGroup[]>([]);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [toasts, setToasts] = useState<MessageToast[]>([]);

  // Which conversation is on screen right now. Derived from the URL rather than
  // held as state, so it is always in step with what the user is actually seeing.
  const openConversation = useMemo(() => {
    if (!location.pathname.startsWith('/app/messages')) return { dm: null, group: null };
    const p = new URLSearchParams(location.search);
    return { dm: p.get('to'), group: p.get('group') || null };
  }, [location.pathname, location.search]);
  // the event handlers are long-lived; a ref lets them see the current value
  // without re-subscribing on every navigation
  const openRef = useRef(openConversation);
  openRef.current = openConversation;

  const loadGroups = useCallback(async () => {
    if (!signedIn) return;
    const res = await client.get<{ groups: MyGroup[] }>('/me/groups');
    // an unexpected shape would otherwise leave groups undefined, and the room
    // list below maps over it — one malformed response would blank the whole app
    if (res.ok) setGroups(res.data.groups ?? []);
  }, [client, signedIn]);

  const refreshUnread = useCallback(() => {
    if (!signedIn) return;
    void (async () => {
      const [dms, gs] = await Promise.all([
        client.get<{ conversations: Conversation[] }>('/chat/conversations'),
        client.get<{ unread: Array<{ groupId: string; unread: number }> }>('/me/groups/unread'),
      ]);
      const dmCount = dms.ok ? (dms.data.conversations ?? []).reduce((n, c) => n + (c.unread ?? 0), 0) : 0;
      const groupCount = gs.ok ? (gs.data.unread ?? []).reduce((n, g) => n + (g.unread ?? 0), 0) : 0;
      setUnreadTotal(dmCount + groupCount);
    })();
  }, [client, signedIn]);

  useEffect(() => {
    if (!signedIn) {
      setGroups([]);
      setUnreadTotal(0);
      setToasts([]);
      return;
    }
    void loadGroups();
    refreshUnread();
    const t = setInterval(refreshUnread, COUNT_POLL_MS);
    return () => clearInterval(t);
  }, [signedIn, loadGroups, refreshUnread]);

  // opening a conversation clears its badge, so recount when the URL changes
  useEffect(() => {
    if (signedIn) refreshUnread();
  }, [openConversation.dm, openConversation.group, signedIn, refreshUnread]);

  // Subscribe to every group's room, not only the one that is open.
  const rooms = useMemo(() => groups.map((g) => 'group:' + g.id), [groups]);
  useRealtimeRooms(signedIn ? rooms : []);

  const push = useCallback((toast: MessageToast) => {
    setToasts((list) => (list.some((t) => t.id === toast.id) ? list : [...list, toast].slice(-MAX_TOASTS)));
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== toast.id)), TOAST_MS);
  }, []);

  const onDm = useCallback(
    (env: RealtimeEventEnvelope) => {
      const ev = env.event as { from?: string; fromUsername?: string; message?: DmMessage };
      if (!ev.from || !ev.message?.id) return;
      refreshUnread();
      if (openRef.current.dm === ev.from) return; // you are already reading it
      const name = ev.fromUsername ?? 'New message';
      push({
        id: ev.message.id,
        title: name,
        body: preview(ev.message.body),
        to: '/app/messages?to=' + ev.from + '&name=' + encodeURIComponent(name),
      });
    },
    [push, refreshUnread],
  );
  useRealtimeEvent('dm', onDm);

  // `groups` is a dependency because the banner needs the group's NAME, which the
  // event does not carry — the membership list already held here supplies it
  const onGroupMsg = useCallback(
    (env: RealtimeEventEnvelope) => {
      const ev = env.event as { groupId?: string; message?: GroupMessage };
      if (!ev.groupId || !ev.message?.id) return;
      if (ev.message.senderId === user?.id) return; // your own, echoed back
      refreshUnread();
      if (openRef.current.group === ev.groupId) return;
      const group = groups.find((g) => g.id === ev.groupId);
      push({
        id: ev.message.id,
        title: group ? ev.message.username + ' · ' + group.name : ev.message.username,
        body: preview(ev.message.body),
        to: '/app/messages?group=' + ev.groupId,
      });
    },
    [push, refreshUnread, groups, user?.id],
  );
  useRealtimeEvent('group_msg', onGroupMsg);

  const dismissToast = useCallback((id: string) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const value = useMemo<MessagesContextValue>(
    () => ({ unreadTotal, refreshUnread, toasts, dismissToast }),
    [unreadTotal, refreshUnread, toasts, dismissToast],
  );

  return (
    <MessagesCtx.Provider value={value}>
      {children}
      <MessageToasts />
    </MessagesCtx.Provider>
  );
}

/**
 * Unread count and a way to refresh it. Degrades to zero when no provider is
 * mounted, so components stay renderable in isolation (unit tests especially).
 */
export function useMessages(): MessagesContextValue {
  return useContext(MessagesCtx) ?? NO_PROVIDER;
}

/** The stack of arrival banners. Rendered once, by the provider. */
function MessageToasts(): React.JSX.Element | null {
  const { toasts, dismissToast } = useMessages();
  const navigate = useNavigate();
  if (toasts.length === 0) return null;
  return (
    <div className="msg-toasts" role="region" aria-label="New messages">
      {toasts.map((t) => (
        <div key={t.id} className="msg-toast" role="status">
          <button
            type="button"
            className="msg-toast-open"
            onClick={() => {
              dismissToast(t.id);
              navigate(t.to);
            }}
          >
            <span className="msg-toast-title">{t.title}</span>
            <span className="msg-toast-body">{t.body}</span>
          </button>
          <button
            type="button"
            className="msg-toast-close"
            aria-label={'Dismiss message from ' + t.title}
            onClick={() => dismissToast(t.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

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
import type { ChatUnread } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { CloseButton } from '../components/CloseButton';
import { useRealtimeEvent, useRealtimeRooms } from '../realtime/RealtimeProvider';
import type { RealtimeEventEnvelope } from '../realtime/events';
import type { DmMessage, GroupMessage, MyGroup } from '../lib/types';
import { messagePreview, truncate, type Previewable } from './messagePreview';
import { useT } from '../i18n/I18nProvider';
import type { Translate } from '../i18n/I18nProvider';
import { pollWhileVisible } from '../lib/pollWhileVisible';
import { onParentalRefusal } from '../lib/api';
import { onNotice } from '../lib/notice';
import { LEAVE_MS, playsMotion } from '../lib/motion';

/**
 * App-wide unread counts and arrival banners. Direct messages arrive on the reader's `user:<id>` room; this also
 * joins every `group:<id>` room the reader belongs to while signed in. No banner is raised for the conversation being
 * read or for the reader's own messages. The same stack shows the app's short notices (lib/notice.ts).
 */

/** One arrival banner, or a notice when it leads nowhere. */
interface MessageToast {
  id: string;
  title: string;
  body: string;
  /** where clicking it takes you; null for a notice */
  to: string | null;
}

interface MessagesContextValue {
  /** Unread direct messages plus unread group messages. */
  unreadTotal: number;
  /** Re-read the counts (after opening or reading a conversation). */
  refreshUnread: () => void;
  /** Clears one conversation's count at once, before its read receipt is answered; `refreshUnread` brings the truth. */
  markSeen: (kind: 'dm' | 'group', id: string) => void;
  toasts: MessageToast[];
  dismissToast: (id: string) => void;
}

const MessagesCtx = createContext<MessagesContextValue | null>(null);

/** The value without a provider, at module scope so effects depending on refreshUnread do not re-run every render. */
const NO_PROVIDER: MessagesContextValue = {
  unreadTotal: 0,
  refreshUnread: () => undefined,
  markSeen: () => undefined,
  toasts: [],
  dismissToast: () => undefined,
};

const NOTHING_UNREAD = { dm: {}, group: {} };

/** How long an arrival banner stays before it disappears. */
const TOAST_MS = 6000;
/** Never stack more than this many; older ones drop off. */
const MAX_TOASTS = 3;
/** Counts are event-driven; this is only a safety net for missed events, and only for a tab in view. */
const COUNT_POLL_MS = 60_000;

/** What a banner shows: a game invite reads as an invite, not as its URL; a gift as a gift. */
function preview(message: Previewable, t: Translate): string {
  return truncate(messagePreview(message, t), 90);
}

export function MessagesProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { client, user, status } = useAuth();
  const t = useT();
  // A teen whose parent switched chats off may not read them, so nothing here is asked of the server for them: what the
  // account says, or a refusal met since, which the account says too once it is read again.
  const [refused, setRefused] = useState(false);
  useEffect(() => onParentalRefusal((code, details) => setRefused((r) => r || (code === 'PARENTAL_BLOCKED' && (details as { control?: unknown } | null)?.control === 'chat'))), []);
  // A fresh read of the account is the word on it again.
  useEffect(() => setRefused(false), [user?.supervision]);
  const chatOff = user?.supervision?.controls.chat === false || refused;
  const signedIn = status === 'signedIn' && !chatOff;
  const location = useLocation();
  const [groups, setGroups] = useState<MyGroup[]>([]);
  /** Unread messages by conversation: people by their id, groups by theirs. */
  const [unread, setUnread] = useState<{ dm: Record<string, number>; group: Record<string, number> }>(NOTHING_UNREAD);
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

  // The counts alone (GET /chat/unread), not the conversation list; a failed read leaves the badge as it was.
  const refreshUnread = useCallback(() => {
    if (!signedIn) return;
    void client.get<ChatUnread>('/chat/unread').then((res) => {
      if (!res.ok) return;
      setUnread({
        dm: Object.fromEntries((res.data.direct ?? []).map((c) => [c.userId, c.unread ?? 0])),
        group: Object.fromEntries((res.data.groups ?? []).map((g) => [g.groupId, g.unread ?? 0])),
      });
    });
  }, [client, signedIn]);

  useEffect(() => {
    if (!signedIn) {
      setGroups([]);
      setUnread(NOTHING_UNREAD);
      setToasts([]);
      return;
    }
    void loadGroups();
    refreshUnread();
    return pollWhileVisible(refreshUnread, COUNT_POLL_MS);
  }, [signedIn, loadGroups, refreshUnread]);

  // Opening a conversation clears its badge, so recount when the URL changes; the first count is the poll's own.
  const counted = useRef<string | null>(null);
  useEffect(() => {
    const open = `${openConversation.dm ?? ''}|${openConversation.group ?? ''}`;
    const before = counted.current;
    counted.current = open;
    if (signedIn && before !== null && before !== open) refreshUnread();
  }, [openConversation.dm, openConversation.group, signedIn, refreshUnread]);

  // Subscribe to every group's room, not only the one that is open.
  const rooms = useMemo(() => groups.map((g) => 'group:' + g.id), [groups]);
  useRealtimeRooms(signedIn ? rooms : []);

  const push = useCallback((toast: MessageToast) => {
    setToasts((list) => (list.some((t) => t.id === toast.id) ? list : [...list, toast].slice(-MAX_TOASTS)));
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== toast.id)), TOAST_MS);
  }, []);

  // A notice already showing is not stacked again, so a burst of failures while offline says it once.
  useEffect(() => onNotice((text) => push({ id: `notice:${text}`, title: text, body: '', to: null })), [push]);

  const onDm = useCallback(
    (env: RealtimeEventEnvelope) => {
      const ev = env.event as { from?: string; fromUsername?: string; message?: DmMessage };
      if (!ev.from || !ev.message?.id) return;
      refreshUnread();
      if (openRef.current.dm === ev.from) return; // you are already reading it
      // a friend's game invite has its own banner (play/InviteBanner), which
      // can be answered where it is; a second one for its card would only repeat it
      if (ev.message.kind === 'game') return;
      // a present comes with its own banner, which opens it (gifts/GiftArrivals)
      if (ev.message.kind === 'gift') return;
      const name = ev.fromUsername ?? t('chat.newMessage');
      push({
        id: ev.message.id,
        title: name,
        body: preview(ev.message, t),
        to: '/app/messages?to=' + ev.from + '&name=' + encodeURIComponent(name),
      });
    },
    [push, refreshUnread, t],
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
      // its recipients get the gift's own banner; nobody else needs a banner for it
      if (ev.message.kind === 'gift') return;
      const group = groups.find((g) => g.id === ev.groupId);
      push({
        id: ev.message.id,
        title: group ? ev.message.username + ' · ' + group.name : ev.message.username,
        body: preview(ev.message, t),
        to: '/app/messages?group=' + ev.groupId,
      });
    },
    [push, refreshUnread, groups, user?.id, t],
  );
  useRealtimeEvent('group_msg', onGroupMsg);
  // a chat cleared for everyone has nothing unread left in it
  useRealtimeEvent('group_chat_cleared', refreshUnread);

  const dismissToast = useCallback((id: string) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const markSeen = useCallback((kind: 'dm' | 'group', id: string) => {
    setUnread((u) => (u[kind][id] ? { ...u, [kind]: { ...u[kind], [id]: 0 } } : u));
  }, []);

  const unreadTotal = useMemo(() => [...Object.values(unread.dm), ...Object.values(unread.group)].reduce((n, c) => n + c, 0), [unread]);
  const value = useMemo<MessagesContextValue>(
    () => ({ unreadTotal, refreshUnread, markSeen, toasts, dismissToast }),
    [unreadTotal, refreshUnread, markSeen, toasts, dismissToast],
  );

  return (
    <MessagesCtx.Provider value={value}>
      {children}
      <MessageToasts />
    </MessagesCtx.Provider>
  );
}

/** Unread counts and banners; zero without a provider, so components render in isolation. */
export function useMessages(): MessagesContextValue {
  return useContext(MessagesCtx) ?? NO_PROVIDER;
}

/** The stack of arrival banners. Rendered once, by the provider. */
function MessageToasts(): React.JSX.Element | null {
  const { toasts, dismissToast } = useMessages();
  const t = useT();
  const navigate = useNavigate();
  const shown = useLeavingToasts(toasts);
  if (shown.length === 0) return null;
  return (
    <div className="msg-toasts" role="region" aria-label={t('chat.newMessages')}>
      {shown.map(({ toast, leaving }) => {
        const to = toast.to;
        // A banner on its way out is only a picture: hidden from assistive technology and out of the tab order.
        if (leaving) {
          return (
            <div key={toast.id} className="msg-toast is-leaving" aria-hidden="true" inert>
              <p className="msg-toast-open msg-toast-notice">{toast.title}</p>
            </div>
          );
        }
        return (
          <div key={toast.id} className="msg-toast" role="status">
            {to === null ? (
              <p className="msg-toast-open msg-toast-notice">{toast.title}</p>
            ) : (
              <button
                type="button"
                className="msg-toast-open"
                onClick={() => {
                  dismissToast(toast.id);
                  navigate(to);
                }}
              >
                <span className="msg-toast-title">{toast.title}</span>
                <span className="msg-toast-body">{toast.body}</span>
              </button>
            )}
            <CloseButton
              className="msg-toast-close"
              label={to === null ? t('common.close') : t('chat.dismissFrom', { name: toast.title })}
              onClick={() => dismissToast(toast.id)}
            />
          </div>
        );
      })}
    </div>
  );
}


/**
 * The banners to draw: those showing, and for `LEAVE_MS` after each is dismissed or times out, that one in its old place
 * as it leaves (styles/pages.css), so none vanishes in a frame. Under Reduce Motion they go at once.
 */
function useLeavingToasts(toasts: readonly MessageToast[]): Array<{ toast: MessageToast; leaving: boolean }> {
  const [gone, setGone] = useState<Array<{ toast: MessageToast; at: number }>>([]);
  const before = useRef(toasts);
  useEffect(() => {
    const was = before.current;
    before.current = toasts;
    if (!playsMotion()) return;
    const left = was.flatMap((toast, at) => (toasts.some((x) => x.id === toast.id) ? [] : [{ toast, at }]));
    if (left.length === 0) return;
    setGone((g) => [...g.filter((x) => !left.some((l) => l.toast.id === x.toast.id)), ...left]);
    // Not cleared when the list changes again meanwhile: each banner that left is let go after its own exit.
    window.setTimeout(() => setGone((g) => g.filter((x) => !left.includes(x))), LEAVE_MS);
  }, [toasts]);
  const out = toasts.map((toast) => ({ toast, leaving: false }));
  for (const { toast, at } of gone) if (!toasts.some((x) => x.id === toast.id)) out.splice(Math.min(at, out.length), 0, { toast, leaving: true });
  return out;
}

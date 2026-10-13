/** Pure notification-inbox helpers (KUR-097) — no React Native. */
import { isPlayGame, type GiftChatRef, type PlayGame } from '@kurda/shared';

export interface InboxItem {
  id: string;
  category: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
}

/** Deep-link targets the inbox knows how to open. */
export type DeepLink =
  | { screen: 'EventQuests' }
  | { screen: 'Notifications' }
  | { screen: 'Profile'; params: { userId: string } }
  | { screen: 'Chat'; params: { userId: string; username: string } }
  /** an invite to play: accepted on the way, into the game's lobby */
  | { screen: 'PlayInvite'; params: { inviteId: string; game: PlayGame; lobbyId: string } }
  /** a gift: the chat it was sent in, where it is unwrapped */
  | { screen: 'GiftChat'; params: { chat: GiftChatRef } };

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * Resolve a notification's `data` to a navigation target, or null when there's
 * no valid target — the caller then just marks it read (the friendly fallback
 * for an expired/removed deep-link, rather than navigating into a dead screen).
 */
export function resolveDeepLink(data: Record<string, unknown>): DeepLink | null {
  /*
   * What the server writes today is a `kind` with the ids it needs, rather
   * than a screen name: the app decides where each kind of thing lives.
   */
  if (data.kind === 'play_invite') {
    const inviteId = str(data.inviteId);
    const lobbyId = str(data.lobbyId);
    return inviteId && lobbyId && isPlayGame(data.game) ? { screen: 'PlayInvite', params: { inviteId, game: data.game, lobbyId } } : null;
  }
  if (data.kind === 'gift') {
    const chat = giftChat(data.chat);
    return chat ? { screen: 'GiftChat', params: { chat } } : null;
  }
  switch (data.screen) {
    case 'EventQuests':
      return { screen: 'EventQuests' };
    case 'Profile': {
      const userId = str(data.userId);
      return userId ? { screen: 'Profile', params: { userId } } : null;
    }
    case 'Chat': {
      const userId = str(data.userId);
      const username = str(data.username);
      return userId && username ? { screen: 'Chat', params: { userId, username } } : null;
    }
    default:
      return null;
  }
}

/** A gift notification's chat, written `dm:<senderId>` or `group:<groupId>`. */
function giftChat(v: unknown): GiftChatRef | null {
  const ref = str(v);
  if (!ref) return null;
  const [kind, id] = ref.split(':');
  if (!id) return null;
  if (kind === 'dm') return { kind: 'dm', userId: id };
  if (kind === 'group') return { kind: 'group', groupId: id };
  return null;
}

/** Compact relative age: "now", "5m", "2h", "3d", else a short date. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const diff = now - Date.parse(iso);
  if (Number.isNaN(diff)) return '';
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(iso).toLocaleDateString();
}

/** Badge text for an unread count: null when zero, "9+" when capped. */
export function unreadBadge(count: number, cap = 9): string | null {
  if (count <= 0) return null;
  return count > cap ? `${cap}+` : String(count);
}

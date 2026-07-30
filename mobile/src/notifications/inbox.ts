/** Pure notification-inbox helpers (KUR-097) — no React Native. */

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
  | { screen: 'Game'; params: { roomId: string } }
  | { screen: 'Profile'; params: { userId: string } }
  | { screen: 'Chat'; params: { userId: string; username: string } };

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * Resolve a notification's `data` to a navigation target, or null when there's
 * no valid target — the caller then just marks it read (the friendly fallback
 * for an expired/removed deep-link, rather than navigating into a dead screen).
 */
export function resolveDeepLink(data: Record<string, unknown>): DeepLink | null {
  switch (data.screen) {
    case 'EventQuests':
      return { screen: 'EventQuests' };
    case 'Game': {
      const roomId = str(data.roomId);
      return roomId ? { screen: 'Game', params: { roomId } } : null;
    }
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

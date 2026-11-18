/**
 * The social slide's data and the one judgement in it. `GET /me/social` answers six questions in one request (friends
 * and what they are doing, who is waiting on you, groups with unread messages), since the panel asks them all at once.
 * Pure, so the ordering is testable without a screen.
 */

/** What a friend is doing right now, when they are doing anything. */
export interface RailActivity {
  kind: string;
  /** ISO timestamp the activity started, which "7m" is counted from. */
  since: string;
}

export interface RailFriend {
  userId: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  online?: boolean;
  lastSeenAt?: string | null;
  activity?: RailActivity | null;
}

export interface RailGroup {
  id: string;
  name: string;
  memberCount: number;
  /** The group's own picture, when its owner gave it one. */
  photoUrl?: string | null;
  unread: number;
}

export interface RailPerson {
  userId: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

export interface SocialRailData {
  friends: RailFriend[];
  requests: RailPerson[];
  challenges: RailPerson[];
  groups: RailGroup[];
  unread: { notifications: number; groups: number; requests: number; challenges: number };
}

/** Friends split the way you look for them. */
export interface Buckets {
  playing: RailFriend[];
  online: RailFriend[];
  offline: RailFriend[];
}

/**
 * Three lists, each ordered by the person most worth opening: among players the longest-running game first (closest to
 * over, and to somebody free to talk); among the rest the most recently around first.
 */
export function bucket(friends: readonly RailFriend[]): Buckets {
  const playing: RailFriend[] = [];
  const online: RailFriend[] = [];
  const offline: RailFriend[] = [];
  for (const f of friends) {
    if (f.activity) playing.push(f);
    else if (f.online) online.push(f);
    else offline.push(f);
  }
  playing.sort((a, b) => new Date(a.activity!.since).getTime() - new Date(b.activity!.since).getTime());
  offline.sort((a, b) => (b.lastSeenAt ?? '').localeCompare(a.lastSeenAt ?? ''));
  return { playing, online, offline };
}

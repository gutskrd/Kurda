/**
 * The social slide's data, and the one piece of judgement in it.
 *
 * `GET /me/social` answers six questions in one request — who your friends are
 * and what they are doing right now, who is waiting on you, which groups have
 * unread messages — because the panel asks all of them at once and six round
 * trips to open a drawer is not a drawer anybody opens twice.
 *
 * Pure, so the ordering below can be tested without a screen.
 */

/** What a friend is doing right now, when they are doing anything. */
export interface RailActivity {
  kind: string;
  /** ISO timestamp the activity started, which is what "7m" is counted from */
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
  unread: number;
}

export interface RailPerson {
  userId: string;
  username: string;
  displayName?: string | null;
}

export interface SocialRailData {
  friends: RailFriend[];
  requests: RailPerson[];
  challenges: RailPerson[];
  groups: RailGroup[];
  unread: { notifications: number; groups: number; requests: number; challenges: number };
}

/** Friends split the way you actually look for them. */
export interface Buckets {
  playing: RailFriend[];
  online: RailFriend[];
  offline: RailFriend[];
}

/**
 * Three lists, each ordered by the person most worth opening.
 *
 * The longest-running game first among players — a match that started twelve
 * minutes ago is closer to being over, and to somebody free to talk, than one
 * that started thirty seconds ago. Most recently around first among the rest,
 * so the top of each list is the person most likely to answer.
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

/**
 * How many things are waiting on you, which is what the badge counts.
 *
 * Friend requests and game invites, not unread messages: a badge that included
 * every unread group message would be a number you learn to ignore, and the
 * things here are the ones that go stale — a challenge expires in two minutes.
 */
export function waitingCount(data: Pick<SocialRailData, 'unread'>): number {
  return data.unread.requests + data.unread.challenges;
}

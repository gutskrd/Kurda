import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import type { FriendService, FriendSummary } from '../friends/service.js';
import type { InboxService } from '../notifications/inbox-service.js';
import type { GroupChatService } from '../groups/chat-service.js';
import type { GroupService } from '../groups/service.js';
import type { ChallengeService } from '../game/challenge-service.js';
import { SocialRailService, type RailFriend } from './rail-service.js';

/** Anything older than this is not news; the rail shows the recent tail. */
const RECENT_NOTIFICATIONS = 8;

interface RailDeps {
  friends: FriendService;
  groups: GroupService;
  groupChat: GroupChatService;
  inbox: InboxService;
  challenges: ChallengeService;
}

/**
 * The social rail's one read.
 *
 * Everything on it already had an endpoint — friends, requests, groups, unread
 * counts, per-user challenge status. What did not exist was a way to ask "what
 * is happening with my people" without five round trips, or to discover a game
 * invite without already knowing who sent it.
 *
 * The rail polls, so this is the shape that matters: one request, one coherent
 * answer, and no half-updated rail where the badge and the list disagree.
 */
export function registerSocialRailRoutes(app: FastifyInstance, deps: RailDeps): void {
  const rail = new SocialRailService(app.db);
  const publicUrl = (k: string): string | null => (app.storage ? app.storage.publicUrl(k) : null);

  app.get('/me/social', { preHandler: requireAuth }, async (req) => {
    const me = req.user!.id;

    const [friends, requests, groups, unreadGroups, notifications, unreadNotifications] = await Promise.all([
      deps.friends.list(me, publicUrl),
      deps.friends.incomingRequests(me, publicUrl),
      deps.groups.myGroups(me),
      deps.groupChat.unread(me),
      deps.inbox.list(me),
      deps.inbox.unreadCount(me),
    ]);

    // activity and invites both need the friend list, so they wait for it;
    // `self` does not, and rides along rather than costing a third round trip
    const [activity, challenges, you] = await Promise.all([
      rail.liveActivity(friends.map((f) => f.userId)),
      incomingChallenges(deps.challenges, me, friends),
      rail.self(me, publicUrl),
    ]);

    const withActivity: RailFriend[] = friends.map((f) => ({
      ...f,
      activity: activity.get(f.userId) ?? null,
    }));

    const unreadByGroup = new Map(unreadGroups.map((g) => [g.groupId, g.unread]));

    return {
      you,
      friends: withActivity,
      requests,
      challenges,
      groups: groups
        .filter((g) => g.archivedAt === null)
        .map((g) => ({ id: g.id, name: g.name, memberCount: g.memberCount, unread: unreadByGroup.get(g.id) ?? 0 })),
      notifications: notifications.slice(0, RECENT_NOTIFICATIONS),
      unread: {
        notifications: unreadNotifications,
        groups: unreadGroups.reduce((n, g) => n + g.unread, 0),
        requests: requests.length,
        challenges: challenges.length,
      },
    };
  });
}

/**
 * Who has a game invite out to you right now.
 *
 * Challenges live in the realtime KV under `challenge:<from>:<to>` with a
 * two-minute TTL and no index, so there is nothing to list — but only a friend
 * can challenge you, which makes the friend list the complete set of senders to
 * check. Small lists, one cheap lookup each, and no second copy of the invite
 * state to fall out of step with the keys that actually gate accepting.
 */
async function incomingChallenges(
  challenges: ChallengeService,
  me: string,
  friends: FriendSummary[],
): Promise<FriendSummary[]> {
  if (friends.length === 0) return [];
  const states = await Promise.all(friends.map((f) => challenges.status(me, f.userId)));
  return friends.filter((_, i) => states[i]!.incoming);
}

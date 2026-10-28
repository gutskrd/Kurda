import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import type { FriendService } from '../friends/service.js';
import type { InboxService } from '../notifications/inbox-service.js';
import type { GroupChatService } from '../groups/chat-service.js';
import type { GroupService } from '../groups/service.js';
import { SocialRailService, type RailFriend } from './rail-service.js';

/** Anything older than this is not news; the rail shows the recent tail. */
const RECENT_NOTIFICATIONS = 8;

interface RailDeps {
  friends: FriendService;
  groups: GroupService;
  groupChat: GroupChatService;
  inbox: InboxService;
}

/**
 * The social rail's one read.
 *
 * Everything on it already had an endpoint — friends, requests, groups, unread
 * counts. What did not exist was a way to ask "what is happening with my
 * people" without five round trips.
 *
 * The rail polls, so this is the shape that matters: one request, one coherent
 * answer, and no half-updated rail where the badge and the list disagree.
 */
export function registerSocialRailRoutes(app: FastifyInstance, deps: RailDeps): void {
  const rail = new SocialRailService(app.db);
  const publicUrl = (k: string): string | null => (app.storage ? app.storage.publicUrl(k) : null);

  app.get('/me/social', { preHandler: requireAuth }, async (req) => {
    const me = req.user!.id;

    const [friends, requests, groups, unreadGroups, inbox] = await Promise.all([
      // the rail needs every friend: it asks who is live, over the whole list
      deps.friends.list(me, publicUrl).then((page) => page.friends),
      deps.friends.incomingRequests(me, publicUrl),
      deps.groups.myGroups(me, publicUrl),
      deps.groupChat.unread(me),
      // the recent tail and the unread count, in one read
      deps.inbox.recent(me, RECENT_NOTIFICATIONS),
    ]);

    // activity needs the friend list, so it waits for it; `self` does not, and
    // rides along rather than costing another round trip (with the unopened-gift
    // badge, so the apps need not poll `/me/gifts/unseen` for it)
    const [activity, { you, unseenGifts }] = await Promise.all([
      rail.liveActivity(friends.map((f) => f.userId)),
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
      // Friend challenges were invites to the ranked quiz, which is gone. The
      // field stays, always empty: phone builds already installed read
      // `challenges.length` and add `unread.challenges` without a default, and
      // would crash or show NaN if either went missing.
      challenges: [] as never[],
      groups: groups
        .filter((g) => g.archivedAt === null)
        .map((g) => ({ id: g.id, name: g.name, memberCount: g.memberCount, photoUrl: g.photoUrl, unread: unreadByGroup.get(g.id) ?? 0 })),
      notifications: inbox.items,
      unread: {
        notifications: inbox.unread,
        gifts: unseenGifts,
        groups: unreadGroups.reduce((n, g) => n + g.unread, 0),
        requests: requests.length,
        challenges: 0,
      },
    };
  });
}

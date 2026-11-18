import type { FastifyInstance } from 'fastify';
import { requireAccount } from '../plugins/auth.js';
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
 * The social rail's one read: friends, requests, groups and unread counts in one coherent answer, since the rail
 * polls and separate requests could leave its badge and list disagreeing.
 */
export function registerSocialRailRoutes(app: FastifyInstance, deps: RailDeps): void {
  const rail = new SocialRailService(app.db);
  const publicUrl = (k: string): string | null => (app.storage ? app.storage.publicUrl(k) : null);

  app.get('/me/social', { preHandler: requireAccount }, async (req) => {
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

    // Activity needs the friend list, so it waits; `self` does not, and rides along with the unopened-gift count so the
    // apps need not poll `/me/gifts/unseen`.
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
      // Friend challenges are gone, but installed phone builds read `challenges.length` and `unread.challenges` without a
      // default, so the fields stay, always empty.
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

/**
 * A held account (moderation/returns.ts) can learn but cannot post, comment, message, upload, write letters or join
 * groups; every route that does one of those must refuse it with 403 ACCOUNT_HELD. This walks the route table of a
 * built app: each write under the social surfaces either carries a guard that refuses a held account (`HOLD_GUARD`) or
 * is listed below with why it needs none. A new route that does neither fails here until someone decides.
 */
import type { RouteOptions } from 'fastify';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { routeRefusesHeld } from './restrictions.js';

/** Where posting, messaging, uploading, letters and groups live. */
const SOCIAL = [/^\/library\//, /^\/images\//, /^\/media\//, /^\/chat\//, /^\/dm\//, /^\/groups/, /^\/letters/, /^\/gifts/, /^\/play\//, /^\/me\/profile-picture$/, /^\/me\/username$/];

/**
 * Writes under those surfaces that a held account may make, or that refuse it inside the service, each with why. A
 * route checked in its service must also be covered by an integration test of the hold.
 */
const NEEDS_NO_GUARD: Record<string, string> = {
  // refused inside the service, which every way of sending goes through (tested in returns.integration.test.ts)
  'POST /groups/:id/chat': 'groups/chat-service.ts `send` asks `assertUnrestricted`',
  'POST /gifts': 'gifts/service.ts asks `assertUnrestricted` before the card goes into a chat',
  // taking one's own words back, or leaving, is never refused
  'DELETE /library/posts/:id': 'deleting one’s own post',
  'DELETE /library/comments/:id': 'deleting one’s own comment',
  'DELETE /images/:id': 'deleting one’s own post',
  'DELETE /images/comments/:id': 'deleting one’s own comment',
  'POST /library/posts/:id/unpublish': 'taking one’s own post down',
  'DELETE /me/profile-picture': 'taking one’s own photo down',
  'POST /groups/:id/leave': 'leaving',
  'DELETE /groups/:id/requests': 'withdrawing one’s own request',
  'DELETE /groups/:id': 'deleting one’s own group',
  'DELETE /groups/:id/chat/:messageId': 'deleting a message',
  'POST /groups/:id/chat/clear': 'clearing one’s own view',
  'POST /groups/:id/join': 'answers INVITE_ONLY to everyone',
  'DELETE /letters/out': 'calling one’s own bird home',
  'DELETE /letters/visitor': 'sending a visiting bird away',
  'POST /letters/threads/:threadId/end': 'ending a correspondence',
  // reporting stays open to everyone, held or not
  'POST /library/posts/:id/report': 'a report',
  'POST /library/comments/:id/report': 'a report',
  'POST /images/:id/report': 'a report',
  'POST /images/comments/:id/report': 'a report',
  'POST /chat/reports': 'a report',
  // marks that post nothing others read
  'PUT /images/:id/reaction': 'a reaction carries no words or media',
  'DELETE /images/:id/reaction': 'taking a reaction back',
  'POST /chat/:userId/read': 'a read receipt',
  'POST /chat/:userId/typing': 'a typing indicator',
  'POST /groups/:id/chat/read': 'a read receipt',
  'POST /groups/:id/chat/typing': 'a typing indicator',
  'POST /letters/landed': 'a letter seen landing',
  'POST /letters/bird': 'choosing one’s bird',
  'POST /letters/widget/tokens': 'the home screen widget’s own sign-in',
  'DELETE /letters/widget/tokens': 'the home screen widget’s own sign-in',
  'DELETE /letters/widget/tokens/current': 'the home screen widget’s own sign-in',
  'PUT /letters/widget/prefs': 'the home screen widget’s settings',
  'POST /gifts/:id/open': 'opening a gift one was given',
  'POST /gifts/bag/seen': 'marking what landed in one’s own gift bag as told, which nobody else sees',
  // running a group one is already in is neither joining it nor posting in it; adding someone checks their hold
  'DELETE /groups/:id/photo': 'taking a group photo down',
  'POST /groups/:id/invite': 'the added person’s hold is checked in groups/service.ts `invite`',
  'POST /groups/:id/transfer': 'running a group',
  'PUT /groups/:id/members/:userId/role': 'running a group',
  'DELETE /groups/:id/members/:userId': 'running a group',
  'POST /groups/:id/bans': 'running a group',
  'DELETE /groups/:id/bans/:userId': 'running a group',
  'POST /groups/:id/requests/:userId/approve': 'running a group',
  'POST /groups/:id/requests/:userId/decline': 'running a group',
  'POST /groups/:id/mutes': 'running a group',
  'DELETE /groups/:id/mutes/:userId': 'running a group',
  // games are learning; a game card to a friend is a message, refused in chat/service.ts `sendCard`
  'POST /play/lobbies': 'a game',
  'POST /play/invites': 'a game; its card is refused in chat/service.ts',
  'POST /play/join': 'a game',
  'POST /play/invites/:id/accept': 'a game',
  'POST /play/invites/:id/decline': 'a game',
  'DELETE /play/invites/:id': 'a game',
  'PUT /play/:game/:lobbyId/rated': 'a game',
  'POST /play/:game/:lobbyId/rematch': 'a game',
  'DELETE /play/:game/:lobbyId/rematch': 'a game',
};

describe('the hold on possible returns', () => {
  it('guards every social write, or says why it needs no guard', async () => {
    const routes: Array<{ method: string; url: string; preHandler: unknown }> = [];
    const app = buildApp(loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'fatal', DATABASE_URL: 'postgres://nobody:nothing@127.0.0.1:1/none' }), {
      onRoute: (route: RouteOptions) => {
        for (const method of [route.method].flat()) routes.push({ method, url: route.url, preHandler: route.preHandler });
      },
    });
    try {
      await app.ready();
      const writes = routes.filter((r) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method) && SOCIAL.some((p) => p.test(r.url)));
      expect(writes.length).toBeGreaterThan(20);
      const unguarded = writes
        .filter((r) => !routeRefusesHeld(r.preHandler))
        .map((r) => `${r.method} ${r.url}`)
        .filter((key) => !(key in NEEDS_NO_GUARD));
      expect(unguarded).toEqual([]);
    } finally {
      await app.close();
    }
  });
});

/**
 * A parent's switches (shared/src/parental.ts) close parts of Hevalo to a supervised teen, and every write those parts
 * are made of must ask the parental guard. This walks the route table of a built app: each write under a switch's
 * surfaces either carries `requireParental` for that switch or is listed below with why it needs none. A new route that
 * does neither fails here until someone decides.
 */
import type { RouteOptions } from 'fastify';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { routeParentalSwitch, type GuardedSwitch } from './supervision.js';

/** Where each switch's part of Hevalo lives. */
const SURFACES: Array<[RegExp, GuardedSwitch]> = [
  [/^\/chat\//, 'chat'],
  [/^\/groups/, 'chat'],
  [/^\/gifts/, 'chat'],
  [/^\/shop\/gift$/, 'chat'],
  [/^\/letters/, 'letters'],
  [/^\/library\//, 'posts'],
  [/^\/images/, 'posts'],
  [/^\/posts\//, 'posts'],
  [/^\/activity\//, 'posts'],
  [/^\/play\//, 'games'],
  [/^\/mp\//, 'games'],
  [/^\/story-games/, 'games'],
  [/^\/wordle\/battles/, 'games'],
  [/^\/rhyme\/matches/, 'games'],
  [/^\/tournaments/, 'games'],
  [/^\/friends/, 'friends'],
];

/** Writes under those surfaces that ask the guard elsewhere, or need not, each with why. */
const NEEDS_NO_GUARD: Record<string, string> = {
  // asked inside the service, which every way of doing it goes through (enforcement.integration.test.ts)
  'POST /chat/:userId/messages': 'chat/service.ts `send` asks, as `sendCard` does for a game card',
  'POST /groups/:id/chat': 'groups/chat-service.ts `assertCanPost` asks, for text, gifts and game cards alike',
  'POST /gifts': 'gifts/service.ts asks, or `assertCanPost` for a gift in a group',
  'POST /shop/gift': 'the same gift service as POST /gifts',
  'POST /groups/:id/invite': 'the person added is checked in groups/service.ts `invite`, and the inviter is running a group',
  // asked in the handler, for part of what the route does
  'POST /posts/:type/:id/:kind': 'asked for a like or a repost, not for a bookmark or for taking one back',
  'POST /story-games': 'asked for a game with other people, not for a story read alone',
  // taking back, leaving, ending and reporting are never refused
  'DELETE /library/posts/:id': 'deleting one’s own post',
  'POST /library/posts/:id/unpublish': 'taking one’s own post down',
  'DELETE /library/comments/:id': 'deleting one’s own comment',
  'POST /library/posts/:id/report': 'a report',
  'POST /library/comments/:id/report': 'a report',
  'DELETE /images/:id': 'deleting one’s own post',
  'DELETE /images/:id/reaction': 'taking a reaction back',
  'DELETE /images/comments/:id': 'deleting one’s own comment',
  'POST /images/:id/report': 'a report',
  'POST /images/comments/:id/report': 'a report',
  'POST /chat/reports': 'a report',
  'POST /groups/:id/leave': 'leaving',
  'DELETE /groups/:id/requests': 'withdrawing one’s own request',
  'DELETE /groups/:id': 'deleting one’s own group',
  'DELETE /groups/:id/chat/:messageId': 'deleting a message',
  'POST /groups/:id/chat/clear': 'clearing a chat',
  'POST /groups/:id/join': 'answers INVITE_ONLY to everyone',
  'DELETE /letters/out': 'calling one’s own bird home',
  'DELETE /letters/visitor': 'sending a visiting bird away',
  'POST /letters/threads/:threadId/end': 'ending a correspondence',
  'POST /friends/requests/:userId/decline': 'saying no',
  'DELETE /friends/requests/:userId': 'withdrawing one’s own request',
  'DELETE /friends/:userId': 'ending a friendship',
  'POST /friends/:userId/block': 'blocking',
  'DELETE /friends/:userId/block': 'unblocking',
  'POST /play/invites/:id/decline': 'saying no',
  'DELETE /play/invites/:id': 'taking one’s own invite back',
  'DELETE /play/:game/:lobbyId/rematch': 'saying no to playing again',
  'POST /mp/:game/:id/leave': 'leaving a game',
  'POST /story-games/:id/leave': 'leaving a game',
  'POST /wordle/battles/:id/leave': 'leaving a game',
  'POST /rhyme/matches/:id/leave': 'leaving a game',
  // marks that reach nobody, or reach others with nothing of the teen's own
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
  // running a group one is already in is neither joining it nor writing in its chat
  'PATCH /groups/:id': 'running a group',
  'POST /groups/:id/photo': 'running a group',
  'DELETE /groups/:id/photo': 'running a group',
  'POST /groups/:id/transfer': 'running a group',
  'PUT /groups/:id/members/:userId/role': 'running a group',
  'DELETE /groups/:id/members/:userId': 'running a group',
  'POST /groups/:id/bans': 'running a group',
  'DELETE /groups/:id/bans/:userId': 'running a group',
  'POST /groups/:id/requests/:userId/approve': 'running a group',
  'POST /groups/:id/requests/:userId/decline': 'running a group',
  'POST /groups/:id/mutes': 'running a group',
  'DELETE /groups/:id/mutes/:userId': 'running a group',
  // Inside a game already joined: a game is not cut off for the other players halfway, and the next one is refused.
  'PUT /play/:game/:lobbyId/rated': 'a game already joined',
  'POST /mp/:game/:id/start': 'a game already joined',
  'POST /mp/:game/:id/moves': 'a game already joined',
  'POST /mp/:game/:id/remove': 'a game already joined',
  'POST /mp/:game/:id/team': 'a game already joined',
  'POST /story-games/:id/start': 'a game already joined',
  'POST /story-games/:id/done-reading': 'a game already joined',
  'POST /story-games/:id/answers': 'a game already joined',
  'POST /story-games/:id/continue': 'a game already joined',
  'POST /story-games/:id/advance': 'a game already joined',
  'POST /story-games/:id/remove': 'a game already joined',
  'POST /story-games/:id/extra-time': 'a game already joined',
  'PATCH /story-games/:id/settings': 'a game already joined',
  'POST /wordle/battles/:id/start': 'a game already joined',
  'POST /wordle/battles/:id/guesses': 'a game already joined',
  'POST /wordle/battles/:id/remove': 'a game already joined',
  'POST /rhyme/matches/:id/start': 'a game already joined',
  'POST /rhyme/matches/:id/submissions': 'a game already joined',
  'POST /rhyme/matches/:id/remove': 'a game already joined',
  'POST /tournaments/:id/matches/:matchId/check-in': 'a tournament already entered',
  'POST /tournaments/:id/matches/:matchId/result': 'a tournament already entered',
  // played alone, or staff's
  'POST /mp/:game/solo': 'a game played alone',
  'POST /tournaments': 'staff only',
  'POST /tournaments/:id/start': 'staff only',
};

describe('the parental switches', () => {
  it('guard every write they name, or say why it needs no guard', async () => {
    const routes: Array<{ method: string; url: string; preHandler: unknown }> = [];
    const app = buildApp(loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'fatal', DATABASE_URL: 'postgres://nobody:nothing@127.0.0.1:1/none' }), {
      onRoute: (route: RouteOptions) => {
        for (const method of [route.method].flat()) routes.push({ method, url: route.url, preHandler: route.preHandler });
      },
    });
    try {
      await app.ready();
      const writes = routes.filter((r) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method) && SURFACES.some(([p]) => p.test(r.url)));
      expect(writes.length).toBeGreaterThan(60);
      const wrong = writes
        .filter((r) => !(`${r.method} ${r.url}` in NEEDS_NO_GUARD))
        .filter((r) => routeParentalSwitch(r.preHandler) !== SURFACES.find(([p]) => p.test(r.url))![1])
        .map((r) => `${r.method} ${r.url} (${routeParentalSwitch(r.preHandler) ?? 'no guard'})`);
      expect(wrong).toEqual([]);
      // and nothing listed as needing no guard is left over from a route that is gone or now carries one
      const listed = new Set(writes.map((r) => `${r.method} ${r.url}`));
      const stale = Object.keys(NEEDS_NO_GUARD).filter(
        (key) => !listed.has(key) || routeParentalSwitch(writes.find((r) => `${r.method} ${r.url}` === key)!.preHandler) !== null,
      );
      expect(stale).toEqual([]);
    } finally {
      await app.close();
    }
  });
});

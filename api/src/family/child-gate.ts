import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../config/env.js';
import { AppError } from '../plugins/errors.js';

/**
 * What a child profile may do, decided for every request in one place: a child's session reaches only the routes
 * listed here, each an exact `METHOD /route`, and is refused everything else, so a route added later is closed to
 * children until someone decides it belongs. A child learns (lessons, practice, stories read aloud, riddles, proverbs,
 * the alphabet, the dictionary, the tree, streaks, XP, badges, looks they own and games on one phone) and never meets
 * anyone: no chat, friends, posts, letters, online games, boards, profiles, uploads, gifts, shop or analytics.
 *
 * A child's session is for the phone app alone, so any request from a browser (which always says its origin) is
 * refused too; outside production a developer's own machine may run the phone app in a browser.
 */
export const CHILD_ROUTES: ReadonlySet<string> = new Set([
  // the session itself, the parent's limits, and the account's own settings that are not published
  'GET /me',
  'PATCH /me',
  'POST /me/usage',
  'GET /me/today',
  'GET /me/daily-goal',
  'PUT /me/daily-goal',
  'POST /me/devices',
  'POST /me/devices/heartbeat',
  'POST /me/devices/remove',
  'GET /status',
  'GET /art/overrides',
  'GET /reactions',
  // the child's side of the family: who is in it, asking a parent, and the way back to the parent on their phone
  'GET /me/family',
  'GET /me/family/purchase-requests',
  'POST /me/family/purchase-requests',
  'POST /auth/child/return',
  // lessons, the course map and the placement and jump tests
  'GET /courses',
  'GET /courses/:id/map',
  'GET /courses/:courseId/skill-strength',
  'POST /courses/:courseId/jump',
  'POST /courses/:courseId/placement',
  'POST /placement/:sessionId/answer',
  'GET /lessons/:id/session',
  'GET /sessions/:id',
  'POST /sessions/:id/answers',
  'POST /sessions/:id/complete',
  'POST /sessions/:id/retry',
  'GET /skills/:id/grammar',
  'GET /review/queue',
  // practice
  'GET /practice/due',
  'GET /practice/hub',
  'POST /practice/session',
  'GET /practice/sessions/:id',
  'POST /practice/sessions/:id/answers',
  'POST /practice/sessions/:id/complete',
  'POST /practice/sessions/:id/retry',
  // stories read aloud, and the Hevalo book
  'GET /stories',
  'GET /stories/library',
  'GET /stories/categories',
  'GET /stories/:idOrSlug',
  'PUT /stories/:id/progress',
  'PUT /stories/:id/bookmark',
  'DELETE /stories/:id/bookmark',
  'GET /me/stories',
  'GET /books/road',
  'GET /books/road.pdf',
  // riddles and proverbs
  'GET /riddles',
  'GET /riddles/daily',
  'GET /riddles/:slug',
  'POST /riddles/:slug/guess',
  'POST /riddles/:slug/hint',
  'POST /riddles/:slug/reveal',
  'GET /proverbs',
  'GET /proverbs/:slug',
  'POST /proverbs/rounds',
  'GET /proverbs/rounds/open',
  'GET /proverbs/rounds/:id',
  'POST /proverbs/rounds/:id/answers',
  'POST /proverbs/rounds/:id/finish',
  // the alphabet and the dictionary
  'GET /alphabet/audio',
  'GET /dictionary/search',
  'GET /dictionary/word-of-day',
  'GET /dictionary/entries/:id',
  'PUT /dictionary/entries/:id/save',
  'DELETE /dictionary/entries/:id/save',
  'GET /me/saved-words',
  // the tree, planted and watered by learning; another kind is bought, which a child does not do
  'GET /me/tree',
  'POST /me/tree/plant',
  'POST /me/tree/water',
  // badges and the old achievements
  'GET /me/badges',
  'GET /me/badges/unseen',
  'POST /me/badges/seen',
  'GET /me/achievements',
  'GET /me/achievements/unseen',
  'POST /me/achievements/seen',
  // looks they own: the preset avatars, and wearing what is theirs
  'GET /cosmetics/avatars',
  'GET /me/inventory',
  'POST /me/inventory/refreshed/seen',
  'PUT /me/cosmetics/avatar',
  'PUT /me/cosmetics/background',
  'PUT /me/cosmetics/icon',
  'PUT /me/cosmetics/frame',
  'PUT /me/cosmetics/icon/visibility',
  // games played alone or passed round one phone
  'GET /games/availability',
  'GET /games/build-sentence/ladder',
  'GET /games/solo/open',
  'POST /games/solo/sessions',
  'GET /games/solo/sessions/:id',
  'POST /games/solo/sessions/:id/answers',
  'POST /games/solo/sessions/:id/begin',
  'GET /games/solo/sessions/:id/clips/:clip',
  'POST /games/solo/sessions/:id/finish',
  'POST /games/solo/sessions/:id/hints',
  'GET /games/who-am-i/couch',
  'POST /games/who-am-i/couch/deal',
  'GET /games/impostor/couch',
  'POST /games/impostor/couch/deck',
  'POST /wordle/daily',
  'POST /wordle/practice',
  'POST /wordle/games/:id/guesses',
  'POST /wordle/games/:id/save',
  'GET /wordle/stats',
  'POST /rhyme/training',
  'POST /rhyme/training/:id/guesses',
  'POST /rhyme/training/:id/end',
  'POST /race',
  'POST /race/:id/finish',
  'GET /race/best',
]);

/** 403 CHILD_PROFILE: a part of Hevalo a child profile does not have. */
export function childRefused(): AppError {
  return new AppError('CHILD_PROFILE', 403, 'this part of Hevalo is not for child profiles');
}

/** 403 CHILD_PROFILE_PHONE_ONLY: a child's profile is used in the phone app, never on the website. */
export function childPhoneOnly(): AppError {
  return new AppError('CHILD_PROFILE_PHONE_ONLY', 403, 'a child profile is used in the Hevalo phone app');
}

/** Whether a child's session may use this route (its pattern, not the address asked for). */
export function childMayUse(method: string, routeUrl: string | undefined): boolean {
  return routeUrl !== undefined && CHILD_ROUTES.has(`${method} ${routeUrl}`);
}

/** A developer's own machine, where the phone app may run in a browser outside production. */
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * Whether the request came from a browser: browsers say where a page is from on every request to another site, and
 * the phone app never does. Outside production a page on the developer's own machine counts as the phone.
 */
export function fromBrowser(req: FastifyRequest, config: Pick<AppConfig, 'NODE_ENV'>): boolean {
  const origin = req.headers.origin;
  if (typeof origin !== 'string' || origin === '') return false;
  return config.NODE_ENV === 'production' || !LOCAL_ORIGIN.test(origin);
}

/**
 * The gate, as one deny-by-default hook before every route, like the activation gate: a request without a child's
 * session costs one comparison. It runs before the body is read, so a child hears the same refusal whatever they send.
 */
export function installChildGate(app: FastifyInstance, config: Pick<AppConfig, 'NODE_ENV'>): void {
  app.addHook('preValidation', async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.user?.child !== true) return;
    const refusal = fromBrowser(req, config) ? childPhoneOnly() : childMayUse(req.method, req.routeOptions.url) ? null : childRefused();
    if (!refusal) return;
    await reply.code(refusal.statusCode).send({ code: refusal.code, message: refusal.message, requestId: req.id });
  });
}

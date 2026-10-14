import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { RANKED_GAMES, isSeasonId, type RankedGame } from '@kurda/shared';
import { requireAuth, requireRoles } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import type { RankService } from './service.js';
import type { RankSeasons } from './seasons.js';
import type { RankAdmin } from './admin.js';

const game = z.enum(RANKED_GAMES);
const gameParam = z.object({ game });
const refParams = z.object({ game, ref: z.uuid() });
const lobbyParams = z.object({ game, lobbyId: z.uuid() });
const boardQuery = z.object({ scope: z.enum(['friends', 'top']).default('friends') });
const ratedBody = z.object({ rated: z.boolean() });
const reasonBody = z.object({ reason: z.string().trim().min(3).max(500) });
const seasonParam = z.object({ id: z.string().max(10) });

const notFound = () => new AppError('NOT_FOUND', 404, 'not found');

/**
 * Game Ranks (contract-4 §R; shapes in @kurda/shared `ranks`). Everything is
 * about the signed-in player or a game they are in; a game they are not in is
 * "not found", like one that does not exist. The admin routes are staff-only
 * (and behind the admin 2FA gate, like every /admin route).
 */
export function registerRankRoutes(
  app: FastifyInstance,
  deps: { ranks: RankService; seasons: RankSeasons; admin: RankAdmin },
): void {
  const { ranks, seasons, admin } = deps;

  /** Your rank in every game, a running rated-game cooldown, and the season (`MyRanks`). */
  app.get('/ranks/me', { preHandler: requireAuth }, async (req) => ranks.myRanks(req.user!.id));

  /** Your rank in one game (`RankCard`). */
  app.get('/ranks/me/:game', { schema: { params: gameParam }, preHandler: requireAuth }, async (req) =>
    ranks.card(req.user!.id, (req.params as { game: RankedGame }).game),
  );

  /** What a game you played did to your rank, with its one plain reason (`RankResult`). */
  app.get('/ranks/results/:game/:ref', { schema: { params: refParams }, preHandler: requireAuth }, async (req) => {
    const p = req.params as { game: RankedGame; ref: string };
    const result = await ranks.result(req.user!.id, p.game, p.ref);
    if (!result) throw notFound();
    return result;
  });

  /** In a lobby you are in: "Win ≈ +24 · Lose ≈ −8" per opponent, and whether it would count now (`ExpectedGains`). */
  app.get('/ranks/expected/:game/:lobbyId', { schema: { params: lobbyParams }, preHandler: requireAuth }, async (req) => {
    const p = req.params as { game: RankedGame; lobbyId: string };
    const gains = await ranks.expected(req.user!.id, p.game, p.lobbyId);
    if (!gains) throw notFound();
    return gains;
  });

  /** A game's Friends board (always) or Top board (`RankBoard`). */
  app.get(
    '/ranks/boards/:game',
    { schema: { params: gameParam, querystring: boardQuery }, preHandler: requireAuth },
    async (req) => {
      const { scope } = req.query as z.infer<typeof boardQuery>;
      return ranks.board(req.user!.id, (req.params as { game: RankedGame }).game, scope);
    },
  );

  /** Your remembered Rated/Friendly choice per game (what a setup sheet starts on). */
  app.get('/ranks/preferences', { preHandler: requireAuth }, async (req) => {
    const rows = await app.db.query<{ game: RankedGame; rated: boolean }>(
      `SELECT game, rated FROM rank_preferences WHERE user_id = $1`,
      [req.user!.id],
    );
    return { preferences: Object.fromEntries(rows.rows.map((r) => [r.game, r.rated])) as Partial<Record<RankedGame, boolean>> };
  });

  /** Remember a Rated/Friendly choice for a game (a setup sheet's toggle, before any lobby exists). */
  app.put(
    '/ranks/preferences/:game',
    { schema: { params: gameParam, body: ratedBody }, config: { rateLimit: { max: 30, windowMs: 60_000 } }, preHandler: requireAuth },
    async (req) => {
      const { game: g } = req.params as { game: RankedGame };
      const { rated } = req.body as z.infer<typeof ratedBody>;
      await ranks.rememberChoice(app.db, req.user!.id, g, rated);
      return { game: g, rated };
    },
  );

  /** The season now, its rewards, and your last season (`SeasonOverview`). */
  app.get('/ranks/seasons/current', { preHandler: requireAuth }, async (req) => seasons.overview(req.user!.id));

  /** Your season emblems, kept forever (`SeasonEmblem[]`). */
  app.get('/ranks/seasons/me', { preHandler: requireAuth }, async (req) => ({ emblems: await seasons.emblems(req.user!.id) }));

  // ---- admin -----------------------------------------------------------------

  /** How the active players spread over the tiers, per game (to tune the one tier table). */
  app.get('/admin/ranks/spread', { preHandler: requireRoles('admin') }, async () => ({ games: await admin.spread() }));

  /** The top players of a game, by name. */
  app.get('/admin/ranks/top/:game', { schema: { params: gameParam }, preHandler: requireRoles('admin') }, async (req) => ({
    players: await admin.top((req.params as { game: RankedGame }).game),
  }));

  /** Pairs whose rated games together look unusual: signals only. */
  app.get('/admin/ranks/suspicious-pairs', { preHandler: requireRoles('admin') }, async () => ({
    pairs: await admin.suspiciousPairs(),
  }));

  /** The rated games a pair played together in a game: what a suspicious pair opens, to void from. */
  app.get(
    '/admin/ranks/pairs/:game/:a/:b',
    { schema: { params: z.object({ game, a: z.uuid(), b: z.uuid() }) }, preHandler: requireRoles('admin') },
    async (req) => {
      const p = req.params as { game: RankedGame; a: string; b: string };
      return { games: await admin.pairGames(p.game, p.a, p.b) };
    },
  );

  /** One player's rank in every game and their latest rated games (`AdminPlayerRanks`): the person page's Ranks tab. */
  app.get(
    '/admin/ranks/players/:userId',
    { schema: { params: z.object({ userId: z.uuid() }) }, preHandler: requireRoles('admin') },
    async (req) => {
      const { userId } = req.params as { userId: string };
      const games = await admin.playerGames(userId);
      if (!games) throw notFound();
      return { ranks: (await ranks.myRanks(userId)).ranks, games };
    },
  );

  /** Void one game's rating effect: the game stops counting and everyone it touched is replayed from history. */
  app.post(
    '/admin/ranks/games/:game/:ref/void',
    { schema: { params: refParams, body: reasonBody }, preHandler: requireRoles('admin') },
    async (req) => {
      const p = req.params as { game: RankedGame; ref: string };
      const { reason } = req.body as z.infer<typeof reasonBody>;
      return admin.voidGame(p.game, p.ref, req.user!.id, reason);
    },
  );

  /** Reset one player's rating in one game to the start (placement again). */
  app.post(
    '/admin/ranks/players/:userId/:game/reset',
    { schema: { params: z.object({ userId: z.uuid(), game }), body: reasonBody }, preHandler: requireRoles('admin') },
    async (req) => {
      const p = req.params as { userId: string; game: RankedGame };
      await admin.reset(p.userId, p.game);
      return { ok: true };
    },
  );

  /** The seasons: the current one, and each closed one with what it handed out. */
  app.get('/admin/seasons', { preHandler: requireRoles('admin') }, async () => seasons.adminList());

  /**
   * A season's rewards (`AdminSeasonRewards`): who its close would reward now,
   * and with what — an open season's players included, as if it closed now —
   * and what it has handed out already.
   */
  app.get('/admin/seasons/:id/rewards', { schema: { params: seasonParam }, preHandler: requireRoles('admin') }, async (req) => {
    const { id } = req.params as { id: string };
    if (!isSeasonId(id)) throw new AppError('BAD_SEASON', 400, 'not a season id');
    return { rewards: await seasons.previewRewards(id), given: await seasons.givenRewards(id) };
  });

  /** Close the seasons that have ended now, rather than at the next run (idempotent). */
  app.post('/admin/seasons/end', { config: { skipValidation: true }, preHandler: requireRoles('admin') }, async () => ({
    processed: await seasons.closeDue(),
  }));
}

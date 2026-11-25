import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { lowerUuid } from '../http/ids.js';
import { PLAY_GAMES, seasonDaysLeft, seasonOf, type MyRanks, type SeasonEmblem, type SeasonOverview } from '@kurda/shared';
import { requireAccount } from '../plugins/auth.js';

/**
 * Game ranks and seasons have ended and every game is friendly. Installed phone builds still read these routes, so each
 * answers the empty shape those builds show as "no rank yet", reading and writing nothing. The stored ranks history
 * stays in the data export (gdpr.ts).
 */

/** The calendar quarter `now` falls in, the season older builds expect beside their ranks. */
function seasonNow(now: Date): MyRanks['season'] {
  const season = seasonOf(now);
  return { ...season, daysLeft: seasonDaysLeft(season, now) };
}

const resultParams = z.object({ game: z.string().max(40), ref: lowerUuid() });

export function registerRankRoutes(app: FastifyInstance): void {
  app.get('/ranks/me', { preHandler: requireAccount }, async (): Promise<MyRanks> => ({ ranks: [], cooldownUntil: null, season: seasonNow(new Date()) }));

  /** Older builds ask what a finished game did to their rank: nothing, it was friendly. */
  app.get('/ranks/results/:game/:ref', { schema: { params: resultParams }, preHandler: requireAccount }, async (req) => {
    const { game, ref } = req.params as z.infer<typeof resultParams>;
    return { game, gameRef: ref, counted: false, friendlyReason: 'chosen' };
  });

  /** Friendly for every game, so an older build's set-up sheet starts there. */
  app.get('/ranks/preferences', { preHandler: requireAccount }, async () => ({
    preferences: Object.fromEntries(PLAY_GAMES.map((g) => [g, false])),
  }));

  app.get('/ranks/seasons/current', { preHandler: requireAccount }, async (): Promise<SeasonOverview> => ({
    season: seasonNow(new Date()),
    rewards: [],
    // older builds divide by it
    minGames: 10,
    lastSeason: null,
  }));

  app.get('/ranks/seasons/me', { preHandler: requireAccount }, async (): Promise<{ emblems: SeasonEmblem[] }> => ({ emblems: [] }));
}

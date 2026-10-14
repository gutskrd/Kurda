import type pg from 'pg';
import type { Redis } from 'ioredis';
import { ActivityService } from '../activity/service.js';
import { FriendService } from '../friends/service.js';
import { GemService } from '../gems/service.js';
import { createProgression } from '../badges/progression.js';
import { RedisRoomPublisher } from '../realtime/bus.js';
import { RankService } from '../ranks/service.js';
import { WalletService } from '../wallet/service.js';
import { StoryGameNotifier } from './notifier.js';
import { StoryGamesService } from './service.js';

interface Log {
  warn: (obj: unknown, msg: string) => void;
  info?: (obj: unknown, msg: string) => void;
}

/**
 * The story games for a process that serves none of their routes: the job
 * worker, which takes a closing account out of the games it is still in.
 *
 * Taking someone out can finish a game for everybody else — they may have been
 * the last player a question waited for, and closing the last question pays
 * the others. So this pays exactly as the API does, with the services app.ts
 * wires for it: XP that joins the weekly league, the badges after the commit,
 * and — when the game was rated — its rating changes, which the ranked badges
 * hear of through the same events as on the API. And with Redis it tells the API instances, through a
 * publish-only notifier on the room bus: their waiting polls wake at once, and
 * their deadline timers, finding a newer version than the one they were armed
 * with, read the game again instead of sleeping on its old deadline. It arms no
 * timers of its own; nothing would be left in this process to run them.
 */
export function standaloneStoryGames(pool: pg.Pool, opts: { redis?: Redis | null; log?: Log } = {}): StoryGamesService {
  const log: Log = opts.log ?? { warn: () => undefined };
  const redis = opts.redis ?? undefined;
  const gems = new GemService(pool, new WalletService(pool));
  const activity = new ActivityService(pool, new FriendService(pool), redis);
  // badges reached here are counted without a celebration of their own: the
  // app shows them from `GET /me/badges/unseen` when it next opens
  const ranks = new RankService(pool, { log });
  const { xp, badges } = createProgression(pool, { ranks: ranks.events, gems, activity, log });
  return new StoryGamesService(pool, {
    xp,
    milestones: badges,
    ranks,
    notifier: redis ? new StoryGameNotifier(new RedisRoomPublisher(redis), log) : null,
    log,
    timers: false,
  });
}

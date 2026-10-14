import type pg from 'pg';
import type { Redis } from 'ioredis';
import { AchievementsService } from '../achievements/service.js';
import { ActivityService } from '../activity/service.js';
import { FriendService } from '../friends/service.js';
import { GemService } from '../gems/service.js';
import { LeagueService } from '../leagues/service.js';
import { RedisRoomPublisher } from '../realtime/bus.js';
import { WalletService } from '../wallet/service.js';
import { XpService } from '../xp/service.js';
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
 * wires for it: XP that joins the weekly league, and the streak milestones
 * after the commit. And with Redis it tells the API instances, through a
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
  const leagues = new LeagueService(pool, { gems, activity, log });
  return new StoryGamesService(pool, {
    xp: new XpService(pool, (award) => void leagues.onXp(award).catch((err) => log.warn({ err }, 'league join failed'))),
    milestones: new AchievementsService(pool, gems, activity),
    notifier: redis ? new StoryGameNotifier(new RedisRoomPublisher(redis), log) : null,
    log,
    timers: false,
  });
}

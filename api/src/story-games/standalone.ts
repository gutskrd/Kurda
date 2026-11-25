import type pg from 'pg';
import type { Redis } from 'ioredis';
import { ActivityService } from '../activity/service.js';
import { FriendService } from '../friends/service.js';
import { EarnService } from '../earn/service.js';
import { createProgression } from '../badges/progression.js';
import { RedisRoomPublisher } from '../realtime/bus.js';
import { WalletService } from '../wallet/service.js';
import { StoryGameNotifier } from './notifier.js';
import { StoryGamesService } from './service.js';

interface Log {
  warn: (obj: unknown, msg: string) => void;
  info?: (obj: unknown, msg: string) => void;
}

/**
 * The story games for a process that serves none of their routes: the job worker, which removes a closing account from
 * its games.
 *
 * Removing someone can finish a game for the others (they may have been the last player a question waited for), so this
 * pays exactly as the API does with the services app.ts wires: league XP and badges. With Redis it publishes on the room
 * bus so the API's polls wake at once and their timers re-read the game. It arms no timers of its own.
 */
export function standaloneStoryGames(pool: pg.Pool, opts: { redis?: Redis | null; log?: Log } = {}): StoryGamesService {
  const log: Log = opts.log ?? { warn: () => undefined };
  const redis = opts.redis ?? undefined;
  const earn = new EarnService(pool, new WalletService(pool));
  const activity = new ActivityService(pool, new FriendService(pool));
  // badges reached here are counted without a celebration of their own: the
  // app shows them from `GET /me/badges/unseen` when it next opens
  const { xp, badges } = createProgression(pool, { earn, activity, log });
  return new StoryGamesService(pool, {
    xp,
    milestones: badges,
    notifier: redis ? new StoryGameNotifier(new RedisRoomPublisher(redis), log) : null,
    log,
    timers: false,
  });
}

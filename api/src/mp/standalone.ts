import type pg from 'pg';
import type { Redis } from 'ioredis';
import { ActivityService } from '../activity/service.js';
import { FriendService } from '../friends/service.js';
import { GemService } from '../gems/service.js';
import { createProgression } from '../badges/progression.js';
import { RedisRoomPublisher } from '../realtime/bus.js';
import { RankService } from '../ranks/service.js';
import { WalletService } from '../wallet/service.js';
import { StoryGameNotifier } from '../story-games/notifier.js';
import { MP_ROOM_PREFIX } from './notify.js';
import { MultiplayerService } from './service.js';

interface Log {
  warn: (obj: unknown, msg: string) => void;
  info?: (obj: unknown, msg: string) => void;
}

/**
 * The multiplayer learning games for a process that serves none of their
 * routes: the job worker, which takes a closing account out of the games it is
 * still in. As the story games' standalone service (story-games/standalone.ts):
 * leaving can end a game for everybody else, so this pays and rates exactly as
 * the API does, wakes the API instances' waiting polls over Redis with a
 * publish-only notifier, and arms no timers of its own.
 */
export function standaloneMultiplayer(pool: pg.Pool, opts: { redis?: Redis | null; log?: Log } = {}): MultiplayerService {
  const log: Log = opts.log ?? { warn: () => undefined };
  const redis = opts.redis ?? undefined;
  const gems = new GemService(pool, new WalletService(pool));
  const activity = new ActivityService(pool, new FriendService(pool), redis);
  const ranks = new RankService(pool, { log });
  const { xp } = createProgression(pool, { ranks: ranks.events, gems, activity, log });
  return new MultiplayerService(pool, {
    xp,
    ranks,
    notifier: redis ? new StoryGameNotifier(new RedisRoomPublisher(redis), log, { roomPrefix: MP_ROOM_PREFIX }) : null,
    log,
    timers: false,
  });
}

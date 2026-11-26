import type pg from 'pg';
import type { Redis } from 'ioredis';
import { ActivityService } from '../activity/service.js';
import { FriendService } from '../friends/service.js';
import { EarnService } from '../earn/service.js';
import { createProgression } from '../badges/progression.js';
import { RedisRoomPublisher } from '../realtime/bus.js';
import { WalletService } from '../wallet/service.js';
import { StoryGameNotifier } from '../story-games/notifier.js';
import { MP_ROOM_PREFIX } from './notify.js';
import { MultiplayerService } from './service.js';

interface Log {
  warn: (obj: unknown, msg: string) => void;
  info?: (obj: unknown, msg: string) => void;
}

/**
 * The multiplayer games for a process that serves none of their routes: the job worker, which removes a closing account
 * from its games. Like story-games/standalone.ts, it pays as the API does (a leave can end a game), wakes the
 * API's polls over Redis with a publish-only notifier, and arms no timers.
 */
export function standaloneMultiplayer(pool: pg.Pool, opts: { redis?: Redis | null; log?: Log } = {}): MultiplayerService {
  const log: Log = opts.log ?? { warn: () => undefined };
  const redis = opts.redis ?? undefined;
  const earn = new EarnService(pool, new WalletService(pool));
  const activity = new ActivityService(pool, new FriendService(pool));
  const { xp } = createProgression(pool, { earn, activity, log });
  return new MultiplayerService(pool, {
    xp,
    notifier: redis ? new StoryGameNotifier(new RedisRoomPublisher(redis), log, { roomPrefix: MP_ROOM_PREFIX }) : null,
    log,
    timers: false,
  });
}

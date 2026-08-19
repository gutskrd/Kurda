/** Friend activity feed (KUR-087) against real Postgres (+ Redis when present). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { ActivityService } from './service.js';
import { FriendService } from '../friends/service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('activity feed (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let activity: ActivityService;
  let friends: FriendService;
  const suffix = Date.now().toString(36);
  const id: Record<string, string> = {};

  const register = async (tag: string, ip: string): Promise<string> => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `act_${tag}_${suffix}@it.kurda.app`,
        username: `act_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
      },
      remoteAddress: ip,
    });
    return res.json().user.id as string;
  };
  const makeFriends = async (a: string, b: string): Promise<void> => {
    await friends.request(a, b);
    await friends.respond(b, a, true);
  };
  const has = (feed: Array<{ id: string }>, eventId: string): boolean => feed.some((e) => e.id === eventId);

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    friends = new FriendService(pool);
    activity = new ActivityService(pool, friends, app.redis);
    id.a = await register('a', '10.87.1.1');
    id.b = await register('b', '10.87.2.1');
    id.c = await register('c', '10.87.3.1'); // private (nobody)
    id.d = await register('d', '10.87.4.1');
    id.e = await register('e', '10.87.5.1'); // non-friend
    await makeFriends(id.a!, id.b!);
    await makeFriends(id.c!, id.d!);
    await pool.query(`UPDATE users SET profile_visibility = 'nobody' WHERE id = $1`, [id.c!]);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
    await pool.end();
    await app.close();
  });

  it('a milestone reaches friend feeds but not non-friends', async () => {
    const event = await activity.publish(id.a!, 'achievement', { achievementId: 'first_lesson' });
    const feedB = await activity.feed(id.b!);
    expect(has(feedB, event.id)).toBe(true);
    expect(feedB.find((e) => e.id === event.id)!.actorUsername).toContain('act_a');
    // a non-friend never sees it
    expect(has(await activity.feed(id.e!), event.id)).toBe(false);
  });

  it('a private (nobody) actor does not broadcast to feeds', async () => {
    const event = await activity.publish(id.c!, 'league_promotion', { tier: 'silver' });
    expect(has(await activity.feed(id.d!), event.id)).toBe(false);
  });

  it('congratulate is idempotent and reflected in the feed', async () => {
    const event = await activity.publish(id.a!, 'streak_milestone', { days: 7 });
    expect(await activity.congratulate(id.b!, event.id)).toBe(1);
    expect(await activity.congratulate(id.b!, event.id)).toBe(1); // idempotent
    const entry = (await activity.feed(id.b!)).find((e) => e.id === event.id)!;
    expect(entry.congrats).toBe(1);
    expect(entry.didCongrats).toBe(true);
  });
});

/** The social rail's one read, against real Postgres: who, doing what, right now. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { LIVE_GAME_MAX_MINUTES } from './rail-service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('social rail (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  const ids: Record<string, string> = {};
  const tokens: Record<string, string> = {};

  async function register(tag: string, ip: string): Promise<void> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `rail_${tag}_${suffix}@it.kurda.app`,
        username: `rail_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
      },
      remoteAddress: ip,
    });
    ids[tag] = res.json().user.id;
    tokens[tag] = res.json().tokens.accessToken;
  }

  const call = (method: 'GET' | 'POST' | 'PATCH', url: string, token: string, payload?: unknown) =>
    app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, payload: payload as object, remoteAddress: '10.77.5.5' });

  const rail = async (tag: string) => (await call('GET', '/me/social', tokens[tag]!)).json();

  async function befriend(a: string, b: string): Promise<void> {
    const [lo, hi] = [a, b].sort();
    await pool.query(
      `INSERT INTO friendships (user_lo, user_hi, status, responded_at, requested_by)
       VALUES ($1, $2, 'accepted', now(), $1) ON CONFLICT (user_lo, user_hi)
       DO UPDATE SET status = 'accepted', responded_at = now()`,
      [lo, hi],
    );
  }

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    await register('me', '10.77.0.1');
    await register('mate', '10.77.0.2');
    await register('idler', '10.77.0.3');
    await register('stranger', '10.77.0.4');
    await befriend(ids.me!, ids.mate!);
    await befriend(ids.me!, ids.idler!);
  });

  afterAll(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.end();
    await app.close();
  });

  it('lists your friends and nobody else', async () => {
    const body = await rail('me');
    const names = body.friends.map((f: { username: string }) => f.username);
    expect(names).toContain(`rail_mate_${suffix}`.slice(0, 30));
    expect(names).toContain(`rail_idler_${suffix}`.slice(0, 30));
    // a stranger is not on your rail no matter what they are doing
    expect(names).not.toContain(`rail_stranger_${suffix}`.slice(0, 30));
  });

  it('says who is online, and when the rest were last around', async () => {
    await pool.query(`UPDATE users SET last_seen_at = now() WHERE id = $1`, [ids.mate!]);
    await pool.query(`UPDATE users SET last_seen_at = now() - interval '3 hours' WHERE id = $1`, [ids.idler!]);

    const body = await rail('me');
    const byId = new Map(body.friends.map((f: { userId: string }) => [f.userId, f]));
    expect((byId.get(ids.mate!) as { online: boolean }).online).toBe(true);

    const idler = byId.get(ids.idler!) as { online: boolean; lastSeenAt: string };
    expect(idler.online).toBe(false);
    // "offline" alone is not useful; the rail says how long ago
    expect(new Date(idler.lastSeenAt).getTime()).toBeLessThan(Date.now());
  });

  it('shows what a friend is playing, and since when', async () => {
    await pool.query(
      `INSERT INTO wordle_games (user_id, mode, difficulty, day_index, target, target_length, status, started_at)
       VALUES ($1, 'practice', 'easy', 4001, 'welat', 5, 'playing', now() - interval '4 minutes')`,
      [ids.mate!],
    );
    const body = await rail('me');
    const mate = body.friends.find((f: { userId: string }) => f.userId === ids.mate);
    expect(mate.activity.game).toBe('Wordle');
    // the client counts up from this, so it has to be the real start
    const minutes = (Date.now() - new Date(mate.activity.since).getTime()) / 60_000;
    expect(minutes).toBeGreaterThan(3);
    expect(minutes).toBeLessThan(6);
  });

  it('does not call an abandoned game a game in progress', async () => {
    await pool.query(
      `INSERT INTO wordle_games (user_id, mode, difficulty, day_index, target, target_length, status, started_at)
       VALUES ($1, 'practice', 'easy', 4002, 'welat', 5, 'playing', now() - ($2 || ' minutes')::interval)`,
      [ids.idler!, String(LIVE_GAME_MAX_MINUTES + 30)],
    );
    const body = await rail('me');
    const idler = body.friends.find((f: { userId: string }) => f.userId === ids.idler);
    // a closed tab leaves 'playing' behind forever; "in a game since Tuesday" is
    // worse than saying nothing
    expect(idler.activity).toBeNull();
  });

  it('respects a friend who hides their games', async () => {
    expect((await call('PATCH', '/me/profile/sections', tokens.mate!, { games: false })).statusCode).toBe(200);

    const hidden = await rail('me');
    expect(hidden.friends.find((f: { userId: string }) => f.userId === ids.mate).activity).toBeNull();

    // and it comes back when they turn it on again
    await call('PATCH', '/me/profile/sections', tokens.mate!, { games: true });
    const shown = await rail('me');
    expect(shown.friends.find((f: { userId: string }) => f.userId === ids.mate).activity.game).toBe('Wordle');
  });

  it('surfaces a game invite without being told who sent it', async () => {
    expect((await call('POST', '/challenges', tokens.mate!, { userId: ids.me })).statusCode).toBe(200);

    const body = await rail('me');
    expect(body.challenges.map((c: { userId: string }) => c.userId)).toEqual([ids.mate]);
    expect(body.unread.challenges).toBe(1);
    // the sender's own rail shows nothing: an invite you sent is not an invite
    expect((await rail('mate')).challenges).toEqual([]);
  });

  it('counts friend requests waiting on you', async () => {
    expect((await call('POST', '/friends/requests', tokens.stranger!, { userId: ids.me })).statusCode).toBe(200);

    const body = await rail('me');
    expect(body.requests.map((r: { userId: string }) => r.userId)).toContain(ids.stranger);
    expect(body.unread.requests).toBe(body.requests.length);
  });

  it('carries the notification badge and the recent few', async () => {
    await pool.query(
      `INSERT INTO notifications (user_id, category, title, body)
       VALUES ($1, 'social', 'Hello', 'something happened')`,
      [ids.me!],
    );
    const body = await rail('me');
    expect(body.unread.notifications).toBeGreaterThanOrEqual(1);
    expect(body.notifications[0].title).toBe('Hello');
  });

  it('is a signed-in read', async () => {
    const res = await app.inject({ method: 'GET', url: '/me/social', remoteAddress: '10.77.5.5' });
    expect(res.statusCode).toBe(401);
  });
});

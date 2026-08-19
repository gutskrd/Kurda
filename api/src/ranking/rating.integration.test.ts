/** Skill-rating writes (KUR-061) against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { RatingService } from './rating-service.js';
import { DEFAULT_RATING } from './elo.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('rating (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let rating: RatingService;
  const suffix = Date.now().toString(36);
  const ids: string[] = [];
  const tokens: string[] = [];

  const register = async (tag: string): Promise<void> => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `rate_${tag}_${suffix}@it.kurda.app`,
        username: `rate_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
      },
      remoteAddress: '10.61.0.1',
    });
    ids.push(res.json().user.id);
    tokens.push(res.json().tokens.accessToken);
  };

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    rating = new RatingService(pool);
    await register('a');
    await register('b');
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
    await pool.end();
    await app.close();
  });

  it('applies a zero-sum ELO update and records history + games played', async () => {
    const applied = await rating.apply({
      roomId: `it-rate-${suffix}-1`,
      mode: '1v1',
      outcomes: [
        { userId: ids[0]!, rank: 1, forfeit: false },
        { userId: ids[1]!, rank: 2, forfeit: false },
      ],
    });
    const winner = applied.find((a) => a.userId === ids[0]!)!;
    const loser = applied.find((a) => a.userId === ids[1]!)!;
    expect(winner.delta).toBeGreaterThan(0);
    expect(winner.delta).toBe(-loser.delta);

    const w = await rating.summary(ids[0]!);
    expect(w.rating).toBe(DEFAULT_RATING + winner.delta);
    expect(w.gamesPlayed).toBe(1);

    const hist = await rating.history(ids[0]!);
    expect(hist).toHaveLength(1);
    expect(hist[0]!.delta).toBe(winner.delta);
    expect(hist[0]!.rank).toBe(1);
  });

  it('is idempotent: re-applying the same game moves nothing', async () => {
    const roomId = `it-rate-${suffix}-2`;
    const outcomes = [
      { userId: ids[0]!, rank: 2, forfeit: false },
      { userId: ids[1]!, rank: 1, forfeit: false },
    ];
    const first = await rating.apply({ roomId, mode: '1v1', outcomes });
    expect(first).toHaveLength(2);
    const afterFirst = await rating.summary(ids[0]!);

    const second = await rating.apply({ roomId, mode: '1v1', outcomes });
    expect(second).toHaveLength(0); // already scored
    const afterSecond = await rating.summary(ids[0]!);
    expect(afterSecond.rating).toBe(afterFirst.rating);
    expect(afterSecond.gamesPlayed).toBe(afterFirst.gamesPlayed);
  });

  it('GET /me/rating reports the current rating and placement status', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/me/rating',
      headers: { authorization: `Bearer ${tokens[1]}` },
      remoteAddress: '10.61.0.2',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.rating).toBe('number');
    expect(body.gamesPlayed).toBeGreaterThanOrEqual(2);
    expect(body.placement).toBe(true); // still under 10 games
  });
});

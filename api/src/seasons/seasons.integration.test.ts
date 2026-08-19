/** Season resets + rewards (KUR-065) against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { SeasonService } from './service.js';
import { WalletService } from '../wallet/service.js';
import { seasonRewardGems, softReset } from './season-logic.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('seasons (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let seasons: SeasonService;
  let wallet: WalletService;
  const suffix = Date.now().toString(36);
  const season = `TEST-${suffix}`;
  let userId = '';

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    wallet = new WalletService(pool);
    seasons = new SeasonService(pool, wallet);

    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `season_${suffix}@it.kurda.app`,
        username: `season_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
      },
      remoteAddress: '10.65.0.1',
    });
    userId = res.json().user.id;
    // peaked at Gold this season, currently Silver; rating 1400
    await pool.query(
      `INSERT INTO user_league (user_id, tier, peak_tier) VALUES ($1, 'silver', 'gold')
       ON CONFLICT (user_id) DO UPDATE SET tier = 'silver', peak_tier = 'gold'`,
      [userId],
    );
    await pool.query(
      `INSERT INTO player_ratings (user_id, rating, games_played) VALUES ($1, 1400, 20)
       ON CONFLICT (user_id) DO UPDATE SET rating = 1400`,
      [userId],
    );
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
    await pool.query(`DELETE FROM season_state WHERE season_key = $1`, [season]);
    await pool.end();
    await app.close();
  });

  it('archives peak tier + final rating, soft-resets rating, and pays reward Gems', async () => {
    await seasons.endSeason(season, [userId]);

    const hist = await seasons.history(userId);
    const entry = hist.find((h) => h.seasonKey === season)!;
    expect(entry).toMatchObject({ peakTier: 'gold', finalRating: 1400, rewardGems: seasonRewardGems('gold') });

    // rating compressed toward the mean (1400 → 1200)
    const rating = await pool.query<{ rating: number }>(`SELECT rating FROM player_ratings WHERE user_id = $1`, [userId]);
    expect(rating.rows[0]!.rating).toBe(softReset(1400));
    // peak reset to the current tier for the new season
    const league = await pool.query<{ peak_tier: string }>(`SELECT peak_tier FROM user_league WHERE user_id = $1`, [userId]);
    expect(league.rows[0]!.peak_tier).toBe('silver');
    // reward paid
    expect((await wallet.balances(userId)).gems).toBe(seasonRewardGems('gold'));
  });

  it('is idempotent: a re-run neither re-compresses the rating nor double-pays', async () => {
    await seasons.endSeason(season, [userId]);
    const rating = await pool.query<{ rating: number }>(`SELECT rating FROM player_ratings WHERE user_id = $1`, [userId]);
    expect(rating.rows[0]!.rating).toBe(softReset(1400)); // still 1200, not 1100
    expect((await wallet.balances(userId)).gems).toBe(seasonRewardGems('gold')); // paid once
  });

  it('GET /me/seasons exposes the archived history', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: `season_${suffix}@it.kurda.app`, password: 'a-strong-password1' },
      remoteAddress: '10.65.0.1',
    });
    const token = res.json().tokens.accessToken as string;
    const hist = await app.inject({
      method: 'GET',
      url: '/me/seasons',
      headers: { authorization: `Bearer ${token}` },
      remoteAddress: '10.65.0.2',
    });
    expect(hist.statusCode).toBe(200);
    expect((hist.json().seasons as Array<{ seasonKey: string }>).some((s) => s.seasonKey === season)).toBe(true);
  });
});

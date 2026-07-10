/** Weekly leagues (KUR-062) against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { LeagueService } from './service.js';
import { GemService } from '../gems/service.js';
import { WalletService } from '../wallet/service.js';
import { weekStart } from './league-logic.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('weekly leagues (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let leagues: LeagueService;
  let gems: GemService;
  const suffix = Date.now().toString(36);
  const ids: string[] = [];
  // a safely-closed past week (two weeks ago) + the current week
  const pastWeek = weekStart(new Date(Date.now() - 14 * 86_400_000));

  const register = async (i: number): Promise<string> => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `lg_${i}_${suffix}@it.kurda.app`,
        username: `lg_${i}_${suffix}`.slice(0, 30),
        password: 'a-strong-password',
        acceptTerms: true,
      },
      // distinct IPs so 12 signups don't trip per-IP anti-bot limits
      remoteAddress: `10.62.${i}.1`,
    });
    const body = res.json();
    if (!body.user) throw new Error(`register ${i} failed: ${res.statusCode} ${JSON.stringify(body)}`);
    return body.user.id as string;
  };

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    gems = new GemService(pool, new WalletService(pool));
    leagues = new LeagueService(pool, gems);

    for (let i = 0; i < 12; i++) ids.push(await register(i));
    // start everyone in Gold so both promotion (→sapphire) and demotion (→silver) show
    for (const id of ids) {
      await pool.query(
        `INSERT INTO user_league (user_id, tier) VALUES ($1, 'gold')
         ON CONFLICT (user_id) DO UPDATE SET tier = 'gold'`,
        [id],
      );
    }

    // join everyone to a past-week Gold cohort and give descending weekly XP
    const at = `${pastWeek}T12:00:00Z`;
    for (let i = 0; i < ids.length; i++) {
      await leagues.ensureMembership(ids[i]!, new Date(at));
      await pool.query(
        `INSERT INTO xp_ledger (user_id, source, amount, ref_id, created_at)
         VALUES ($1, 'test_league', $2, $3, $4::timestamptz)`,
        [ids[i]!, (ids.length - i) * 100, `lg-${suffix}-${i}`, at],
      );
    }
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

  it('settles a closed week: top promotes, bottom demotes, promotions pay Gems', async () => {
    const settled = await leagues.settleDueWeeks(new Date());
    expect(settled).toBeGreaterThanOrEqual(1);

    const tierOf = async (userId: string): Promise<string> =>
      (await pool.query<{ tier: string }>(`SELECT tier FROM user_league WHERE user_id = $1`, [userId])).rows[0]!.tier;

    // id[0] had the most XP → rank 1 → promoted gold → sapphire
    expect(await tierOf(ids[0]!)).toBe('sapphire');
    // id[11] had the least → rank 12 → demoted gold → silver
    expect(await tierOf(ids[11]!)).toBe('silver');
    // the winner was paid league-promotion Gems
    expect((await wallet(pool).balances(ids[0]!)).gems).toBeGreaterThan(0);
  });

  it('re-settling is idempotent (no further tier moves)', async () => {
    const again = await leagues.settleDueWeeks(new Date());
    expect(again).toBe(0);
  });

  it('GET /me/league joins the current week and returns ranked standings', async () => {
    const view = await leagues.standings(ids[0]!, new Date());
    expect(view.tier).toBe('sapphire'); // promoted last week → new cohort tier
    expect(view.standings.some((s) => s.isSelf)).toBe(true);
    expect(view.rank).toBeGreaterThanOrEqual(1);
  });
});

function wallet(pool: pg.Pool): WalletService {
  return new WalletService(pool);
}

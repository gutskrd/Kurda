/** Leaving the weekly leagues, and minors being out of them by default, against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';
import { bornYearsAgo } from '../test/age.js';
import { LeagueService } from './service.js';
import { weekStart } from './league-logic.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('league opt-out (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let leagues: LeagueService;
  const suffix = Date.now().toString(36);
  let n = 0;

  interface Account {
    id: string;
    token: string;
  }

  const signUp = async (tag: string, years = 30): Promise<Account> => {
    n += 1;
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `lo_${tag}_${suffix}@it.kurda.app`,
        username: `lo_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        ...bornYearsAgo(years),
      },
      remoteAddress: `10.141.${n}.1`,
    });
    if (res.statusCode !== 201) throw new Error(`register ${tag}: ${res.statusCode} ${res.body}`);
    await activate(app, pool, res);
    return { id: res.json().user.id, token: res.json().tokens.accessToken };
  };

  const call = (who: Account, method: 'GET' | 'PATCH', url: string, payload?: Record<string, unknown>) =>
    app.inject({ method, url, payload, headers: { authorization: `Bearer ${who.token}` }, remoteAddress: '10.141.0.1' });

  const inWeek = async (userId: string, weekKey = weekStart(new Date())): Promise<boolean> =>
    ((await pool.query(`SELECT 1 FROM league_members WHERE user_id = $1 AND week_key = $2`, [userId, weekKey]))
      .rowCount ?? 0) > 0;

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    leagues = new LeagueService(pool);
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

  it('one tap out: no table, no placement, and out of the table they were in', async () => {
    const leaver = await signUp('leaver');
    const stays = await signUp('stays');
    await leagues.onXp(leaver.id);
    await leagues.onXp(stays.id);
    expect(await inWeek(leaver.id)).toBe(true);

    const res = await call(leaver, 'PATCH', '/me', { leaguesEnabled: false });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.leaguesEnabled).toBe(false);
    expect(await inWeek(leaver.id)).toBe(false);

    const view = (await call(leaver, 'GET', '/me/league')).json();
    expect(view).toMatchObject({ optedOut: true, standings: [] });
    // reading the page, or earning XP, does not put them back
    await leagues.onXp(leaver.id);
    expect(await inWeek(leaver.id)).toBe(false);

    const others = await leagues.standings(stays.id);
    expect(others.optedOut).toBe(false);
    expect(others.standings.some((s) => s.userId === leaver.id)).toBe(false);
  });

  it('one tap back in', async () => {
    const returner = await signUp('returner');
    await call(returner, 'PATCH', '/me', { leaguesEnabled: false });
    await call(returner, 'PATCH', '/me', { leaguesEnabled: true });
    const view = (await call(returner, 'GET', '/me/league')).json();
    expect(view.optedOut).toBe(false);
    expect(await inWeek(returner.id)).toBe(true);
  });

  it('a minor is out by default, and can choose to join', async () => {
    const minor = await signUp('minor', 15);
    expect((await call(minor, 'GET', '/me')).json().user.leaguesEnabled).toBe(false);
    await leagues.onXp(minor.id);
    expect(await inWeek(minor.id)).toBe(false);
    expect((await call(minor, 'GET', '/me/league')).json().optedOut).toBe(true);

    await call(minor, 'PATCH', '/me', { leaguesEnabled: true });
    await leagues.onXp(minor.id);
    expect(await inWeek(minor.id)).toBe(true);
  });

  it('nobody who has left is promoted or demoted when the week closes', async () => {
    // a closed week, far enough back to be nobody else's
    const week = weekStart(new Date(Date.now() - 35 * 86_400_000));
    const at = new Date(`${week}T12:00:00Z`);
    const members: Account[] = [];
    for (let i = 0; i < 12; i++) members.push(await signUp(`w${i}`));
    for (let i = 0; i < members.length; i++) {
      const id = members[i]!.id;
      await pool.query(
        `INSERT INTO user_league (user_id, tier) VALUES ($1, 'gold') ON CONFLICT (user_id) DO UPDATE SET tier = 'gold'`,
        [id],
      );
      await leagues.ensureMembership(id, at);
      await pool.query(
        `INSERT INTO xp_ledger (user_id, source, amount, ref_id, created_at)
         VALUES ($1, 'test_league', $2, $3, $4::timestamptz)`,
        [id, (members.length - i) * 100, `lo-${suffix}-${i}`, at.toISOString()],
      );
    }
    // the week's winner and its last place both leave before it settles
    const [winner, ...rest] = members;
    const last = rest.at(-1)!;
    await call(winner!, 'PATCH', '/me', { leaguesEnabled: false });
    await call(last, 'PATCH', '/me', { leaguesEnabled: false });

    await leagues.settleDueWeeks(new Date());
    const tierOf = async (userId: string) =>
      (await pool.query<{ tier: string }>(`SELECT tier FROM user_league WHERE user_id = $1`, [userId])).rows[0]!.tier;
    expect(await tierOf(winner!.id)).toBe('gold');
    expect(await tierOf(last.id)).toBe('gold');
    // the ten who stayed: the top of them promotes as before
    expect(await tierOf(rest[0]!.id)).toBe('sapphire');
  });
});

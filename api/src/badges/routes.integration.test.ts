/**
 * Badges, leagues and progress over HTTP and on the profile, and in the data
 * export and a child's erase, against real Postgres.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';
import { bornYearsAgo } from '../test/age.js';
import { befriend } from '../test/social.js';
import { GdprService, eraseChildData } from '../gdpr/service.js';
import { LeagueService } from '../leagues/service.js';
import { learningAward } from '../test/progress.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('badges and progress over HTTP (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
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
        email: `bdr_${tag}_${suffix}@it.kurda.app`,
        username: `bdr_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        ...bornYearsAgo(years),
      },
      remoteAddress: `10.177.${n}.1`,
    });
    if (res.statusCode !== 201) throw new Error(`register ${tag}: ${res.statusCode} ${res.body}`);
    await activate(app, pool, res);
    return { id: res.json().user.id, token: res.json().tokens.accessToken };
  };
  const call = (who: Account | null, method: 'GET' | 'PUT' | 'POST', url: string, payload?: unknown) =>
    app.inject({
      method,
      url,
      payload: payload as never,
      headers: who ? { authorization: `Bearer ${who.token}` } : {},
      remoteAddress: '10.177.0.1',
    });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
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

  it('serves the badge page, the showcase and the unseen list, and keeps the admin routes for admins', async () => {
    const me = await signUp('me');
    const page = await call(me, 'GET', '/me/badges');
    expect(page.statusCode).toBe(200);
    expect(page.json().badges).toHaveLength(44);
    expect(page.json()).toMatchObject({ showcase: [], secretsFound: 0, secretsTotal: 6, legacy: [] });

    const bad = await call(me, 'PUT', '/me/badges/showcase', { keys: ['agir'] });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().code).toBe('BADGE_NOT_EARNED');
    const tooMany = await call(me, 'PUT', '/me/badges/showcase', { keys: ['a', 'b', 'c', 'd'] });
    expect(tooMany.statusCode).toBe(400);

    expect((await call(me, 'GET', '/me/badges/unseen')).json()).toEqual({ unseen: [] });
    expect((await call(me, 'POST', '/me/badges/seen', {})).statusCode).toBe(200);
    expect((await call(null, 'GET', '/me/badges')).statusCode).toBe(401);
    expect((await call(me, 'GET', '/admin/badges')).statusCode).toBe(403);
    expect((await call(me, 'GET', '/admin/leagues')).statusCode).toBe(403);
    expect((await call(me, 'POST', `/admin/users/${me.id}/badges/agir`, { action: 'award', tier: 1, reason: 'nope' })).statusCode).toBe(403);
  });

  it('a profile names no league for someone never in one, nor for someone who opted out, and the tier key once they are', async () => {
    const me = await signUp('pr');
    const viewer = await signUp('viewer');
    let profile = (await call(viewer, 'GET', `/users/${me.id}`)).json();
    expect(profile).toMatchObject({ tier: null, league: null, badges: [] });

    await new LeagueService(pool).onXp(learningAward(me.id));
    profile = (await call(viewer, 'GET', `/users/${me.id}`)).json();
    expect(profile).toMatchObject({ tier: 'dilop', league: { tier: 'dilop' } });

    await pool.query(`UPDATE users SET leagues_enabled = false WHERE id = $1`, [me.id]);
    profile = (await call(viewer, 'GET', `/users/${me.id}`)).json();
    expect(profile).toMatchObject({ tier: null, league: null });
  });

  it('a profile shows the three chosen badges; a minor’s only to friends', async () => {
    const teen = await signUp('teen', 15);
    const friend = await signUp('friend');
    const stranger = await signUp('stranger');
    await befriend(pool, teen.id, friend.id);
    await pool.query(`INSERT INTO user_streaks (user_id, current_streak, longest_streak, days_learned) VALUES ($1, 7, 7, 1)`, [teen.id]);
    await call(teen, 'GET', '/me/badges'); // counts what they have done
    expect((await call(teen, 'PUT', '/me/badges/showcase', { keys: ['agir'] })).json()).toEqual({ showcase: ['agir'] });
    const seen = (await call(friend, 'GET', `/users/${teen.id}`)).json();
    expect(seen.badges).toEqual([{ key: 'agir', family: 'habit', tier: 1, tierKey: 'sifir' }]);
    expect(seen.achievements).toBe(1);
    const strangers = (await call(stranger, 'GET', `/users/${teen.id}`)).json();
    expect(strangers.badges ?? []).toEqual([]);
  });

  it('the data export holds the learner’s XP, league weeks, streak, badges and ranks', async () => {
    const me = await signUp('ex');
    await new LeagueService(pool).onXp(learningAward(me.id));
    await pool.query(`INSERT INTO xp_ledger (user_id, source, amount, ref_id, counted) VALUES ($1, 'wordle_battle', 100, $2, 60)`, [
      me.id,
      `ex-${suffix}`,
    ]);
    await pool.query(
      `INSERT INTO league_weeks (user_id, week_key, mode, tier, weekly_xp, goal_xp, goal_met) VALUES ($1, '2025-01-06', 'league', 'kani', 200, 150, true)`,
      [me.id],
    );
    await pool.query(`INSERT INTO user_streaks (user_id, current_streak, longest_streak, days_learned) VALUES ($1, 7, 7, 1)`, [me.id]);
    await call(me, 'GET', '/me/badges');
    const out = (await new GdprService(pool).buildExport(me.id)) as { progress: Record<string, unknown> };
    expect(out.progress.xpLedger).toEqual([expect.objectContaining({ source: 'wordle_battle', amount: 100, counted: 60 })]);
    expect(out.progress.league).toMatchObject({ tier: 'dilop' });
    expect(out.progress.leagueWeeks).toEqual([expect.objectContaining({ week_key: '2025-01-06', tier: 'kani', goal_met: true })]);
    expect(out.progress.leagueMemberships).toHaveLength(1);
    expect(out.progress.streak).toMatchObject({ longest_streak: 7 });
    expect(out.progress.badges).toEqual(expect.arrayContaining([expect.objectContaining({ badge_key: 'agir', tier: 1 })]));
    expect(out.progress).toHaveProperty('ratedGames');
    expect(out.progress).toHaveProperty('ranks');
  });

  it('a child’s erase removes their badges and showcase; closing any account takes it off this week’s table', async () => {
    const child = await signUp('child', 14);
    await pool.query(`UPDATE users SET leagues_enabled = true WHERE id = $1`, [child.id]);
    await new LeagueService(pool).onXp(learningAward(child.id));
    await pool.query(`INSERT INTO user_streaks (user_id, current_streak, longest_streak, days_learned) VALUES ($1, 7, 7, 1)`, [child.id]);
    await call(child, 'GET', '/me/badges');
    await call(child, 'PUT', '/me/badges/showcase', { keys: ['agir'] });
    await new GdprService(pool).closeNow(child.id, 'under_minimum_age');
    const left = await pool.query(`SELECT 1 FROM user_badges WHERE user_id = $1 UNION ALL SELECT 1 FROM badge_showcase WHERE user_id = $1`, [
      child.id,
    ]);
    expect(left.rowCount).toBe(0);
    const member = await pool.query<{ left_at: Date | null }>(`SELECT left_at FROM league_members WHERE user_id = $1`, [child.id]);
    expect(member.rows[0]!.left_at).not.toBeNull();
    // and an erase run twice is harmless
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await eraseChildData(client, child.id);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
});

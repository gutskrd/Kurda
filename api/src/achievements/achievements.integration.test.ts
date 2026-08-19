/** Achievements (standalone, decoupled from cosmetics) against Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { ACHIEVEMENTS, AchievementsService } from './service.js';

describe('achievement definitions (unit)', () => {
  it('are named Kurdish-first with unique ids', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const def of ACHIEVEMENTS) expect(def.nameKu.length).toBeGreaterThan(2);
  });
});

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('achievement awards (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let service: AchievementsService;
  let token: string;
  let userId: string;
  const suffix = Date.now().toString(36);

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    service = new AchievementsService(pool);
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `ach_${suffix}@it.kurda.app`,
        username: `ach_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
      },
      remoteAddress: '10.18.0.1',
    });
    token = res.json().tokens.accessToken;
    userId = res.json().user.id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    await pool.end();
    await app.close();
  });

  const authed = (method: 'GET' | 'POST', url: string) =>
    app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, remoteAddress: '10.18.0.2' });

  it('awards exactly once (idempotent)', async () => {
    expect(await service.award(userId, 'first-game-win')).toEqual({ awarded: true, alreadyEarned: false });
    expect(await service.award(userId, 'first-game-win')).toEqual({ awarded: false, alreadyEarned: true });
    const rows = await pool.query(
      `SELECT count(*)::int n FROM user_achievements WHERE user_id = $1 AND achievement_id = 'first-game-win'`,
      [userId],
    );
    expect(rows.rows[0].n).toBe(1);
  });

  it('rejects unknown achievements', async () => {
    await expect(service.award(userId, 'not-real')).rejects.toThrow(/unknown/);
  });

  it('unseen powers the toast, then ack clears it', async () => {
    await service.award(userId, 'newroz-2026');
    const unseen = await authed('GET', '/me/achievements/unseen');
    expect((unseen.json().unseen as Array<{ id: string }>).map((a) => a.id)).toContain('newroz-2026');
    expect((await authed('POST', '/me/achievements/seen')).statusCode).toBe(200);
    expect((await authed('GET', '/me/achievements/unseen')).json().unseen).toEqual([]);
  });

  it('GET /me/achievements lists all with earned state', async () => {
    const all = (await authed('GET', '/me/achievements')).json().achievements as Array<{
      id: string;
      earnedAt: string | null;
    }>;
    expect(all).toHaveLength(ACHIEVEMENTS.length);
    expect(all.find((a) => a.id === 'first-game-win')?.earnedAt).not.toBeNull();
    expect(all.find((a) => a.id === 'streak-30')?.earnedAt).toBeNull();
  });
});

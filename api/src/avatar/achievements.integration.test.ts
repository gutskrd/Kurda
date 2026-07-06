/** Achievement unlocks (KUR-078) against real Postgres (CI integration job). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { AVATAR_CATALOG } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { ACHIEVEMENTS, AchievementsService } from './achievements.js';
import { CosmeticsInventory } from './inventory.js';

describe('achievement definitions (unit)', () => {
  it('every granted cosmetic exists in the catalog and is premium', () => {
    const catalogIds = new Map(AVATAR_CATALOG.map((i) => [i.id, i]));
    for (const def of ACHIEVEMENTS) {
      if (!def.grantsCosmetic) continue;
      const item = catalogIds.get(def.grantsCosmetic);
      expect(item, `${def.id} grants ${def.grantsCosmetic}`).toBeDefined();
      expect(item?.base, `${def.grantsCosmetic} must be premium`).toBe(false);
    }
  });

  it('achievements are named in Kurdish first', () => {
    for (const def of ACHIEVEMENTS) {
      expect(def.nameKu.length, def.id).toBeGreaterThan(2);
    }
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
        password: 'a-strong-password',
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
    app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${token}` },
      remoteAddress: '10.18.0.2',
    });

  it('awarding grants the mapped cosmetic exactly once', async () => {
    const first = await service.award(userId, 'first-game-win');
    expect(first).toEqual({
      awarded: true,
      alreadyEarned: false,
      grantedCosmetic: 'head-sasik',
    });

    const inventory = new CosmeticsInventory(pool);
    expect((await inventory.ownedIds(userId)).has('head-sasik')).toBe(true);

    // backfill re-trigger: no double award, no second grant
    const again = await service.award(userId, 'first-game-win');
    expect(again).toEqual({ awarded: false, alreadyEarned: true });
    const rows = await pool.query(
      `SELECT count(*)::int AS n FROM user_cosmetics WHERE user_id = $1 AND item_id = 'head-sasik'`,
      [userId],
    );
    expect(rows.rows[0].n).toBe(1);
  });

  it('unknown achievements are rejected', async () => {
    await expect(service.award(userId, 'not-real')).rejects.toThrow(/unknown/);
  });

  it('unseen unlocks power the toast, then ack clears them', async () => {
    await service.award(userId, 'newroz-2026');
    const unseen = await authed('GET', '/me/achievements/unseen');
    expect(unseen.statusCode).toBe(200);
    const list = unseen.json().unseen as Array<{ id: string; nameKu: string }>;
    expect(list.map((a) => a.id)).toContain('newroz-2026');
    expect(list.find((a) => a.id === 'newroz-2026')?.nameKu).toBe('Newroza 2026');

    const ack = await authed('POST', '/me/achievements/seen');
    expect(ack.statusCode).toBe(200);
    const after = await authed('GET', '/me/achievements/unseen');
    expect(after.json().unseen).toEqual([]);
  });

  it('GET /me/achievements lists all with earned state', async () => {
    const res = await authed('GET', '/me/achievements');
    const all = res.json().achievements as Array<{ id: string; earnedAt: string | null }>;
    expect(all).toHaveLength(ACHIEVEMENTS.length);
    expect(all.find((a) => a.id === 'first-game-win')?.earnedAt).not.toBeNull();
    expect(all.find((a) => a.id === 'streak-30')?.earnedAt).toBeNull();
  });
});

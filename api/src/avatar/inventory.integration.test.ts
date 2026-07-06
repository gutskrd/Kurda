/** Cosmetic inventory (KUR-077) against real Postgres (CI integration job). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { DEFAULT_AVATAR } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { CosmeticsInventory } from './inventory.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('cosmetic inventory (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let inventory: CosmeticsInventory;
  let token: string;
  let userId: string;
  const suffix = Date.now().toString(36);

  const putAvatar = (body: Record<string, unknown>) =>
    app.inject({
      method: 'PUT',
      url: '/me/avatar',
      payload: body,
      headers: { authorization: `Bearer ${token}` },
      remoteAddress: '10.17.0.1',
    });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    inventory = new CosmeticsInventory(pool);
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `inv_${suffix}@it.kurda.app`,
        username: `inv_${suffix}`.slice(0, 30),
        password: 'a-strong-password',
        acceptTerms: true,
      },
      remoteAddress: '10.17.0.2',
    });
    token = res.json().tokens.accessToken;
    userId = res.json().user.id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    await pool.end();
    await app.close();
  });

  it('granting a premium item makes it equippable', async () => {
    const before = await putAvatar({ ...DEFAULT_AVATAR, headwear: 'head-kofi' });
    expect(before.statusCode).toBe(403);

    const grant = await inventory.grant(userId, 'head-kofi', 'achievement');
    expect(grant).toEqual({ granted: true, alreadyOwned: false });

    const after = await putAvatar({ ...DEFAULT_AVATAR, headwear: 'head-kofi' });
    expect(after.statusCode).toBe(200);
    expect(after.json().config.headwear).toBe('head-kofi');
  });

  it('duplicate grants are idempotent — one row, first source kept', async () => {
    const dupe = await inventory.grant(userId, 'head-kofi', 'shop');
    expect(dupe).toEqual({ granted: false, alreadyOwned: true });
    const rows = await pool.query(
      `SELECT source FROM user_cosmetics WHERE user_id = $1 AND item_id = 'head-kofi'`,
      [userId],
    );
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].source).toBe('achievement');
  });

  it('revoking an equipped item auto-unequips it (slot resets)', async () => {
    expect(await inventory.revoke(userId, 'head-kofi')).toBe(true);
    const row = await pool.query(`SELECT avatar_config FROM users WHERE id = $1`, [userId]);
    expect(row.rows[0].avatar_config.headwear).toBe(DEFAULT_AVATAR.headwear);

    const rejected = await putAvatar({ ...DEFAULT_AVATAR, headwear: 'head-kofi' });
    expect(rejected.statusCode).toBe(403);
  });

  it('re-granting after revoke restores ownership', async () => {
    const regrant = await inventory.grant(userId, 'head-kofi', 'event');
    expect(regrant.granted).toBe(true);
    expect((await inventory.ownedIds(userId)).has('head-kofi')).toBe(true);
    await inventory.revoke(userId, 'head-kofi');
  });

  it('granting base or unknown items behaves sensibly', async () => {
    const base = await inventory.grant(userId, 'outfit-sal-sapik', 'shop');
    expect(base.alreadyOwned).toBe(true);
    await expect(inventory.grant(userId, 'not-a-real-item', 'shop')).rejects.toThrow(/unknown/);
  });

  it('GET /me/cosmetics returns the annotated catalog for the editor', async () => {
    await inventory.grant(userId, 'bg-newroz', 'event');
    const res = await app.inject({
      method: 'GET',
      url: '/me/cosmetics',
      headers: { authorization: `Bearer ${token}` },
      remoteAddress: '10.17.0.3',
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().items as Array<{
      id: string;
      owned: boolean;
      base: boolean;
      nameKu: string;
    }>;
    expect(items.find((i) => i.id === 'outfit-sal-sapik')?.owned).toBe(true); // base
    expect(items.find((i) => i.id === 'bg-newroz')?.owned).toBe(true); // granted
    expect(items.find((i) => i.id === 'head-kofi')?.owned).toBe(false); // revoked
    expect(items.every((i) => i.nameKu.length > 1)).toBe(true);
  });
});

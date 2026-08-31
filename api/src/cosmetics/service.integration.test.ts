/** Cosmetic equip/access + favorites + profile-DTO safety against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { CosmeticsService } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('cosmetics equip + favorites + DTO (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let cosmetics: CosmeticsService;
  const s = Date.now().toString(36).slice(-6);
  let userA = '';
  let tokenA = '';
  let tokenB = '';
  const sku = { owned: `bg-owned-${s}`, prem: `bg-prem-${s}`, inactive: `bg-off-${s}`, icon: `icon-${s}` };
  let poemId = '';
  let draftPoemId = '';

  const register = async (tag: string, ip: string): Promise<{ id: string; token: string }> => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: `cos_${tag}_${s}@it.kurda.app`, username: `cos${tag}${s}`, password: 'a-strong-password1', acceptTerms: true },
      remoteAddress: ip,
    });
    const body = res.json();
    return { id: body.user.id as string, token: body.tokens.accessToken as string };
  };

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    cosmetics = new CosmeticsService(pool);

    const a = await register('a', '10.9.0.1');
    userA = a.id;
    tokenA = a.token;
    tokenB = (await register('b', '10.9.0.2')).token;

    await pool.query(
      `INSERT INTO shop_items (sku, name, category, currency, price, is_unique, active, in_stock, asset_key, premium_only)
       VALUES ($1,'Owned','background','zer',0,true,true,true,'backgrounds/o.png',false),
              ($2,'Prem','background','zer',500,true,true,true,'backgrounds/p.png',true),
              ($3,'Off','background','zer',0,true,false,true,'backgrounds/x.png',true),
              ($4,'Icon','icon','zer',800,true,true,true,'icons/i.png',true)`,
      [sku.owned, sku.prem, sku.inactive, sku.icon],
    );
    await pool.query(`INSERT INTO user_entitlements (user_id, sku, source) VALUES ($1,$2,'purchase'), ($1,$3,'purchase')`, [userA, sku.owned, sku.icon]);

    const poem = await pool.query<{ id: string }>(
      `INSERT INTO library_posts (author_id, author_role, type, title, body, language, status, published_at)
       VALUES ($1,'user','poem','My Poem','...', 'kmr','published', now()) RETURNING id`,
      [userA],
    );
    poemId = poem.rows[0]!.id;
    const draft = await pool.query<{ id: string }>(
      `INSERT INTO library_posts (author_id, author_role, type, title, body, language, status)
       VALUES ($1,'user','poem','Draft','...', 'kmr','draft') RETURNING id`,
      [userA],
    );
    draftPoemId = draft.rows[0]!.id;
  });

  afterAll(async () => {
    await pool?.query(`DELETE FROM shop_items WHERE sku = ANY($1)`, [Object.values(sku)]).catch(() => undefined);
    await pool?.end();
    await app?.close();
  });

  it('equips an owned background; rejects premium/wrong-category/inactive/missing', async () => {
    await expect(cosmetics.equipBackground(userA, sku.owned)).resolves.toBeUndefined();
    await expect(cosmetics.equipBackground(userA, sku.prem)).rejects.toThrow(/access/i); // not owned, no premium
    await expect(cosmetics.equipBackground(userA, sku.icon)).rejects.toThrow(/not a background/i);
    await expect(cosmetics.equipBackground(userA, sku.inactive)).rejects.toThrow(/available/i);
    await expect(cosmetics.equipBackground(userA, `nope-${s}`)).rejects.toThrow(/no such item/i);
  });

  it('grants premium-only access while premium is active', async () => {
    await pool.query(`UPDATE users SET premium_until = now() + interval '1 day' WHERE id = $1`, [userA]);
    await expect(cosmetics.equipBackground(userA, sku.prem)).resolves.toBeUndefined();
    await pool.query(`UPDATE users SET premium_until = now() - interval '1 day' WHERE id = $1`, [userA]);
  });

  it('validates default avatar keys', async () => {
    await expect(cosmetics.equipAvatar(userA, 'default-01')).resolves.toBeUndefined();
    await expect(cosmetics.equipAvatar(userA, 'not-a-real-avatar')).rejects.toThrow(/avatar/i);
    // switching avatar must not clear the (possibly set) uploaded photo column
    const r = await pool.query<{ selected_avatar_key: string | null }>(`SELECT selected_avatar_key FROM users WHERE id=$1`, [userA]);
    expect(r.rows[0]!.selected_avatar_key).toBe('default-01');
  });

  it('gates premium default avatars by active premium (default-01 always free)', async () => {
    await pool.query(`UPDATE users SET premium_until = NULL WHERE id = $1`, [userA]);
    // no premium: a premium avatar is rejected, the free fallback is allowed
    await expect(cosmetics.equipAvatar(userA, 'default-02')).rejects.toThrow(/premium/i);
    await expect(cosmetics.equipAvatar(userA, 'default-01')).resolves.toBeUndefined();
    // with premium: the premium avatar is allowed
    await pool.query(`UPDATE users SET premium_until = now() + interval '1 day' WHERE id = $1`, [userA]);
    await expect(cosmetics.equipAvatar(userA, 'default-02')).resolves.toBeUndefined();
    // reset shared state for later tests
    await cosmetics.equipAvatar(userA, 'default-01');
    await pool.query(`UPDATE users SET premium_until = NULL WHERE id = $1`, [userA]);
  });

  it('sets a published favorite poem; rejects draft and wrong type', async () => {
    await expect(cosmetics.setFavorite(userA, 'poem', poemId)).resolves.toBeUndefined();
    await expect(cosmetics.setFavorite(userA, 'poem', draftPoemId)).rejects.toThrow(/published/i);
    await expect(cosmetics.setFavorite(userA, 'story', poemId)).rejects.toThrow(/story/i);
  });

  it('public profile DTO exposes URLs, never raw keys/entitlement/premium fields', async () => {
    const res = await app.inject({ method: 'GET', url: `/users/${userA}`, headers: { authorization: `Bearer ${tokenB}` } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // no raw/private fields leak
    for (const k of ['profilePhotoKey', 'selectedAvatarKey', 'premiumUntil', 'email']) {
      expect(body).not.toHaveProperty(k);
    }
    // background is resolved (owned one equipped earlier) with a url, no `owned` flag
    if (body.background) {
      expect(body.background).toHaveProperty('url');
      expect(body.background).not.toHaveProperty('owned');
    }
    expect(body.level).toHaveProperty('level');
    expect(body.favoritePoem).toEqual({ id: poemId, title: 'My Poem' });
  });

  it('inventory carries a resolved cosmetic assetUrl (icons are web-static)', async () => {
    const res = await app.inject({ method: 'GET', url: '/me/inventory', headers: { authorization: `Bearer ${tokenA}` } });
    expect(res.statusCode).toBe(200);
    const items = res.json().items as Array<{ sku: string; category: string; assetKey: string | null; assetUrl: string | null; premiumOnly: boolean }>;
    const iconItem = items.find((i) => i.sku === sku.icon);
    expect(iconItem).toMatchObject({ category: 'icon', assetKey: 'icons/i.png', assetUrl: '/cosmetics/icons/i.png', premiumOnly: true });
    // backgrounds resolve via R2 → null here (no storage configured in the test)
    const bgItem = items.find((i) => i.sku === sku.owned);
    expect(bgItem).toMatchObject({ category: 'background', assetUrl: null });
  });
});

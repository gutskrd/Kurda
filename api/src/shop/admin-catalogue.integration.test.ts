/**
 * The admin's backgrounds and icons, against real Postgres with a bucket in
 * memory: uploading art, adding and editing items, and deleting them — which
 * deletes only what nobody has, and retires the rest for the people who do.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import sharp from 'sharp';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';
import { pass2fa } from '../test/admin-2fa.js';
import { memoryStorage } from '../test/media.js';

const DATABASE_URL = process.env.DATABASE_URL;

interface UploadRow {
  kind: string | null;
  confirmed_at: Date | null;
  content_type: string;
  width: number | null;
  height: number | null;
}

describe.skipIf(!DATABASE_URL)('shop art and catalogue editing (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  const storage = memoryStorage();
  let app: FastifyInstance;
  /** the same API with no bucket configured */
  let bare: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  /** a test's SKU, from a name: lower case and no spaces, as SKUs are */
  const sku = (name: string): string => `${name.toLowerCase().replace(/\s+/g, '-')}_${suffix}`;
  let n = 0;
  const ip = (): string => `10.181.${Math.floor(++n / 250)}.${(n % 250) + 1}`;
  const keys: string[] = [];
  let admin = { id: '', token: '' };
  let member = { id: '', token: '' };
  let owner = { id: '', token: '' };
  let borrower = { id: '', token: '' };

  /** A picture of its own colour, so every one is a new file however often the suite runs. */
  let hue = Number(BigInt(Date.now()) % 200n);
  async function picture(width: number, height: number, alpha = false): Promise<Buffer> {
    hue = (hue + 7) % 250;
    const background = alpha ? { r: 0, g: 0, b: 0, alpha: 0 } : { r: hue, g: 120, b: 200 - (hue % 100) };
    const r = Math.round(Math.min(width, height) / 3);
    return sharp({ create: { width, height, channels: alpha ? 4 : 3, background } })
      .composite([{ input: Buffer.from(`<svg width="${width}" height="${height}"><circle cx="${width / 2}" cy="${height / 2}" r="${r}" fill="rgb(${hue},200,80)"/></svg>`) }])
      .png()
      .toBuffer();
  }

  async function person(tag: string): Promise<{ id: string; token: string }> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `sart_${tag}_${suffix}@it.kurda.app`,
        username: `sart_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: ip(),
    });
    await activate(app, pool, res);
    return { id: res.json().user.id, token: res.json().tokens.accessToken };
  }

  const call = (
    who: { token: string } | null,
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    payload?: object,
    on: FastifyInstance = app,
  ) =>
    on.inject({
      method,
      url,
      headers: who ? { authorization: `Bearer ${who.token}` } : {},
      payload,
      remoteAddress: ip(),
    });

  const upload = async (kind: string, bytes: Buffer, who: { token: string } = admin, on: FastifyInstance = app, type = 'image/png') => {
    const res = await on.inject({
      method: 'POST',
      url: `/admin/shop/art/${kind}`,
      headers: { authorization: `Bearer ${who.token}`, 'content-type': type },
      payload: bytes,
      remoteAddress: ip(),
    });
    if (res.statusCode === 201) keys.push(res.json().key);
    return res;
  };

  const uploadRow = async (key: string): Promise<UploadRow | undefined> =>
    (
      await pool.query<UploadRow>(
        `SELECT kind, confirmed_at, content_type, width, height FROM media_uploads WHERE key = $1`,
        [key],
      )
    ).rows[0];

  /** Add a background or icon through the admin's own route, with art uploaded for it. */
  async function addArtItem(name: string, category: 'background' | 'icon', over: Record<string, unknown> = {}) {
    const art = await upload(category, category === 'background' ? await picture(1280, 720) : await picture(512, 512, true));
    expect(art.statusCode).toBe(201);
    const res = await call(admin, 'POST', '/admin/shop/items', {
      sku: sku(name),
      name,
      category,
      currency: 'zer',
      price: 300,
      assetKey: art.json().key,
      premiumOnly: false,
      ...over,
    });
    expect(res.statusCode).toBe(201);
    return { sku: sku(name), key: art.json().key as string, item: res.json() };
  }

  beforeAll(async () => {
    app = buildApp(config);
    app.decorate('storage', storage);
    await app.ready();
    bare = buildApp(config);
    await bare.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });

    admin = await person('admin');
    await pool.query(`UPDATE users SET roles = '{admin}' WHERE id = $1`, [admin.id]);
    await pass2fa(app, admin.token, ip());
    member = await person('member');
    owner = await person('owner');
    borrower = await person('borrow');
    await pool.query(`UPDATE users SET premium_until = now() + interval '30 days' WHERE id = $1`, [borrower.id]);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM admin_config_changes WHERE payload->>'sku' LIKE $1`, [`%_${suffix}`]);
    await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`%_${suffix}@it.kurda.app`]);
    await pool.query(`DELETE FROM shop_items WHERE sku LIKE $1`, [`%_${suffix}`]);
    if (keys.length) await pool.query(`DELETE FROM media_uploads WHERE key = ANY($1)`, [keys]);
    await pool.end();
    await bare.close();
    await app.close();
  });

  describe('who may', () => {
    it('refuses everyone but an admin', async () => {
      const bytes = await picture(512, 512, true);
      expect((await upload('icon', bytes, member)).statusCode).toBe(403);
      expect((await call(member, 'PATCH', '/shop/items/whatever', { name: 'x' })).statusCode).toBe(403);
      expect((await call(member, 'DELETE', '/shop/items/whatever')).statusCode).toBe(403);
      expect((await call(member, 'GET', '/admin/shop/items/whatever/usage')).statusCode).toBe(403);
      expect((await call(member, 'POST', '/admin/shop/items', { sku: 'x', name: 'x', currency: 'zer', price: 1 })).statusCode).toBe(403);
      const stranger = await app.inject({
        method: 'POST',
        url: '/admin/shop/art/icon',
        headers: { 'content-type': 'image/png' },
        payload: bytes,
        remoteAddress: ip(),
      });
      expect(stranger.statusCode).toBe(401);
    });
  });

  describe('uploading art', () => {
    it('stores a background as a 16:9 WebP under its own prefix, held until an item uses it', async () => {
      const res = await upload('background', await picture(1920, 1080));
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toMatchObject({ kind: 'background', width: 1920, height: 1080, contentType: 'image/webp', trimmed: false });
      expect(body.key).toMatch(/^cosmetic\/background\/[a-f0-9]{64}\.webp$/);
      expect(body.url).toBe(`https://cdn.test/${body.key}`);
      expect(body.bytes).toBeLessThanOrEqual(120 * 1024);
      expect(storage.objects.has(body.key)).toBe(true);
      expect(await uploadRow(body.key)).toMatchObject({ kind: 'cosmetic-background', confirmed_at: null, content_type: 'image/webp' });
      const audited = await pool.query(`SELECT 1 FROM admin_audit_log WHERE action = 'shop.art.upload' AND target_id = $1`, [body.key]);
      expect(audited.rowCount).toBe(1);
    });

    it('stores an icon as a square PNG that keeps its transparency', async () => {
      const res = await upload('icon', await picture(1024, 1024, true), admin, app, 'application/octet-stream');
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toMatchObject({ kind: 'icon', width: 512, height: 512, contentType: 'image/png' });
      expect(body.key).toMatch(/^cosmetic\/icon\/[a-f0-9]{64}\.png$/);
      const meta = await sharp(storage.objects.get(body.key)!).metadata();
      expect([meta.format, meta.hasAlpha]).toEqual(['png', true]);
    });

    it('refuses what is not a PNG, WebP or JPEG, whatever it is labelled', async () => {
      const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><script>alert(1)</script></svg>');
      const res = await upload('icon', svg);
      expect(res.statusCode).toBe(415);
      expect(res.json().code).toBe('INVALID_IMAGE');
      const gif = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(256)]);
      expect((await upload('icon', gif, admin, app, 'image/webp')).statusCode).toBe(415);
      // a content type it does not read bodies for is refused before the handler
      expect((await upload('icon', svg, admin, app, 'image/svg+xml')).statusCode).toBe(415);
    });

    it('refuses a file over the upload limit before reading it', async () => {
      const res = await upload('background', Buffer.alloc(config.MEDIA_MAX_UPLOAD_MB * 1024 * 1024 + 4096, 1));
      expect(res.statusCode).toBe(413);
    });

    it('refuses the wrong shape and too small, saying what it got', async () => {
      const square = await upload('background', await picture(1600, 1200));
      expect(square.statusCode).toBe(422);
      expect(square.json()).toMatchObject({ code: 'WRONG_SHAPE', details: { width: 1600, height: 1200, shape: '16:9' } });
      const wide = await upload('icon', await picture(800, 500, true));
      expect(wide.json().code).toBe('WRONG_SHAPE');
      const small = await upload('background', await picture(960, 540));
      expect(small.statusCode).toBe(422);
      expect(small.json()).toMatchObject({ code: 'IMAGE_TOO_SMALL', details: { minWidth: 1280, minHeight: 720 } });
    });

    it('says plainly when there is no storage to put art in', async () => {
      const res = await upload('icon', await picture(512, 512, true), admin, bare);
      expect(res.statusCode).toBe(503);
      expect(res.json().code).toBe('STORAGE_UNAVAILABLE');
    });
  });

  describe('adding an item', () => {
    it('holds its art, and every view resolves uploaded art to the CDN and built-in art to the site', async () => {
      const { sku: added, key } = await addArtItem('Newroz', 'background', { premiumOnly: true });
      expect((await uploadRow(key))?.confirmed_at).not.toBeNull();

      const shopView = (await call(member, 'GET', '/shop')).json().items as Array<{ sku: string; assetUrl: string | null }>;
      expect(shopView.find((i) => i.sku === added)?.assetUrl).toBe(`https://cdn.test/${key}`);
      // the art the shop ships with stays a path on the site
      const builtIn = shopView.find((i) => i.sku === 'bg-made-hevalo');
      if (builtIn) expect(builtIn.assetUrl).toBe('/cosmetics/backgrounds/made-01-hevalo.webp');

      const listed = (await call(admin, 'GET', '/admin/shop/items')).json().items as Array<{ sku: string; assetUrl: string; owners: number; retiredAt: string | null }>;
      expect(listed.find((i) => i.sku === added)).toMatchObject({ assetUrl: `https://cdn.test/${key}`, owners: 0, retiredAt: null });

      // owned and worn: the inventory and the profile resolve it the same way
      await pool.query(`INSERT INTO user_entitlements (user_id, sku, source) VALUES ($1, $2, 'grant')`, [owner.id, added]);
      const inventory = (await call(owner, 'GET', '/me/inventory')).json().items as Array<{ sku: string; assetUrl: string }>;
      expect(inventory.find((i) => i.sku === added)?.assetUrl).toBe(`https://cdn.test/${key}`);
      expect((await call(owner, 'PUT', '/me/cosmetics/background', { sku: added })).statusCode).toBe(200);
      const profile = (await call(member, 'GET', `/users/${owner.id}`)).json();
      expect(profile.background).toMatchObject({ sku: added, url: `https://cdn.test/${key}`, type: 'image' });
    });

    it('refuses an SKU that is taken, rather than replacing that item', async () => {
      const { sku: first } = await addArtItem('Taken', 'icon');
      const art = await upload('icon', await picture(512, 512, true));
      const res = await call(admin, 'POST', '/admin/shop/items', {
        sku: first,
        name: 'Impostor',
        category: 'icon',
        currency: 'zer',
        price: 1,
        assetKey: art.json().key,
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('SKU_TAKEN');
      expect((await pool.query(`SELECT name FROM shop_items WHERE sku = $1`, [first])).rows[0]?.name).toBe('Taken');
    });

    it('refuses icon art on a background, art that was never uploaded, and no art at all', async () => {
      const iconArt = await upload('icon', await picture(512, 512, true));
      const wrong = await call(admin, 'POST', '/admin/shop/items', {
        sku: sku('mixed'),
        name: 'Mixed',
        category: 'background',
        currency: 'zer',
        price: 10,
        assetKey: iconArt.json().key,
      });
      expect(wrong.statusCode).toBe(409);
      expect(wrong.json().code).toBe('ART_WRONG_KIND');
      const missing = await call(admin, 'POST', '/admin/shop/items', {
        sku: sku('ghost'),
        name: 'Ghost',
        category: 'icon',
        currency: 'zer',
        price: 10,
        assetKey: `cosmetic/icon/${'0'.repeat(64)}.png`,
      });
      expect(missing.json().code).toBe('ART_MISSING');
      const bare = await call(admin, 'POST', '/admin/shop/items', { sku: sku('bare'), name: 'Bare', category: 'icon', currency: 'zer', price: 10 });
      expect(bare.json().code).toBe('ART_REQUIRED');
      expect((await pool.query(`SELECT 1 FROM shop_items WHERE sku = ANY($1)`, [[sku('mixed'), sku('ghost'), sku('bare')]])).rowCount).toBe(0);
    });

    it('sends a price of 1,000 or more to Approvals', async () => {
      const art = await upload('icon', await picture(512, 512, true));
      const res = await call(admin, 'POST', '/admin/shop/items', {
        sku: sku('dear'),
        name: 'Dear',
        category: 'icon',
        currency: 'gems',
        price: 1000,
        assetKey: art.json().key,
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('PRICE_NEEDS_APPROVAL');
    });
  });

  describe('editing an item', () => {
    it('changes only the fields sent, and records what changed', async () => {
      const { sku: edited, key } = await addArtItem('Hills', 'background', {
        premiumOnly: true,
        displayOrder: 40,
        description: 'Green',
        availableTo: '2031-01-01T00:00:00.000Z',
      });
      const res = await call(admin, 'PATCH', `/shop/items/${edited}`, { name: 'Spring hills', description: null });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        sku: edited,
        name: 'Spring hills',
        description: null,
        premiumOnly: true,
        displayOrder: 40,
        assetKey: key,
        assetUrl: `https://cdn.test/${key}`,
        availableTo: '2031-01-01T00:00:00.000Z',
        price: 300,
      });
      const audit = await pool.query<{ before: Record<string, unknown>; after: Record<string, unknown> }>(
        `SELECT before, after FROM admin_audit_log WHERE action = 'shop.item.edit' AND target_id = $1`,
        [edited],
      );
      expect(audit.rows[0]).toEqual({
        before: { name: 'Hills', description: 'Green' },
        after: { name: 'Spring hills', description: null },
      });
    });

    it('holds the new art and lets go of the old when the art is replaced', async () => {
      const { sku: edited, key: old } = await addArtItem('Swap', 'icon');
      const fresh = await upload('icon', await picture(512, 512, true));
      const res = await call(admin, 'PATCH', `/shop/items/${edited}`, { assetKey: fresh.json().key });
      expect(res.statusCode).toBe(200);
      expect((await uploadRow(fresh.json().key))?.confirmed_at).not.toBeNull();
      expect((await uploadRow(old))?.confirmed_at).toBeNull();
    });

    it('keeps art another item still uses', async () => {
      const { sku: a, key } = await addArtItem('Shared A', 'icon');
      const b = await call(admin, 'POST', '/admin/shop/items', { sku: sku('shared_b'), name: 'Shared B', category: 'icon', currency: 'zer', price: 5, assetKey: key });
      expect(b.statusCode).toBe(201);
      const fresh = await upload('icon', await picture(512, 512, true));
      await call(admin, 'PATCH', `/shop/items/${a}`, { assetKey: fresh.json().key });
      expect((await uploadRow(key))?.confirmed_at).not.toBeNull();
    });

    it('keeps the approval rule: a new price of 1,000 or more is refused, the rest of a dear item is not', async () => {
      const { sku: edited } = await addArtItem('Pricey', 'icon');
      expect((await call(admin, 'PATCH', `/shop/items/${edited}`, { price: 999 })).statusCode).toBe(200);
      const dear = await call(admin, 'PATCH', `/shop/items/${edited}`, { price: 1500 });
      expect(dear.statusCode).toBe(409);
      expect(dear.json().code).toBe('PRICE_NEEDS_APPROVAL');
      // an item already at a dear price keeps its other edits; a new currency is a new price
      await pool.query(`UPDATE shop_items SET price = 2000 WHERE sku = $1`, [edited]);
      expect((await call(admin, 'PATCH', `/shop/items/${edited}`, { name: 'Very pricey' })).statusCode).toBe(200);
      expect((await call(admin, 'PATCH', `/shop/items/${edited}`, { currency: 'gems' })).json().code).toBe('PRICE_NEEDS_APPROVAL');
      expect((await pool.query(`SELECT price, currency FROM shop_items WHERE sku = $1`, [edited])).rows[0]).toEqual({ price: 2000, currency: 'zer' });
    });

    it('refuses nothing to change, an unknown item, and a picture that is not the item’s kind', async () => {
      const { sku: edited } = await addArtItem('Strict', 'background');
      expect((await call(admin, 'PATCH', `/shop/items/${edited}`, {})).statusCode).toBe(400);
      expect((await call(admin, 'PATCH', `/shop/items/${sku('nope')}`, { name: 'x' })).statusCode).toBe(404);
      expect((await call(admin, 'PATCH', `/shop/items/${edited}`, { assetKey: 'icons/made-08-caydan.png' })).json().code).toBe('BAD_ART_KEY');
      expect((await call(admin, 'PATCH', `/shop/items/${edited}`, { assetKey: '../../index.html' })).json().code).toBe('BAD_ART_KEY');
      expect((await call(admin, 'PATCH', `/shop/items/${edited}`, { assetKey: null })).json().code).toBe('ART_REQUIRED');
    });

    it('holds art named by a change waiting in Approvals, and lets it go when the change is rejected', async () => {
      const { sku: edited } = await addArtItem('Waiting', 'icon');
      const art = await upload('icon', await picture(512, 512, true));
      const proposed = await call(admin, 'POST', '/admin/config/changes', {
        target: 'shop_item',
        payload: { sku: edited, name: 'Waiting', currency: 'zer', price: 1200, assetKey: art.json().key },
      });
      expect(proposed.statusCode).toBe(202);
      expect((await uploadRow(art.json().key))?.confirmed_at).not.toBeNull();

      // the item cannot be deleted from under the change
      const removed = await call(admin, 'DELETE', `/shop/items/${edited}`);
      expect(removed.statusCode).toBe(409);
      expect(removed.json().code).toBe('CHANGE_PENDING');

      const reviewer = await person('reviewer');
      await pool.query(`UPDATE users SET roles = '{admin}' WHERE id = $1`, [reviewer.id]);
      await pass2fa(app, reviewer.token, ip());
      const rejected = await call(reviewer, 'POST', `/admin/config/changes/${proposed.json().id}/reject`, { reason: 'too dear' });
      expect(rejected.statusCode).toBe(200);
      expect((await uploadRow(art.json().key))?.confirmed_at).toBeNull();
    });
  });

  describe('deleting an item', () => {
    it('deletes one nobody has, and lets go of its art', async () => {
      const { sku: gone, key } = await addArtItem('Unloved', 'icon');
      const usage = await call(admin, 'GET', `/admin/shop/items/${gone}/usage`);
      expect(usage.json()).toEqual({ sku: gone, owners: 0, equipped: 0, gifts: 0, refunds: 0, builtIn: false, outcome: 'delete' });
      const res = await call(admin, 'DELETE', `/shop/items/${gone}`);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ sku: gone, outcome: 'deleted', owners: 0, artReleased: true });
      expect((await pool.query(`SELECT 1 FROM shop_items WHERE sku = $1`, [gone])).rowCount).toBe(0);
      expect((await uploadRow(key))?.confirmed_at).toBeNull();
      const audit = await pool.query(`SELECT before FROM admin_audit_log WHERE action = 'shop.item.delete' AND target_id = $1`, [gone]);
      expect(audit.rows[0]?.before).toMatchObject({ sku: gone, name: 'Unloved' });
      expect((await call(admin, 'DELETE', `/shop/items/${gone}`)).statusCode).toBe(404);
    });

    it('retires one people own: off sale and out of the admin list, kept and still worn by its owners', async () => {
      const { sku: kept, key } = await addArtItem('Beloved', 'background', { premiumOnly: true });
      await pool.query(`INSERT INTO user_entitlements (user_id, sku, source) VALUES ($1, $2, 'purchase')`, [owner.id, kept]);
      expect((await call(owner, 'PUT', '/me/cosmetics/background', { sku: kept })).statusCode).toBe(200);
      // somebody wearing it on Premium without owning it
      expect((await call(borrower, 'PUT', '/me/cosmetics/background', { sku: kept })).statusCode).toBe(200);

      const usage = (await call(admin, 'GET', `/admin/shop/items/${kept}/usage`)).json();
      expect(usage).toMatchObject({ owners: 1, equipped: 2, outcome: 'retire' });
      const res = await call(admin, 'DELETE', `/shop/items/${kept}`);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ sku: kept, outcome: 'retired', owners: 1, equipped: 2, unequipped: 1, artReleased: false });

      const row = (await pool.query(`SELECT active, in_stock, retired_at FROM shop_items WHERE sku = $1`, [kept])).rows[0];
      expect(row).toMatchObject({ active: false, in_stock: false });
      expect(row.retired_at).not.toBeNull();
      expect((await uploadRow(key))?.confirmed_at).not.toBeNull();

      // out of the shop and out of the admin's list, unless asked for
      expect(((await call(member, 'GET', '/shop')).json().items as Array<{ sku: string }>).some((i) => i.sku === kept)).toBe(false);
      const listed = (await call(admin, 'GET', '/admin/shop/items')).json().items as Array<{ sku: string }>;
      expect(listed.some((i) => i.sku === kept)).toBe(false);
      const all = (await call(admin, 'GET', '/admin/shop/items?retired=include')).json().items as Array<{ sku: string; retiredAt: string | null; owners: number }>;
      expect(all.find((i) => i.sku === kept)).toMatchObject({ owners: 1 });
      expect(all.find((i) => i.sku === kept)?.retiredAt).toBeTruthy();

      // the owner keeps it and still wears it; the borrower's is taken off
      expect(((await call(owner, 'GET', '/me/inventory')).json().items as Array<{ sku: string }>).some((i) => i.sku === kept)).toBe(true);
      expect((await call(member, 'GET', `/users/${owner.id}`)).json().background).toMatchObject({ sku: kept, url: `https://cdn.test/${key}` });
      expect((await call(owner, 'PUT', '/me/cosmetics/background', { sku: kept })).statusCode).toBe(200);
      const borrowed = await pool.query(`SELECT equipped_background_sku FROM users WHERE id = $1`, [borrower.id]);
      expect(borrowed.rows[0]?.equipped_background_sku).toBeNull();

      const audit = await pool.query(`SELECT after FROM admin_audit_log WHERE action = 'shop.item.retire' AND target_id = $1`, [kept]);
      expect(audit.rows[0]?.after).toMatchObject({ active: false, inStock: false, owners: 1 });

      // retiring again answers the same; listing it again brings it back
      expect((await call(admin, 'DELETE', `/shop/items/${kept}`)).json().outcome).toBe('retired');
      const relisted = await call(admin, 'PATCH', `/shop/items/${kept}`, { active: true, inStock: true });
      expect(relisted.json()).toMatchObject({ active: true, inStock: true, retiredAt: null });
    });

    it('retires an item that was given as a gift, so the gift stays in the chat', async () => {
      const { sku: given } = await addArtItem('Given', 'icon');
      await pool.query(
        `INSERT INTO gifts (from_user_id, to_user_id, sku, price, currency) VALUES ($1, $2, $3, 300, 'zer')`,
        [member.id, owner.id, given],
      );
      const res = await call(admin, 'DELETE', `/shop/items/${given}`);
      expect(res.json()).toMatchObject({ outcome: 'retired', gifts: 1 });
    });

    it('retires the art the shop ships with rather than deleting it', async () => {
      const usage = await call(admin, 'GET', '/admin/shop/items/bg-made-hevalo/usage');
      if (usage.statusCode === 404) return; // a database without the shipped catalogue
      expect(usage.json()).toMatchObject({ builtIn: true, outcome: 'retire' });
    });
  });
});

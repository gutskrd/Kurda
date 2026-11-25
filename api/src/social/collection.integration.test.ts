/** A profile's collection over HTTP: the profile's own gate, blocks, and who sent a gift told only to its recipient. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import type { CollectionResponse } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';
import { bornYearsAgo } from '../test/age.js';
import { befriend, block } from '../test/social.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('a profile’s collection (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  const sku = (name: string): string => `it-coll-${name}-${suffix}`;
  let n = 0;
  interface Account {
    id: string;
    token: string;
  }

  const signUp = async (tag: string): Promise<Account> => {
    n += 1;
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `coll_${tag}_${suffix}@it.kurda.app`,
        username: `coll_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        ...bornYearsAgo(30),
      },
      remoteAddress: `10.178.${n}.1`,
    });
    if (res.statusCode !== 201) throw new Error(`register ${tag}: ${res.statusCode} ${res.body}`);
    await activate(app, pool, res);
    return { id: res.json().user.id, token: res.json().tokens.accessToken };
  };
  const read = (who: Account | null, id: string) =>
    app.inject({
      method: 'GET',
      url: `/users/${id}/collection`,
      headers: who ? { authorization: `Bearer ${who.token}` } : {},
      remoteAddress: '10.178.0.1',
    });
  const gift = (from: string, to: string, item: string, minutesAgo: number) =>
    pool.query(`INSERT INTO gifts (from_user_id, to_user_id, sku, price, currency, created_at) VALUES ($1, $2, $3, 100, 'zer', now() - $4 * interval '1 minute')`, [
      from,
      to,
      item,
      minutesAgo,
    ]);

  let owner: Account;
  let friend: Account;
  let stranger: Account;
  let blocked: Account;

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    for (const [name, category, asset] of [
      ['star', 'icon', 'icons/star.png'],
      ['moon', 'icon', 'icons/moon.png'],
      ['sky', 'background', null],
    ] as const) {
      await pool.query(`INSERT INTO shop_items (sku, name, category, currency, price, asset_key) VALUES ($1, $2, $3, 'zer', 100, $4)`, [
        sku(name),
        `Item ${name}`,
        category,
        asset,
      ]);
    }
    owner = await signUp('owner');
    friend = await signUp('friend');
    stranger = await signUp('stranger');
    blocked = await signUp('blocked');
    await befriend(pool, owner.id, friend.id);
    await pool.query(`INSERT INTO user_entitlements (user_id, sku, source) VALUES ($1, $2, 'gift'), ($1, $3, 'purchase')`, [owner.id, sku('star'), sku('moon')]);
    await pool.query(`UPDATE users SET equipped_icon_sku = $2 WHERE id = $1`, [owner.id, sku('star')]);
    // Two skies from a friend and one star from somebody the owner later blocks; the owner sent the friend a moon.
    await gift(friend.id, owner.id, sku('sky'), 30);
    await gift(friend.id, owner.id, sku('sky'), 10);
    await gift(blocked.id, owner.id, sku('star'), 20);
    await gift(owner.id, friend.id, sku('moon'), 5);
    await block(pool, owner.id, blocked.id);
  });

  afterAll(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
      await client.query(`DELETE FROM shop_items WHERE sku LIKE $1`, [`it-coll-%-${suffix}`]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.end();
    await app.close();
  });

  it('shows the owner their icons with the worn one first, what they were given with who sent it, and what they sent', async () => {
    const res = await read(owner, owner.id);
    expect(res.statusCode).toBe(200);
    const body = res.json() as CollectionResponse;
    expect(body.private).toBe(false);
    expect(body.icons.items.map((i) => [i.sku, i.worn])).toEqual([
      [sku('star'), true],
      [sku('moon'), false],
    ]);
    expect(body.icons.total).toBe(2);
    // Newest first: the second sky came ten minutes ago, the star twenty.
    expect(body.received.items.map((g) => [g.sku, g.count])).toEqual([
      [sku('sky'), 2],
      [sku('star'), 1],
    ]);
    const skies = body.received.items[0]!.people!;
    expect(skies).toHaveLength(2);
    expect(skies.every((p) => p.person?.id === friend.id)).toBe(true);
    expect(new Date(skies[0]!.at).getTime()).toBeGreaterThan(new Date(skies[1]!.at).getTime());
    // Somebody blocked is there without a name.
    expect(body.received.items[1]!.people).toEqual([{ person: null, at: expect.any(String) }]);
    expect(body.sent?.items).toEqual([expect.objectContaining({ sku: sku('moon'), count: 1, people: [expect.objectContaining({ person: expect.objectContaining({ id: friend.id }) })] })]);
  });

  it('shows anyone else the items and counts but never who sent them, and nothing of what was sent', async () => {
    for (const viewer of [friend, stranger, null]) {
      const body = (await read(viewer, owner.id)).json() as CollectionResponse;
      // Accounts start as 'members': a signed-out reader is told nothing.
      if (viewer === null) {
        expect(body).toMatchObject({ private: true, icons: { items: [] }, received: { items: [] } });
        continue;
      }
      expect(body.icons.items).toHaveLength(2);
      expect(body.received.items.map((g) => g.count)).toEqual([2, 1]);
      expect(body.received.items.every((g) => g.people === undefined)).toBe(true);
      expect(body.sent).toBeUndefined();
      expect(JSON.stringify(body)).not.toContain(friend.id);
    }
  });

  it('follows the profile’s visibility: friends only keeps it from a stranger and shows it to a friend', async () => {
    await pool.query(`UPDATE users SET profile_visibility = 'friends' WHERE id = $1`, [owner.id]);
    try {
      expect((await read(stranger, owner.id)).json()).toMatchObject({ private: true, icons: { items: [], total: 0 } });
      expect(((await read(friend, owner.id)).json() as CollectionResponse).icons.total).toBe(2);
    } finally {
      await pool.query(`UPDATE users SET profile_visibility = 'members' WHERE id = $1`, [owner.id]);
    }
  });

  it('is not found across a block, either way', async () => {
    expect((await read(blocked, owner.id)).statusCode).toBe(404);
    expect((await read(owner, blocked.id)).statusCode).toBe(404);
  });
});

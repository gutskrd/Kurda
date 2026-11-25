/** A profile's collection over HTTP: the profile's own gate, blocks, and each giver named only as the reader may see them. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import type { CollectionGift, CollectionResponse } from '@kurda/shared';
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

  const signUp = async (tag: string, years = 30): Promise<Account> => {
    n += 1;
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `coll_${tag}_${suffix}@it.kurda.app`,
        username: `coll_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        ...bornYearsAgo(years),
      },
      remoteAddress: `10.178.${n}.1`,
    });
    if (res.statusCode !== 201) throw new Error(`register ${tag}: ${res.statusCode} ${res.body}`);
    await activate(app, pool, res);
    return { id: res.json().user.id, token: res.json().tokens.accessToken };
  };
  const read = async (who: Account | null, id: string): Promise<{ status: number; body: CollectionResponse }> => {
    const res = await app.inject({
      method: 'GET',
      url: `/users/${id}/collection`,
      headers: who ? { authorization: `Bearer ${who.token}` } : {},
      remoteAddress: '10.178.0.1',
    });
    return { status: res.statusCode, body: res.json() };
  };
  const gift = (from: string, to: string, item: string, minutesAgo: number) =>
    pool.query(`INSERT INTO gifts (from_user_id, to_user_id, sku, price, currency, created_at) VALUES ($1, $2, $3, 100, 'zer', now() - $4 * interval '1 minute')`, [
      from,
      to,
      item,
      minutesAgo,
    ]);
  /** Who each gift item came from, as the reader is told: an id, or null for "a Hevalo member". */
  const givers = (gifts: CollectionGift[]): Record<string, Array<string | null>> =>
    Object.fromEntries(gifts.map((g) => [g.sku, g.people.map((p) => p.person?.id ?? null)]));

  let owner: Account;
  let friend: Account;
  let stranger: Account;
  let blocked: Account;
  let teen: Account;
  let gone: Account;
  let picky: Account;

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
    teen = await signUp('teen', 15);
    gone = await signUp('gone');
    picky = await signUp('picky');
    await befriend(pool, owner.id, friend.id);
    await befriend(pool, owner.id, teen.id);
    await pool.query(`INSERT INTO user_entitlements (user_id, sku, source) VALUES ($1, $2, 'gift'), ($1, $3, 'purchase')`, [owner.id, sku('star'), sku('moon')]);
    await pool.query(`UPDATE users SET equipped_icon_sku = $2 WHERE id = $1`, [owner.id, sku('star')]);
    // Two skies from a friend; a star from somebody the owner later blocks, and one from an account since deleted; a moon
    // from a teenage friend. The owner sent the friend a moon.
    await gift(friend.id, owner.id, sku('sky'), 30);
    await gift(friend.id, owner.id, sku('sky'), 10);
    await gift(blocked.id, owner.id, sku('star'), 20);
    await gift(gone.id, owner.id, sku('star'), 25);
    await gift(teen.id, owner.id, sku('moon'), 40);
    await gift(owner.id, friend.id, sku('moon'), 5);
    await block(pool, owner.id, blocked.id);
    await block(pool, picky.id, friend.id);
    await pool.query(`UPDATE users SET deleted_at = now() WHERE id = $1`, [gone.id]);
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

  it('shows the owner their icons with the worn one first, their gifts newest first with who gave them, and what they sent', async () => {
    const { status, body } = await read(owner, owner.id);
    expect(status).toBe(200);
    expect(body.private).toBe(false);
    expect(body.icons.items.map((i) => [i.sku, i.worn])).toEqual([
      [sku('star'), true],
      [sku('moon'), false],
    ]);
    expect(body.icons.total).toBe(2);
    // The second sky came ten minutes ago, the newer star twenty, the moon forty.
    expect(body.received.items.map((g) => [g.sku, g.count])).toEqual([
      [sku('sky'), 2],
      [sku('star'), 2],
      [sku('moon'), 1],
    ]);
    const skies = body.received.items[0]!.people;
    expect(new Date(skies[0]!.at).getTime()).toBeGreaterThan(new Date(skies[1]!.at).getTime());
    // Somebody the owner blocked, and an account that is gone, are members without a name; a teenage friend is named.
    expect(givers(body.received.items)).toEqual({ [sku('sky')]: [friend.id, friend.id], [sku('star')]: [null, null], [sku('moon')]: [teen.id] });
    expect(body.sent?.items).toEqual([expect.objectContaining({ sku: sku('moon'), count: 1, people: [expect.objectContaining({ person: expect.objectContaining({ id: friend.id }) })] })]);
  });

  it('names who gave each icon that came as a gift, the newest giver, as each reader may see them', async () => {
    const giverOf = (body: CollectionResponse): Record<string, string | null> =>
      Object.fromEntries(body.icons.items.map((i) => [i.sku, i.giftedBy?.id ?? null]));
    // The newest star came from somebody the owner blocked, so the owner is told no name; the moon’s teenage giver is
    // the owner’s friend, and a stranger’s no friend of theirs.
    expect(giverOf((await read(owner, owner.id)).body)).toEqual({ [sku('star')]: null, [sku('moon')]: teen.id });
    expect(giverOf((await read(stranger, owner.id)).body)).toEqual({ [sku('star')]: blocked.id, [sku('moon')]: null });
    expect((await read(stranger, owner.id)).body.icons.items[0]!.giftedBy).toMatchObject({
      id: blocked.id,
      username: expect.stringMatching(/^coll_blocked_/),
      avatarUrl: expect.any(String),
    });
    // A gift from an account since deleted names nobody once it is the newest of its kind.
    await gift(gone.id, owner.id, sku('star'), 1);
    try {
      expect(giverOf((await read(stranger, owner.id)).body)[sku('star')]).toBeNull();
    } finally {
      await pool.query(`DELETE FROM gifts WHERE to_user_id = $1 AND sku = $2 AND created_at > now() - interval '5 minutes'`, [owner.id, sku('star')]);
    }
  });

  it('names each giver to anyone else as they may see them, and keeps what the owner sent to the owner', async () => {
    // A stranger is told the adults, the one the owner blocked included, and not the teenager they are no friend of.
    const strangers = (await read(stranger, owner.id)).body;
    expect(givers(strangers.received.items)).toEqual({ [sku('sky')]: [friend.id, friend.id], [sku('star')]: [blocked.id, null], [sku('moon')]: [null] });
    expect(strangers.icons.items).toHaveLength(2);
    expect(strangers.sent).toBeUndefined();
    // Somebody who blocked the giver is not shown them.
    const pickys = (await read(picky, owner.id)).body;
    expect(givers(pickys.received.items)[sku('sky')]).toEqual([null, null]);
    // A friend of the owner is told no more of the teenager than a stranger.
    const friends = (await read(friend, owner.id)).body;
    expect(givers(friends.received.items)[sku('moon')]).toEqual([null]);
    expect(friends.sent).toBeUndefined();
    // The teenager is told their own name.
    expect(givers((await read(teen, owner.id)).body.received.items)[sku('moon')]).toEqual([teen.id]);
  });

  it('follows the profile’s visibility: nothing signed out from a members’ profile, nothing to a stranger from a friends’ one', async () => {
    expect((await read(null, owner.id)).body).toMatchObject({ private: true, icons: { items: [], total: 0 }, received: { items: [], total: 0 } });
    await pool.query(`UPDATE users SET profile_visibility = 'friends' WHERE id = $1`, [owner.id]);
    try {
      expect((await read(stranger, owner.id)).body).toMatchObject({ private: true, icons: { items: [], total: 0 } });
      expect((await read(friend, owner.id)).body.icons.total).toBe(2);
    } finally {
      await pool.query(`UPDATE users SET profile_visibility = 'members' WHERE id = $1`, [owner.id]);
    }
  });

  it('is not found across a block, either way', async () => {
    expect((await read(blocked, owner.id)).status).toBe(404);
    expect((await read(owner, blocked.id)).status).toBe(404);
  });
});

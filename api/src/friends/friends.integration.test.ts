/** Friend system (KUR-081) against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { FriendService } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('friend system (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let friends: FriendService;
  const suffix = Date.now().toString(36);
  const id: Record<string, string> = {};

  const register = async (tag: string, ip: string): Promise<string> => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `fr_${tag}_${suffix}@it.kurda.app`,
        username: `fr_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
      },
      remoteAddress: ip,
    });
    return res.json().user.id as string;
  };
  const has = (list: Array<{ userId: string }>, userId: string): boolean => list.some((x) => x.userId === userId);

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    friends = new FriendService(pool);
    id.a = await register('a', '10.81.1.1');
    id.b = await register('b', '10.81.2.1');
    id.c = await register('c', '10.81.3.1');
    id.d = await register('d', '10.81.4.1');
    id.e = await register('e', '10.81.5.1');
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
    await pool.end();
    await app.close();
  });

  it('request → accept makes a mutual friendship', async () => {
    expect(await friends.request(id.a!, id.b!)).toBe('requested');
    expect(has(await friends.incomingRequests(id.b!), id.a!)).toBe(true);
    expect(await friends.respond(id.b!, id.a!, true)).toBe('accepted');
    expect(has((await friends.list(id.a!)).friends, id.b!)).toBe(true);
    expect(has((await friends.list(id.b!)).friends, id.a!)).toBe(true);
  });

  it('decline leaves no friendship', async () => {
    await friends.request(id.a!, id.c!);
    expect(await friends.respond(id.c!, id.a!, false)).toBe('declined');
    expect(has(await friends.incomingRequests(id.c!), id.a!)).toBe(false);
    expect(has((await friends.list(id.a!)).friends, id.c!)).toBe(false);
  });

  it('shows a sent request to the sender, and to nobody else as sent', async () => {
    await friends.request(id.d!, id.e!);

    expect(has(await friends.outgoingRequests(id.d!), id.e!)).toBe(true);
    // it is incoming for them, not outgoing — the two lists are not the same list
    expect(has(await friends.outgoingRequests(id.e!), id.d!)).toBe(false);
    expect(has(await friends.incomingRequests(id.e!), id.d!)).toBe(true);
  });

  it('lets the sender take a request back', async () => {
    await friends.cancelRequest(id.d!, id.e!);

    expect(has(await friends.outgoingRequests(id.d!), id.e!)).toBe(false);
    expect(has(await friends.incomingRequests(id.e!), id.d!)).toBe(false);
    // withdrawn, not answered: they can still be friends later
    expect(await friends.request(id.d!, id.e!)).toBe('requested');
    await friends.cancelRequest(id.d!, id.e!);
  });

  it('will not let the recipient cancel a request as if they had sent it', async () => {
    await friends.request(id.d!, id.e!);

    // e is the recipient; cancelling is for the sender, and declining is a
    // separate act that e is entitled to make instead
    await friends.cancelRequest(id.e!, id.d!);
    expect(has(await friends.incomingRequests(id.e!), id.d!)).toBe(true);

    expect(await friends.respond(id.e!, id.d!, false)).toBe('declined');
  });

  it('cancelling something that is not there is not an error', async () => {
    await expect(friends.cancelRequest(id.d!, id.e!)).resolves.toBeUndefined();
  });

  it('a mutual request auto-accepts', async () => {
    await friends.request(id.a!, id.d!);
    expect(await friends.request(id.d!, id.a!)).toBe('accepted');
    expect(has((await friends.list(id.a!)).friends, id.d!)).toBe(true);
  });

  it('blocking cancels a pending request silently and hides the requester', async () => {
    await friends.request(id.e!, id.a!); // E asks to be A's friend
    expect(has(await friends.incomingRequests(id.a!), id.e!)).toBe(true);

    await friends.block(id.a!, id.e!); // A blocks E
    // the request vanishes for both, with no notification
    expect(has(await friends.incomingRequests(id.a!), id.e!)).toBe(false);
    expect(await friends.areBlocked(id.a!, id.e!)).toBe(true);
    // E re-requesting is silently swallowed (never told they're blocked)
    expect(await friends.request(id.e!, id.a!)).toBe('silent');
    expect(has(await friends.incomingRequests(id.a!), id.e!)).toBe(false);
  });

  it('blocking removes an existing friendship and hides both users', async () => {
    // A and B are friends from the first test
    await friends.block(id.a!, id.b!);
    expect(has((await friends.list(id.a!)).friends, id.b!)).toBe(false);
    expect(has((await friends.list(id.b!)).friends, id.a!)).toBe(false);
    expect(await friends.areBlocked(id.b!, id.a!)).toBe(true);
    // A can't re-add B until unblocking
    await expect(friends.request(id.a!, id.b!)).rejects.toThrow(/unblock/i);
    await friends.unblock(id.a!, id.b!);
    expect(await friends.areBlocked(id.a!, id.b!)).toBe(false);
  });

  /**
   * The blocklist. Its own users throughout: the a–e graph is mutated by the
   * tests above and a list that has to be exhaustive cannot share it.
   */
  describe('the list of who you have blocked', () => {
    let me = '';
    let token = '';
    let one = '';
    let two = '';

    beforeAll(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: `fr_bl_me_${suffix}@it.kurda.app`,
          username: `fr_bl_me_${suffix}`.slice(0, 30),
          password: 'a-strong-password1',
          acceptTerms: true,
        },
        remoteAddress: '10.81.30.1',
      });
      me = res.json().user.id as string;
      token = res.json().tokens.accessToken as string;

      one = await register('bl_1', '10.81.30.2');
      two = await register('bl_2', '10.81.30.3');
      await friends.block(me, one);
      await friends.block(me, two);
    });

    it('lists everyone you blocked, most recent first', async () => {
      const page = await friends.blocked(me);
      expect(page.total).toBe(2);
      expect(page.blocked.map((b) => b.userId)).toEqual([two, one]);
      expect(page.blocked[0]!.username).toContain('bl_2');
      expect(Date.parse(page.blocked[0]!.blockedAt)).toBeGreaterThan(0);
    });

    /**
     * The one property that matters most here. A block is silent by design —
     * `request` returns 'silent' rather than admitting it, and a blocked user's
     * profile answers 404 — and all of that is undone if the list ever answers
     * "who blocked me" as well as "who did I block".
     */
    it('never tells you who has blocked you', async () => {
      expect((await friends.blocked(one)).blocked).toEqual([]);
      expect((await friends.blocked(one)).total).toBe(0);
      expect((await friends.blocked(two)).total).toBe(0);
    });

    it('drops someone the moment you unblock them', async () => {
      await friends.unblock(me, one);
      const page = await friends.blocked(me);
      expect(page.total).toBe(1);
      expect(page.blocked.map((b) => b.userId)).toEqual([two]);

      await friends.block(me, one); // put it back for the tests below
    });

    it('pages without losing the count of the whole list', async () => {
      const first = await friends.blocked(me, undefined, 1, 0);
      const second = await friends.blocked(me, undefined, 1, 1);

      expect(first.blocked).toHaveLength(1);
      expect(second.blocked).toHaveLength(1);
      expect(first.blocked[0]!.userId).not.toBe(second.blocked[0]!.userId);
      // both pages still say how long the list actually is
      expect(first.total).toBe(2);
      expect(second.total).toBe(2);
      // and past the end there is no row to carry the count, so it is counted
      expect(await friends.blocked(me, undefined, 1, 50)).toEqual({ blocked: [], total: 2 });
    });

    it('leaves out an account that has since been deleted', async () => {
      const gone = await register('bl_gone', '10.81.30.4');
      await friends.block(me, gone);
      expect((await friends.blocked(me)).total).toBe(3);

      await pool.query(`UPDATE users SET deleted_at = now() WHERE id = $1`, [gone]);
      const page = await friends.blocked(me);
      expect(page.total).toBe(2);
      expect(page.blocked.some((b) => b.userId === gone)).toBe(false);
      // the block itself survives, so it still holds if that account comes back
      expect(await friends.areBlocked(me, gone)).toBe(true);
    });

    it('serves the list over HTTP to the signed-in user and nobody else', async () => {
      const anon = await app.inject({ method: 'GET', url: '/friends/blocks' });
      expect(anon.statusCode).toBe(401);

      const mine = await app.inject({
        method: 'GET',
        url: '/friends/blocks',
        headers: { authorization: `Bearer ${token}` },
        remoteAddress: '10.81.30.1',
      });
      expect(mine.statusCode).toBe(200);
      // whoever the token belongs to, never a user id in the request
      expect(mine.json().blocked.map((b: { userId: string }) => b.userId)).toContain(two);
      expect(mine.json().total).toBe(2);
    });

    it('will not take a limit big enough to dump the whole table', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/friends/blocks?limit=100000',
        headers: { authorization: `Bearer ${token}` },
        remoteAddress: '10.81.30.1',
      });
      expect(res.statusCode).toBe(400);
    });
  });

  it('rejects friending or blocking yourself', async () => {
    await expect(friends.request(id.a!, id.a!)).rejects.toThrow(/yourself/i);
    await expect(friends.block(id.a!, id.a!)).rejects.toThrow(/yourself/i);
  });

  it('suggests friends-of-friends ranked by mutual count', async () => {
    // fresh graph (independent of the mutated a–e users): X–Y and Y–Z are friends
    const x = await register('sx', '10.81.10.1');
    const y = await register('sy', '10.81.10.2');
    const z = await register('sz', '10.81.10.3');
    await friends.request(x, y);
    await friends.respond(y, x, true);
    await friends.request(y, z);
    await friends.respond(z, y, true);

    const forX = await friends.suggestions(x);
    const zSug = forX.find((s) => s.userId === z);
    expect(zSug).toBeTruthy();
    expect(zSug!.mutualCount).toBe(1); // Y is the mutual friend
    expect(has(forX, y)).toBe(false); // already a friend
    expect(has(forX, x)).toBe(false); // never yourself
  });

  /**
   * The list is paged so that a profile drawing eight avatars can ask for
   * eight instead of five hundred. What has to hold is that the count keeps
   * telling the truth while the page gets shorter — a heading that says "8
   * friends" over a list of eight, when there are forty, is worse than the
   * over-fetch it replaced.
   */
  it('pages the list without lying about how long it is', async () => {
    const hub = await register('hub', '10.81.30.1');
    const others: string[] = [];
    for (let i = 0; i < 4; i++) {
      const other = await register(`pal${i}`, `10.81.31.${i + 1}`);
      await friends.request(hub, other);
      await friends.respond(other, hub, true);
      others.push(other);
    }

    const all = await friends.list(hub);
    expect(all.friends).toHaveLength(4);
    expect(all.total).toBe(4);

    const firstTwo = await friends.list(hub, undefined, 2);
    expect(firstTwo.friends).toHaveLength(2);
    expect(firstTwo.total).toBe(4);

    // the pages join back up, in the same order, with nobody twice
    const nextTwo = await friends.list(hub, undefined, 2, 2);
    expect(nextTwo.friends).toHaveLength(2);
    expect([...firstTwo.friends, ...nextTwo.friends].map((f) => f.userId)).toEqual(
      all.friends.map((f) => f.userId),
    );

    // past the end there is no row to carry count(*) OVER (), and answering 0
    // would read as "no friends" rather than "no more friends"
    const past = await friends.list(hub, undefined, 2, 10);
    expect(past.friends).toEqual([]);
    expect(past.total).toBe(4);

    // and nobody can ask for more than the cap allows
    const greedy = await friends.list(hub, undefined, 10_000);
    expect(greedy.friends).toHaveLength(4);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM users WHERE id = ANY($1)`, [[hub, ...others]]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
  });

  it('reflects online presence from last_seen_at', async () => {
    const p = await register('pon', '10.81.20.1');
    const q = await register('pof', '10.81.20.2');
    await friends.request(p, q);
    await friends.respond(q, p, true);
    // Q just heartbeated; P never did
    await pool.query(`UPDATE users SET last_seen_at = now() WHERE id = $1`, [q]);

    const forP = await friends.list(p);
    expect(forP.friends.find((x) => x.userId === q)?.online).toBe(true);
    const forQ = await friends.list(q);
    expect(forQ.friends.find((x) => x.userId === p)?.online).toBe(false);
  });
});

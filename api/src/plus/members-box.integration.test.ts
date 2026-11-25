/**
 * The members' box against real Postgres: given once a month to a member on their first visit, however many visits
 * race, with its Zêr outside the earned cap, three free gifts and that month's members-only item; nothing for anyone
 * else.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { MEMBERS_BOX_FREE_GIFTS, MEMBERS_BOX_ZER, membersBoxItem } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';
import { makeLearner, removeLearners, type TestLearner } from '../test/progress.js';
import { WalletService } from '../wallet/service.js';
import { MEMBERS_BOX_REASON, MembersBoxService } from './members-box.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('the members’ box (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let wallet: WalletService;
  let boxes: MembersBoxService;
  const suffix = Date.now().toString(36);
  let n = 0;
  const learner = (): Promise<TestLearner> => makeLearner(pool, `mbox${n++}${suffix}`);
  const member = async () => {
    const who = await learner();
    await pool.query(`UPDATE users SET premium_until = '2030-01-01T00:00:00Z' WHERE id = $1`, [who.id]);
    return who;
  };
  const ledger = async (who: TestLearner) =>
    (await pool.query<{ amount: number }>(`SELECT amount FROM wallet_ledger WHERE user_id = $1 AND reason = $2`, [who.id, MEMBERS_BOX_REASON])).rows.map(
      (r) => r.amount,
    );

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    wallet = new WalletService(pool);
    boxes = new MembersBoxService(pool, wallet);
  });

  afterAll(async () => {
    await removeLearners(pool, `mbox%${suffix}@it.kurda.app`);
    await pool.end();
    await app.close();
  });

  it('gives a member the month’s box once, with its Zêr, free gifts and item', async () => {
    const who = await member();
    const now = new Date('2026-03-05T10:00:00Z');
    expect(await boxes.ensure(who.id, now)).toBe(true);
    expect(await boxes.ensure(who.id, now)).toBe(false);
    const view = await boxes.view(who.id, now);
    expect(view).toMatchObject({
      box: { month: '2026-03', zer: MEMBERS_BOX_ZER, freeGifts: MEMBERS_BOX_FREE_GIFTS, item: { sku: membersBoxItem('2026-03') }, seen: false },
      freeGifts: MEMBERS_BOX_FREE_GIFTS,
    });
    expect(await ledger(who)).toEqual([MEMBERS_BOX_ZER]);
    const owned = await pool.query(`SELECT source FROM user_entitlements WHERE user_id = $1 AND sku = $2`, [who.id, membersBoxItem('2026-03')]);
    expect(owned.rows).toEqual([{ source: 'members_box' }]);
    await boxes.markSeen(who.id, now);
    expect((await boxes.view(who.id, now)).box?.seen).toBe(true);

    // a new month is a new box, and free gifts add up until used
    await boxes.ensure(who.id, new Date('2026-04-02T10:00:00Z'));
    expect(await ledger(who)).toEqual([MEMBERS_BOX_ZER, MEMBERS_BOX_ZER]);
    expect((await boxes.view(who.id, new Date('2026-04-02T10:00:00Z'))).freeGifts).toBe(2 * MEMBERS_BOX_FREE_GIFTS);
  });

  it('is given once when first visits race', async () => {
    const who = await member();
    const now = new Date('2026-05-01T00:00:01Z');
    const given = await Promise.all(Array.from({ length: 8 }, () => boxes.ensure(who.id, now)));
    expect(given.filter(Boolean)).toHaveLength(1);
    expect(await ledger(who)).toEqual([MEMBERS_BOX_ZER]);
  });

  it('holds the rest when the member owns the month’s item already', async () => {
    const who = await member();
    await pool.query(`INSERT INTO user_entitlements (user_id, sku, source) VALUES ($1, $2, 'purchase')`, [who.id, membersBoxItem('2026-06')]);
    await boxes.ensure(who.id, new Date('2026-06-10T00:00:00Z'));
    expect((await boxes.view(who.id, new Date('2026-06-10T00:00:00Z'))).box).toMatchObject({ zer: MEMBERS_BOX_ZER, item: null });
  });

  it('gives nobody else a box, and a lapsed member none', async () => {
    const plain = await learner();
    expect(await boxes.ensure(plain.id)).toBe(false);
    expect(await boxes.view(plain.id)).toEqual({ box: null, freeGifts: 0 });
    const lapsed = await learner();
    await pool.query(`UPDATE users SET premium_until = '2020-01-01T00:00:00Z' WHERE id = $1`, [lapsed.id]);
    expect(await boxes.ensure(lapsed.id)).toBe(false);
  });

  it('is given by the daily view on a member’s first visit of the month, and read at GET /me/members-box', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `mbox_http_${suffix}@it.kurda.app`,
        username: `mbox_http_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: '10.161.0.1',
    });
    await activate(app, pool, res);
    const token = res.json().tokens.accessToken as string;
    const userId = res.json().user.id as string;
    await pool.query(`UPDATE users SET premium_until = '2030-01-01T00:00:00Z' WHERE id = $1`, [userId]);
    const call = (method: 'GET' | 'POST', url: string) => app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, remoteAddress: '10.161.0.2' });

    expect((await call('GET', '/me/today')).statusCode).toBe(200);
    expect((await wallet.balances(userId)).zer).toBe(MEMBERS_BOX_ZER);
    const box = (await call('GET', '/me/members-box')).json();
    expect(box).toMatchObject({ box: { zer: MEMBERS_BOX_ZER, seen: false }, freeGifts: MEMBERS_BOX_FREE_GIFTS });
    expect((await call('POST', '/me/members-box/seen')).statusCode).toBe(200);
    expect((await call('GET', '/me/members-box')).json().box.seen).toBe(true);
    expect((await wallet.balances(userId)).zer).toBe(MEMBERS_BOX_ZER);
  });
});

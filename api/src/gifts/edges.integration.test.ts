/**
 * The gift rules where a request could slip past them, against real Postgres: ids sent in another letter case, gifts
 * not on offer, the bag and the wallet locked at once, a streak won back, what the catalog tells someone who cannot give
 * onto a post, who is told what Hevalo+ adds, gifts in the data export, a limit lowered to a shorter window, and the
 * bag's record that only ever grows.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { GIFT_DAY_CAPS, giftSku } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { issueAccessToken } from '../auth/tokens.js';
import { canonicalPair } from '../friends/pair.js';
import { WalletService } from '../wallet/service.js';
import { makeLearner } from '../test/progress.js';
import { StreakService } from '../streaks/service.js';
import { GdprService, eraseAccountData } from '../gdpr/service.js';
import { grantBagGiftWithin } from './bag.js';

const DATABASE_URL = process.env.DATABASE_URL;

interface Account {
  id: string;
  username: string;
  token: string;
}

const CAY = giftSku('cay');
const QEHWE = giftSku('qehwe');
const GUL = giftSku('gul');
const MAL = giftSku('mal');

/** The same uuid spelled with some of its letters in upper case: `mask` picks which. */
function spelled(id: string, mask: number): string {
  let bit = 0;
  return [...id].map((c) => (/[a-f]/.test(c) ? (mask & (1 << bit++) ? c.toUpperCase() : c) : c)).join('');
}

describe.skipIf(!DATABASE_URL)('the gift rules at their edges (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let wallet: WalletService;
  const suffix = Date.now().toString(36);
  let n = 0;
  const ip = (): string => `10.163.${Math.floor(++n / 250)}.${(n % 250) + 1}`;

  const person = async (tag: string, age: number | null = 30): Promise<Account> => {
    const who = await makeLearner(pool, `gx${tag}${suffix}`, { age });
    return { id: who.id, username: who.username, token: await issueAccessToken(config, { sub: who.id, ver: 0 }) };
  };
  const befriend = async (a: Account, b: Account, hoursAgo = 48): Promise<void> => {
    const { lo, hi } = canonicalPair(a.id, b.id);
    await pool.query(
      `INSERT INTO friendships (user_lo, user_hi, status, requested_by, created_at, responded_at)
       VALUES ($1, $2, 'accepted', $3, now() - make_interval(hours => $4), now() - make_interval(hours => $4))`,
      [lo, hi, a.id, hoursAgo],
    );
  };
  const call = (method: 'GET' | 'POST' | 'PUT', url: string, who: Account, payload?: unknown) =>
    app.inject({ method, url, headers: { authorization: `Bearer ${who.token}` }, ...(payload === undefined ? {} : { payload: payload as object }), remoteAddress: ip() });
  let k = 0;
  const key = (): string => `edge-${suffix}-${++k}`;
  const dm = (from: Account, toId: string, sku: string) => call('POST', '/gifts', from, { sku, toUserIds: [toId], chat: { kind: 'dm', userId: toId }, idempotencyKey: key() });
  /** A send, confirmed once more when its size asks for it, so only the gift rules can stop it. */
  const confirmed = async (from: Account, body: Record<string, unknown>) => {
    const first = await call('POST', '/gifts', from, body);
    if (first.json().code !== 'GIFT_NEEDS_CONFIRM') return first;
    return call('POST', '/gifts', from, { ...body, confirmToken: first.json().details.confirmToken });
  };
  const fund = (who: Account, amount = 100_000) => wallet.credit({ userId: who.id, currency: 'zer', amount, reason: 'admin_adjustment' });
  const zer = async (who: Account) => (await wallet.balances(who.id)).zer;
  const received = async (who: Account) =>
    (await pool.query<{ sku: string; price: number }>(`SELECT sku, price FROM gifts WHERE to_user_id = $1 ORDER BY created_at`, [who.id])).rows;
  const bag = async (who: Account) =>
    Object.fromEntries((await pool.query<{ sku: string; count: number }>(`SELECT sku, count FROM gift_bag WHERE user_id = $1`, [who.id])).rows.map((r) => [r.sku, r.count]));
  const inTx = async <T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const out = await work(client);
      await client.query('COMMIT');
      return out;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  };
  const post = async (author: Account): Promise<string> =>
    (
      await pool.query<{ id: string }>(
        `INSERT INTO library_posts (author_id, author_role, type, body, status, published_at) VALUES ($1, 'user', 'gotin', 'Silav', 'published', now()) RETURNING id`,
        [author.id],
      )
    ).rows[0]!.id;

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    wallet = new WalletService(pool);
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(app.realtime, 'notifyUser').mockResolvedValue(undefined);
    vi.spyOn(app.realtime, 'publish').mockResolvedValue(undefined);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM groups WHERE name LIKE $1`, [`edge ${suffix}%`]);
      await client.query(`DELETE FROM shop_items WHERE sku = $1`, [`gift-x${suffix}`]);
      await client.query(`DELETE FROM users WHERE username LIKE $1`, [`gx%${suffix}%`]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.end();
    await app.close();
  });

  describe('ids sent in another letter case', () => {
    it('hold a 15-year-old friend of an hour to the same rules, however the id is spelled', async () => {
      const adult = await person('caseadult');
      const teen = await person('caseteen', 15);
      await befriend(adult, teen, 1);
      await fund(adult);
      const asked = (id: string) => ({ sku: MAL, toUserIds: [id], chat: { kind: 'dm', userId: id }, idempotencyKey: key() });
      const plain = await confirmed(adult, asked(teen.id));
      for (const mask of [1, 2, 0xff, 0xfffff]) {
        const res = await confirmed(adult, asked(spelled(teen.id, mask)));
        expect(res.statusCode, res.body).toBe(plain.statusCode);
        expect({ sent: res.json().sent, skipped: res.json().skipped, code: res.json().code }).toEqual({
          sent: plain.json().sent,
          skipped: plain.json().skipped,
          code: plain.json().code,
        });
      }
      expect(await received(teen)).toEqual([]);
      expect(await zer(adult)).toBe(100_000);
      // nor does the shop's own gift route let one through
      expect((await call('POST', '/shop/gift', adult, { sku: MAL, toUserId: spelled(teen.id, 0xff), idempotencyKey: key() })).statusCode).not.toBe(200);
      expect(await received(teen)).toEqual([]);
      // and the gift sheet shows the cap on gifts to someone under 18 whichever way the id comes
      const sheet = await call('GET', `/gifts/catalog?to=${spelled(teen.id, 0xff)}`, adult);
      expect(sheet.json().limits).toEqual((await call('GET', `/gifts/catalog?to=${teen.id}`, adult)).json().limits);
    });

    it('keep the day’s gifts to one friend at its cap', async () => {
      // a friend under 18, so the narrow cap holds: three a day
      const cap = GIFT_DAY_CAPS.young.perFriend;
      const adult = await person('capadult');
      const pal = await person('cappal', 16);
      await befriend(adult, pal);
      await fund(adult, 1_000);
      for (let i = 0; i < cap; i++) expect((await dm(adult, pal.id, CAY)).json().sent).toEqual([pal.id]);
      for (const mask of [1, 2, 4]) expect((await dm(adult, spelled(pal.id, mask), CAY)).json().sent).toEqual([]);
      expect(await received(pal)).toHaveLength(cap);
    });

    it('count one person once in a group send, however many ways the id is spelled', async () => {
      const adult = await person('grpadult');
      const teen = await person('grpteen', 16);
      await befriend(adult, teen);
      await fund(adult, 1_000);
      const made = await pool.query<{ id: string }>(`INSERT INTO groups (name, owner_id) VALUES ($1, $2) RETURNING id`, [`edge ${suffix} group`, adult.id]);
      const group = made.rows[0]!.id;
      await pool.query(`INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'owner'), ($1, $3, 'member')`, [group, adult.id, teen.id]);
      const ids = [1, 2, 3, 4, 5, 6, 7].map((mask) => spelled(teen.id, mask));
      const res = await call('POST', '/gifts', adult, { sku: GUL, toUserIds: ids, chat: { kind: 'group', groupId: spelled(group, 0xff) }, idempotencyKey: key() });
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json().sent).toEqual([teen.id]);
      expect(await received(teen)).toEqual([{ sku: GUL, price: 25 }]);
      expect(await zer(adult)).toBe(1_000 - 25);
    });

    it('still hold a sender under 18 to 500 Zêr a gift', async () => {
      const teen = await person('casesender', 15);
      const pal = await person('casesenderpal');
      await befriend(teen, pal);
      await fund(teen, 10_000);
      expect((await dm(teen, spelled(pal.id, 0xff), MAL)).json().code).toBe('GIFT_OVER_LIMIT');
      expect(await received(pal)).toEqual([]);
    });
  });

  describe('a gift not on offer', () => {
    // a gift an admin added without a picture yet: on sale in the table, never shown on the gift sheet
    const UNDRAWN = `gift-x${suffix}`;

    it('cannot be bought or given while it has no picture, through either route', async () => {
      await pool.query(`INSERT INTO shop_items (sku, name, category, currency, price, active, in_stock) VALUES ($1, 'Undrawn', 'gift', 'zer', 10, true, true)`, [
        UNDRAWN,
      ]);
      const adult = await person('undrawn');
      const pal = await person('undrawnpal');
      await befriend(adult, pal);
      await fund(adult, 1_000);
      expect((await call('GET', `/gifts/catalog?to=${pal.id}`, adult)).json().items.map((i: { sku: string }) => i.sku)).not.toContain(UNDRAWN);
      const sent = await dm(adult, pal.id, UNDRAWN);
      expect(sent.statusCode).toBe(409);
      expect(sent.json().code).toBe('ITEM_UNAVAILABLE');
      const shop = await call('POST', '/shop/gift', adult, { sku: UNDRAWN, toUserId: pal.id, idempotencyKey: key() });
      expect(shop.json().code).toBe('ITEM_UNAVAILABLE');
      expect(await received(pal)).toEqual([]);
      expect(await zer(adult)).toBe(1_000);
    });
  });

  describe('the bag and the wallet locked at once', () => {
    it('take their locks in one order, so a bag gift and a payment together never deadlock', async () => {
      const who = await person('locks');
      await fund(who, 1);
      const c1 = await pool.connect();
      const c2 = await pool.connect();
      const failed: string[] = [];
      try {
        await c1.query('BEGIN');
        await c2.query('BEGIN');
        // a win fills the bag, then pays its Zêr
        await grantBagGiftWithin(c1, { userId: who.id, source: 'win', ref: `lock-${suffix}` });
        // meanwhile a harvest pays its Zêr, then fills the bag; given a moment to take the wallet if it can
        const wallet2 = c2.query(`SELECT 1 FROM wallet_balances WHERE user_id = $1 AND currency = 'zer' FOR UPDATE`, [who.id]);
        const second = wallet2
          .then(() => grantBagGiftWithin(c2, { userId: who.id, source: 'harvest', ref: `lock-${suffix}` }, { warn: () => failed.push('second grant') }))
          .catch((err: { code?: string }) => failed.push(`second ${err.code}`));
        await Promise.race([wallet2.catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 300))]);
        await c1
          .query(`SELECT 1 FROM wallet_balances WHERE user_id = $1 AND currency = 'zer' FOR UPDATE`, [who.id])
          .catch((err: { code?: string }) => failed.push(`first ${err.code}`));
        await c1.query('COMMIT');
        await second;
        await c2.query('COMMIT');
      } finally {
        await c1.query('ROLLBACK').catch(() => undefined);
        await c2.query('ROLLBACK').catch(() => undefined);
        c1.release();
        c2.release();
      }
      expect(failed).toEqual([]);
      expect(Object.values(await bag(who)).reduce((a, b) => a + b, 0)).toBe(2);
    });
  });

  describe('a streak won back', () => {
    it('does not fill the bag again for a milestone it reached within sixty days', async () => {
      const learner = await person('streakback');
      const streaks = new StreakService(pool);
      const at = (day: string) => new Date(`${day}T12:00:00Z`);
      for (let d = 1; d <= 8; d++) await streaks.recordActivity(learner.id, 'UTC', at(`2026-05-0${d}`));
      expect(await bag(learner)).toEqual({ [QEHWE]: 1 });
      // no freeze to keep the 9th, which is missed: the 10th's third session wins the eight days back, past the 7th again
      await pool.query(`UPDATE user_streaks SET freezes = 0 WHERE user_id = $1`, [learner.id]);
      expect((await streaks.recordActivity(learner.id, 'UTC', at('2026-05-10'))).current).toBe(1);
      for (let i = 0; i < 2; i++) await streaks.recordActivity(learner.id, 'UTC', at('2026-05-10'));
      expect((await streaks.get(learner.id, 'UTC', at('2026-05-10'))).current).toBe(9);
      expect(await bag(learner)).toEqual({ [QEHWE]: 1 });
    });
  });

  describe('what the catalog tells someone who cannot give onto a post', () => {
    it('shows the same limits on a stranger’s post whatever the author’s age', async () => {
      const stranger = await person('stranger');
      const unknown = await person('unknownauthor', null);
      const teen = await person('teenauthor', 15);
      const adult = await person('adultauthor');
      const sheet = async (author: Account) => (await call('GET', `/gifts/catalog?post=library:${await post(author)}`, stranger)).json();
      const [onUnknown, onAdult] = [await sheet(unknown), await sheet(adult)];
      expect(onAdult.hold).toBeNull();
      expect(onUnknown.limits).toEqual(onAdult.limits);
      // a teen's post is not shown to a stranger at all, so its sheet tells nothing either
      expect(await sheet(teen)).toMatchObject({ code: 'POST_NOT_FOUND' });
      // a friend of the author, who may give, is shown the cap that applies
      const friend = await person('authorfriend');
      await befriend(friend, unknown);
      const theirs = (await call('GET', `/gifts/catalog?post=library:${await post(unknown)}`, friend)).json();
      expect(theirs).toMatchObject({ hold: null, limits: { maxPrice: 500 } });
    });
  });

  describe('who is told what Hevalo+ adds', () => {
    it('is only an account the server knows is an adult, never a guest or anyone of unknown age', async () => {
      const adult = await person('knownadult');
      const unknown = await person('unknownage', null);
      const teen = await person('knownteen', 16);
      const guest = await person('guestage');
      await pool.query(`UPDATE users SET guest = true, email = NULL WHERE id = $1`, [guest.id]);
      const me = async (who: Account) => (await call('GET', '/me', who)).json().user;
      expect(await me(adult)).toMatchObject({ knownAdult: true });
      expect(await me(unknown)).toMatchObject({ knownAdult: false });
      expect(await me(teen)).toMatchObject({ knownAdult: false });
      expect(await me(guest)).toMatchObject({ knownAdult: false });
      expect((await call('GET', '/gifts/bag', adult)).json()).toMatchObject({ nudges: true });
      expect((await call('GET', '/gifts/bag', unknown)).json()).toMatchObject({ nudges: false });
      expect((await call('GET', '/gifts/bag', teen)).json()).toMatchObject({ nudges: false });
    });
  });

  describe('the data export', () => {
    it('holds the gifts given and received, naming the other person, and no price on what was received', async () => {
      const giver = await person('exportgiver');
      const pal = await person('exportpal');
      await befriend(giver, pal);
      await fund(giver, 1_000);
      await fund(pal, 1_000);
      expect((await dm(giver, pal.id, GUL)).json().sent).toEqual([pal.id]);
      expect((await dm(pal, giver.id, CAY)).json().sent).toEqual([giver.id]);
      type Exported = { gifts: { given: Record<string, unknown>[]; received: Record<string, unknown>[] } };
      const exported = (await new GdprService(pool).buildExport(giver.id)) as unknown as Exported;
      expect(exported.gifts.given).toMatchObject([
        { sku: GUL, item: 'Gul', zer: 25, paidWith: 'zer', to: { username: pal.username, displayName: null }, onPost: false },
      ]);
      expect(exported.gifts.received).toMatchObject([{ sku: CAY, item: 'Çay', from: { username: pal.username, displayName: null }, onPost: false }]);
      expect(exported.gifts.received[0]).not.toHaveProperty('zer');
      // someone whose account has closed is no longer named
      await pool.query(`UPDATE users SET deleted_at = now() WHERE id = $1`, [pal.id]);
      const later = (await new GdprService(pool).buildExport(giver.id)) as unknown as Exported;
      expect(later.gifts.given).toMatchObject([{ sku: GUL, to: null }]);
    });
  });

  describe('an adult’s own limit', () => {
    const limit = (who: Account, period: 'day' | 'week' | 'month', zerAmount: number) => call('PUT', '/me/gift-limit', who, { limit: { period, zer: zerAmount } });

    it('is lowered at once to a shorter window that cannot spend more, and waits a day when it could', async () => {
      const lower = await person('limitlower');
      expect((await limit(lower, 'week', 1_000)).json()).toMatchObject({ delayed: false });
      // at most 700 a week now, so it can only spend less
      expect((await limit(lower, 'day', 100)).json()).toMatchObject({ delayed: false, limit: { period: 'day', zer: 100 }, pending: null });

      const more = await person('limitmore');
      await limit(more, 'week', 1_000);
      // up to 1,400 a week, more than before
      expect((await limit(more, 'day', 200)).json()).toMatchObject({ delayed: true, limit: { period: 'week', zer: 1_000 } });
    });
  });

  describe('what landed in a bag', () => {
    it('can only be marked seen: never changed, deleted apart from its account, or emptied at once', async () => {
      const who = await person('appendonly');
      await inTx((c) => grantBagGiftWithin(c, { userId: who.id, source: 'harvest', ref: `ao-${suffix}` }));
      const refused = (sql: string) => pool.query(sql, [who.id]).then(
        () => 'allowed',
        (err: Error) => err.message,
      );
      expect(await refused(`UPDATE gift_bag_grants SET ref = 'other' WHERE user_id = $1`)).toMatch(/append-only/);
      expect(await refused(`UPDATE gift_bag_grants SET sku = 'gift-qehwe' WHERE user_id = $1`)).toMatch(/append-only/);
      expect(await refused(`UPDATE gift_bag_grants SET seen_at = now() WHERE user_id = $1`)).toBe('allowed');
      expect(await refused(`DELETE FROM gift_bag_grants WHERE user_id = $1`)).toMatch(/as long as the account lasts/);
      expect(await pool.query(`TRUNCATE gift_bag_grants`).then(() => 'allowed', (err: Error) => err.message)).toMatch(/cannot be truncated/);
      // the account's erase takes it, under its own transaction's leave
      await inTx((c) => eraseAccountData(c, who.id));
      expect((await pool.query(`SELECT 1 FROM gift_bag_grants WHERE user_id = $1`, [who.id])).rowCount).toBe(0);
      // and so does the account's own row going
      const gone = await person('appendgone');
      await inTx((c) => grantBagGiftWithin(c, { userId: gone.id, source: 'harvest', ref: `ao-${suffix}` }));
      await pool.query(`DELETE FROM users WHERE id = $1`, [gone.id]);
      expect((await pool.query(`SELECT 1 FROM gift_bag_grants WHERE user_id = $1`, [gone.id])).rowCount).toBe(0);
    });
  });
});

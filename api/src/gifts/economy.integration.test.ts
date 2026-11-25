/**
 * The gift economy against real Postgres: the gifts on sale, the gift bag everyone fills (members and free accounts,
 * never a child), giving from it under the gift rules, the safeguards on spending Zêr (under 18, to under 18, a big
 * gift's second confirmation, an adult's own limit and its day's wait on a raise), and two quick sends at once.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import {
  BAG_GIFTS_PER_DAY,
  BAG_MAX_EACH,
  BIG_GIFT_CONFIRM_TTL_MS,
  GIFTS,
  MINOR_GIFT_MONTHLY_ZER,
  giftSku,
  type BagSource,
} from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { issueAccessToken } from '../auth/tokens.js';
import { canonicalPair } from '../friends/pair.js';
import { WalletService } from '../wallet/service.js';
import { makeLearner } from '../test/progress.js';
import { payOnlineWin } from '../earn/wins.js';
import { StreakService } from '../streaks/service.js';
import { exportProgress } from '../gdpr/progress-export.js';
import { eraseAccountData } from '../gdpr/service.js';
import { pass2fa } from '../test/admin-2fa.js';
import { activate } from '../test/activate.js';
import { grantBagGiftWithin } from './bag.js';
import { confirmToken, confirmTokenValid, type ConfirmSubject } from './safety.js';

const DATABASE_URL = process.env.DATABASE_URL;

interface Account {
  id: string;
  token: string;
}

const CAY = giftSku('cay');
const QEHWE = giftSku('qehwe');
const GUL = giftSku('gul');
const PISIK = giftSku('pisik');
const BELEM = giftSku('belem');
const MAL = giftSku('mal');
const HEYV = giftSku('heyv');

describe.skipIf(!DATABASE_URL)('the gift economy (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let wallet: WalletService;
  const suffix = Date.now().toString(36);
  let n = 0;
  const ip = (): string => `10.162.${Math.floor(++n / 250)}.${(n % 250) + 1}`;

  const person = async (tag: string, age: number | null = 30): Promise<Account> => {
    const who = await makeLearner(pool, `ge${tag.toLowerCase()}${suffix}`, { age });
    return { id: who.id, token: await issueAccessToken(config, { sub: who.id, ver: 0 }) };
  };
  const befriend = async (a: Account, b: Account, hoursAgo = 48): Promise<void> => {
    const { lo, hi } = canonicalPair(a.id, b.id);
    await pool.query(
      `INSERT INTO friendships (user_lo, user_hi, status, requested_by, created_at, responded_at)
       VALUES ($1, $2, 'accepted', $3, now() - make_interval(hours => $4), now() - make_interval(hours => $4))
       ON CONFLICT (user_lo, user_hi) DO UPDATE SET status = 'accepted', created_at = EXCLUDED.created_at, responded_at = EXCLUDED.responded_at`,
      [lo, hi, a.id, hoursAgo],
    );
  };
  const call = (method: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, who: Account, payload?: unknown) =>
    app.inject({ method, url, headers: { authorization: `Bearer ${who.token}` }, ...(payload === undefined ? {} : { payload: payload as object }), remoteAddress: ip() });
  let k = 0;
  const key = () => `econ-${suffix}-${++k}`;
  const gift = (from: Account, to: Account, sku: string, extra: Record<string, unknown> = {}) =>
    call('POST', '/gifts', from, { sku, toUserIds: [to.id], chat: { kind: 'dm', userId: to.id }, idempotencyKey: key(), ...extra });
  const fund = (who: Account, amount = 200_000) => wallet.credit({ userId: who.id, currency: 'zer', amount, reason: 'admin_adjustment' });
  const zer = async (who: Account) => (await wallet.balances(who.id)).zer;
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
  const grant = (who: Account, source: BagSource, ref: string) => inTx((c) => grantBagGiftWithin(c, { userId: who.id, source, ref: `${ref}:${suffix}` }));
  /** Gifts already paid for this month, written straight into the table, as if sent earlier. */
  const spentBefore = async (from: Account, to: Account, zerSpent: number) =>
    pool.query(`INSERT INTO gifts (from_user_id, to_user_id, sku, price, currency, paid_with) VALUES ($1, $2, $3, $4, 'zer', 'zer')`, [from.id, to.id, PISIK, zerSpent]);

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
      await client.query(`DELETE FROM users WHERE email LIKE $1`, [`ge%${suffix}@it.kurda.app`]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.end();
    await app.close();
  });

  describe('the gifts on sale', () => {
    it('are the thirty-one gifts at their prices, the Newroz fire for March only, and the stickers retired', async () => {
      const rows = await pool.query<{ sku: string; name: string; price: number; category: string; available_to: Date | null; active: boolean }>(
        `SELECT sku, name, price, category, available_to, active FROM shop_items WHERE category = 'gift' ORDER BY display_order`,
      );
      expect(rows.rows.map((r) => [r.sku, r.name, r.price])).toEqual(GIFTS.map((g) => [giftSku(g.id), g.name, g.price]));
      expect(rows.rows.every((r) => r.active)).toBe(true);
      // the Newroz fire's March is the catalogue's, every year, not a date written into the table
      expect(rows.rows.filter((r) => r.available_to)).toEqual([]);
      expect(GIFTS.filter((g) => g.months).map((g) => [g.id, g.months])).toEqual([['pet', [3]]]);
      const stickers = await pool.query<{ active: boolean; retired: boolean }>(
        `SELECT active, retired_at IS NOT NULL AS retired FROM shop_items WHERE category = 'sticker'`,
      );
      expect(stickers.rows.length).toBe(9);
      expect(stickers.rows.every((r) => !r.active && r.retired)).toBe(true);
    });

    it('show in the admin’s list with their drawn pictures and prices, a dear price going through Approvals', async () => {
      const registered = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: `gestaff${suffix}@it.kurda.app`, username: `gestaff${suffix}`, password: 'a-strong-password1', acceptTerms: true, birthYear: 1990, birthMonth: 6 },
        remoteAddress: ip(),
      });
      await activate(app, pool, registered);
      const staff = { id: registered.json().user.id, token: registered.json().tokens.accessToken };
      await pool.query(`UPDATE users SET roles = '{admin}' WHERE id = $1`, [staff.id]);
      await pass2fa(app, staff.token, ip());
      const list = await call('GET', '/admin/shop/items', staff);
      expect(list.statusCode, list.body).toBe(200);
      const items = list.json().items as Array<{ sku: string; assetUrl: string | null; price: number; category: string }>;
      expect(items.find((i) => i.sku === HEYV)).toMatchObject({ category: 'gift', price: 20_000, assetUrl: '/cosmetics/gifts/made-07-heyv.png' });
      expect(items.find((i) => i.sku === giftSku('lale'))).toMatchObject({ price: 10, assetUrl: null });
      const edited = await call('PATCH', `/shop/items/${HEYV}`, staff, { price: 25_000 });
      expect(edited.json().code).toBe('PRICE_NEEDS_APPROVAL');
      // a small one changes at once, and a gift is never deleted, since it may wait in someone's bag
      expect((await call('PATCH', `/shop/items/${giftSku('lale')}`, staff, { price: 12 })).json()).toMatchObject({ price: 12 });
      await call('PATCH', `/shop/items/${giftSku('lale')}`, staff, { price: 10 });
      expect((await call('GET', `/admin/shop/items/${giftSku('lale')}/usage`, staff)).json()).toMatchObject({ builtIn: true, outcome: 'retire' });
    });
  });

  describe('the gift bag', () => {
    it('fills from every moment that pays members, for a free account as for a member, once a moment', async () => {
      const free = await person('bagfree');
      expect(await grant(free, 'streak', 's7')).toMatchObject({ sku: QEHWE, source: 'streak' });
      expect(await grant(free, 'harvest', 'h1')).toMatchObject({ sku: CAY });
      expect(await grant(free, 'podium', 'p1')).toMatchObject({ sku: QEHWE });
      // the same moment again gives nothing
      expect(await grant(free, 'streak', 's7')).toBeNull();
      expect(await bag(free)).toEqual({ [CAY]: 1, [QEHWE]: 2 });
      expect(await zer(free)).toBe(0);
    });

    it('puts a streak milestone’s coffee in a free account’s bag as the seventh day is learned', async () => {
      const learner = await person('bagstreak');
      const streaks = new StreakService(pool);
      for (let d = 1; d <= 6; d++) await streaks.recordActivity(learner.id, 'UTC', new Date(`2026-05-0${d}T12:00:00Z`));
      expect(await bag(learner)).toEqual({});
      await streaks.recordActivity(learner.id, 'UTC', new Date('2026-05-07T12:00:00Z'));
      expect(await bag(learner)).toEqual({ [QEHWE]: 1 });
      expect(await zer(learner)).toBe(0);
    });

    it('puts a win’s gift in a free account’s bag without any Zêr', async () => {
      const [a, b] = [await person('winA'), await person('winB')];
      const won = await inTx((c) => payOnlineWin(c, wallet, { ref: `w1:${suffix}`, players: [{ userId: a.id, place: 1 }, { userId: b.id, place: 2 }] }));
      expect(won).toMatchObject({ userId: a.id, result: { granted: 0, cappedBy: 'none' } });
      expect(await zer(a)).toBe(0);
      expect(await bag(a)).toEqual({ [CAY]: 1 });
      expect(await bag(b)).toEqual({});
    });

    it('holds five a day, and no more than ninety-nine of one kind', async () => {
      const busy = await person('bagcap');
      for (let i = 0; i < BAG_GIFTS_PER_DAY; i++) expect(await grant(busy, 'win', `cap${i}`)).not.toBeNull();
      expect(await grant(busy, 'win', 'cap-over')).toBeNull();
      expect(Object.values(await bag(busy)).reduce((a, b) => a + b, 0)).toBe(BAG_GIFTS_PER_DAY);

      const full = await person('bagfull');
      await pool.query(`INSERT INTO gift_bag (user_id, sku, count) VALUES ($1, $2, $3)`, [full.id, CAY, BAG_MAX_EACH]);
      expect(await grant(full, 'daily', 'd1')).toMatchObject({ sku: QEHWE });
      await pool.query(`UPDATE gift_bag SET count = $3 WHERE user_id = $1 AND sku = $2`, [full.id, QEHWE, BAG_MAX_EACH]);
      expect(await grant(full, 'daily', 'd2')).toBeNull();
      await expect(pool.query(`UPDATE gift_bag SET count = 100 WHERE user_id = $1 AND sku = $2`, [full.id, CAY])).rejects.toThrow();
    });

    it('lets two moments at once pass the day’s cap only as far as it goes', async () => {
      const racer = await person('bagrace');
      const results = await Promise.all(Array.from({ length: 8 }, (_, i) => grant(racer, 'win', `race${i}`)));
      expect(results.filter(Boolean)).toHaveLength(BAG_GIFTS_PER_DAY);
    });

    it('gives a child’s profile nothing', async () => {
      const child = await person('bagchild', 9);
      await pool.query(`UPDATE users SET kind = 'child' WHERE id = $1`, [child.id]);
      expect(await grant(child, 'harvest', 'c1')).toBeNull();
      expect(await bag(child)).toEqual({});
    });

    it('tells of what landed once, and shows what it holds', async () => {
      const looker = await person('baglook');
      await grant(looker, 'harvest', 'l1');
      const view = (await call('GET', '/gifts/bag', looker)).json();
      expect(view).toMatchObject({ items: [{ sku: CAY, name: 'Çay', count: 1, assetUrl: '/cosmetics/gifts/made-01-cay.png' }], earnsZer: false });
      expect(view.arrivals).toMatchObject([{ sku: CAY, source: 'harvest' }]);
      expect((await call('POST', '/gifts/bag/seen', looker)).json()).toEqual({ seen: 1 });
      expect((await call('GET', '/gifts/bag', looker)).json().arrivals).toEqual([]);
    });

    it('goes into the data export, and goes with the account', async () => {
      const leaving = await person('bagleave');
      await grant(leaving, 'harvest', 'x1');
      const exported = (await exportProgress(pool, leaving.id)) as { giftBag: { items: unknown[]; landed: unknown[] } };
      expect(exported.giftBag.items).toMatchObject([{ sku: CAY, count: 1 }]);
      expect(exported.giftBag.landed).toMatchObject([{ sku: CAY, source: 'harvest' }]);
      await inTx((c) => eraseAccountData(c, leaving.id));
      expect(await bag(leaving)).toEqual({});
      expect((await pool.query(`SELECT 1 FROM gift_bag_grants WHERE user_id = $1`, [leaving.id])).rowCount).toBe(0);
    });
  });

  describe('giving from the bag', () => {
    let giver: Account;
    let pal: Account;
    let newPal: Account;
    let stranger: Account;

    beforeAll(async () => {
      giver = await person('bgiver');
      pal = await person('bpal');
      newPal = await person('bnew', 15);
      stranger = await person('bstranger');
      await befriend(giver, pal);
      await befriend(giver, newPal, 2);
      await pool.query(`INSERT INTO gift_bag (user_id, sku, count) VALUES ($1, $2, 3)`, [giver.id, CAY]);
    });

    it('takes one from the bag, pays no Zêr, and records it as given from the bag', async () => {
      const res = await gift(giver, pal, CAY, { fromBag: true });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ sent: [pal.id], balance: { zer: 0 }, bag: [{ sku: CAY, count: 2 }] });
      const row = await pool.query(`SELECT paid_with, price FROM gifts WHERE from_user_id = $1`, [giver.id]);
      expect(row.rows).toEqual([{ paid_with: 'bag', price: 1 }]);
    });

    it('follows the friendship and new-friend rules of any gift, and spends nothing a rule turns away', async () => {
      expect((await gift(giver, stranger, CAY, { fromBag: true })).json().code).toBe('NOT_FRIENDS');
      expect((await gift(giver, newPal, CAY, { fromBag: true })).json()).toMatchObject({ sent: [], skipped: [{ userId: newPal.id, reason: 'not_allowed' }] });
      await pool.query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)`, [pal.id, giver.id]);
      expect((await gift(giver, pal, CAY, { fromBag: true })).statusCode).toBe(403);
      await pool.query(`DELETE FROM blocks WHERE blocker_id = $1`, [pal.id]);
      expect(await bag(giver)).toEqual({ [CAY]: 2 });
    });

    it('refuses what the bag does not hold, and anything but a gift', async () => {
      expect((await gift(giver, pal, QEHWE, { fromBag: true })).json().code).toBe('BAG_EMPTY');
      expect((await gift(giver, pal, CAY, { fromBag: true, useFreeGift: true })).json().code).toBe('BAD_PAYMENT');
    });

    it('lets two sends at once take only what is there', async () => {
      // two left, and a third friend's share of the day, so only the bag can stop the third
      const other = await person('bother');
      await befriend(giver, other);
      const results = await Promise.all([gift(giver, pal, CAY, { fromBag: true }), gift(giver, other, CAY, { fromBag: true }), gift(giver, other, CAY, { fromBag: true })]);
      const sent = results.filter((r) => r.statusCode === 200 && r.json().sent.length === 1);
      expect(sent, results.map((r) => r.body).join('\n')).toHaveLength(2);
      expect(results.filter((r) => r.json().code === 'BAG_EMPTY')).toHaveLength(1);
      expect(await bag(giver)).toEqual({});
    });

    it('never turns a received gift into Zêr: the gift is the recipient’s to keep, and cannot be bought or sold', async () => {
      expect(await zer(pal)).toBe(0);
      // as many as were given, whichever send lost the race above
      const given = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM gifts WHERE to_user_id = $1 AND sku = $2`, [pal.id, CAY]);
      expect(given.rows[0]!.n).toBeGreaterThan(0);
      const owned = await pool.query(`SELECT quantity FROM user_entitlements WHERE user_id = $1 AND sku = $2`, [pal.id, CAY]);
      expect(owned.rows[0]).toMatchObject({ quantity: given.rows[0]!.n });
      expect((await call('POST', '/shop/purchase', pal, { sku: CAY, idempotencyKey: key() })).json().code).toBe('GIFT_ONLY');
      expect((await call('POST', '/shop/sell', pal, { sku: CAY })).statusCode).toBe(404);
    });
  });

  describe('someone under 18', () => {
    let teen: Account;
    let teenPal: Account;
    let adultPal: Account;

    beforeAll(async () => {
      teen = await person('teen', 15);
      teenPal = await person('teenpal', 16);
      adultPal = await person('teenadult');
      await befriend(teen, teenPal);
      await befriend(teen, adultPal);
      await fund(teen, 10_000);
    });

    it('is shown what is within reach and no suggestion to buy', async () => {
      const catalog = (await call('GET', `/gifts/catalog?to=${teenPal.id}`, teen)).json();
      expect(catalog).toMatchObject({ nudges: false, limits: { maxPrice: 500, left: MINOR_GIFT_MONTHLY_ZER, confirmFrom: 2_000 } });
    });

    it('gives gifts of at most 500 Zêr', async () => {
      const res = await gift(teen, adultPal, BELEM);
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ code: 'GIFT_OVER_LIMIT', details: { maxPrice: 500 } });
      expect(await zer(teen)).toBe(10_000);
      expect((await gift(teen, adultPal, PISIK)).statusCode).toBe(200);
    });

    it('spends at most 2,000 Zêr a calendar month on gifts, gifts from the bag apart', async () => {
      await spentBefore(teen, teenPal, MINOR_GIFT_MONTHLY_ZER - 150 - 100);
      // 150 sent above and 1,750 before: 100 left
      const over = await gift(teen, teenPal, PISIK);
      expect(over.json()).toMatchObject({ code: 'GIFT_SPEND_LIMIT', details: { left: 100, by: 'minor_month' } });
      expect((await gift(teen, teenPal, GUL)).statusCode).toBe(200);
      await pool.query(`INSERT INTO gift_bag (user_id, sku, count) VALUES ($1, $2, 1)`, [teen.id, CAY]);
      expect((await gift(teen, teenPal, CAY, { fromBag: true })).json().sent).toEqual([teenPal.id]);
      expect((await call('GET', '/me/gift-limit', teen)).json()).toMatchObject({ minor: true, spent: MINOR_GIFT_MONTHLY_ZER - 75, limit: null });
    });

    it('cannot set a limit of their own, since theirs are fixed', async () => {
      const res = await call('PUT', '/me/gift-limit', teen, { limit: { period: 'day', zer: 5_000 } });
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('MINOR_GIFT_LIMITS');
    });

    it('lets two quick sends spend no more than the month allows', async () => {
      const racer = await person('teenrace', 14);
      const pal = await person('teenracepal', 14);
      await befriend(racer, pal);
      await fund(racer, 10_000);
      await spentBefore(racer, pal, MINOR_GIFT_MONTHLY_ZER - 200);
      const results = await Promise.all([gift(racer, pal, PISIK), gift(racer, pal, PISIK)]);
      expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
      expect(results.filter((r) => r.json().code === 'GIFT_SPEND_LIMIT')).toHaveLength(1);
      expect(await zer(racer)).toBe(10_000 - 150);
    });
  });

  describe('an adult giving to someone under 18', () => {
    it('gives only a friend, and only up to 500 Zêr', async () => {
      const adult = await person('toTeen');
      const teen = await person('toTeenKid', 16);
      const notFriend = await person('toTeenStranger', 16);
      const grown = await person('toTeenGrown');
      await befriend(adult, teen);
      await befriend(adult, grown);
      await fund(adult);
      expect((await call('GET', `/gifts/catalog?to=${teen.id}`, adult)).json()).toMatchObject({ nudges: true, limits: { maxPrice: 500 } });
      expect((await gift(adult, teen, BELEM)).json()).toMatchObject({ code: 'GIFT_OVER_LIMIT', details: { maxPrice: 500 } });
      expect((await gift(adult, teen, PISIK)).statusCode).toBe(200);
      expect((await gift(adult, notFriend, PISIK)).json().code).toBe('NOT_FRIENDS');
      // and to an adult friend, the dear gifts are there
      expect((await call('GET', `/gifts/catalog?to=${grown.id}`, adult)).json().limits.maxPrice).toBeNull();
    });

    it('cannot put a dear gift on their post either', async () => {
      const adult = await person('postTeen');
      const teen = await person('postTeenKid', 15);
      await befriend(adult, teen);
      await fund(adult);
      const postId = (
        await pool.query<{ id: string }>(
          `INSERT INTO library_posts (author_id, author_role, type, title, body, language, status, published_at)
           VALUES ($1, 'user', 'poem', $2, 'Helbesteke kurt.', 'kmr', 'published', now()) RETURNING id`,
          [teen.id, `Teen post ${suffix}`],
        )
      ).rows[0]!.id;
      const onPost = (sku: string) => call('POST', '/gifts', adult, { sku, post: { type: 'library', id: postId }, idempotencyKey: key() });
      expect((await onPost(BELEM)).json().code).toBe('GIFT_OVER_LIMIT');
      expect((await onPost(PISIK)).json().sent).toEqual([teen.id]);
    });
  });

  describe('a big gift’s second confirmation', () => {
    let sender: Account;
    let friend: Account;

    beforeAll(async () => {
      sender = await person('big');
      friend = await person('bigfriend');
      await befriend(sender, friend);
      await fund(sender, 50_000);
    });

    it('asks again with the amount before 2,000 Zêr or more goes, and moves nothing until then', async () => {
      const idempotencyKey = key();
      const first = await gift(sender, friend, BELEM, { idempotencyKey });
      expect(first.statusCode).toBe(409);
      const details = first.json().details;
      expect(first.json().code).toBe('GIFT_NEEDS_CONFIRM');
      expect(details).toMatchObject({ total: 2_000, recipients: 1 });
      expect(typeof details.confirmToken).toBe('string');
      expect(await zer(sender)).toBe(50_000);

      const confirmed = await gift(sender, friend, BELEM, { idempotencyKey, confirmToken: details.confirmToken });
      expect(confirmed.statusCode).toBe(200);
      expect(await zer(sender)).toBe(48_000);
      // the same request again is the same gift, paid once
      expect((await gift(sender, friend, BELEM, { idempotencyKey, confirmToken: details.confirmToken })).statusCode).toBe(200);
      expect(await zer(sender)).toBe(48_000);
    });

    it('holds a confirmation to the one send it was given for', async () => {
      const idempotencyKey = key();
      const { confirmToken: token } = (await gift(sender, friend, BELEM, { idempotencyKey })).json().details;
      // another request, another gift, a changed token: each asks again
      expect((await gift(sender, friend, BELEM, { idempotencyKey: key(), confirmToken: token })).json().code).toBe('GIFT_NEEDS_CONFIRM');
      expect((await gift(sender, friend, MAL, { idempotencyKey, confirmToken: token })).json().code).toBe('GIFT_NEEDS_CONFIRM');
      const forged = `${token.slice(0, -2)}${token.endsWith('AA') ? 'BB' : 'AA'}`;
      expect((await gift(sender, friend, BELEM, { idempotencyKey, confirmToken: forged })).json().code).toBe('GIFT_NEEDS_CONFIRM');
      expect(await zer(sender)).toBe(48_000);
    });

    it('expires, and is signed with the server’s own key', () => {
      const secret = Buffer.alloc(32, 7);
      const subject: ConfirmSubject = { fromId: sender.id, sku: BELEM, price: 2_000, recipients: [friend.id], target: `dm:${friend.id}`, idempotencyKey: 'k' };
      const now = new Date();
      const { token } = confirmToken(secret, subject, now);
      expect(confirmTokenValid(secret, token, subject, now)).toBe(true);
      expect(confirmTokenValid(secret, token, { ...subject, recipients: [sender.id] }, now)).toBe(false);
      expect(confirmTokenValid(Buffer.alloc(32, 8), token, subject, now)).toBe(false);
      expect(confirmTokenValid(secret, token, subject, new Date(now.getTime() + BIG_GIFT_CONFIRM_TTL_MS + 1))).toBe(false);
      expect(confirmTokenValid(secret, undefined, subject, now)).toBe(false);
    });

    it('never asks someone to confirm what they cannot pay for', async () => {
      const poor = await person('bigpoor');
      await befriend(poor, friend);
      await fund(poor, 500);
      expect((await gift(poor, friend, BELEM)).json().code).toBe('INSUFFICIENT_FUNDS');
    });

    it('opens a grand gift on the whole screen, and keeps it large on a post', async () => {
      const idempotencyKey = key();
      const { confirmToken: token } = (await gift(sender, friend, HEYV, { idempotencyKey })).json().details;
      const sent = await gift(sender, friend, HEYV, { idempotencyKey, confirmToken: token });
      expect(sent.statusCode).toBe(200);
      expect(sent.json().message.gift).toMatchObject({ sku: HEYV, tier: 'grand' });
    });
  });

  describe('an adult’s own spending limit', () => {
    let spender: Account;
    let friend: Account;
    const setLimit = (limit: { period: string; zer: number } | null) => call('PUT', '/me/gift-limit', spender, { limit });

    beforeAll(async () => {
      spender = await person('limit');
      friend = await person('limitfriend');
      await befriend(spender, friend);
      await fund(spender, 50_000);
    });

    it('applies a new limit at once, and holds sends to it', async () => {
      const set = (await setLimit({ period: 'day', zer: 200 })).json();
      expect(set).toMatchObject({ limit: { period: 'day', zer: 200 }, pending: null, delayed: false, left: 200 });
      expect((await gift(spender, friend, PISIK)).statusCode).toBe(200);
      expect((await gift(spender, friend, PISIK)).json()).toMatchObject({ code: 'GIFT_SPEND_LIMIT', details: { left: 50, by: 'own_limit' } });
      expect((await call('GET', `/gifts/catalog?to=${friend.id}`, spender)).json().limits.left).toBe(50);
    });

    it('raises it only a day later, and says from when', async () => {
      const raised = (await setLimit({ period: 'day', zer: 5_000 })).json();
      expect(raised).toMatchObject({ limit: { period: 'day', zer: 200 }, pending: { limit: { period: 'day', zer: 5_000 } }, delayed: true });
      const from = new Date(raised.pending.from).getTime();
      expect(from - Date.now()).toBeGreaterThan(23.9 * 3_600_000);
      // asking again keeps the time rather than starting the day over
      expect((await setLimit({ period: 'day', zer: 5_000 })).json().pending.from).toBe(raised.pending.from);
      expect((await gift(spender, friend, PISIK)).json().code).toBe('GIFT_SPEND_LIMIT');
      // a day on, the raise has taken over
      await pool.query(`UPDATE gift_spend_limits SET pending_from = now() - interval '1 second' WHERE user_id = $1`, [spender.id]);
      expect((await gift(spender, friend, PISIK)).statusCode).toBe(200);
      expect((await call('GET', '/me/gift-limit', spender)).json()).toMatchObject({ limit: { period: 'day', zer: 5_000 }, pending: null });
    });

    it('removes it only a day later, and a lowering in the meantime applies at once', async () => {
      const removed = (await setLimit(null)).json();
      expect(removed).toMatchObject({ limit: { zer: 5_000 }, pending: { limit: null }, delayed: true });
      const lowered = (await setLimit({ period: 'week', zer: 400 })).json();
      expect(lowered).toMatchObject({ limit: { period: 'week', zer: 400 }, pending: null, delayed: false });
      // 300 already this week, so a rose still goes and a kitten does not
      expect((await gift(spender, friend, PISIK)).json()).toMatchObject({ code: 'GIFT_SPEND_LIMIT', details: { left: 100 } });
      expect((await gift(spender, friend, GUL)).statusCode).toBe(200);
    });

    it('refuses a limit outside one euro to ten thousand', async () => {
      expect((await setLimit({ period: 'day', zer: 50 })).statusCode).toBe(400);
      expect((await setLimit({ period: 'year', zer: 500 })).statusCode).toBe(400);
    });

    it('lets two quick sends spend no more than the limit', async () => {
      const racer = await person('limitrace');
      await befriend(racer, friend);
      await fund(racer, 10_000);
      await call('PUT', '/me/gift-limit', racer, { limit: { period: 'day', zer: 200 } });
      const results = await Promise.all([gift(racer, friend, PISIK), gift(racer, friend, PISIK), gift(racer, friend, PISIK)]);
      expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
      expect(await zer(racer)).toBe(10_000 - 150);
    });
  });

  describe('a child’s profile', () => {
    it('sends nothing, by the gift routes or the bag', async () => {
      const child = await person('kid', 9);
      const pal = await person('kidpal');
      await pool.query(`UPDATE users SET kind = 'child' WHERE id = $1`, [child.id]);
      await befriend(child, pal);
      await pool.query(`INSERT INTO gift_bag (user_id, sku, count) VALUES ($1, $2, 1)`, [child.id, CAY]);
      const res = await gift(child, pal, CAY, { fromBag: true });
      expect(res.statusCode).toBe(403);
      expect((await call('GET', '/gifts/bag', child)).statusCode).toBe(403);
      expect((await call('GET', '/me/gift-limit', child)).statusCode).toBe(403);
      expect(await bag(child)).toEqual({ [CAY]: 1 });
    });
  });
});

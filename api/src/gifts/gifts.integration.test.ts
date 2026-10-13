/**
 * Gifts that arrive in the chat, against real Postgres: every rule a send
 * goes through (friends only, a day of friendship around anyone who is not a
 * known adult, the daily caps, owned already, never free), what it changes
 * (the money, the item, the one chat message), who is told and how, the
 * retry that must not pay twice, the race two friends gifting at once must
 * not both win, and the unwrapping.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { GIFTS_PER_DAY, GIFTS_PER_FRIEND_PER_DAY } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { WalletService } from '../wallet/service.js';
import { activate } from '../test/activate.js';
import { bornYearsAgo } from '../test/age.js';
import { canonicalPair } from '../friends/pair.js';

const DATABASE_URL = process.env.DATABASE_URL;

interface Account {
  id: string;
  token: string;
  username: string;
}

type Event = Record<string, unknown> & { type: string };

describe.skipIf(!DATABASE_URL)('gifts in the chat (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let wallet: WalletService;
  const suffix = Date.now().toString(36);
  let n = 0;
  const ip = (): string => `10.150.${Math.floor(++n / 250)}.${(n % 250) + 1}`;
  const groupIds: string[] = [];

  /** Every event pushed to a user's own channel, and every one published to a room. */
  let pushed: Array<{ to: string; ev: Event }> = [];
  let published: Array<{ room: string; ev: Event }> = [];
  const pushedTo = (to: string, type: string) => pushed.filter((p) => p.to === to && p.ev.type === type).map((p) => p.ev);

  const sku = (tag: string) => `gift_${tag}_${suffix}`;
  const BG = sku('bg'); // a background: unique, wearable, Zêr
  const POWER = sku('pw'); // not unique: can be given again and again
  const FREE = sku('free'); // costs nothing, so cannot be given
  const RACE = [sku('race1'), sku('race2'), sku('race3')];
  const BUY_RACE = sku('buyrace');

  const signUp = async (tag: string, birth = bornYearsAgo(30)): Promise<Account> => {
    const username = `gf_${tag}_${suffix}`.slice(0, 30);
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `gf_${tag}_${suffix}@it.kurda.app`,
        username,
        password: 'a-strong-password1',
        acceptTerms: true,
        ...birth,
      },
      remoteAddress: ip(),
    });
    if (res.statusCode !== 201) throw new Error(`register ${tag}: ${res.statusCode} ${res.body}`);
    await activate(app, pool, res);
    return { id: res.json().user.id, token: res.json().tokens.accessToken, username };
  };

  /** Friends since `hoursAgo` — set straight in the table, as other suites do. */
  const befriend = async (a: Account, b: Account, hoursAgo = 0): Promise<void> => {
    const { lo, hi } = canonicalPair(a.id, b.id);
    await pool.query(
      `INSERT INTO friendships (user_lo, user_hi, status, requested_by, created_at, responded_at)
       VALUES ($1, $2, 'accepted', $3, now() - make_interval(hours => $4), now() - make_interval(hours => $4))
       ON CONFLICT (user_lo, user_hi) DO UPDATE
         SET status = 'accepted', created_at = EXCLUDED.created_at, responded_at = EXCLUDED.responded_at`,
      [lo, hi, a.id, hoursAgo],
    );
  };

  const call = (method: 'GET' | 'POST' | 'DELETE', url: string, who: Account, payload?: unknown) =>
    app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${who.token}` },
      ...(payload === undefined ? {} : { payload: payload as object }),
      remoteAddress: ip(),
    });

  let keyN = 0;
  const key = () => `gift-key-${suffix}-${++keyN}`;

  const giftDm = (from: Account, to: Account, item: string, idempotencyKey = key()) =>
    call('POST', '/gifts', from, { sku: item, toUserIds: [to.id], chat: { kind: 'dm', userId: to.id }, idempotencyKey });

  const giftGroup = (from: Account, groupId: string, to: Account[], item: string, idempotencyKey = key()) =>
    call('POST', '/gifts', from, {
      sku: item,
      toUserIds: to.map((t) => t.id),
      chat: { kind: 'group', groupId },
      idempotencyKey,
    });

  const fund = (who: Account, amount = 10_000) =>
    wallet.credit({ userId: who.id, currency: 'zer', amount, reason: 'admin_adjustment' });
  const zer = async (who: Account) => (await wallet.balances(who.id)).zer;
  const owns = async (who: Account, item: string) =>
    (await pool.query<{ quantity: number; source: string }>(
      `SELECT quantity, source FROM user_entitlements WHERE user_id = $1 AND sku = $2`,
      [who.id, item],
    )).rows[0] ?? null;
  const giftRows = async (from: Account) =>
    (await pool.query<{ id: string; to_user_id: string; batch_id: string }>(
      `SELECT id, to_user_id, batch_id FROM gifts WHERE from_user_id = $1 ORDER BY created_at`,
      [from.id],
    )).rows;

  const group = async (name: string, owner: Account, members: Account[], privacy: 'invite' | 'open' = 'invite') => {
    const id = (
      await pool.query<{ id: string }>(`INSERT INTO groups (name, privacy, owner_id) VALUES ($1, $2, $3) RETURNING id`, [
        `${name} ${suffix}`,
        privacy,
        owner.id,
      ])
    ).rows[0]!.id;
    groupIds.push(id);
    await pool.query(`INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'owner')`, [id, owner.id]);
    for (const m of members) {
      await pool.query(`INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'member')`, [id, m.id]);
    }
    return id;
  };

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    wallet = new WalletService(pool);

    const items: Array<[string, string, string, number, boolean, string | null]> = [
      [BG, 'Gift Test Background', 'background', 300, true, 'backgrounds/background-01.webp'],
      [POWER, 'Gift Test Powerup', 'powerup', 20, false, null],
      [FREE, 'Gift Test Freebie', 'powerup', 0, false, null],
      [BUY_RACE, 'Gift Test Bought Or Given', 'background', 100, true, 'backgrounds/background-02.webp'],
      ...RACE.map((s, i): [string, string, string, number, boolean, string | null] => [
        s,
        `Gift Test Race ${i}`,
        'background',
        100,
        true,
        'backgrounds/background-03.webp',
      ]),
    ];
    for (const [s, name, category, price, unique, asset] of items) {
      await pool.query(
        `INSERT INTO shop_items (sku, name, category, currency, price, is_unique, active, in_stock, asset_key)
         VALUES ($1, $2, $3, 'zer', $4, $5, true, true, $6)`,
        [s, name, category, price, unique, asset],
      );
    }
  });

  beforeEach(() => {
    pushed = [];
    published = [];
    vi.restoreAllMocks();
    vi.spyOn(app.realtime, 'notifyUser').mockImplementation(async (to, ev) => {
      pushed.push({ to, ev: ev as Event });
    });
    vi.spyOn(app.realtime, 'publish').mockImplementation(async (room, ev) => {
      published.push({ room, ev: ev as Event });
    });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM groups WHERE id = ANY($1::uuid[])`, [groupIds]);
      await client.query(`DELETE FROM users WHERE email LIKE $1`, [`%_${suffix}@it.kurda.app`]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.query(`DELETE FROM shop_items WHERE sku LIKE $1`, [`gift_%_${suffix}`]);
    await pool.end();
    await app.close();
  });

  describe('a gift in a direct message', () => {
    let alan: Account;
    let bea: Account;
    let dev: Account;
    let giftId = '';
    let batchId = '';

    beforeAll(async () => {
      alan = await signUp('alan');
      bea = await signUp('bea');
      dev = await signUp('dev');
      await befriend(alan, bea); // friends since just now: both adults, so no wait
      await fund(alan);
    });

    it('charges the sender as a gift, gives the item, and posts one gift message', async () => {
      const before = await zer(alan);
      const res = await giftDm(alan, bea, BG);
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.sent).toEqual([bea.id]);
      expect(body.skipped).toEqual([]);
      expect(body.balance.zer).toBe(before - 300);
      batchId = body.batchId;

      const rows = await giftRows(alan);
      expect(rows).toHaveLength(1);
      giftId = rows[0]!.id;
      expect(rows[0]!.batch_id).toBe(batchId);

      // the ledger tells a gift from a purchase, and points at the gift
      const ledger = await pool.query(
        `SELECT reason, ref_id, amount FROM wallet_ledger WHERE user_id = $1 AND reason = 'gift'`,
        [alan.id],
      );
      expect(ledger.rows).toEqual([{ reason: 'gift', ref_id: giftId, amount: -300 }]);
      expect(await owns(bea, BG)).toEqual({ quantity: 1, source: 'gift' });

      const { lo, hi } = canonicalPair(alan.id, bea.id);
      const messages = await pool.query(
        `SELECT sender_id, kind, body, gift_batch_id FROM dm_messages WHERE user_lo = $1 AND user_hi = $2`,
        [lo, hi],
      );
      expect(messages.rows).toEqual([{ sender_id: alan.id, kind: 'gift', body: null, gift_batch_id: batchId }]);

      // the sender's own view of it comes back, to draw without a refetch
      expect(body.message).toMatchObject({ kind: 'gift', body: null, senderId: alan.id, game: null });
      expect(body.message.gift).toMatchObject({
        batchId,
        sku: BG,
        tier: 'common',
        myGiftId: null,
        equippable: null,
        recipients: [{ name: bea.username, isMe: false, opened: false }],
      });
      expect(body.message.gift).not.toHaveProperty('price');
    });

    it('reaches the recipient live, as a message and as a gift, and in their notifications', async () => {
      // the events of the send above were recorded before this test's reset,
      // so send another (not unique, so it can be given again)
      const res = await giftDm(alan, bea, POWER);
      expect(res.statusCode).toBe(200);
      const { batchId: b2 } = res.json();
      const dm = pushedTo(bea.id, 'dm');
      expect(dm).toHaveLength(1);
      expect(dm[0]).toMatchObject({ from: alan.id, fromUsername: alan.username });
      expect((dm[0]!.message as { gift: { myGiftId: string | null } }).gift.myGiftId).not.toBeNull();

      const received = pushedTo(bea.id, 'gift_received');
      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({
        batchId: b2,
        from: { name: alan.username },
        chat: { kind: 'dm', userId: alan.id },
        card: { sku: POWER, myOpened: false, recipients: [{ isMe: true }] },
      });
      // nothing went to anyone else
      expect(pushed.every((p) => p.to === bea.id)).toBe(true);

      const note = await pool.query<{ category: string; title: string; body: string; data: Record<string, string> }>(
        `SELECT category, title, body, data FROM notifications WHERE user_id = $1 AND data->>'batchId' = $2`,
        [bea.id, b2],
      );
      expect(note.rows).toHaveLength(1);
      expect(note.rows[0]).toMatchObject({ category: 'friends', title: 'You have a gift' });
      expect(note.rows[0]!.body).toContain(alan.username);
      expect(note.rows[0]!.data).toMatchObject({
        kind: 'gift',
        giftId: received[0]!.giftId,
        batchId: b2,
        chat: `dm:${alan.id}`,
      });
    });

    it('shows the gift in the thread to each side as theirs to see', async () => {
      const asBea = (await call('GET', `/chat/${alan.id}/messages`, bea)).json().messages;
      const card = asBea.find((m: { gift: { batchId: string } | null }) => m.gift?.batchId === batchId);
      expect(card).toMatchObject({ kind: 'gift', body: null, game: null });
      expect(card.gift).toMatchObject({
        myGiftId: giftId,
        myOpened: false,
        equippable: 'background',
        recipients: [{ name: bea.username, isMe: true, opened: false }],
      });

      const asAlan = (await call('GET', `/chat/${bea.id}/messages`, alan)).json().messages;
      const sent = asAlan.find((m: { gift: { batchId: string } | null }) => m.gift?.batchId === batchId);
      expect(sent.gift).toMatchObject({ myGiftId: null, equippable: null, recipients: [{ isMe: false }] });

      // a text message keeps its shape, with the new fields saying so
      const text = await call('POST', `/chat/${bea.id}/messages`, alan, { body: 'Ji te re!' });
      expect(text.json()).toMatchObject({ kind: 'text', body: 'Ji te re!', gift: null, game: null });
    });

    it('lists the conversation by what its last message is', async () => {
      await giftDm(alan, bea, POWER);
      const convo = (await call('GET', '/chat/conversations', bea)).json().conversations.find(
        (c: { userId: string }) => c.userId === alan.id,
      );
      // the apps write their own line from the kind; old builds print the stand-in
      expect(convo).toMatchObject({ lastKind: 'gift', lastMessage: '🎁 Gift', lastFromMe: false });
    });

    it('opens once: opened and seen, the sender told, and opening again is harmless', async () => {
      const res = await call('POST', `/gifts/${giftId}/open`, bea);
      expect(res.statusCode).toBe(200);
      expect(res.json().equippable).toBe('background');
      expect(res.json().card).toMatchObject({ batchId, myGiftId: giftId, myOpened: true, recipients: [{ opened: true }] });
      const row = await pool.query(`SELECT opened_at IS NOT NULL AS opened, seen_at IS NOT NULL AS seen FROM gifts WHERE id = $1`, [
        giftId,
      ]);
      expect(row.rows[0]).toEqual({ opened: true, seen: true });
      expect(pushedTo(alan.id, 'gift_opened')).toEqual([{ type: 'gift_opened', batchId, giftId }]);

      const again = await call('POST', `/gifts/${giftId}/open`, bea);
      expect(again.statusCode).toBe(200);
      expect(pushedTo(alan.id, 'gift_opened')).toHaveLength(1);

      // the sender's card says so when fetched again
      const card = await call('GET', `/gifts/batches/${batchId}`, alan);
      expect(card.json().card.recipients).toEqual([expect.objectContaining({ opened: true })]);
    });

    it('is opened only by its recipient, and its card shown only to the two of them', async () => {
      expect((await call('POST', `/gifts/${giftId}/open`, alan)).statusCode).toBe(404);
      expect((await call('POST', `/gifts/${giftId}/open`, dev)).statusCode).toBe(404);
      expect((await call('GET', `/gifts/batches/${batchId}`, dev)).statusCode).toBe(404);
    });

    it('refuses anyone who is not a friend, for the gift and for the picker', async () => {
      const res = await giftDm(alan, dev, POWER);
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('NOT_FRIENDS');
      expect((await call('GET', `/gifts/catalog?to=${dev.id}`, alan)).json().code).toBe('NOT_FRIENDS');
    });

    it('refuses a gift in a direct message to anyone but the person in it', async () => {
      const res = await call('POST', '/gifts', alan, {
        sku: POWER,
        toUserIds: [bea.id],
        chat: { kind: 'dm', userId: dev.id },
        idempotencyKey: key(),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('BAD_RECIPIENTS');
    });

    it('refuses to give something that costs nothing', async () => {
      const before = await zer(alan);
      const res = await giftDm(alan, bea, FREE);
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('NOT_GIFTABLE');
      expect(await zer(alan)).toBe(before);
    });

    it('skips a friend who owns it already, and charges nothing for them', async () => {
      const before = await zer(alan);
      const res = await giftDm(alan, bea, BG);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ sent: [], skipped: [{ userId: bea.id, reason: 'already_owned' }], message: null });
      expect(await zer(alan)).toBe(before);
      expect(pushed).toEqual([]);
    });

    it('moves nothing when the sender cannot afford it', async () => {
      const poor = await signUp('poor');
      await befriend(poor, bea);
      const res = await giftDm(poor, bea, POWER);
      expect(res.statusCode).toBe(402);
      expect(await giftRows(poor)).toEqual([]);
      const { lo, hi } = canonicalPair(poor.id, bea.id);
      expect((await pool.query(`SELECT 1 FROM dm_messages WHERE user_lo = $1 AND user_hi = $2`, [lo, hi])).rowCount).toBe(0);
    });

    it('ends with a block, which ends the friendship', async () => {
      const ola = await signUp('ola');
      await befriend(alan, ola);
      await pool.query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)`, [ola.id, alan.id]);
      await pool.query(`DELETE FROM friendships WHERE user_lo = LEAST($1::uuid, $2::uuid) AND user_hi = GREATEST($1::uuid, $2::uuid)`, [
        ola.id,
        alan.id,
      ]);
      const res = await giftDm(alan, ola, POWER);
      // the answer anyone who is not a friend gets: nothing says it was a block
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('NOT_FRIENDS');
    });

    it('is from a former member once the sender’s account is deleted', async () => {
      const gone = await signUp('gone');
      await befriend(gone, dev);
      await fund(gone);
      expect((await giftDm(gone, dev, POWER)).json().sent).toEqual([dev.id]);
      await pool.query(`UPDATE users SET deleted_at = now(), username = 'deleted_' || substr(id::text, 1, 8) WHERE id = $1`, [
        gone.id,
      ]);
      const list = (await call('GET', '/me/gifts', dev)).json().gifts;
      expect(list).toEqual([expect.objectContaining({ sku: POWER, from: null })]);
    });

    it('asks for the birth month first, as a message does', async () => {
      const unknown = await signUp('nobirth');
      await befriend(unknown, bea);
      await pool.query(`UPDATE users SET birth_year = NULL, birth_month = NULL WHERE id = $1`, [unknown.id]);
      expect((await giftDm(unknown, bea, POWER)).statusCode).toBe(428);
    });
  });

  describe('a block after the gift', () => {
    // A block is silent and absolute: the direct messages between the two
    // are hidden from both, and a gift in them is part of that thread.
    let sid: Account;
    let ria: Account; // fifteen
    let batchId = '';
    let giftId = '';

    beforeAll(async () => {
      sid = await signUp('sid');
      ria = await signUp('ria', bornYearsAgo(15));
      await befriend(ria, sid, 25);
      await fund(sid);
      const res = await giftDm(sid, ria, BG);
      expect(res.json().sent).toEqual([ria.id]);
      batchId = res.json().batchId;
      giftId = (await giftRows(sid))[0]!.id;
      const block = await call('POST', `/friends/${sid.id}/block`, ria);
      expect(block.statusCode).toBe(200);
    });

    it('lets the recipient open it, and tells the person they blocked nothing', async () => {
      const res = await call('POST', `/gifts/${giftId}/open`, ria);
      expect(res.statusCode).toBe(200);
      expect(res.json().card).toMatchObject({ myGiftId: giftId, myOpened: true });
      expect(pushed).toEqual([]);
    });

    it('shows the card to neither of them, as the thread it was in', async () => {
      expect((await call('GET', `/chat/${ria.id}/messages`, sid)).json().messages).toEqual([]);
      const asSender = await call('GET', `/gifts/batches/${batchId}`, sid);
      expect(asSender.statusCode).toBe(404);
      expect(asSender.json().code).toBe('GIFT_NOT_FOUND');
      expect((await call('GET', `/gifts/batches/${batchId}`, ria)).statusCode).toBe(404);
    });

    it('and once it is lifted, the card is back', async () => {
      expect((await call('DELETE', `/friends/${sid.id}/block`, ria)).statusCode).toBe(200);
      const card = await call('GET', `/gifts/batches/${batchId}`, sid);
      expect(card.statusCode).toBe(200);
      expect(card.json().card.recipients).toEqual([expect.objectContaining({ name: ria.username, opened: true })]);
    });
  });

  describe('a retry', () => {
    let cal: Account;
    let dot: Account;

    beforeAll(async () => {
      cal = await signUp('cal');
      dot = await signUp('dot');
      await befriend(cal, dot);
      await fund(cal);
    });

    it('returns the stored result and pays, posts and tells nobody twice', async () => {
      const k = key();
      const before = await zer(cal);
      const first = await giftDm(cal, dot, POWER, k);
      const again = await giftDm(cal, dot, POWER, k);
      expect(first.statusCode).toBe(200);
      expect(again.statusCode).toBe(200);
      expect(again.json()).toMatchObject({ batchId: first.json().batchId, sent: [dot.id], skipped: [], message: null });
      expect(await zer(cal)).toBe(before - 20);
      expect(await giftRows(cal)).toHaveLength(1);
      const { lo, hi } = canonicalPair(cal.id, dot.id);
      expect((await pool.query(`SELECT 1 FROM dm_messages WHERE user_lo = $1 AND user_hi = $2`, [lo, hi])).rowCount).toBe(1);
      expect(pushedTo(dot.id, 'gift_received')).toHaveLength(1);
    });

    it('sent twice at once, still happens once — and both answers say it did', async () => {
      const k = key();
      const before = await zer(cal);
      const [a, b] = await Promise.all([giftDm(cal, dot, POWER, k), giftDm(cal, dot, POWER, k)]);
      expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
      expect(a.json().batchId).toBe(b.json().batchId);
      expect(a.json().sent).toEqual([dot.id]);
      expect(b.json().sent).toEqual([dot.id]);
      expect(await zer(cal)).toBe(before - 20);
      expect((await giftRows(cal)).filter((r) => r.batch_id === a.json().batchId)).toHaveLength(1);
    });

    it('cannot be reused for a different item', async () => {
      const k = key();
      expect((await giftDm(cal, dot, POWER, k)).statusCode).toBe(200);
      const other = await giftDm(cal, dot, BG, k);
      expect(other.statusCode).toBe(409);
      expect(other.json().code).toBe('IDEMPOTENCY_REUSED');
    });
  });

  describe('a failure after the gift is made', () => {
    it('still tells the recipient, before the answer to the sender is built', async () => {
      // The gift is committed by then, and the sender's retry replays it
      // without telling anyone: so the telling cannot wait on the answer.
      const tia = await signUp('tia');
      const uli = await signUp('uli');
      await befriend(tia, uli);
      await fund(tia);
      vi.spyOn(WalletService.prototype, 'balances').mockRejectedValueOnce(new Error('timeout exceeded when trying to connect'));
      const k = key();
      const res = await giftDm(tia, uli, POWER, k);
      expect(res.statusCode).toBe(500);

      expect(pushedTo(uli.id, 'dm')).toHaveLength(1);
      expect(pushedTo(uli.id, 'gift_received')).toHaveLength(1);
      const note = await pool.query(`SELECT 1 FROM notifications WHERE user_id = $1 AND data->>'kind' = 'gift'`, [uli.id]);
      expect(note.rowCount).toBe(1);

      // and the retry gets the answer, from what was done
      const again = await giftDm(tia, uli, POWER, k);
      expect(again.statusCode).toBe(200);
      expect(again.json()).toMatchObject({ sent: [uli.id], skipped: [], balance: { zer: 10_000 - 20 } });
      expect(pushedTo(uli.id, 'gift_received')).toHaveLength(1);
    });
  });

  describe('a key used before in another chat', () => {
    // A retry is the same request in the same chat. Taken as one elsewhere, a
    // key would add people to a gift posted somewhere else: listed on a card
    // in a chat they are not in, and told of a gift in a chat that never got it.
    let ole: Account;
    let pia: Account;
    let kit: Account; // fifteen; ole's friend, not pia's
    let g1 = '';
    let g2 = '';

    beforeAll(async () => {
      ole = await signUp('ole');
      pia = await signUp('pia');
      kit = await signUp('kit', bornYearsAgo(15));
      await befriend(ole, pia);
      await befriend(kit, ole, 25);
      await fund(ole);
      g1 = await group('Key club one', ole, [pia, kit]);
      g2 = await group('Key club two', ole, [pia, kit]);
    });

    // each test on a day of its own, so the caps stay out of it
    beforeEach(async () => {
      await pool.query(`UPDATE gifts SET created_at = created_at - interval '25 hours' WHERE from_user_id = $1`, [ole.id]);
    });

    /** Nothing more given, paid, posted or told than before the refused send. */
    const expectNothingMore = async (before: { zer: number; gifts: number; messages: number }) => {
      expect(await zer(ole)).toBe(before.zer);
      expect(await giftRows(ole)).toHaveLength(before.gifts);
      expect(await groupMessages()).toBe(before.messages);
      expect(pushed).toEqual([]);
      expect(published).toEqual([]);
    };
    const groupMessages = async () =>
      (await pool.query<{ n: number }>(`SELECT count(*)::int n FROM group_messages WHERE group_id = ANY($1::uuid[])`, [[g1, g2]]))
        .rows[0]!.n;
    const state = async () => ({ zer: await zer(ole), gifts: (await giftRows(ole)).length, messages: await groupMessages() });

    it('from a direct message, is refused in a group, and adds nobody to the first gift', async () => {
      const k = key();
      const first = await giftDm(ole, pia, POWER, k);
      expect(first.json().sent).toEqual([pia.id]);
      pushed = [];
      published = [];

      const before = await state();
      const res = await giftGroup(ole, g1, [pia, kit], POWER, k);
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('IDEMPOTENCY_REUSED');
      await expectNothingMore(before);

      // the direct message's card still lists pia alone, for pia
      const asPia = (await call('GET', `/chat/${ole.id}/messages`, pia)).json().messages;
      const card = asPia.find((m: { gift: { batchId: string } | null }) => m.gift?.batchId === first.json().batchId);
      expect(card.gift.recipients).toEqual([expect.objectContaining({ name: pia.username, isMe: true })]);
    });

    it('from one group, is refused in another', async () => {
      const k = key();
      expect((await giftGroup(ole, g1, [pia], POWER, k)).json().sent).toEqual([pia.id]);
      pushed = [];
      published = [];
      const before = await state();
      const res = await giftGroup(ole, g2, [pia, kit], POWER, k);
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('IDEMPOTENCY_REUSED');
      await expectNothingMore(before);
    });

    it('from a group, is refused in a direct message', async () => {
      const k = key();
      expect((await giftGroup(ole, g2, [kit], POWER, k)).json().sent).toEqual([kit.id]);
      pushed = [];
      published = [];
      const before = await state();
      const res = await giftDm(ole, kit, POWER, k);
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('IDEMPOTENCY_REUSED');
      await expectNothingMore(before);
    });

    it('is refused when it was used for two gifts, which no one request made', async () => {
      // one key, two sends in the same group to different friends: two gifts,
      // each with its own message — and then a request naming both is a
      // retry of neither
      const k = key();
      const a = await giftGroup(ole, g1, [kit], POWER, k);
      const b = await giftGroup(ole, g1, [pia], POWER, k);
      expect(a.json().batchId).not.toBe(b.json().batchId);
      pushed = [];
      published = [];
      const res = await giftGroup(ole, g1, [kit, pia], POWER, k);
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('IDEMPOTENCY_REUSED');
    });

    it('whose gift has lost its message, is refused in a group and only answered from in a direct message', async () => {
      // the group is gone, and its messages with it: nothing says where the gift was
      const gone = await group('Key club gone', ole, [pia, kit]);
      const k = key();
      const first = await giftGroup(ole, gone, [pia], POWER, k);
      expect(first.json().sent).toEqual([pia.id]);
      await pool.query(`DELETE FROM groups WHERE id = $1`, [gone]);
      pushed = [];
      published = [];
      const before = await state();

      // in a group it could add kit to a gift whose chat is not this one…
      const elsewhere = await giftGroup(ole, g1, [pia, kit], POWER, k);
      expect(elsewhere.statusCode).toBe(409);
      expect(elsewhere.json().code).toBe('IDEMPOTENCY_REUSED');
      // …to pia alone, who has it, all it can do is say what was given
      const again = await giftDm(ole, pia, POWER, k);
      expect(again.statusCode).toBe(200);
      expect(again.json()).toMatchObject({ batchId: first.json().batchId, sent: [pia.id], skipped: [], message: null });
      await expectNothingMore(before);
    });

    it('in the same group, still reaches a friend the first try skipped, on the message it posted', async () => {
      const k = key();
      // kit is skipped the first time (a friendship of an hour, with a minor)…
      await befriend(kit, ole, 1);
      const first = await giftGroup(ole, g2, [pia, kit], BG, k);
      expect(first.json()).toMatchObject({ sent: [pia.id], skipped: [{ userId: kit.id, reason: 'not_allowed' }] });
      // …and reached by the retry, once the day has passed
      await befriend(kit, ole, 25);
      const again = await giftGroup(ole, g2, [pia, kit], BG, k);
      expect(again.statusCode).toBe(200);
      expect(again.json()).toMatchObject({ batchId: first.json().batchId, sent: [pia.id, kit.id], message: null });
      const messages = await pool.query(`SELECT 1 FROM group_messages WHERE gift_batch_id = $1`, [first.json().batchId]);
      expect(messages.rowCount).toBe(1);
    });
  });

  describe('two friends gifting the same thing at once', () => {
    it('gives it once: one is sent, the other is told they own it, and only one pays', async () => {
      const rae = await signUp('rae');
      const sam = await signUp('sam');
      const tess = await signUp('tess');
      await befriend(sam, rae);
      await befriend(tess, rae);
      await fund(sam);
      await fund(tess);

      // a few rounds, each a fresh item, so the race is run more than once
      for (const item of RACE) {
        const [a, b] = await Promise.all([giftDm(sam, rae, item), giftDm(tess, rae, item)]);
        expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
        const results = [a.json(), b.json()];
        expect(results.filter((r) => r.sent.length === 1)).toHaveLength(1);
        expect(results.filter((r) => r.skipped[0]?.reason === 'already_owned')).toHaveLength(1);
        expect(await owns(rae, item)).toEqual({ quantity: 1, source: 'gift' });
        const paid = await pool.query(
          `SELECT count(*)::int n FROM gifts WHERE to_user_id = $1 AND sku = $2`,
          [rae.id, item],
        );
        expect(paid.rows[0].n).toBe(1);
      }
      // 3 items × 100 Zêr, paid between them, never twice for one item
      expect((await zer(sam)) + (await zer(tess))).toBe(20_000 - 300);
    });

    it('two people giving the same friends something, listed the other way round, both go through', async () => {
      // Not unique, so nothing decides between them: each friend gets two.
      // Each send changes both friends' items, and without one order for
      // that, each held one friend's while waiting for the other's.
      const pat = await signUp('pat');
      const quin = await signUp('quin');
      const f0 = await signUp('wayf0');
      const f1 = await signUp('wayf1');
      for (const s of [pat, quin]) {
        for (const f of [f0, f1]) await befriend(s, f);
        await fund(s);
      }
      const gid = await group('Both ways', pat, [quin, f0, f1]);
      const rounds = 8;
      for (let i = 0; i < rounds; i++) {
        const [a, b] = await Promise.all([giftGroup(pat, gid, [f0, f1], POWER), giftGroup(quin, gid, [f1, f0], POWER)]);
        expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
        expect(a.json().sent).toEqual([f0.id, f1.id]);
        expect(b.json().sent).toEqual([f1.id, f0.id]);
        // the next round on another day, so the caps stay out of it
        await pool.query(
          `UPDATE gifts SET created_at = created_at - interval '25 hours' WHERE from_user_id = ANY($1::uuid[])`,
          [[pat.id, quin.id]],
        );
      }
      expect((await owns(f0, POWER))!.quantity).toBe(2 * rounds);
      expect((await owns(f1, POWER))!.quantity).toBe(2 * rounds);
    });

    it('and being given it while buying it: one of the two, never both', async () => {
      const uma = await signUp('uma');
      const vic = await signUp('vic');
      await befriend(vic, uma);
      await fund(uma);
      await fund(vic);
      const [gift, buy] = await Promise.all([
        giftDm(vic, uma, BUY_RACE),
        call('POST', '/shop/purchase', uma, { sku: BUY_RACE, idempotencyKey: key() }),
      ]);
      const gave = gift.statusCode === 200 && gift.json().sent.length === 1;
      const bought = buy.statusCode === 200;
      expect(gave !== bought).toBe(true);
      expect((await owns(uma, BUY_RACE))!.quantity).toBe(1);
      if (!bought) expect(buy.json().code).toBe('ALREADY_OWNED');
      if (!gave) expect(gift.json().skipped).toEqual([{ userId: uma.id, reason: 'already_owned' }]);
    });
  });

  describe('a friendship with someone who is not a known adult', () => {
    let wes: Account;
    let kid: Account;

    beforeAll(async () => {
      wes = await signUp('wes');
      kid = await signUp('kid', bornYearsAgo(15));
      await befriend(kid, wes); // the minor's own request, accepted just now
      await fund(wes);
      await fund(kid);
    });

    it('waits a day before a gift can pass, either way', async () => {
      const before = await zer(wes);
      const res = await giftDm(wes, kid, POWER);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ sent: [], skipped: [{ userId: kid.id, reason: 'not_allowed' }] });
      expect(await zer(wes)).toBe(before);
      expect((await giftDm(kid, wes, POWER)).json().skipped).toEqual([{ userId: wes.id, reason: 'not_allowed' }]);

      // the shop's button says so its own way
      const shop = await call('POST', '/shop/gift', wes, { sku: POWER, toUserId: kid.id, idempotencyKey: key() });
      expect(shop.statusCode).toBe(403);
      expect(shop.json().code).toBe('GIFT_NOT_ALLOWED');
    });

    it('and then lets it through', async () => {
      await befriend(kid, wes, 25);
      expect((await giftDm(wes, kid, POWER)).json().sent).toEqual([kid.id]);
      expect((await giftDm(kid, wes, POWER)).json().sent).toEqual([wes.id]);
    });

    it('counts an account whose age is not on record as not known to be an adult', async () => {
      const xan = await signUp('xan');
      const yul = await signUp('yul');
      await befriend(xan, yul);
      await fund(xan);
      // an older account that never answered: it cannot send (428), but it can be sent to
      await pool.query(`UPDATE users SET birth_year = NULL, birth_month = NULL WHERE id = $1`, [yul.id]);
      expect((await giftDm(xan, yul, POWER)).json().skipped).toEqual([{ userId: yul.id, reason: 'not_allowed' }]);
    });
  });

  describe('the daily caps', () => {
    it(`lets ${GIFTS_PER_FRIEND_PER_DAY} gifts reach one friend in 24 hours, then waits`, async () => {
      const zed = await signUp('zed');
      const ana = await signUp('ana');
      await befriend(zed, ana);
      await fund(zed);
      for (let i = 0; i < GIFTS_PER_FRIEND_PER_DAY; i++) {
        expect((await giftDm(zed, ana, POWER)).json().sent).toEqual([ana.id]);
      }
      const before = await zer(zed);
      const over = await giftDm(zed, ana, POWER);
      expect(over.json()).toMatchObject({ sent: [], skipped: [{ userId: ana.id, reason: 'daily_limit' }] });
      expect(await zer(zed)).toBe(before);
      expect((await call('POST', '/shop/gift', zed, { sku: POWER, toUserId: ana.id, idempotencyKey: key() })).json().code).toBe(
        'GIFT_DAILY_LIMIT',
      );

      // a rolling day: once the first is more than 24 hours old, there is room again
      await pool.query(
        `UPDATE gifts SET created_at = now() - interval '25 hours'
          WHERE id = (SELECT id FROM gifts WHERE from_user_id = $1 ORDER BY created_at LIMIT 1)`,
        [zed.id],
      );
      expect((await giftDm(zed, ana, POWER)).json().sent).toEqual([ana.id]);
    });

    it(`lets one person give ${GIFTS_PER_DAY} gifts in 24 hours, counting each friend`, async () => {
      const ben = await signUp('ben');
      await fund(ben);
      const friends: Account[] = [];
      for (let i = 0; i < 4; i++) {
        const f = await signUp(`benf${i}`);
        await befriend(ben, f);
        friends.push(f);
      }
      // what they gave earlier today, to friends outside this group, up to two short of the cap
      const others: Account[] = [];
      for (let i = 0; i < Math.ceil((GIFTS_PER_DAY - 2) / GIFTS_PER_FRIEND_PER_DAY); i++) {
        const o = await signUp(`beno${i}`);
        await befriend(ben, o);
        others.push(o);
      }
      for (let i = 0; i < GIFTS_PER_DAY - 2; i++) {
        await pool.query(
          `INSERT INTO gifts (from_user_id, to_user_id, sku, price, currency, created_at)
           VALUES ($1, $2, $3, 20, 'zer', now() - interval '1 hour')`,
          [ben.id, others[i % others.length]!.id, POWER],
        );
      }
      const gid = await group('Cap club', ben, friends);
      const res = await giftGroup(ben, gid, friends, POWER);
      expect(res.statusCode).toBe(200);
      // in the order asked: the first two fit, the rest wait
      expect(res.json().sent).toEqual([friends[0]!.id, friends[1]!.id]);
      expect(res.json().skipped).toEqual([
        { userId: friends[2]!.id, reason: 'daily_limit' },
        { userId: friends[3]!.id, reason: 'daily_limit' },
      ]);
    });
  });

  describe('a gift in a group', () => {
    let gus: Account;
    let hal: Account;
    let ivy: Account;
    let jon: Account; // a member, not gus's friend
    let kai: Account; // gus's friend, not a member
    let gid = '';

    beforeAll(async () => {
      gus = await signUp('gus');
      hal = await signUp('hal');
      ivy = await signUp('ivy');
      jon = await signUp('jon');
      kai = await signUp('kai');
      for (const f of [hal, ivy, kai]) await befriend(gus, f);
      await fund(gus);
      gid = await group('Gift club', gus, [hal, ivy, jon]);
    });

    it('posts one message for every friend it reaches, and tells each of them', async () => {
      const before = await zer(gus);
      const res = await giftGroup(gus, gid, [hal, ivy], POWER);
      expect(res.statusCode).toBe(200);
      const { batchId, sent, message } = res.json();
      expect(sent).toEqual([hal.id, ivy.id]);
      expect(await zer(gus)).toBe(before - 40);

      const messages = await pool.query(`SELECT kind, body, gift_batch_id FROM group_messages WHERE group_id = $1`, [gid]);
      expect(messages.rows).toEqual([{ kind: 'gift', body: null, gift_batch_id: batchId }]);
      expect(message).toMatchObject({ kind: 'gift', deleted: false, gift: { batchId } });

      // the room hears it once, on a card that is no one's in particular
      const room = published.filter((p) => p.room === `group:${gid}` && p.ev.type === 'group_msg');
      expect(room).toHaveLength(1);
      const roomCard = (room[0]!.ev.message as { gift: Record<string, unknown> }).gift;
      expect(roomCard).toMatchObject({
        myGiftId: null,
        recipients: [
          { name: hal.username, isMe: false },
          { name: ivy.username, isMe: false },
        ],
      });

      for (const to of [hal, ivy]) {
        const received = pushedTo(to.id, 'gift_received');
        expect(received).toHaveLength(1);
        expect(received[0]).toMatchObject({ batchId, chat: { kind: 'group', groupId: gid } });
        expect((received[0]!.card as { myGiftId: string | null }).myGiftId).not.toBeNull();
        const note = await pool.query<{ data: Record<string, string> }>(
          `SELECT data FROM notifications WHERE user_id = $1 AND data->>'batchId' = $2`,
          [to.id, batchId],
        );
        expect(note.rows[0]!.data.chat).toBe(`group:${gid}`);
      }
      // a group gift is not a direct message
      expect(pushed.some((p) => p.ev.type === 'dm')).toBe(false);
    });

    it('shows each member the card as theirs to see', async () => {
      const asHal = (await call('GET', `/groups/${gid}/chat`, hal)).json().messages;
      const forHal = asHal.find((m: { kind: string }) => m.kind === 'gift');
      expect(forHal).toMatchObject({ body: null, game: null });
      expect(forHal.gift.myGiftId).not.toBeNull();
      expect(forHal.gift.recipients.map((r: { isMe: boolean }) => r.isMe)).toEqual([true, false]);

      const asJon = (await call('GET', `/groups/${gid}/chat`, jon)).json().messages;
      const forJon = asJon.find((m: { kind: string }) => m.kind === 'gift');
      // an invite-only group's members see one another
      expect(forJon.gift).toMatchObject({
        myGiftId: null,
        recipients: [{ name: hal.username }, { name: ivy.username }],
      });
    });

    it('tells the group when one of them opens theirs', async () => {
      const halGift = (await pool.query<{ id: string; batch_id: string }>(
        `SELECT id, batch_id FROM gifts WHERE to_user_id = $1 AND from_user_id = $2`,
        [hal.id, gus.id],
      )).rows[0]!;
      const msg = (await pool.query<{ id: string }>(`SELECT id FROM group_messages WHERE gift_batch_id = $1`, [halGift.batch_id]))
        .rows[0]!;
      expect((await call('POST', `/gifts/${halGift.id}/open`, hal)).statusCode).toBe(200);
      expect(published.filter((p) => p.ev.type === 'group_msg_gift_opened')).toEqual([
        {
          room: `group:${gid}`,
          ev: { type: 'group_msg_gift_opened', groupId: gid, messageId: msg.id, batchId: halGift.batch_id },
        },
      ]);
      expect(pushedTo(gus.id, 'gift_opened')).toHaveLength(1);

      // a member fetches the card again and sees who opened theirs
      const card = (await call('GET', `/gifts/batches/${halGift.batch_id}`, jon)).json().card;
      expect(card.recipients.map((r: { opened: boolean }) => r.opened)).toEqual([true, false]);
      // and someone outside the group cannot
      expect((await call('GET', `/gifts/batches/${halGift.batch_id}`, kai)).statusCode).toBe(404);
    });

    it('skips a friend who is not in the group, and refuses a member who is not a friend', async () => {
      expect((await giftGroup(gus, gid, [kai], POWER)).json()).toMatchObject({
        sent: [],
        skipped: [{ userId: kai.id, reason: 'not_allowed' }],
      });
      const res = await giftGroup(gus, gid, [hal, jon], POWER);
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('NOT_FRIENDS');
    });

    it('is only for someone who may post in the group', async () => {
      // kai is hal's friend but not a member
      await befriend(kai, hal);
      await fund(kai);
      const outsider = await giftGroup(kai, gid, [hal], POWER);
      expect(outsider.statusCode).toBe(403);
      expect(outsider.json().code).toBe('NOT_A_MEMBER');

      await pool.query(`INSERT INTO group_mutes (group_id, user_id, muted_until) VALUES ($1, $2, NULL)`, [gid, gus.id]);
      const muted = await giftGroup(gus, gid, [hal], POWER);
      expect(muted.statusCode).toBe(403);
      expect(muted.json().code).toBe('MUTED');
      await pool.query(`DELETE FROM group_mutes WHERE group_id = $1 AND user_id = $2`, [gid, gus.id]);
    });
  });

  describe('the picker, the badge and the shop', () => {
    let lou: Account;
    let mae: Account;
    let ned: Account;

    beforeAll(async () => {
      lou = await signUp('lou');
      mae = await signUp('mae');
      ned = await signUp('ned');
      await befriend(lou, mae);
      await befriend(lou, ned);
      await fund(lou);
      await pool.query(`INSERT INTO user_entitlements (user_id, sku, source) VALUES ($1, $2, 'purchase')`, [mae.id, BG]);
      await pool.query(`INSERT INTO user_entitlements (user_id, sku, source) VALUES ($1, $2, 'purchase')`, [lou.id, RACE[0]]);
    });

    it('offers what can be given, says who owns it already, and shows the balance', async () => {
      const res = await call('GET', `/gifts/catalog?to=${mae.id},${ned.id}`, lou);
      expect(res.statusCode).toBe(200);
      const { items, balance } = res.json();
      const bySku = new Map(items.map((i: { sku: string }) => [i.sku, i]));
      expect(bySku.get(BG)).toMatchObject({ price: 300, currency: 'zer', tier: 'common', alreadyOwnedBy: [mae.id] });
      expect(bySku.get(POWER)).toMatchObject({ alreadyOwnedBy: [] });
      // never free, and owning something yourself does not stop you giving it
      expect(bySku.has(FREE)).toBe(false);
      expect(bySku.has(RACE[0])).toBe(true);
      expect(balance.zer).toBe(10_000);
    });

    it('refuses to pick for yourself', async () => {
      const res = await call('GET', `/gifts/catalog?to=${lou.id}`, lou);
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('GIFT_TO_SELF');
    });

    it('a gift from the shop arrives in the chat too, with the answer the shop always gave', async () => {
      const res = await call('POST', '/shop/gift', lou, { sku: POWER, toUserId: ned.id, idempotencyKey: key() });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ gifted: true, duplicate: false, sku: POWER, balance: 10_000 - 20 });
      const { lo, hi } = canonicalPair(lou.id, ned.id);
      const m = await pool.query(`SELECT kind FROM dm_messages WHERE user_lo = $1 AND user_hi = $2`, [lo, hi]);
      expect(m.rows).toEqual([{ kind: 'gift' }]);
      expect(pushedTo(ned.id, 'dm')).toHaveLength(1);
      expect(pushedTo(ned.id, 'gift_received')[0]).toMatchObject({ chat: { kind: 'dm', userId: lou.id } });
    });

    it('puts the unopened count on the social rail, cleared by seeing them', async () => {
      const before = (await call('GET', '/me/social', ned)).json();
      expect(before.unread.gifts).toBe(1);
      await call('POST', '/me/gifts/seen', ned);
      expect((await call('GET', '/me/social', ned)).json().unread.gifts).toBe(0);
    });
  });
});

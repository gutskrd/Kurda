/**
 * A one-tap thanks for a gift against real Postgres: it is its own kind of message pointing at the gift, carries a
 * fixed text whatever the app sent, is said once per gift and only by its recipient in the chat the gift was given in,
 * and the gift's cards say it was said.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { THANKS_FALLBACK_BODY, type GiftCard } from '@kurda/shared';
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
}

type Event = Record<string, unknown> & { type: string };
interface Message {
  id: string;
  senderId: string;
  body: string | null;
  kind: string;
  gift: GiftCard | null;
  thanks?: { batchId: string; name: string } | null;
}

describe.skipIf(!DATABASE_URL)('a one-tap thanks for a gift (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let wallet: WalletService;
  const suffix = Date.now().toString(36);
  let n = 0;
  const ip = (): string => `10.151.${Math.floor(++n / 250)}.${(n % 250) + 1}`;
  const groupIds: string[] = [];
  const ITEM = `gift_thx_${suffix}`;
  const ITEM_NAME = 'Thanks Test Rose';

  let pushed: Array<{ to: string; ev: Event }> = [];
  let published: Array<{ room: string; ev: Event }> = [];

  const signUp = async (tag: string): Promise<Account> => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `thx_${tag}_${suffix}@it.kurda.app`,
        username: `thx_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        ...bornYearsAgo(30),
      },
      remoteAddress: ip(),
    });
    if (res.statusCode !== 201) throw new Error(`register ${tag}: ${res.statusCode} ${res.body}`);
    await activate(app, pool, res);
    return { id: res.json().user.id, token: res.json().tokens.accessToken };
  };

  const befriend = async (a: Account, b: Account): Promise<void> => {
    const { lo, hi } = canonicalPair(a.id, b.id);
    await pool.query(
      `INSERT INTO friendships (user_lo, user_hi, status, requested_by, created_at, responded_at)
       VALUES ($1, $2, 'accepted', $3, now() - interval '2 days', now() - interval '2 days') ON CONFLICT DO NOTHING`,
      [lo, hi, a.id],
    );
  };

  const call = (method: 'GET' | 'POST', url: string, who: Account, payload?: unknown) =>
    app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${who.token}` },
      ...(payload === undefined ? {} : { payload: payload as object }),
      remoteAddress: ip(),
    });

  let keyN = 0;
  const giftDm = async (from: Account, to: Account): Promise<string> => {
    const res = await call('POST', '/gifts', from, {
      sku: ITEM,
      toUserIds: [to.id],
      chat: { kind: 'dm', userId: to.id },
      idempotencyKey: `thx-${suffix}-${++keyN}`,
    });
    expect(res.statusCode).toBe(200);
    return res.json().batchId as string;
  };

  const thankDm = (from: Account, to: Account, batchId: string, body = 'any words at all') =>
    call('POST', `/chat/${to.id}/messages`, from, { body, thanksFor: batchId });

  const history = async (who: Account, other: Account): Promise<Message[]> =>
    (await call('GET', `/chat/${other.id}/messages`, who)).json().messages as Message[];

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    wallet = new WalletService(pool);
    await pool.query(
      `INSERT INTO shop_items (sku, name, category, currency, price, is_unique, active, in_stock)
       VALUES ($1, $2, 'powerup', 'zer', 5, false, true, true)`,
      [ITEM, ITEM_NAME],
    );
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
    await pool.query(`DELETE FROM shop_items WHERE sku = $1`, [ITEM]);
    await pool.end();
    await app.close();
  });

  describe('in a direct message', () => {
    let alan: Account;
    let bea: Account;
    let cem: Account;
    let batchId = '';

    beforeAll(async () => {
      [alan, bea, cem] = [await signUp('alan'), await signUp('bea'), await signUp('cem')];
      await befriend(alan, bea);
      await befriend(bea, cem);
      await wallet.credit({ userId: alan.id, currency: 'zer', amount: 100, reason: 'admin_adjustment' });
      batchId = await giftDm(alan, bea);
    });

    it('is a thanks pointing at the gift, with the fixed text rather than the app’s', async () => {
      const res = await thankDm(bea, alan, batchId);
      expect(res.statusCode).toBe(200);
      const sent = res.json() as Message;
      expect(sent.kind).toBe('thanks');
      expect(sent.body).toBe(THANKS_FALLBACK_BODY);
      expect(sent.thanks).toEqual({ batchId, name: ITEM_NAME });
      // the giver hears it live as the same thanks
      const live = pushed.find((p) => p.to === alan.id && p.ev.type === 'dm');
      expect((live?.ev.message as Message | undefined)?.kind).toBe('thanks');
    });

    it('reads back as a thanks for both, and the gift’s cards say it was said', async () => {
      for (const [who, other] of [[alan, bea], [bea, alan]] as const) {
        const messages = await history(who, other);
        const thanks = messages.find((m) => m.kind === 'thanks');
        expect(thanks?.thanks).toEqual({ batchId, name: ITEM_NAME });
        expect(thanks?.gift).toBeNull();
      }
      const giverCard = (await history(alan, bea)).find((m) => m.kind === 'gift')!.gift!;
      expect(giverCard.recipients.map((r) => r.thanked)).toEqual([true]);
      const takerCard = (await history(bea, alan)).find((m) => m.kind === 'gift')!.gift!;
      expect(takerCard.myThanked).toBe(true);
      // and the conversation list shows the stand-in text, marked as a thanks
      const list = (await call('GET', '/chat/conversations', alan)).json() as { conversations: Array<{ userId: string; lastMessage: string; lastKind: string }> };
      const withBea = list.conversations.find((c) => c.userId === bea.id);
      expect(withBea?.lastKind).toBe('thanks');
      expect(withBea?.lastMessage).toBe(THANKS_FALLBACK_BODY);
    });

    it('is said once per gift', async () => {
      const again = await thankDm(bea, alan, batchId);
      expect(again.statusCode).toBe(409);
      expect(again.json().code).toBe('ALREADY_THANKED');
      expect((await history(alan, bea)).filter((m) => m.kind === 'thanks')).toHaveLength(1);
    });

    it('is only the recipient’s to say, and only where the gift was given', async () => {
      // the giver cannot thank for their own gift
      expect((await thankDm(alan, bea, batchId)).statusCode).toBe(404);
      // nor can the recipient say it in another chat
      expect((await thankDm(bea, cem, batchId)).statusCode).toBe(404);
      // nor anyone for a gift that does not exist
      expect((await thankDm(bea, alan, '00000000-0000-4000-8000-000000000000')).statusCode).toBe(404);
      const rows = await pool.query(`SELECT count(*)::int AS n FROM dm_messages WHERE kind = 'thanks' AND gift_batch_id = $1`, [batchId]);
      expect(rows.rows[0].n).toBe(1);
    });
  });

  describe('in a group', () => {
    let gul: Account;
    let han: Account;
    let ivo: Account;
    let groupId = '';
    let batchId = '';

    beforeAll(async () => {
      [gul, han, ivo] = [await signUp('gul'), await signUp('han'), await signUp('ivo')];
      groupId = (await pool.query<{ id: string }>(`INSERT INTO groups (name, owner_id) VALUES ($1, $2) RETURNING id`, [`Thanks ${suffix}`, gul.id])).rows[0]!.id;
      groupIds.push(groupId);
      await pool.query(`INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'owner'), ($1, $3, 'member'), ($1, $4, 'member')`, [
        groupId,
        gul.id,
        han.id,
        ivo.id,
      ]);
      await befriend(gul, han);
      await befriend(gul, ivo);
      await wallet.credit({ userId: gul.id, currency: 'zer', amount: 100, reason: 'admin_adjustment' });
      const res = await call('POST', '/gifts', gul, {
        sku: ITEM,
        toUserIds: [han.id, ivo.id],
        chat: { kind: 'group', groupId },
        idempotencyKey: `thx-${suffix}-group`,
      });
      expect(res.statusCode).toBe(200);
      batchId = res.json().batchId as string;
    });

    it('each recipient may say thanks once, published to the room as a thanks', async () => {
      const han1 = await call('POST', `/groups/${groupId}/chat`, han, { body: 'thanks!', thanksFor: batchId });
      expect(han1.statusCode).toBe(200);
      expect((han1.json() as Message).kind).toBe('thanks');
      expect(published.some((p) => p.ev.type === 'group_msg' && (p.ev.message as Message).kind === 'thanks')).toBe(true);
      expect((await call('POST', `/groups/${groupId}/chat`, ivo, { body: 'thanks!', thanksFor: batchId })).statusCode).toBe(200);
      expect((await call('POST', `/groups/${groupId}/chat`, han, { body: 'thanks!', thanksFor: batchId })).statusCode).toBe(409);
      // the giver is not a recipient
      expect((await call('POST', `/groups/${groupId}/chat`, gul, { body: 'thanks!', thanksFor: batchId })).statusCode).toBe(404);

      const read = (await call('GET', `/groups/${groupId}/chat`, gul)).json() as { messages: Message[] };
      const thanks = read.messages.filter((m) => m.kind === 'thanks');
      expect(thanks.map((m) => m.thanks)).toEqual([
        { batchId, name: ITEM_NAME },
        { batchId, name: ITEM_NAME },
      ]);
      const card = read.messages.find((m) => m.kind === 'gift')!.gift!;
      expect(card.recipients.every((r) => r.thanked)).toBe(true);
    });
  });
});

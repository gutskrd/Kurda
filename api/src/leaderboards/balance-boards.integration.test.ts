/**
 * The Zêr and Gewher boards against real Postgres (and Redis when present):
 * what each person holds now, highest first, ties sharing a place, a page at
 * a time down to the board's depth; the same listing rules as the weekly
 * board, with the staff and empty wallets left out as well; and the caller's
 * own balance and place always live.
 *
 * Balances are written straight to `wallet_balances` and are near the column's
 * limit, so these people lead the shared board whatever else is in the
 * database, and the places asserted are places on the whole board.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { Redis } from 'ioredis';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { WalletService } from '../wallet/service.js';
import { makeLearner, removeLearners, type LearnerOptions, type TestLearner } from '../test/progress.js';
import { befriend } from '../test/social.js';
import { BALANCE_BOARD_DEPTH, builtKeyFor, GLOBAL_BOARD_REBUILD_SECONDS, LeaderboardService, type Board } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

/** Every balance here is above this, and nobody else’s is. */
const BASE = 2_100_000_000;
/** A country no other suite uses, so its board is this suite’s alone. */
const COUNTRY = 'NR';
const PHOTO_URL = (key: string) => `https://media.test/${key}`;

describe.skipIf(!DATABASE_URL)('Zêr and Gewher boards (integration)', () => {
  let pool: pg.Pool;
  let redis: Redis | undefined;
  let app: FastifyInstance;
  const suffix = Date.now().toString(36);
  let n = 0;
  const people: Record<string, TestLearner> = {};
  const learner = (opts: LearnerOptions = {}) => makeLearner(pool, `lbz${suffix}${++n}`, { country: COUNTRY, ...opts });
  const boards = () => new LeaderboardService(pool, redis, { publicUrl: PHOTO_URL });
  const hold = async (who: TestLearner, currency: 'zer' | 'gems', balance: number) => {
    await pool.query(
      `INSERT INTO wallet_balances (user_id, currency, balance) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, currency) DO UPDATE SET balance = EXCLUDED.balance`,
      [who.id, currency, balance],
    );
  };
  const ours = (board: Board) => board.top.filter((e) => Object.values(people).some((p) => p.id === e.userId));
  const listed = (board: Board, who: TestLearner) => board.top.some((e) => e.userId === who.id);

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    if (REDIS_URL) redis = new Redis(REDIS_URL);
    app = buildApp(loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' }));
    await app.ready();

    // the listed ones: one ahead, two tied, one behind, and the reader
    people.top = await learner({ visibility: 'members' });
    people.tieA = await learner();
    people.tieB = await learner();
    people.next = await learner();
    people.me = await learner();
    // richer than all of them, and on no public board
    people.flagged = await learner();
    people.minor = await learner({ age: 15 });
    people.hidden = await learner({ visibility: 'nobody' });
    people.friendsOnly = await learner({ visibility: 'friends' });
    people.optedOut = await learner({ leaguesEnabled: false });
    people.guest = await learner();
    people.staff = await learner();
    people.empty = await learner();

    await hold(people.top!, 'zer', BASE + 300);
    await hold(people.tieA!, 'zer', BASE + 200);
    await hold(people.tieB!, 'zer', BASE + 200);
    await hold(people.next!, 'zer', BASE + 100);
    await hold(people.me!, 'zer', BASE + 50);
    await hold(people.flagged!, 'zer', BASE + 990);
    await hold(people.minor!, 'zer', BASE + 900);
    await hold(people.hidden!, 'zer', BASE + 800);
    await hold(people.friendsOnly!, 'zer', BASE + 700);
    await hold(people.optedOut!, 'zer', BASE + 600);
    await hold(people.guest!, 'zer', BASE + 500);
    await hold(people.staff!, 'zer', BASE + 400);
    await hold(people.empty!, 'zer', 0);
    // Gewher is a board of its own: led by someone who is fourth for Zêr, and
    // without the top of the Zêr board, who holds none
    await hold(people.next!, 'gems', BASE + 20);
    await hold(people.tieA!, 'gems', BASE + 10);
    await hold(people.me!, 'gems', BASE + 10);
    await hold(people.staff!, 'gems', BASE + 30);

    await pool.query(`UPDATE users SET profile_photo_key = 'avatars/top.jpg' WHERE id = $1`, [people.top!.id]);
    await pool.query(`UPDATE users SET guest = true WHERE id = $1`, [people.guest!.id]);
    await pool.query(`UPDATE users SET roles = '{moderator}' WHERE id = $1`, [people.staff!.id]);
    await pool.query(
      `INSERT INTO cheat_reviews (user_id, room_id, flags, evidence, confidence, shadow_flagged)
       VALUES ($1, 'test', '[]'::jsonb, '{}'::jsonb, 1.0, true)`,
      [people.flagged!.id],
    );
    for (const p of ['tieA', 'minor', 'hidden', 'friendsOnly', 'optedOut', 'staff', 'flagged']) await befriend(pool, people.me!.id, people[p]!.id);

    // a run a minute ago may have left its country board behind; this one starts from the people above
    await redis?.del(`lb:zer:country:${COUNTRY}`, `lb:gewher:country:${COUNTRY}`);
    await boards().rebuild('zer');
    await boards().rebuild('gewher');
  });

  afterAll(async () => {
    await removeLearners(pool, `lbz${suffix}%`);
    redis?.disconnect();
    await pool.end();
    await app.close();
  });

  it('ranks what people hold now, highest first, with a tie sharing one place', async () => {
    const board = await boards().board('zer', people.me!.id);
    expect(board.type).toBe('zer');
    expect(board.depth).toBe(BALANCE_BOARD_DEPTH);
    const top = ours(board);
    expect(top.map((e) => e.userId).slice(0, 1)).toEqual([people.top!.id]);
    expect(top.map((e) => [e.username, e.rank, e.score])).toEqual([
      [people.top!.username, 1, BASE + 300],
      [top[1]!.username, 2, BASE + 200],
      [top[2]!.username, 2, BASE + 200],
      [people.next!.username, 4, BASE + 100],
      [people.me!.username, 5, BASE + 50],
    ]);
    expect(new Set([top[1]!.userId, top[2]!.userId])).toEqual(new Set([people.tieA!.id, people.tieB!.id]));
    // the reader’s own place agrees with the number beside their name
    expect(board.me).toEqual({ rank: 5, score: BASE + 50 });
  });

  it('pages the board, and a page that opens in the middle of a tie gives it the tie’s place', async () => {
    const first = await boards().board('zer', people.me!.id, { limit: 2, offset: 0 });
    const second = await boards().board('zer', people.me!.id, { limit: 2, offset: 2 });
    expect(first.top.map((e) => e.rank)).toEqual([1, 2]);
    expect(second.top.map((e) => e.rank)).toEqual([2, 4]);
    expect(second.top[1]!.userId).toBe(people.next!.id);
    // the two pages together are the board once, nobody twice
    const both = [...first.top, ...second.top].map((e) => e.userId);
    expect(new Set(both).size).toBe(4);
    expect(both).toContain(people.tieA!.id);
    expect(both).toContain(people.tieB!.id);
    expect(first.total).toBe(second.total);
    expect(first.total).toBeGreaterThanOrEqual(5);
  });

  it('keeps Gewher a board of its own, ranked by the gems in the wallet', async () => {
    const board = await boards().board('gewher', people.me!.id);
    expect(board.type).toBe('gewher');
    expect(ours(board).map((e) => [e.userId, e.rank, e.score])).toEqual([
      [people.next!.id, 1, BASE + 20],
      [ours(board)[1]!.userId, 2, BASE + 10],
      [ours(board)[2]!.userId, 2, BASE + 10],
    ]);
    // nobody who holds no Gewher, and no staff
    expect(listed(board, people.top!)).toBe(false);
    expect(listed(board, people.staff!)).toBe(false);
    expect(board.me).toEqual({ rank: 2, score: BASE + 10 });
  });

  it('lists nobody the public boards may not name, on the global board or the country one', async () => {
    for (const scope of ['global', 'country'] as const) {
      const board = await boards().board('zer', people.me!.id, { scope, limit: 100 });
      expect(listed(board, people.top!)).toBe(true);
      for (const who of ['flagged', 'minor', 'hidden', 'friendsOnly', 'optedOut', 'guest', 'staff', 'empty']) {
        expect(listed(board, people[who]!), `${who} on the ${scope} board`).toBe(false);
      }
    }
    const country = await boards().board('zer', people.me!.id, { scope: 'country', limit: 100 });
    expect(country.country).toBe(COUNTRY);
    expect(ours(country).map((e) => e.rank)).toEqual([1, 2, 2, 4, 5]);
  });

  it('shows a friend’s balance to their friends, but not one who opted out, hid, or was flagged', async () => {
    const board = await boards().board('zer', people.me!.id, { scope: 'friends', limit: 100 });
    expect(listed(board, people.me!)).toBe(true);
    expect(listed(board, people.tieA!)).toBe(true);
    expect(listed(board, people.friendsOnly!)).toBe(true);
    expect(listed(board, people.minor!)).toBe(true);
    expect(listed(board, people.staff!)).toBe(true);
    expect(listed(board, people.optedOut!)).toBe(false);
    expect(listed(board, people.hidden!)).toBe(false);
    expect(listed(board, people.flagged!)).toBe(false);
    expect(listed(board, people.top!)).toBe(false);
    // minor, friends-only, staff, tieA, then the reader
    expect(board.me).toEqual({ rank: 5, score: BASE + 50 });
  });

  it('still tells whoever is left off their own balance and place, and says nothing to an empty wallet', async () => {
    const flagged = await boards().board('zer', people.flagged!.id);
    expect(flagged.me).toEqual({ rank: 1, score: BASE + 990 });
    const minor = await boards().board('zer', people.minor!.id);
    expect(minor.me).toEqual({ rank: 1, score: BASE + 900 });
    const optedOut = await boards().board('zer', people.optedOut!.id);
    expect(optedOut.me?.score).toBe(BASE + 600);
    const empty = await boards().board('zer', people.empty!.id);
    expect(empty.me).toBeNull();
    const signedOut = await boards().board('zer', null);
    expect(signedOut.me).toBeNull();
  });

  it('reads the caller’s own balance live while the board itself is the one built', async () => {
    const wallet = new WalletService(pool);
    await wallet.credit({ userId: people.me!.id, currency: 'zer', amount: 60, reason: 'test_board', idempotencyKey: `lbz-${suffix}-live` });
    const board = await boards().board('zer', people.me!.id);
    // ahead of `next` now, whatever the list says
    expect(board.me).toEqual({ rank: 4, score: BASE + 110 });
    // the sorted set lists the balance as it was built, for a few minutes; straight from Postgres it is the new one
    expect(board.top.find((e) => e.userId === people.me!.id)?.score).toBe(REDIS_URL ? BASE + 50 : BASE + 110);
    await wallet.debit({ userId: people.me!.id, currency: 'zer', amount: 60, reason: 'test_board', idempotencyKey: `lbz-${suffix}-back` });
    await boards().rebuild('zer');
  });

  it('gives each row a face, and a photo to a signed-out reader only from a profile shown to everyone', async () => {
    const signedIn = await boards().board('zer', people.me!.id);
    const top = signedIn.top.find((e) => e.userId === people.top!.id)!;
    expect(top.avatarUrl).toBe(PHOTO_URL('avatars/top.jpg'));
    expect(signedIn.top.every((e) => typeof e.avatarUrl === 'string' && e.avatarUrl.length > 0)).toBe(true);
    // a members-only profile: a stranger who is not signed in sees the drawing, not the face
    const signedOut = await boards().board('zer', null);
    const topOut = signedOut.top.find((e) => e.userId === people.top!.id)!;
    expect(topOut.avatarUrl).not.toBe(PHOTO_URL('avatars/top.jpg'));
    expect(topOut.avatarUrl).toBeTruthy();
  });

  it('stops at its depth, and tells someone below the cut their balance with no place beside it', async () => {
    const shallow = (r?: Redis) => new LeaderboardService(pool, r, { balanceDepth: 2 });
    const check = async (service: LeaderboardService) => {
      const board = await service.board('zer', people.next!.id, { limit: 100 });
      expect(board.depth).toBe(2);
      expect(board.total).toBe(2);
      expect(board.top.map((e) => e.rank)).toEqual([1, 2]);
      expect(board.top[0]!.userId).toBe(people.top!.id);
      // `next` is below the cut: a balance, and no made-up third place
      expect(board.me).toEqual({ rank: null, score: BASE + 100 });
      // the tie at the cut is a place on the board, whichever of the two the cut kept
      const cutTie = board.top[1]!.userId === people.tieA!.id ? people.tieB! : people.tieA!;
      expect((await service.board('zer', cutTie.id)).me).toEqual({ rank: 2, score: BASE + 200 });
    };
    // straight from Postgres
    await check(shallow());
    // and from the sorted set, which is put back as it was afterwards
    if (redis) {
      try {
        await shallow(redis).rebuild('zer');
        await check(shallow(redis));
      } finally {
        await boards().rebuild('zer');
      }
      // a board that was not cut gives everyone their place again
      expect((await boards().board('zer', people.next!.id)).me).toEqual({ rank: 4, score: BASE + 100 });
    }
  });

  it.skipIf(!REDIS_URL)('builds the global board when it is read, at most once in a few minutes, with no week in its key', async () => {
    let builds = 0;
    const counting = {
      query: (...args: Parameters<pg.Pool['query']>) => {
        if (/FROM wallet_balances b JOIN users u/.test(String(args[0]))) builds++;
        return (pool.query as (...a: unknown[]) => unknown)(...args);
      },
    } as unknown as pg.Pool;
    const lazy = new LeaderboardService(counting, redis);
    const built = builtKeyFor('gewher', new Date());
    expect(built).toBe('lb:balance:gewher:built');

    await redis!.del(built);
    const first = await lazy.board('gewher', people.me!.id);
    expect(builds).toBe(1);
    expect(first.top[0]!.userId).toBe(people.next!.id);
    const ttl = await redis!.ttl(built);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(GLOBAL_BOARD_REBUILD_SECONDS);
    // the board itself outlives the marker, and expires on its own when nobody reads it
    expect(await redis!.ttl('lb:balance:gewher')).toBeGreaterThan(GLOBAL_BOARD_REBUILD_SECONDS);

    await lazy.board('gewher', people.tieA!.id);
    await lazy.board('gewher', null);
    expect(builds).toBe(1);

    await redis!.del(built);
    await lazy.board('gewher', people.me!.id);
    expect(builds).toBe(2);
  });

  it('reads the top of a currency in order off its index, with no sort', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // a test database is small enough that reading it all and sorting would win; this asks
      // whether the index can serve the read in order at all
      await client.query('SET LOCAL enable_seqscan = off');
      await client.query('SET LOCAL enable_bitmapscan = off');
      const plan = await client.query<{ 'QUERY PLAN': string }>(
        `EXPLAIN SELECT user_id, balance FROM wallet_balances b
          WHERE b.currency = 'zer' AND b.balance > 0 ORDER BY b.balance DESC, b.user_id DESC LIMIT 1000`,
      );
      const text = plan.rows.map((r) => r['QUERY PLAN']).join('\n');
      expect(text).toContain('wallet_balances_board_idx');
      expect(text).not.toMatch(/\bSort\b/);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('serves both boards over HTTP to anyone, and refuses the wallet’s own word for a board', async () => {
    for (const type of ['zer', 'gewher']) {
      const res = await app.inject({ method: 'GET', url: `/leaderboards/${type}?limit=5`, remoteAddress: '10.64.1.1' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ type, scope: 'global', me: null, depth: BALANCE_BOARD_DEPTH });
      expect(res.json().top.length).toBeLessThanOrEqual(5);
    }
    const gems = await app.inject({ method: 'GET', url: '/leaderboards/gems', remoteAddress: '10.64.1.1' });
    expect(gems.statusCode).toBe(400);
    expect(gems.json().code).toBe('BAD_BOARD');
  });
});

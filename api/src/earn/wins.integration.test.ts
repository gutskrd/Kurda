/**
 * Zêr for beating other people against real Postgres: a win in an online game (once per game, three a day, to members
 * only, nothing for a draw or a pair on one device) and a quiz night's podium (rooms of four accounts or more).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { PAID_WINS_PER_DAY, QUIZ_PODIUM_MIN_ACCOUNTS } from '@kurda/shared';
import { makeLearner, removeLearners, type TestLearner } from '../test/progress.js';
import { WalletService } from '../wallet/service.js';
import { payOnlineWin, payQuizPodium, type Placing } from './wins.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('Zêr for wins (integration)', () => {
  let pool: pg.Pool;
  let wallet: WalletService;
  const suffix = Date.now().toString(36);
  let n = 0;
  const learner = (): Promise<TestLearner> => makeLearner(pool, `ewin${n++}${suffix}`);
  const zer = async (who: TestLearner) => (await wallet.balances(who.id)).zer;
  const member = (who: TestLearner) => pool.query(`UPDATE users SET premium_until = '2030-01-01T00:00:00Z' WHERE id = $1`, [who.id]);

  const inTx = async <T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const out = await work(client);
      await client.query('COMMIT');
      return out;
    } finally {
      client.release();
    }
  };
  const win = (ref: string, players: Placing[]) => inTx((c) => payOnlineWin(c, wallet, { ref: `${ref}:${suffix}`, players }));
  const podium = (ref: string, placings: Placing[], accounts: number) => inTx((c) => payQuizPodium(c, wallet, { ref: `${ref}:${suffix}`, placings, accounts }));

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    wallet = new WalletService(pool);
  });

  afterAll(async () => {
    await removeLearners(pool, `ewin%${suffix}@it.kurda.app`);
    await pool.end();
  });

  it('pays the one winner of a game, once, and three wins a day', async () => {
    const [a, b] = [await learner(), await learner()];
    await member(a);
    await member(b);
    const first = await win('g1', [
      { userId: a.id, place: 1 },
      { userId: b.id, place: 2 },
    ]);
    expect(first).toMatchObject({ userId: a.id, result: { granted: 10 } });
    // the same game finishing again pays nothing more
    expect((await win('g1', [{ userId: a.id, place: 1 }, { userId: b.id, place: 2 }]))?.result.granted).toBe(0);
    for (let i = 2; i <= PAID_WINS_PER_DAY; i++) await win(`g${i}`, [{ userId: a.id, place: 1 }, { userId: b.id, place: 2 }]);
    expect(await win('g9', [{ userId: a.id, place: 1 }, { userId: b.id, place: 2 }])).toBeNull();
    expect(await zer(a)).toBe(10 * PAID_WINS_PER_DAY);
    expect(await zer(b)).toBe(0);
  });

  it('pays nothing to a winner who is not a member', async () => {
    const [a, b] = [await learner(), await learner()];
    const result = await win('m1', [{ userId: a.id, place: 1 }, { userId: b.id, place: 2 }]);
    expect(result).toMatchObject({ userId: a.id, result: { granted: 0 } });
    expect(await zer(a)).toBe(0);
  });

  it('pays nobody for a draw, a game alone, or a pair that played from one device', async () => {
    const [a, b] = [await learner(), await learner()];
    await member(a);
    expect(await win('d1', [{ userId: a.id, place: 1 }, { userId: b.id, place: 1 }])).toBeNull();
    expect(await win('d2', [{ userId: a.id, place: 1 }])).toBeNull();
    const device = `dev-${suffix}`;
    for (const who of [a, b]) {
      await pool.query(`INSERT INTO risk_decisions (event, user_id, device_hash, score, band, action) VALUES ('login', $1, $2, 0, 'low', 'proceed')`, [
        who.id,
        device,
      ]);
    }
    expect(await win('d3', [{ userId: a.id, place: 1 }, { userId: b.id, place: 2 }])).toBeNull();
    expect(await zer(a)).toBe(0);
  });

  it('pays a quiz night’s podium in a room of four accounts or more, to the members on it', async () => {
    const room = [await learner(), await learner(), await learner(), await learner()];
    for (const who of [room[0]!, room[1]!, room[3]!]) await member(who);
    const placings = room.map((p, i) => ({ userId: p.id, place: i + 1 }));
    expect(await podium('q0', placings, QUIZ_PODIUM_MIN_ACCOUNTS - 1)).toEqual([]);
    const paid = await podium('q1', placings, QUIZ_PODIUM_MIN_ACCOUNTS);
    expect(paid.map((p) => [p.place, p.result.granted])).toEqual([
      [1, 30],
      [2, 20],
      [3, 0],
    ]);
    expect(await Promise.all(room.map(zer))).toEqual([30, 20, 0, 0]);
    // the same night ending again pays nothing more
    expect((await podium('q1', placings, QUIZ_PODIUM_MIN_ACCOUNTS)).every((p) => p.result.granted === 0)).toBe(true);
  });
});

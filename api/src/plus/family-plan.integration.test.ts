/**
 * A family plan against real Postgres: an adult in a family whose plan lasts has a member's daily Zêr, box, freezes and
 * doubled earnings without a membership of their own, until the plan ends; a child in the same family has the plan's
 * freezes but none of the money, and is never paid.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { MEMBERS_BOX_ZER, onlineWinZer } from '@kurda/shared';
import { EarnService, earnReason } from '../earn/service.js';
import { payOnlineWin } from '../earn/wins.js';
import { DailyRewardService } from '../rewards/service.js';
import { maxFreezesFor } from '../streaks/streak-logic.js';
import { TodayService } from '../streaks/today.js';
import { makeLearner, removeLearners, type TestLearner } from '../test/progress.js';
import { WalletService } from '../wallet/service.js';
import { MembersBoxService } from './members-box.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('a family plan’s members (integration)', () => {
  let pool: pg.Pool;
  let wallet: WalletService;
  let boxes: MembersBoxService;
  let today: TodayService;
  let daily: DailyRewardService;
  const suffix = Date.now().toString(36);
  let n = 0;
  const learner = (): Promise<TestLearner> => makeLearner(pool, `fplan${n++}${suffix}`);
  const children: string[] = [];
  const zer = async (id: string) => (await wallet.balances(id)).zer;

  let owner: TestLearner;
  let adult: TestLearner;
  let plain: TestLearner;
  let child: string;
  let family: string;

  /** A child's profile in the family, written as the parent's add-a-child makes it. */
  const addChild = async (): Promise<string> => {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO users (email, username, display_name, birth_year, birth_month, kind, leagues_enabled, profile_visibility)
       VALUES (NULL, $1, 'Rojîn', extract(year FROM now())::int - 8, 1, 'child', false, 'nobody') RETURNING id`,
      [`fplan_kid${n++}${suffix}`.slice(0, 30)],
    );
    const id = r.rows[0]!.id;
    children.push(id);
    await pool.query(`INSERT INTO child_profiles (user_id, parent_id, consent_version, consented_at) VALUES ($1, $2, 'test', now())`, [id, owner.id]);
    await pool.query(`INSERT INTO family_members (user_id, family_id, role) VALUES ($1, $2, 'child')`, [id, family]);
    return id;
  };
  const plan = (until: string) => pool.query(`UPDATE families SET plus_until = $2::timestamptz WHERE id = $1`, [family, until]);
  const win = (ref: string, winner: string, other: string) =>
    pool.connect().then(async (client) => {
      try {
        await client.query('BEGIN');
        const out = await payOnlineWin(client, wallet, { ref: `${ref}:${suffix}`, players: [{ userId: winner, place: 1 }, { userId: other, place: 2 }] });
        await client.query('COMMIT');
        return out?.result.granted ?? null;
      } finally {
        client.release();
      }
    });

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    wallet = new WalletService(pool);
    boxes = new MembersBoxService(pool, wallet);
    today = new TodayService(pool, undefined, boxes);
    daily = new DailyRewardService(pool, wallet);
    owner = await learner();
    adult = await learner();
    plain = await learner();
    family = (await pool.query<{ id: string }>(`INSERT INTO families (owner_id) VALUES ($1) RETURNING id`, [owner.id])).rows[0]!.id;
    await pool.query(`INSERT INTO family_members (user_id, family_id, role) VALUES ($1, $3, 'owner'), ($2, $3, 'adult')`, [owner.id, adult.id, family]);
    child = await addChild();
  });

  afterAll(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [children]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await removeLearners(pool, `fplan%${suffix}@it.kurda.app`);
    await pool.end();
  });

  it('gives an adult in the plan the members’ box, the daily Zêr, a member’s freezes and doubled wins, until it ends', async () => {
    await plan('2030-01-01T00:00:00Z');
    const view = await today.view(adult.id, 1);
    expect(view.daily.member).toBe(true);
    expect(view.streak.maxFreezes).toBe(maxFreezesFor(true));
    // the daily view gave this month's box on the first look
    expect(await zer(adult.id)).toBe(MEMBERS_BOX_ZER);
    expect((await boxes.view(adult.id)).box).toMatchObject({ zer: MEMBERS_BOX_ZER });
    expect((await daily.status(adult.id)).member).toBe(true);
    expect(await win('plan-on', adult.id, plain.id)).toBe(onlineWinZer(true));

    await plan('2020-01-01T00:00:00Z');
    const after = await today.view(adult.id, 1);
    expect(after.daily.member).toBe(false);
    expect(after.streak.maxFreezes).toBe(maxFreezesFor(false));
    expect((await daily.status(adult.id)).member).toBe(false);
    expect(await win('plan-off', adult.id, plain.id)).toBe(onlineWinZer(false));
  });

  it('gives a child in the plan its freezes but no box, no daily Zêr and no earned Zêr', async () => {
    await plan('2030-01-01T00:00:00Z');
    const view = await today.view(child, 1);
    expect(view.daily.member).toBe(false);
    expect(view.daily.canClaim).toBe(false);
    expect(view.streak.maxFreezes).toBe(maxFreezesFor(true));
    expect(await boxes.ensure(child)).toBe(false);
    expect((await pool.query(`SELECT 1 FROM members_boxes WHERE user_id = $1`, [child])).rowCount).toBe(0);
    expect((await daily.status(child)).member).toBe(false);

    // nothing earned is paid to a child, by any rule or way of earning
    const earn = new EarnService(pool, wallet);
    expect(await earn.pay({ userId: child, amount: 10, reason: earnReason('test'), idempotencyKey: `fplan:${suffix}:kid` })).toEqual({
      granted: 0,
      cappedBy: 'restricted',
    });
    expect(await win('kid-win', child, plain.id)).toBe(0);
    expect(await zer(child)).toBe(0);
  });
});

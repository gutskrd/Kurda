/**
 * The economy's most valuable paths under a burst of identical requests,
 * against real Postgres: twenty at once, and exactly the right number of them
 * pay — the rest are refused or answered as the repeat they are — with every
 * balance equal to its ledger afterwards.
 *
 * The services are called directly rather than through their routes: what is
 * under test is the database's part (the row locks, unique constraints and
 * idempotency keys), and the routes' own rate limits would turn most of a
 * burst away before it reached any of that.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { WalletService } from '../wallet/service.js';
import { WalletReconciler } from '../wallet/reconcile.js';
import { DailyRewardService } from '../rewards/service.js';
import { rewardForDay } from '../rewards/daily-cycle.js';
import { StreakService } from '../streaks/service.js';
import { DailyQuestService } from '../quests/service.js';
import { chestAmount, questId } from '../quests/daily.js';
import { localDate } from '../streaks/streak-logic.js';
import { ShopService } from '../shop/service.js';
import { QuestService } from '../events/quest-service.js';
import type { EventDef } from '../events/window.js';
import { GemService } from '../gems/service.js';
import { IapService } from '../iap/service.js';
import { StubReceiptVerifier } from '../iap/verifier.js';
import { FraudService } from '../fraud/service.js';
import { UserAdminService } from '../admin/user-admin-service.js';
import { SanctionsService } from '../moderation/sanctions-service.js';
import { loadConfig } from '../config/env.js';
import { makeLearner, removeLearners, type TestLearner } from '../test/progress.js';

const DATABASE_URL = process.env.DATABASE_URL;
const BURST = 20;

/** Run `fn` BURST times at once; how many resolved, and the reasons the rest were refused. */
async function burst<T>(fn: (i: number) => Promise<T>): Promise<{ ok: T[]; refused: string[] }> {
  const settled = await Promise.allSettled(Array.from({ length: BURST }, (_, i) => fn(i)));
  const ok: T[] = [];
  const refused: string[] = [];
  for (const s of settled) {
    if (s.status === 'fulfilled') ok.push(s.value);
    else refused.push((s.reason as { code?: string; message?: string }).code ?? String((s.reason as Error).message));
  }
  return { ok, refused };
}

describe.skipIf(!DATABASE_URL)('the economy under concurrent requests (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let pool: pg.Pool;
  let wallet: WalletService;
  const suffix = Date.now().toString(36);
  const people: TestLearner[] = [];
  const learner = async (tag: string) => {
    const who = await makeLearner(pool, `ecc${tag}${suffix}`);
    people.push(who);
    return who;
  };
  const skus: string[] = [];
  const item = async (tag: string, price: number, unique: boolean) => {
    const sku = `ecc-${tag}-${suffix}`;
    await pool.query(
      `INSERT INTO shop_items (sku, name, category, currency, price, is_unique, active, in_stock)
       VALUES ($1, $2, 'misc', 'zer', $3, $4, true, true)`,
      [sku, `Burst ${tag}`, price, unique],
    );
    skus.push(sku);
    return sku;
  };
  const balances = async (who: TestLearner) => wallet.balances(who.id);
  const product = `gems_burst_${suffix}`;
  const gemRule = `burst_${suffix}`;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL, max: 30 });
    wallet = new WalletService(pool);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM shop_items WHERE sku = ANY($1)`, [skus]).catch(() => undefined);
    await pool.query(`DELETE FROM gem_packs WHERE product_id = $1`, [product]).catch(() => undefined);
    await pool.query(`DELETE FROM gem_rules WHERE key = $1`, [gemRule]).catch(() => undefined);
    await removeLearners(pool, `ecc%${suffix}@it.kurda.app`);
    await pool.end();
  });

  it('pays a day’s reward once, however many claims arrive together', async () => {
    const ann = await learner('daily');
    const now = new Date();
    await new StreakService(pool).recordActivity(ann.id, 'UTC', now);
    const rewards = new DailyRewardService(pool, wallet);
    const { ok, refused } = await burst(() => rewards.claim(ann.id, now));
    expect(ok).toHaveLength(1);
    expect(refused).toEqual(Array(BURST - 1).fill('ALREADY_CLAIMED'));
    expect((await balances(ann)).zer).toBe(rewardForDay(1));
  });

  it('opens a quest’s chest once', async () => {
    const bo = await learner('chest');
    const day = localDate(new Date(), 'UTC');
    await pool.query(
      `INSERT INTO user_quests (user_id, day, kind, target, chest, progress, done_at) VALUES ($1, $2, 'lessons', 2, 'rare', 2, now())`,
      [bo.id, day],
    );
    const id = questId(day, 'lessons');
    const quests = new DailyQuestService(pool, wallet);
    const { ok, refused } = await burst(() => quests.claim(bo.id, id));
    expect(ok).toHaveLength(1);
    expect(refused).toEqual(Array(BURST - 1).fill('QUEST_CLAIMED'));
    expect((await balances(bo)).zer).toBe(chestAmount('rare', bo.id, id));
  });

  it('sells something there is only one of once, whatever keys the buys carry', async () => {
    const cy = await learner('unique');
    const sku = await item('unique', 100, true);
    await wallet.credit({ userId: cy.id, currency: 'zer', amount: 1000, reason: 'admin_adjustment' });
    const shop = new ShopService(pool, wallet);
    const { ok, refused } = await burst((i) => shop.purchase(cy.id, sku, `ecc-unique-${suffix}-${i}`));
    expect(ok).toHaveLength(1);
    expect(refused).toEqual(Array(BURST - 1).fill('ALREADY_OWNED'));
    expect((await balances(cy)).zer).toBe(900);
    const owned = await pool.query(`SELECT quantity FROM user_entitlements WHERE user_id = $1 AND sku = $2`, [cy.id, sku]);
    expect(owned.rows).toEqual([{ quantity: 1 }]);
  });

  it('charges a retried purchase once: the same key, twenty times', async () => {
    const di = await learner('samekey');
    const sku = await item('samekey', 50, false);
    await wallet.credit({ userId: di.id, currency: 'zer', amount: 1000, reason: 'admin_adjustment' });
    const shop = new ShopService(pool, wallet);
    const { ok, refused } = await burst(() => shop.purchase(di.id, sku, `ecc-same-${suffix}`));
    expect(refused).toEqual([]);
    expect(ok.filter((r) => !r.duplicate)).toHaveLength(1);
    expect((await balances(di)).zer).toBe(950);
    const owned = await pool.query(`SELECT quantity FROM user_entitlements WHERE user_id = $1 AND sku = $2`, [di.id, sku]);
    expect(owned.rows).toEqual([{ quantity: 1 }]);
  });

  it('never spends more than is there: twenty buys against five buys’ worth', async () => {
    const ed = await learner('overdraw');
    const sku = await item('overdraw', 100, false);
    await wallet.credit({ userId: ed.id, currency: 'zer', amount: 500, reason: 'admin_adjustment' });
    const shop = new ShopService(pool, wallet);
    const { ok, refused } = await burst((i) => shop.purchase(ed.id, sku, `ecc-over-${suffix}-${i}`));
    expect(ok).toHaveLength(5);
    expect(refused).toEqual(Array(BURST - 5).fill('INSUFFICIENT_FUNDS'));
    expect((await balances(ed)).zer).toBe(0);
  });

  it('pays an event quest once', async () => {
    const fa = await learner('event');
    const event: EventDef = {
      id: `ecc-${suffix}`,
      key: `ecc-event-${suffix}`,
      name: 'Burst',
      type: 'cultural',
      startsAt: new Date(Date.now() - 3_600_000).toISOString(),
      endsAt: new Date(Date.now() + 3_600_000).toISOString(),
      priority: 1,
      theme: 'newroz',
      quests: [{ id: 'xp', type: 'earn_xp', count: 10, reward: { zer: 70, gems: 7 } }],
      rewards: {},
      enabled: true,
    } as EventDef;
    const metrics = { earnedXp: async () => 10, storyQuizzes: async () => 0, lessonsCompleted: async () => 0 };
    const quests = new QuestService(pool, { byKey: async () => event }, wallet, metrics);
    const { ok, refused } = await burst(() => quests.claim(fa.id, event.key, 'xp'));
    expect(refused).toEqual([]);
    expect(ok.filter((r) => r.ok && r.claimed)).toHaveLength(1);
    expect(await balances(fa)).toEqual({ zer: 70, gems: 7 });
    await pool.query(`DELETE FROM event_quest_claims WHERE event_key = $1`, [event.key]).catch(() => undefined);
  });

  it('grants a rule’s Gems once for one event', async () => {
    const gi = await learner('gems');
    const gems = new GemService(pool, wallet);
    // a rule of this suite's own: which seeded rules are switched on is not what is under test
    await gems.upsertRule({ key: gemRule, amount: 15, dailyCap: null, cooldownSeconds: 0, active: true });
    const results = await Promise.all(Array.from({ length: BURST }, () => gems.grant(gi.id, gemRule, `burst:${gi.id}`)));
    expect(results.filter((r) => r.granted > 0)).toHaveLength(1);
    expect(results.filter((r) => r.granted === 0).every((r) => r.cappedBy === 'duplicate')).toBe(true);
    expect((await balances(gi)).gems).toBe(results.find((r) => r.granted > 0)!.granted);
  });

  it('redeems one store receipt once', async () => {
    const ha = await learner('iap');
    const iap = new IapService(pool, wallet, new StubReceiptVerifier(), config, new FraudService(pool, wallet));
    await iap.createPack({ platform: 'apple', productId: product, gems: 100 });
    const receipt = JSON.stringify({ transactionId: `ecc_txn_${suffix}`, environment: 'production' });
    const { ok, refused } = await burst(() => iap.redeem(ha.id, 'apple', receipt, product));
    expect(refused).toEqual([]);
    expect(ok.filter((r) => r.granted && !r.duplicate)).toHaveLength(1);
    expect((await balances(ha)).gems).toBe(100);
  });

  it('moves an admin’s change once per request key', async () => {
    const admin = await learner('admin');
    const ivo = await learner('adjusted');
    const users = new UserAdminService(pool, wallet, { sanctions: new SanctionsService(pool, { moderatorCount: async () => 1 }) });
    const { ok, refused } = await burst(() => users.adjustWallet(admin.id, ivo.id, 'zer', 250, 'support goodwill', `ecc-adj-${suffix}`));
    expect(refused).toEqual([]);
    expect(ok.filter((r) => r.ok && !('duplicate' in r && r.duplicate))).toHaveLength(1);
    expect((await balances(ivo)).zer).toBe(250);
    const logged = await pool.query(`SELECT 1 FROM admin_actions WHERE target_user_id = $1 AND action = 'wallet_adjust'`, [ivo.id]);
    expect(logged.rowCount).toBe(1);
  });

  it('leaves every balance it touched equal to its ledger', async () => {
    const report = await new WalletReconciler(pool).check({ userIds: people.map((p) => p.id) });
    expect(report.checked).toBeGreaterThan(0);
    expect(report).toMatchObject({ mismatched: 0, mismatches: [] });
  });
});

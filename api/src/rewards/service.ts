import type pg from 'pg';
import { isPremiumActive, memberZerUntilSql } from '../cosmetics/access.js';
import { AppError } from '../plugins/errors.js';
import { WalletService } from '../wallet/service.js';
import { assertEconomyNotHeld } from '../economy/standing.js';
import { earnWithin } from '../earn/service.js';
import { localDate } from '../streaks/streak-logic.js';
import { StreakService } from '../streaks/service.js';
import { dailyRewardView, statusFor, type DailyRewardState, type DailyRewardView } from './daily-cycle.js';
import { grantBagGiftWithin } from '../gifts/bag.js';
import { childRefused } from '../family/child-gate.js';
import { isKnownAdultAccount } from '../users/age.js';
import { cosmeticAssetUrl, type PublicUrl } from '../cosmetics/access.js';

export interface ClaimResult {
  claimed: boolean;
  cycleDay: number;
  /** what was paid, which the daily earned cap can make less than the day's reward; 0 for anyone not a member */
  reward: number;
  balance: number;
  /** the small gift the day put in the gift bag, for everyone; null when the bag's day or its kinds were full */
  bagGift: { sku: string; name: string; assetUrl: string | null } | null;
  /** whether this learner earns Zêr, so the apps can say members do to someone who does not */
  member: boolean;
  /** a known adult, the only one the apps may tell what Hevalo+ gives; never a guest or anyone of unknown age */
  nudges: boolean;
}

/**
 * The daily cycle: a Hevalo+ member's Zêr, and for everyone a small gift in the gift bag (gifts/bag.ts). The claim day is the user's local calendar date (`localDate`) by server
 * time, so a device clock can never unlock an extra claim; the grant is atomic with the cycle update and idempotent per
 * user and day, and counts toward the day's earned cap. A claim needs a lesson or practice session finished that local
 * day (`last_learned_on`); a daily Peyvok win keeps a streak but does not count.
 */
export class DailyRewardService {
  private readonly streaks: StreakService;

  constructor(
    private readonly pool: pg.Pool,
    private readonly wallet: WalletService,
    private readonly publicUrl: PublicUrl = () => null,
  ) {
    this.streaks = new StreakService(pool);
  }

  /** The learner's time zone, whether they are a Hevalo+ member at `now`, and whether this is a child's profile. */
  private async account(userId: string, now: Date): Promise<{ tz: string; plus: boolean; child: boolean }> {
    const row = await this.pool.query<{ timezone: string; premium_until: Date | null; child: boolean }>(
      `SELECT u.timezone, ${memberZerUntilSql('u')} AS premium_until, u.kind = 'child' AS child FROM users u WHERE u.id = $1`,
      [userId],
    );
    return { tz: row.rows[0]?.timezone ?? 'UTC', plus: isPremiumActive(row.rows[0]?.premium_until ?? null, now), child: row.rows[0]?.child ?? false };
  }

  private async read(executor: Pick<pg.Pool, 'query'>, userId: string): Promise<DailyRewardState> {
    const row = await executor.query<{ cycle_day: number; last_claim_on: string | null }>(
      `SELECT cycle_day, last_claim_on FROM daily_rewards WHERE user_id = $1`,
      [userId],
    );
    const r = row.rows[0];
    return { cycleDay: r?.cycle_day ?? 0, lastClaimOn: r?.last_claim_on ?? null };
  }

  private async learnedOn(executor: Pick<pg.Pool, 'query'>, userId: string, today: string): Promise<boolean> {
    return (await this.streaks.lastLearnedOn(userId, executor)) === today;
  }

  /** Cycle progress and the next reward for the calendar, and whether the learner has the daily Zêr. */
  async status(userId: string, now: Date = new Date()): Promise<DailyRewardView> {
    const { tz, plus, child } = await this.account(userId, now);
    const today = localDate(now, tz);
    const state = await this.read(this.pool, userId);
    const view = dailyRewardView(state, today, await this.learnedOn(this.pool, userId, today), plus);
    return child ? { ...view, canClaim: false } : view;
  }

  /**
   * Claims today's reward: a member's Zêr and everyone's gift for the bag. ALREADY_CLAIMED if claimed, LEARN_FIRST
   * without a lesson or practice today, REWARDS_PAUSED for a confirmed bot or fraud hold (economy/standing.ts). The
   * amount is the server's (daily-cycle.ts). A child's profile is given nothing.
   */
  async claim(userId: string, now: Date = new Date()): Promise<ClaimResult> {
    await assertEconomyNotHeld(this.pool, userId, 'rewards');
    const { tz, plus, child } = await this.account(userId, now);
    if (child) throw childRefused();
    const today = localDate(now, tz);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO daily_rewards (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
        [userId],
      );
      // lock the row so concurrent claims serialize
      await client.query(`SELECT 1 FROM daily_rewards WHERE user_id = $1 FOR UPDATE`, [userId]);
      const state = await this.read(client, userId);
      const status = statusFor(state, today, await this.learnedOn(client, userId, today));
      if (status.alreadyClaimedToday) {
        throw new AppError('ALREADY_CLAIMED', 409, 'daily reward already claimed today');
      }
      if (!status.learnedToday) {
        throw new AppError('LEARN_FIRST', 409, 'finish a lesson or a practice session to claim today’s reward');
      }

      // nothing for anyone not a member (`earnWithin`), and the day's gift for everyone, shown with the claim
      const paid = await earnWithin(client, this.wallet, {
        userId,
        amount: status.reward,
        reason: 'daily_reward',
        idempotencyKey: `daily:${userId}:${today}`,
        now,
      });
      const bag = await grantBagGiftWithin(client, { userId, source: 'daily', ref: today, seen: true });
      await client.query(
        `UPDATE daily_rewards SET cycle_day = $2, last_claim_on = $3, updated_at = now() WHERE user_id = $1`,
        [userId, status.claimableDay, today],
      );
      const balance = await client.query<{ balance: number }>(`SELECT balance FROM wallet_balances WHERE user_id = $1 AND currency = 'zer'`, [userId]);
      await client.query('COMMIT');
      const bagGift = bag ? { sku: bag.sku, name: bag.name, assetUrl: cosmeticAssetUrl('gift', null, this.publicUrl, bag.sku) } : null;
      const nudges = await isKnownAdultAccount(client, userId);
      return { claimed: true, cycleDay: status.claimableDay, reward: paid.granted, balance: balance.rows[0]?.balance ?? 0, bagGift, member: plus, nudges };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}

import type pg from 'pg';
import { PLUS_DAILY_GEMS } from '@kurda/shared';
import { isPremiumActive } from '../cosmetics/access.js';
import { AppError } from '../plugins/errors.js';
import { WalletService } from '../wallet/service.js';
import { assertEconomyNotHeld } from '../economy/standing.js';
import { localDate } from '../streaks/streak-logic.js';
import { StreakService } from '../streaks/service.js';
import { statusFor, type DailyRewardState, type DailyRewardStatus } from './daily-cycle.js';

export interface ClaimResult {
  claimed: boolean;
  cycleDay: number;
  reward: number;
  balance: number;
  /** gems a Hevalo+ member received with this claim; 0 for everyone else */
  plusGems: number;
}

/** The ledger's reason for a Hevalo+ member's daily gems. */
export const PLUS_DAILY_REASON = 'plus_daily';

/**
 * Daily Zêr reward claims (KUR-067). Server-time only: the claim day is the
 * user's tz-local calendar date (KUR-031's `localDate`), so a device clock can
 * never unlock an extra claim. The grant is atomic with the cycle-state update
 * and idempotent per (user, day).
 *
 * A claim needs a lesson or practice session finished on that same local day —
 * the streak service's `last_learned_on`, written when a session completes.
 * A daily Peyvok win keeps a streak but does not count here.
 *
 * A Hevalo+ member receives `PLUS_DAILY_GEMS` gems with the claim: in the
 * same transaction, once a day by a ledger key of its own, and under a reason
 * of its own rather than a gem rule's, so it stands outside the daily cap on
 * earned gems — it is part of what membership is, not something earned.
 */
export class DailyRewardService {
  private readonly streaks: StreakService;

  constructor(
    private readonly pool: pg.Pool,
    private readonly wallet: WalletService,
  ) {
    this.streaks = new StreakService(pool);
  }

  /** The learner's time zone, and whether they are a Hevalo+ member at `now`. */
  private async account(userId: string, now: Date): Promise<{ tz: string; plus: boolean }> {
    const row = await this.pool.query<{ timezone: string; premium_until: Date | null }>(
      `SELECT timezone, premium_until FROM users WHERE id = $1`,
      [userId],
    );
    return { tz: row.rows[0]?.timezone ?? 'UTC', plus: isPremiumActive(row.rows[0]?.premium_until ?? null, now) };
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

  /**
   * Cycle progress + next reward for the calendar UI, and the gems a claim
   * today adds for a Hevalo+ member (0 for everyone else).
   */
  async status(userId: string, now: Date = new Date()): Promise<DailyRewardStatus & { cycleDay: number; plusGems: number }> {
    const { tz, plus } = await this.account(userId, now);
    const today = localDate(now, tz);
    const state = await this.read(this.pool, userId);
    const learned = await this.learnedOn(this.pool, userId, today);
    return { ...statusFor(state, today, learned), cycleDay: state.cycleDay, plusGems: plus ? PLUS_DAILY_GEMS : 0 };
  }

  /**
   * Claim today's reward. Throws ALREADY_CLAIMED if today is already claimed,
   * LEARN_FIRST if no lesson or practice session has been finished today, and
   * REWARDS_PAUSED for a confirmed bot or an account on a payment-fraud hold
   * (economy/standing.ts). The amount is the server's own (daily-cycle.ts).
   */
  async claim(userId: string, now: Date = new Date()): Promise<ClaimResult> {
    await assertEconomyNotHeld(this.pool, userId, 'rewards');
    const { tz, plus } = await this.account(userId, now);
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

      const credit = await this.wallet.creditWithin(client, {
        userId,
        currency: 'zer',
        amount: status.reward,
        reason: 'daily_reward',
        idempotencyKey: `daily:${userId}:${today}`,
      });
      // a member's gems ride on the same claim: the day's lock above already makes this once a day, and the key says so to the ledger
      let plusGems = 0;
      if (plus) {
        const gems = await this.wallet.creditWithin(client, {
          userId,
          currency: 'gems',
          amount: PLUS_DAILY_GEMS,
          reason: PLUS_DAILY_REASON,
          idempotencyKey: `plus-daily:${userId}:${today}`,
        });
        if (!gems.duplicate) plusGems = PLUS_DAILY_GEMS;
      }
      await client.query(
        `UPDATE daily_rewards SET cycle_day = $2, last_claim_on = $3, updated_at = now() WHERE user_id = $1`,
        [userId, status.claimableDay, today],
      );
      await client.query('COMMIT');
      return { claimed: true, cycleDay: status.claimableDay, reward: status.reward, balance: credit.balance, plusGems };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}

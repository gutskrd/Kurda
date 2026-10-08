import type pg from 'pg';
import { AppError } from '../plugins/errors.js';
import { WalletService } from '../wallet/service.js';
import { localDate } from '../streaks/streak-logic.js';
import { StreakService } from '../streaks/service.js';
import { statusFor, type DailyRewardState, type DailyRewardStatus } from './daily-cycle.js';

export interface ClaimResult {
  claimed: boolean;
  cycleDay: number;
  reward: number;
  balance: number;
}

/**
 * Daily Zêr reward claims (KUR-067). Server-time only: the claim day is the
 * user's tz-local calendar date (KUR-031's `localDate`), so a device clock can
 * never unlock an extra claim. The grant is atomic with the cycle-state update
 * and idempotent per (user, day).
 *
 * A claim needs a lesson or practice session finished on that same local day —
 * the streak service's `last_learned_on`, written when a session completes.
 * A daily Wordle win keeps a streak but does not count here.
 */
export class DailyRewardService {
  private readonly streaks: StreakService;

  constructor(
    private readonly pool: pg.Pool,
    private readonly wallet: WalletService,
  ) {
    this.streaks = new StreakService(pool);
  }

  private async timezone(userId: string): Promise<string> {
    const row = await this.pool.query<{ timezone: string }>(
      `SELECT timezone FROM users WHERE id = $1`,
      [userId],
    );
    return row.rows[0]?.timezone ?? 'UTC';
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

  /** Cycle progress + next reward for the calendar UI. */
  async status(userId: string, now: Date = new Date()): Promise<DailyRewardStatus & { cycleDay: number }> {
    const tz = await this.timezone(userId);
    const today = localDate(now, tz);
    const state = await this.read(this.pool, userId);
    const learned = await this.learnedOn(this.pool, userId, today);
    return { ...statusFor(state, today, learned), cycleDay: state.cycleDay };
  }

  /**
   * Claim today's reward. Throws ALREADY_CLAIMED if today is already claimed,
   * and LEARN_FIRST if no lesson or practice session has been finished today.
   */
  async claim(userId: string, now: Date = new Date()): Promise<ClaimResult> {
    const tz = await this.timezone(userId);
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
      await client.query(
        `UPDATE daily_rewards SET cycle_day = $2, last_claim_on = $3, updated_at = now() WHERE user_id = $1`,
        [userId, status.claimableDay, today],
      );
      await client.query('COMMIT');
      return { claimed: true, cycleDay: status.claimableDay, reward: status.reward, balance: credit.balance };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}

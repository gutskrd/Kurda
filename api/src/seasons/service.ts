import type pg from 'pg';
import { WalletService } from '../wallet/service.js';
import { isTier, type Tier } from '../leagues/league-logic.js';
import { previousSeason, seasonRewardGems, softReset } from './season-logic.js';

export interface SeasonRecord {
  seasonKey: string;
  peakTier: Tier;
  finalRating: number | null;
  rewardGems: number;
  createdAt: Date;
}

/**
 * Season resets + rewards (KUR-065). At quarter end each league participant's
 * peak tier + final rating are archived, their rating is soft-reset toward the
 * mean, their peak tier resets for the new season, and they're paid reward Gems
 * scaled by peak tier. Every step is idempotent so the job is safe to re-run
 * after a partial failure: the archive is unique per (user, season), the reset
 * happens only on the archiving run, and the Gem grant is idempotency-keyed.
 */
export class SeasonService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly wallet: WalletService,
  ) {}

  /** Settle the previous season if it hasn't been fully processed yet. */
  async endDueSeasons(now: Date = new Date()): Promise<number> {
    const key = previousSeason(now);
    const done = await this.pool.query(
      `SELECT 1 FROM season_state WHERE season_key = $1 AND completed_at IS NOT NULL`,
      [key],
    );
    if ((done.rowCount ?? 0) > 0) return 0;
    const processed = await this.endSeason(key);
    await this.pool.query(
      `INSERT INTO season_state (season_key, completed_at) VALUES ($1, now())
       ON CONFLICT (season_key) DO UPDATE SET completed_at = now()`,
      [key],
    );
    return processed;
  }

  /**
   * Archive + reset + reward league participants for `seasonKey`. Returns how
   * many were processed. Idempotent per user. `onlyUsers` scopes the pass (used
   * by tests); production settles everyone.
   */
  async endSeason(seasonKey: string, onlyUsers?: string[]): Promise<number> {
    const participants = await this.pool.query<{ user_id: string; tier: string; peak_tier: string; rating: number | null }>(
      `SELECT ul.user_id, ul.tier, ul.peak_tier, r.rating
         FROM user_league ul
         LEFT JOIN player_ratings r ON r.user_id = ul.user_id
        ${onlyUsers ? 'WHERE ul.user_id = ANY($1)' : ''}`,
      onlyUsers ? [onlyUsers] : [],
    );

    for (const p of participants.rows) {
      await this.processUser(seasonKey, p.user_id, p.tier, p.peak_tier, p.rating);
    }
    return participants.rows.length;
  }

  private async processUser(
    seasonKey: string,
    userId: string,
    tier: string,
    peakTier: string,
    rating: number | null,
  ): Promise<void> {
    const peak: Tier = isTier(peakTier) ? peakTier : 'bronze';
    const currentTier: Tier = isTier(tier) ? tier : 'bronze';
    const rewardGems = seasonRewardGems(peak);

    const client = await this.pool.connect();
    let archived = false;
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        `INSERT INTO seasons (user_id, season_key, peak_tier, final_rating, reward_gems)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, season_key) DO NOTHING`,
        [userId, seasonKey, peak, rating, rewardGems],
      );
      archived = (inserted.rowCount ?? 0) > 0;
      if (archived) {
        // one-time: soft-reset the rating and start the new season's peak fresh
        if (rating !== null) {
          await client.query(`UPDATE player_ratings SET rating = $2, updated_at = now() WHERE user_id = $1`, [
            userId,
            softReset(rating),
          ]);
        }
        await client.query(`UPDATE user_league SET peak_tier = $2 WHERE user_id = $1`, [userId, currentTier]);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }

    // reward is attempted every run but idempotency-keyed, so a re-run after a
    // partial failure completes it exactly once (KUR-065 idempotent grant).
    // (An exclusive-cosmetic entitlement grant hooks in here once cosmetics return.)
    if (rewardGems > 0) {
      await this.wallet.credit({
        userId,
        currency: 'gems',
        amount: rewardGems,
        reason: 'season_reward',
        idempotencyKey: `season:${seasonKey}:${userId}`,
      });
    }
  }

  /** A user's season history for their profile. */
  async history(userId: string): Promise<SeasonRecord[]> {
    const rows = await this.pool.query<{
      season_key: string;
      peak_tier: string;
      final_rating: number | null;
      reward_gems: number;
      created_at: Date;
    }>(
      `SELECT season_key, peak_tier, final_rating, reward_gems, created_at
         FROM seasons WHERE user_id = $1 ORDER BY season_key DESC`,
      [userId],
    );
    return rows.rows.map((r) => ({
      seasonKey: r.season_key,
      peakTier: isTier(r.peak_tier) ? r.peak_tier : 'bronze',
      finalRating: r.final_rating,
      rewardGems: r.reward_gems,
      createdAt: r.created_at,
    }));
  }
}

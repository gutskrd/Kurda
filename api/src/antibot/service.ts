import type pg from 'pg';
import { scoreAccount, type BotScore } from './scoring.js';
import { deriveSignals, MIN_SAMPLE, type SignalInput } from './signals.js';

export interface BotFlag {
  userId: string;
  score: number;
  tier: string;
  signals: unknown;
  computedAt: Date;
}

/**
 * Behavioral bot detection (KUR-110). The scoring job gathers each account's
 * behavioral signals (game answer stats #058, activity-hour spread from the XP
 * ledger, accounts-per-device #296), scores them with the pure core, and
 * persists the verdict. `challenge` accounts get an invisible CAPTCHA next
 * session; `flagged` accounts are queued for a human who can confirm-and-reverse
 * their ill-gotten XP (append-only ledger, reversible) or clear a false positive.
 */
export class BotDetectionService {
  constructor(private readonly pool: pg.Pool) {}

  /** Score one account and persist the verdict. */
  async scoreUser(userId: string): Promise<BotScore> {
    const input = await this.gather(userId);
    const result = scoreAccount(deriveSignals(input));
    await this.pool.query(
      `INSERT INTO bot_scores (user_id, score, tier, signals, challenge, flagged)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)
       ON CONFLICT (user_id) DO UPDATE SET
         score = EXCLUDED.score, tier = EXCLUDED.tier, signals = EXCLUDED.signals,
         challenge = EXCLUDED.challenge, flagged = EXCLUDED.flagged, computed_at = now(),
         -- a confirmed bot stays confirmed; anything else re-activates on re-score
         status = CASE WHEN bot_scores.status = 'confirmed' THEN 'confirmed' ELSE 'active' END,
         resolved_at = CASE WHEN bot_scores.status = 'confirmed' THEN bot_scores.resolved_at ELSE NULL END`,
      [userId, result.score, result.tier, JSON.stringify({ ...deriveSignals(input), raw: input }), result.challenge, result.flagged],
    );
    return result;
  }

  /** Scoring job: score every account with enough game activity. Returns #scored. */
  async scoreActive(): Promise<number> {
    const rows = await this.pool.query<{ user_id: string }>(
      `SELECT user_id FROM cheat_stats WHERE questions_answered >= $1`,
      [MIN_SAMPLE],
    );
    for (const r of rows.rows) await this.scoreUser(r.user_id);
    return rows.rows.length;
  }

  /** Does this account owe an invisible CAPTCHA on its next session? */
  async requiresChallenge(userId: string): Promise<boolean> {
    const res = await this.pool.query<{ challenge: boolean }>(
      `SELECT challenge FROM bot_scores WHERE user_id = $1 AND status = 'active'`,
      [userId],
    );
    return res.rows[0]?.challenge ?? false;
  }

  /** Flagged accounts awaiting review, most suspicious first. */
  async flaggedForReview(limit = 50): Promise<BotFlag[]> {
    const res = await this.pool.query<{ user_id: string; score: string; tier: string; signals: unknown; computed_at: Date }>(
      `SELECT user_id, score, tier, signals, computed_at FROM bot_scores
       WHERE flagged = true AND status = 'active' ORDER BY score DESC LIMIT $1`,
      [limit],
    );
    return res.rows.map((r) => ({
      userId: r.user_id, score: Number(r.score), tier: r.tier, signals: r.signals, computedAt: r.computed_at,
    }));
  }

  /**
   * Confirm a flagged account as a bot: reverse its XP gains through the
   * append-only ledger (a compensating negative entry under the ledger-admin
   * bypass) and mark the verdict confirmed. Returns the XP reversed.
   */
  async confirmAndReverse(userId: string, adminId: string): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const bal = await client.query<{ xp: number }>(`SELECT xp FROM users WHERE id = $1 FOR UPDATE`, [userId]);
      const xp = bal.rows[0]?.xp ?? 0;
      if (xp > 0) {
        // compensating negative ledger entry keeps users.xp == ledger sum
        await client.query(
          `INSERT INTO xp_ledger (user_id, source, amount, ref_id) VALUES ($1, 'bot_reversal', $2, $3)`,
          [userId, -xp, `bot:${userId}:${Date.now()}`],
        );
        await client.query(`UPDATE users SET xp = xp + $2 WHERE id = $1`, [userId, -xp]);
      }
      await client.query(
        `UPDATE bot_scores SET status = 'confirmed', resolved_at = now(), resolved_by = $2 WHERE user_id = $1`,
        [userId, adminId],
      );
      await client.query('COMMIT');
      return xp;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Clear a false positive: the account is no longer challenged/flagged. */
  async clear(userId: string, adminId: string): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE bot_scores SET status = 'cleared', challenge = false, flagged = false,
              resolved_at = now(), resolved_by = $2
       WHERE user_id = $1 AND status = 'active'`,
      [userId, adminId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  /** Gather the raw signal inputs for an account from the source tables. */
  private async gather(userId: string): Promise<SignalInput> {
    const [stats, hours, device] = await Promise.all([
      this.pool.query<{ questions_answered: number; impossible_count: number; fast_count: number; rtt_anomaly_count: number }>(
        `SELECT questions_answered, impossible_count, fast_count, rtt_anomaly_count FROM cheat_stats WHERE user_id = $1`,
        [userId],
      ),
      this.pool.query<{ n: string }>(
        `SELECT COUNT(DISTINCT EXTRACT(HOUR FROM created_at))::int AS n FROM xp_ledger
         WHERE user_id = $1 AND created_at > now() - interval '7 days'`,
        [userId],
      ),
      this.pool.query<{ n: string }>(
        `SELECT COALESCE(MAX(cnt), 0) AS n FROM (
           SELECT COUNT(DISTINCT rd2.user_id) AS cnt
           FROM risk_decisions rd
           JOIN risk_decisions rd2 ON rd2.device_hash = rd.device_hash
           WHERE rd.user_id = $1 AND rd.device_hash IS NOT NULL
           GROUP BY rd.device_hash
         ) t`,
        [userId],
      ),
    ]);
    const s = stats.rows[0];
    return {
      questionsAnswered: s?.questions_answered ?? 0,
      impossibleCount: s?.impossible_count ?? 0,
      fastCount: s?.fast_count ?? 0,
      rttAnomalyCount: s?.rtt_anomaly_count ?? 0,
      distinctActiveHours: Number(hours.rows[0]?.n ?? 0),
      deviceAccountCount: Number(device.rows[0]?.n ?? 0),
    };
  }
}

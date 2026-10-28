import type pg from 'pg';
import { confirmBot } from '../moderation/sources.js';
import { scoreAccount, type BotScore } from './scoring.js';
import { deriveSignals, MIN_SAMPLE, type SignalInput } from './signals.js';

export interface BotFlag {
  userId: string;
  score: number;
  tier: string;
  signals: unknown;
  computedAt: Date;
}

/** One account's raw signal inputs as `gatherColumns` reads them. */
interface GatheredRow {
  user_id: string;
  questions_answered: number | null;
  impossible_count: number | null;
  fast_count: number | null;
  rtt_anomaly_count: number | null;
  hours: number;
  devices: string | number;
}

/**
 * The raw signal inputs for the account `user` (a column), from the source
 * tables: its game answer stats (`c`, cheat_stats, which the caller joins),
 * the distinct hours it earned XP in over the last week, and the most accounts
 * any of its devices was seen with. `user` is always a literal from this file.
 */
function gatherColumns(user: string): string {
  return `${user} AS user_id, c.questions_answered, c.impossible_count, c.fast_count, c.rtt_anomaly_count,
    (SELECT COUNT(DISTINCT EXTRACT(HOUR FROM x.created_at))::int FROM xp_ledger x
      WHERE x.user_id = ${user} AND x.created_at > now() - interval '7 days') AS hours,
    (SELECT COALESCE(MAX(cnt), 0) FROM (
       SELECT COUNT(DISTINCT rd2.user_id) AS cnt
         FROM risk_decisions rd
         JOIN risk_decisions rd2 ON rd2.device_hash = rd.device_hash
        WHERE rd.user_id = ${user} AND rd.device_hash IS NOT NULL
        GROUP BY rd.device_hash
     ) t) AS devices`;
}

function inputOf(row: GatheredRow): SignalInput {
  return {
    questionsAnswered: row.questions_answered ?? 0,
    impossibleCount: row.impossible_count ?? 0,
    fastCount: row.fast_count ?? 0,
    rttAnomalyCount: row.rtt_anomaly_count ?? 0,
    distinctActiveHours: Number(row.hours ?? 0),
    deviceAccountCount: Number(row.devices ?? 0),
  };
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
    const rows = await this.pool.query<GatheredRow>(
      `SELECT ${gatherColumns('a.id')} FROM (SELECT $1::uuid AS id) a LEFT JOIN cheat_stats c ON c.user_id = a.id`,
      [userId],
    );
    const [scored] = await this.persist(rows.rows);
    return scored!;
  }

  /**
   * Scoring job: score every account with enough game activity. Returns #scored.
   * Every account's signals are gathered in one query and every verdict written
   * in one statement, rather than four statements for each account.
   */
  async scoreActive(): Promise<number> {
    const rows = await this.pool.query<GatheredRow>(
      `SELECT ${gatherColumns('c.user_id')} FROM cheat_stats c WHERE c.questions_answered >= $1`,
      [MIN_SAMPLE],
    );
    await this.persist(rows.rows);
    return rows.rows.length;
  }

  /** Score each gathered account and write the verdicts, all in one statement. */
  private async persist(rows: readonly GatheredRow[]): Promise<BotScore[]> {
    const scored = rows.map((row) => {
      const input = inputOf(row);
      const signals = deriveSignals(input);
      return { userId: row.user_id, result: scoreAccount(signals), signals: { ...signals, raw: input } };
    });
    if (scored.length === 0) return [];
    await this.pool.query(
      `INSERT INTO bot_scores (user_id, score, tier, signals, challenge, flagged)
       SELECT v.user_id, v.score, v.tier, v.signals, v.challenge, v.flagged
         FROM jsonb_to_recordset($1::jsonb) AS v(user_id uuid, score numeric, tier text, signals jsonb, challenge boolean, flagged boolean)
       ON CONFLICT (user_id) DO UPDATE SET
         score = EXCLUDED.score, tier = EXCLUDED.tier, signals = EXCLUDED.signals,
         challenge = EXCLUDED.challenge, flagged = EXCLUDED.flagged, computed_at = now(),
         -- a confirmed bot stays confirmed; anything else re-activates on re-score
         status = CASE WHEN bot_scores.status = 'confirmed' THEN 'confirmed' ELSE 'active' END,
         resolved_at = CASE WHEN bot_scores.status = 'confirmed' THEN bot_scores.resolved_at ELSE NULL END`,
      [
        JSON.stringify(
          scored.map((x) => ({
            user_id: x.userId,
            score: x.result.score,
            tier: x.result.tier,
            signals: x.signals,
            challenge: x.result.challenge,
            flagged: x.result.flagged,
          })),
        ),
      ],
    );
    return scored.map((x) => x.result);
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
      // the same steps the moderation queue takes for a confirmed bot case;
      // the compensating negative ledger entry keeps users.xp == ledger sum
      const xp = await confirmBot(client, userId, adminId);
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

}

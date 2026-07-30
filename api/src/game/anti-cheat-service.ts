import type pg from 'pg';
import { FAST_MS, IMPOSSIBLE_MS, evaluate, type CheatVerdict, type PlayerStats } from './anti-cheat.js';
import type { PlayerAnswerEvidence } from './engine.js';

/**
 * Anti-cheat pipeline (KUR-058). Accumulates each player's server-measured
 * answer behaviour across games, evaluates it, and logs flagged games (with
 * evidence) to cheat_reviews for human review. Shadow-flags at high
 * confidence but never penalizes automatically.
 */
export class AntiCheatService {
  constructor(private readonly pool: pg.Pool) {}

  /** Fold one game's evidence into the player's running stats + flag if needed. */
  async recordGame(roomId: string, evidence: PlayerAnswerEvidence): Promise<CheatVerdict> {
    const answered = evidence.answers.length;
    const correct = evidence.answers.filter((a) => a.correct).length;
    const fast = evidence.answers.filter((a) => a.elapsedMs < FAST_MS).length;
    const impossible = evidence.answers.filter((a) => a.elapsedMs < IMPOSSIBLE_MS).length;

    const stats = await this.pool.query<{
      questions_answered: number;
      correct_count: number;
      fast_count: number;
      impossible_count: number;
      rtt_anomaly_count: number;
    }>(
      `INSERT INTO cheat_stats (user_id, questions_answered, correct_count, fast_count, impossible_count, rtt_anomaly_count, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (user_id) DO UPDATE SET
         questions_answered = cheat_stats.questions_answered + EXCLUDED.questions_answered,
         correct_count = cheat_stats.correct_count + EXCLUDED.correct_count,
         fast_count = cheat_stats.fast_count + EXCLUDED.fast_count,
         impossible_count = cheat_stats.impossible_count + EXCLUDED.impossible_count,
         rtt_anomaly_count = cheat_stats.rtt_anomaly_count + EXCLUDED.rtt_anomaly_count,
         updated_at = now()
       RETURNING questions_answered, correct_count, fast_count, impossible_count, rtt_anomaly_count`,
      [evidence.userId, answered, correct, fast, impossible, evidence.rttAnomalies],
    );
    const row = stats.rows[0]!;
    const totals: PlayerStats = {
      questionsAnswered: row.questions_answered,
      correctCount: row.correct_count,
      fastCount: row.fast_count,
      impossibleCount: row.impossible_count,
      rttAnomalyCount: row.rtt_anomaly_count,
    };

    const verdict = evaluate(totals);
    if (verdict.flags.length > 0) {
      await this.pool.query(
        `INSERT INTO cheat_reviews (user_id, room_id, flags, evidence, confidence, shadow_flagged)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          evidence.userId,
          roomId,
          JSON.stringify(verdict.flags),
          JSON.stringify({ totals, game: evidence.answers }),
          verdict.confidence,
          verdict.shadow,
        ],
      );
    }
    return verdict;
  }

  /** Pending reviews for the moderation queue (most confident first). */
  async pendingReviews(limit = 50): Promise<Array<Record<string, unknown>>> {
    const res = await this.pool.query(
      `SELECT id, user_id, room_id, flags, confidence, shadow_flagged, created_at
       FROM cheat_reviews WHERE reviewed = false
       ORDER BY confidence DESC, created_at ASC LIMIT $1`,
      [limit],
    );
    return res.rows;
  }
}

import type pg from 'pg';

/**
 * The old achievements, kept for the ones already earned. Only the tournament win still awards one; learning
 * milestones go to the badges. words-1000, first-game-win and newroz-2026 are defined but never awarded, because
 * nothing measures them honestly, so they show as not yet earned.
 */
export interface AchievementDef {
  id: string;
  nameKu: string;
  nameEn: string;
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: 'streak-30', nameKu: 'Agirê 30 rojan', nameEn: '30-day streak' },
  { id: 'first-perfect', nameKu: 'Dersa bêkêmasî', nameEn: 'First perfect lesson' },
  { id: 'words-1000', nameKu: '1000 peyv', nameEn: '1000 words learned' },
  { id: 'first-game-win', nameKu: 'Serkeftina yekem', nameEn: 'First game win' },
  { id: 'tournament-win', nameKu: 'Şampiyonê tûrnûvayê', nameEn: 'Tournament champion' },
  { id: 'newroz-2026', nameKu: 'Newroza 2026', nameEn: 'Newroz 2026 celebrant' },
] as const;

export function achievementDef(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

export interface AwardResult {
  awarded: boolean;
  /** true when the user already had it (idempotent no-op). */
  alreadyEarned: boolean;
}

/** Grants Gems for a rule and reference id. */
export interface GemGranter {
  grant(userId: string, ruleKey: string, refId: string): Promise<unknown>;
}

/** Records a friend milestone. */
export interface ActivityPublisher {
  publish(actorId: string, type: 'achievement', payload: Record<string, unknown>): Promise<unknown>;
}

/**
 * What a learning activity reports once it has committed, so the milestones it reached are awarded. Every call is
 * idempotent, so reporting on each completion is safe.
 */
export interface MilestoneRecorder {
  recordStreak(userId: string, currentStreak: number): Promise<void>;
  recordLessonCompleted(userId: string, accuracy: number): Promise<void>;
  /**
   * A finished lesson and the streak it left, reported together, for a recorder that counts both from the same
   * tables. A recorder without it is told the two one after the other.
   */
  recordLesson?(userId: string, accuracy: number, currentStreak: number): Promise<void>;
  /** A solo game finished: Peyvok, Rhyme training or the Typing Race. */
  recordSoloGame?(userId: string): Promise<void>;
}

export class AchievementsService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly gems?: GemGranter,
    private readonly activity?: ActivityPublisher,
  ) {}

  /**
   * Awards an achievement exactly once: the primary-key insert is the idempotency gate. A new award also asks for
   * Gems with a key per user and achievement, because the Gem key is global; the `achievement_milestone` rule is
   * switched off, so nothing is paid unless an admin turns it back on.
   */
  async award(userId: string, achievementId: string): Promise<AwardResult> {
    const def = achievementDef(achievementId);
    if (!def) throw new Error(`unknown achievement: ${achievementId}`);

    const inserted = await this.pool.query(
      `INSERT INTO user_achievements (user_id, achievement_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, achievement_id) DO NOTHING`,
      [userId, achievementId],
    );
    if ((inserted.rowCount ?? 0) === 0) return { awarded: false, alreadyEarned: true };

    // The Gems and the milestone are best-effort: a failure must never undo the award.
    if (this.gems) {
      await this.gems.grant(userId, 'achievement_milestone', `${achievementId}:${userId}`).catch(() => undefined);
    }
    if (this.activity) await this.activity.publish(userId, 'achievement', { achievementId }).catch(() => undefined);
    return { awarded: true, alreadyEarned: false };
  }

  /** Earned-but-unseen achievements — powers the unlock toast. */
  async unseen(userId: string) {
    const rows = await this.pool.query<{ achievement_id: string; earned_at: Date }>(
      `SELECT achievement_id, earned_at FROM user_achievements
       WHERE user_id = $1 AND seen_at IS NULL
       ORDER BY earned_at ASC`,
      [userId],
    );
    return rows.rows
      .map((row) => {
        const def = achievementDef(row.achievement_id);
        if (!def) return null;
        return {
          id: def.id,
          nameKu: def.nameKu,
          nameEn: def.nameEn,
          earnedAt: new Date(row.earned_at).toISOString(),
        };
      })
      .filter((a): a is NonNullable<typeof a> => a !== null);
  }

  async markSeen(userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE user_achievements SET seen_at = now() WHERE user_id = $1 AND seen_at IS NULL`,
      [userId],
    );
  }

  async listEarned(userId: string) {
    const rows = await this.pool.query<{ achievement_id: string; earned_at: Date }>(
      `SELECT achievement_id, earned_at FROM user_achievements WHERE user_id = $1`,
      [userId],
    );
    const earned = new Map(rows.rows.map((r) => [r.achievement_id, r.earned_at]));
    return ACHIEVEMENTS.map((def) => ({
      id: def.id,
      nameKu: def.nameKu,
      nameEn: def.nameEn,
      earnedAt: earned.has(def.id) ? new Date(earned.get(def.id) as Date).toISOString() : null,
    }));
  }
}

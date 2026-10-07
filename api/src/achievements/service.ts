import type pg from 'pg';

/**
 * Achievement definitions with Kurdish-first naming. Standalone badges/
 * milestones — no longer tied to cosmetics (the avatar system was
 * removed in favour of profile pictures, #177–#181). Trigger points call
 * AchievementsService from their own systems:
 *  - streak-30       → any activity that extends the streak: lesson, practice,
 *                      daily Wordle win (`recordStreak`)
 *  - first-perfect   → lesson completion at 100% (`recordLessonCompleted`)
 *  - tournament-win  → the tournament champion is paid (`award`)
 *
 * Defined but not yet awarded, because nothing measures them honestly:
 *  - words-1000      → review items are exercises, not words (KUR-043), and
 *                      the course teaches well under 1000 words; it needs the
 *                      word-level knowledge model before it means anything
 *  - first-game-win  → "a game" covers quiz 1v1/2v2/FFA, Wordle Battle, Rhyme
 *                      and solo Wordle, and the quiz ranks 2v2 players one by
 *                      one rather than by team; which of those is a win is a
 *                      product decision, not a trigger to guess at
 *  - newroz-2026     → the event has passed, and whether a "celebrant" is
 *                      anyone who joined, finished its quests or played its
 *                      lessons was never decided
 * Until then they simply show as not yet earned.
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

/** Grants Gems for a rule/refId; injected so achievements stay decoupled (KUR-068). */
export interface GemGranter {
  grant(userId: string, ruleKey: string, refId: string): Promise<unknown>;
}

/** Publishes a friend-feed milestone; injected so achievements stay decoupled (KUR-087). */
export interface ActivityPublisher {
  publish(actorId: string, type: 'achievement', payload: Record<string, unknown>): Promise<unknown>;
}

/** A streak at least this long earns streak-30. */
export const STREAK_ACHIEVEMENT_DAYS = 30;

/**
 * What a learning activity reports once it has committed, so the milestones it
 * reached are awarded. Injected into lessons, practice and Wordle so they stay
 * decoupled; every call is idempotent, so reporting on each completion is safe.
 */
export interface MilestoneRecorder {
  recordStreak(userId: string, currentStreak: number): Promise<void>;
  recordLessonCompleted(userId: string, accuracy: number): Promise<void>;
}

export class AchievementsService implements MilestoneRecorder {
  constructor(
    private readonly pool: pg.Pool,
    private readonly gems?: GemGranter,
    private readonly activity?: ActivityPublisher,
  ) {}

  /**
   * Exactly-once award: the PK insert is the idempotency gate, so a data
   * backfill re-triggering the same achievement can never award twice. A newly
   * earned milestone also grants Gems (KUR-068), idempotent per user and
   * achievement — the Gem idempotency key is global, so a key of the
   * achievement alone would have paid only the first person ever to earn it.
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

    // Gem grant + feed event are best-effort: a failure must never undo the award.
    if (this.gems) {
      await this.gems.grant(userId, 'achievement_milestone', `${achievementId}:${userId}`).catch(() => undefined);
    }
    if (this.activity) await this.activity.publish(userId, 'achievement', { achievementId }).catch(() => undefined);
    return { awarded: true, alreadyEarned: false };
  }

  /** streak-30, once the learner's current streak reaches it. */
  async recordStreak(userId: string, currentStreak: number): Promise<void> {
    if (currentStreak >= STREAK_ACHIEVEMENT_DAYS) await this.award(userId, 'streak-30');
  }

  /** first-perfect, the first time a lesson is completed without a mistake. */
  async recordLessonCompleted(userId: string, accuracy: number): Promise<void> {
    if (accuracy >= 1) await this.award(userId, 'first-perfect');
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

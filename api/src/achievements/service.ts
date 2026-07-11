import type pg from 'pg';

/**
 * Achievement definitions with Kurdish-first naming. Standalone badges/
 * milestones — no longer tied to cosmetics (the avatar system was
 * removed in favour of profile pictures, #177–#181). Trigger points call
 * AchievementsService.award(userId, id) from their own systems:
 *  - streak-30       → streak system (KUR-031, #31)
 *  - first-perfect   → lesson grading (KUR-028/#28, KUR-030/#30)
 *  - words-1000      → spaced repetition (KUR-033, #33)
 *  - first-game-win  → game results (KUR-053, #53)
 *  - tournament-win  → tournaments (KUR-060, #60)
 *  - newroz-2026     → Newroz event (KUR-090, #90)
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

export class AchievementsService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly gems?: GemGranter,
    private readonly activity?: ActivityPublisher,
  ) {}

  /**
   * Exactly-once award: the PK insert is the idempotency gate, so a data
   * backfill re-triggering the same achievement can never award twice. A newly
   * earned milestone also grants Gems (KUR-068), idempotent on the achievement.
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
    if (this.gems) await this.gems.grant(userId, 'achievement_milestone', achievementId).catch(() => undefined);
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

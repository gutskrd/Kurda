import type pg from 'pg';
import { CosmeticsInventory } from './inventory.js';

/**
 * Achievement definitions (KUR-078) with Kurdish-first naming, each
 * optionally granting a cosmetic. Trigger points call
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
  /** Cosmetic granted on earn (must be a premium catalog item). */
  grantsCosmetic?: string;
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  {
    id: 'streak-30',
    nameKu: 'Agirê 30 rojan',
    nameEn: '30-day streak',
    grantsCosmetic: 'bg-roj',
  },
  {
    id: 'first-perfect',
    nameKu: 'Dersa bêkêmasî',
    nameEn: 'First perfect lesson',
    grantsCosmetic: 'head-kum',
  },
  {
    id: 'words-1000',
    nameKu: '1000 peyv',
    nameEn: '1000 words learned',
    grantsCosmetic: 'head-kofi',
  },
  {
    id: 'first-game-win',
    nameKu: 'Serkeftina yekem',
    nameEn: 'First game win',
    grantsCosmetic: 'head-sasik',
  },
  {
    id: 'tournament-win',
    nameKu: 'Şampiyonê tûrnûvayê',
    nameEn: 'Tournament champion',
    grantsCosmetic: 'outfit-pesmerge',
  },
  {
    id: 'newroz-2026',
    nameKu: 'Newroza 2026',
    nameEn: 'Newroz 2026 celebrant',
    grantsCosmetic: 'outfit-newroz',
  },
] as const;

export function achievementDef(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

export interface AwardResult {
  awarded: boolean;
  /** true when the user already had it (idempotent no-op). */
  alreadyEarned: boolean;
  grantedCosmetic?: string;
}

export class AchievementsService {
  private readonly inventory: CosmeticsInventory;

  constructor(private readonly pool: pg.Pool) {
    this.inventory = new CosmeticsInventory(pool);
  }

  /**
   * Exactly-once award: the PK insert is the idempotency gate, so a
   * data backfill re-triggering the same achievement can never grant
   * twice (KUR-078 edge). Cosmetic grant follows only a fresh insert.
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
    if ((inserted.rowCount ?? 0) === 0) {
      return { awarded: false, alreadyEarned: true };
    }

    let grantedCosmetic: string | undefined;
    if (def.grantsCosmetic) {
      await this.inventory.grant(userId, def.grantsCosmetic, 'achievement');
      grantedCosmetic = def.grantsCosmetic;
    }
    return { awarded: true, alreadyEarned: false, grantedCosmetic };
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
          grantsCosmetic: def.grantsCosmetic ?? null,
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
      grantsCosmetic: def.grantsCosmetic ?? null,
      earnedAt: earned.has(def.id) ? new Date(earned.get(def.id) as Date).toISOString() : null,
    }));
  }
}
